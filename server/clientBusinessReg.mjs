import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";

function rowToMeta(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function initClientBusinessRegStore() {
  fs.mkdirSync(config.clientBusinessRegDir, { recursive: true });
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS client_business_reg_files (
      client_id TEXT PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_client_business_reg_updated_at ON client_business_reg_files(updated_at DESC);
  `);
}

function extFromFileName(fileName, mimeType) {
  const ext = path.extname(String(fileName || ""));
  if (ext) return ext;
  if (String(mimeType || "").includes("pdf")) return ".pdf";
  if (String(mimeType || "").startsWith("image/")) {
    const sub = String(mimeType).split("/")[1] || "jpg";
    return `.${sub.replace("jpeg", "jpg")}`;
  }
  return "";
}

function removeStoredFile(storagePath) {
  if (storagePath && fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
}

export function getClientBusinessRegMeta(clientId) {
  const row = getDb()
    .prepare("SELECT * FROM client_business_reg_files WHERE client_id = ?")
    .get(String(clientId || ""));
  return row ? rowToMeta(row) : null;
}

export function getClientBusinessRegFile(clientId) {
  const row = getDb()
    .prepare("SELECT storage_path, file_name, mime_type FROM client_business_reg_files WHERE client_id = ?")
    .get(String(clientId || ""));
  if (!row || !fs.existsSync(row.storage_path)) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type || "application/octet-stream",
  };
}

export function upsertClientBusinessReg(clientId, buffer, meta, createdBy) {
  const normalizedClientId = String(clientId || "").trim();
  if (!normalizedClientId) {
    return { ok: false, status: 400, error: "\uAC70\uB798\uCC98 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  if (!buffer?.length) {
    return { ok: false, status: 400, error: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uD30C\uC77C\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." };
  }

  const existing = getDb()
    .prepare("SELECT id, storage_path FROM client_business_reg_files WHERE client_id = ?")
    .get(normalizedClientId);

  const now = new Date().toISOString();
  const id = existing?.id || `bizreg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = extFromFileName(meta.fileName, meta.mimeType);
  const storagePath = path.join(config.clientBusinessRegDir, `${id}${ext}`);

  if (existing?.storage_path && existing.storage_path !== storagePath) {
    removeStoredFile(existing.storage_path);
  }

  fs.writeFileSync(storagePath, buffer);

  if (existing) {
    getDb()
      .prepare(`
        UPDATE client_business_reg_files
        SET file_name = ?, mime_type = ?, file_size = ?, updated_at = ?, storage_path = ?, created_by = COALESCE(?, created_by)
        WHERE client_id = ?
      `)
      .run(
        meta.fileName || `\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D${ext}`,
        meta.mimeType || "application/octet-stream",
        buffer.length,
        now,
        storagePath,
        createdBy || null,
        normalizedClientId,
      );
  } else {
    getDb()
      .prepare(`
        INSERT INTO client_business_reg_files (
          client_id, id, file_name, mime_type, file_size, created_at, updated_at, storage_path, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalizedClientId,
        id,
        meta.fileName || `\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D${ext}`,
        meta.mimeType || "application/octet-stream",
        buffer.length,
        now,
        now,
        storagePath,
        createdBy || null,
      );
  }

  return { ok: true, meta: getClientBusinessRegMeta(normalizedClientId) };
}
