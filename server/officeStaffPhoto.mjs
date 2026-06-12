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
    staffId: row.staff_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function initOfficeStaffPhotoStore() {
  fs.mkdirSync(config.officeStaffPhotosDir, { recursive: true });
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS office_staff_photo_files (
      staff_id TEXT PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_office_staff_photo_updated_at ON office_staff_photo_files(updated_at DESC);
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

function normalizeStaffId(staffId) {
  return String(staffId || "").trim();
}

export function getOfficeStaffPhotoMeta(staffId) {
  const row = getDb()
    .prepare("SELECT * FROM office_staff_photo_files WHERE staff_id = ?")
    .get(normalizeStaffId(staffId));
  return row ? rowToMeta(row) : null;
}

export function getOfficeStaffPhotoFile(staffId) {
  const row = getDb()
    .prepare("SELECT storage_path, file_name, mime_type FROM office_staff_photo_files WHERE staff_id = ?")
    .get(normalizeStaffId(staffId));
  if (!row || !fs.existsSync(row.storage_path)) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type || "image/jpeg",
  };
}

export function upsertOfficeStaffPhoto(staffId, buffer, meta, createdBy) {
  const normalizedStaffId = normalizeStaffId(staffId);
  if (!normalizedStaffId) {
    return { ok: false, status: 400, error: "내근직 ID가 없습니다." };
  }
  if (!buffer?.length) {
    return { ok: false, status: 400, error: "사진 파일이 비어 있습니다." };
  }
  const mimeType = String(meta.mimeType || "image/jpeg");
  if (!mimeType.startsWith(ALLOWED_MIME_PREFIX)) {
    return { ok: false, status: 400, error: "이미지 파일만 업로드할 수 있습니다." };
  }
  if (buffer.length > 5 * 1024 * 1024) {
    return { ok: false, status: 400, error: "사진 크기는 5MB 이하여야 합니다." };
  }

  const existing = getDb()
    .prepare("SELECT id, storage_path FROM office_staff_photo_files WHERE staff_id = ?")
    .get(normalizedStaffId);

  const now = new Date().toISOString();
  const id = existing?.id || `osphoto-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = extFromFileName(meta.fileName, mimeType);
  const storagePath = path.join(config.officeStaffPhotosDir, `${id}${ext}`);

  if (existing?.storage_path && existing.storage_path !== storagePath) {
    removeStoredFile(existing.storage_path);
  }

  fs.writeFileSync(storagePath, buffer);

  if (existing) {
    getDb()
      .prepare(`
        UPDATE office_staff_photo_files
        SET file_name = ?, mime_type = ?, file_size = ?, updated_at = ?, storage_path = ?, created_by = COALESCE(?, created_by)
        WHERE staff_id = ?
      `)
      .run(
        meta.fileName || `인사사진${ext}`,
        mimeType,
        buffer.length,
        now,
        storagePath,
        createdBy || null,
        normalizedStaffId,
      );
  } else {
    getDb()
      .prepare(`
        INSERT INTO office_staff_photo_files (
          staff_id, id, file_name, mime_type, file_size, created_at, updated_at, storage_path, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalizedStaffId,
        id,
        meta.fileName || `인사사진${ext}`,
        mimeType,
        buffer.length,
        now,
        now,
        storagePath,
        createdBy || null,
      );
  }

  const savedMeta = getOfficeStaffPhotoMeta(normalizedStaffId);
  syncOfficeStaffPhotoMetaToState(normalizedStaffId, savedMeta, createdBy || "office-staff-photo:upload");
  return { ok: true, meta: savedMeta };
}

export function enrichOfficeStaffWithPhotoMeta(officeStaff = []) {
  if (!Array.isArray(officeStaff)) return [];
  return officeStaff.map((row) => {
    const meta = getOfficeStaffPhotoMeta(row?.id);
    if (!meta) return row;
    return {
      ...row,
      photoFileId: meta.id,
      photoFileName: meta.fileName,
      photoUploadedAt: meta.updatedAt,
    };
  });
}

export function syncOfficeStaffPhotoMetaToState(staffId, meta, updatedBy = "office-staff-photo") {
  const normalizedStaffId = normalizeStaffId(staffId);
  if (!normalizedStaffId) return { ok: false, changed: false };

  const state = getErpState();
  const officeStaff = Array.isArray(state.data?.officeStaff) ? state.data.officeStaff : [];
  let changed = false;
  const nextOfficeStaff = officeStaff.map((row) => {
    if (String(row?.id ?? "") !== normalizedStaffId) return row;
    changed = true;
    if (!meta) {
      const next = { ...row };
      delete next.photoFileId;
      delete next.photoFileName;
      delete next.photoUploadedAt;
      return next;
    }
    return {
      ...row,
      photoFileId: meta.id,
      photoFileName: meta.fileName,
      photoUploadedAt: meta.updatedAt,
    };
  });

  if (!changed) return { ok: true, changed: false };

  const merged = mergeErpDomainForSave(state.data || {}, "officeStaff", { officeStaff: nextOfficeStaff });
  saveErpDomain("officeStaff", { officeStaff: merged.officeStaff || nextOfficeStaff }, state.version, updatedBy);
  return { ok: true, changed: true };
}

export function deleteOfficeStaffPhoto(staffId) {
  const normalizedStaffId = normalizeStaffId(staffId);
  if (!normalizedStaffId) {
    return { ok: false, status: 400, error: "내근직 ID가 없습니다." };
  }

  const row = getDb()
    .prepare("SELECT storage_path FROM office_staff_photo_files WHERE staff_id = ?")
    .get(normalizedStaffId);
  if (!row) {
    return { ok: false, status: 404, error: "인사사진이 없습니다." };
  }

  removeStoredFile(row.storage_path);
  getDb().prepare("DELETE FROM office_staff_photo_files WHERE staff_id = ?").run(normalizedStaffId);
  syncOfficeStaffPhotoMetaToState(normalizedStaffId, null, "office-staff-photo:delete");
  return { ok: true };
}
