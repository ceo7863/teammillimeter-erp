import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getDb, getErpState, saveErpDomain } from "./db.mjs";
import { mergeErpDomainForSave } from "./erpDomains.mjs";

const ALLOWED_MIME_PREFIX = "image/";

function rowToMeta(row) {
  return {
    id: row.id,
    workerId: row.worker_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function initWorkerPhotoStore() {
  fs.mkdirSync(config.workerPhotosDir, { recursive: true });
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS worker_photo_files (
      worker_id TEXT PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_worker_photo_updated_at ON worker_photo_files(updated_at DESC);
  `);
}

function extFromFileName(fileName, mimeType) {
  const ext = path.extname(String(fileName || ""));
  if (ext) return ext;
  if (String(mimeType || "").startsWith("image/")) {
    const sub = String(mimeType).split("/")[1] || "jpg";
    return `.${sub.replace("jpeg", "jpg")}`;
  }
  return ".jpg";
}

function removeStoredFile(storagePath) {
  if (storagePath && fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
}

function normalizeWorkerId(workerId) {
  return String(workerId || "").trim();
}

export function getWorkerPhotoMeta(workerId) {
  const row = getDb()
    .prepare("SELECT * FROM worker_photo_files WHERE worker_id = ?")
    .get(normalizeWorkerId(workerId));
  return row ? rowToMeta(row) : null;
}

export function getWorkerPhotoFile(workerId) {
  const row = getDb()
    .prepare("SELECT storage_path, file_name, mime_type FROM worker_photo_files WHERE worker_id = ?")
    .get(normalizeWorkerId(workerId));
  if (!row || !fs.existsSync(row.storage_path)) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type || "image/jpeg",
  };
}

export function upsertWorkerPhoto(workerId, buffer, meta, createdBy) {
  const normalizedWorkerId = normalizeWorkerId(workerId);
  if (!normalizedWorkerId) {
    return { ok: false, status: 400, error: "\uC2DC\uACF5\uC790 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  if (!buffer?.length) {
    return { ok: false, status: 400, error: "\uC0AC\uC9C4 \uD30C\uC77C\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." };
  }
  const mimeType = String(meta.mimeType || "image/jpeg");
  if (!mimeType.startsWith(ALLOWED_MIME_PREFIX)) {
    return { ok: false, status: 400, error: "\uC774\uBBF8\uC9C0 \uD30C\uC77C\uB9CC \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." };
  }
  if (buffer.length > 5 * 1024 * 1024) {
    return { ok: false, status: 400, error: "\uC0AC\uC9C4 \uD06C\uAE30\uB294 5MB \uC774\uD558\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." };
  }

  const existing = getDb()
    .prepare("SELECT id, storage_path FROM worker_photo_files WHERE worker_id = ?")
    .get(normalizedWorkerId);

  const now = new Date().toISOString();
  const id = existing?.id || `wphoto-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = extFromFileName(meta.fileName, mimeType);
  const storagePath = path.join(config.workerPhotosDir, `${id}${ext}`);

  if (existing?.storage_path && existing.storage_path !== storagePath) {
    removeStoredFile(existing.storage_path);
  }

  fs.writeFileSync(storagePath, buffer);

  if (existing) {
    getDb()
      .prepare(`
        UPDATE worker_photo_files
        SET file_name = ?, mime_type = ?, file_size = ?, updated_at = ?, storage_path = ?, created_by = COALESCE(?, created_by)
        WHERE worker_id = ?
      `)
      .run(
        meta.fileName || `\uC778\uC0AC\uC0AC\uC9C4${ext}`,
        mimeType,
        buffer.length,
        now,
        storagePath,
        createdBy || null,
        normalizedWorkerId,
      );
  } else {
    getDb()
      .prepare(`
        INSERT INTO worker_photo_files (
          worker_id, id, file_name, mime_type, file_size, created_at, updated_at, storage_path, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalizedWorkerId,
        id,
        meta.fileName || `\uC778\uC0AC\uC0AC\uC9C4${ext}`,
        mimeType,
        buffer.length,
        now,
        now,
        storagePath,
        createdBy || null,
      );
  }

  const savedMeta = getWorkerPhotoMeta(normalizedWorkerId);
  syncWorkerPhotoMetaToState(normalizedWorkerId, savedMeta, createdBy || "worker-photo:upload");
  return { ok: true, meta: savedMeta };
}

export function enrichWorkersWithPhotoMeta(workers = []) {
  if (!Array.isArray(workers)) return [];
  return workers.map((worker) => {
    const meta = getWorkerPhotoMeta(worker?.id);
    if (!meta) return worker;
    return {
      ...worker,
      photoFileId: meta.id,
      photoFileName: meta.fileName,
      photoUploadedAt: meta.updatedAt,
    };
  });
}

export function syncWorkerPhotoMetaToState(workerId, meta, updatedBy = "worker-photo") {
  const normalizedWorkerId = normalizeWorkerId(workerId);
  if (!normalizedWorkerId) return { ok: false, changed: false };

  const state = getErpState();
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  let changed = false;
  const nextWorkers = workers.map((worker) => {
    if (String(worker?.id ?? "") !== normalizedWorkerId) return worker;
    changed = true;
    if (!meta) {
      const next = { ...worker };
      delete next.photoFileId;
      delete next.photoFileName;
      delete next.photoUploadedAt;
      return next;
    }
    return {
      ...worker,
      photoFileId: meta.id,
      photoFileName: meta.fileName,
      photoUploadedAt: meta.updatedAt,
    };
  });

  if (!changed) return { ok: true, changed: false };

  const merged = mergeErpDomainForSave(state.data || {}, "workers", { workers: nextWorkers });
  saveErpDomain("workers", { workers: merged.workers || nextWorkers }, state.version, updatedBy);
  return { ok: true, changed: true };
}

export function deleteWorkerPhoto(workerId) {
  const normalizedWorkerId = normalizeWorkerId(workerId);
  if (!normalizedWorkerId) {
    return { ok: false, status: 400, error: "\uC2DC\uACF5\uC790 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const row = getDb()
    .prepare("SELECT storage_path FROM worker_photo_files WHERE worker_id = ?")
    .get(normalizedWorkerId);
  if (!row) {
    return { ok: false, status: 404, error: "\uC778\uC0AC\uC0AC\uC9C4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  removeStoredFile(row.storage_path);
  getDb().prepare("DELETE FROM worker_photo_files WHERE worker_id = ?").run(normalizedWorkerId);
  syncWorkerPhotoMetaToState(normalizedWorkerId, null, "worker-photo:delete");
  return { ok: true };
}
