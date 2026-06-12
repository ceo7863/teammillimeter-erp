import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";

const ALLOWED_MIME_PREFIX = "image/";

function rowToMeta(row) {
  return {
    id: row.id,
    userId: row.user_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function initUserProfilePhotoStore() {
  fs.mkdirSync(config.userProfilePhotosDir, { recursive: true });
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS user_profile_photo_files (
      user_id INTEGER PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_profile_photo_updated_at ON user_profile_photo_files(updated_at DESC);
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

function normalizeUserId(userId) {
  const id = Number(userId);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

export function getUserProfilePhotoMeta(userId) {
  const row = getDb()
    .prepare("SELECT * FROM user_profile_photo_files WHERE user_id = ?")
    .get(normalizeUserId(userId));
  return row ? rowToMeta(row) : null;
}

export function getUserProfilePhotoMetaByUserIds(userIds = []) {
  const ids = [...new Set(userIds.map(normalizeUserId).filter((id) => id > 0))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(`SELECT * FROM user_profile_photo_files WHERE user_id IN (${placeholders})`)
    .all(...ids);
  return new Map(rows.map((row) => [Number(row.user_id), rowToMeta(row)]));
}

export function getUserProfilePhotoFile(userId) {
  const row = getDb()
    .prepare("SELECT storage_path, file_name, mime_type FROM user_profile_photo_files WHERE user_id = ?")
    .get(normalizeUserId(userId));
  if (!row || !fs.existsSync(row.storage_path)) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type || "image/jpeg",
  };
}

export function upsertUserProfilePhoto(userId, buffer, meta, createdBy) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return { ok: false, status: 400, error: "\uC0AC\uC6A9\uC790 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
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
    .prepare("SELECT id, storage_path FROM user_profile_photo_files WHERE user_id = ?")
    .get(normalizedUserId);

  const now = new Date().toISOString();
  const id = existing?.id || `upphoto-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = extFromFileName(meta.fileName, mimeType);
  const storagePath = path.join(config.userProfilePhotosDir, `${id}${ext}`);

  if (existing?.storage_path && existing.storage_path !== storagePath) {
    removeStoredFile(existing.storage_path);
  }

  fs.writeFileSync(storagePath, buffer);

  if (existing) {
    getDb()
      .prepare(`
        UPDATE user_profile_photo_files
        SET file_name = ?, mime_type = ?, file_size = ?, updated_at = ?, storage_path = ?, created_by = COALESCE(?, created_by)
        WHERE user_id = ?
      `)
      .run(
        meta.fileName || `\uD504\uB85C\uD544\uC0AC\uC9C4${ext}`,
        mimeType,
        buffer.length,
        now,
        storagePath,
        createdBy || null,
        normalizedUserId,
      );
  } else {
    getDb()
      .prepare(`
        INSERT INTO user_profile_photo_files (
          user_id, id, file_name, mime_type, file_size, created_at, updated_at, storage_path, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalizedUserId,
        id,
        meta.fileName || `\uD504\uB85C\uD544\uC0AC\uC9C4${ext}`,
        mimeType,
        buffer.length,
        now,
        now,
        storagePath,
        createdBy || null,
      );
  }

  return { ok: true, meta: getUserProfilePhotoMeta(normalizedUserId) };
}

export function deleteUserProfilePhoto(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return { ok: false, status: 400, error: "\uC0AC\uC6A9\uC790 ID\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const row = getDb()
    .prepare("SELECT storage_path FROM user_profile_photo_files WHERE user_id = ?")
    .get(normalizedUserId);
  if (!row) {
    return { ok: false, status: 404, error: "\uD504\uB85C\uD544 \uC0AC\uC9C4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  removeStoredFile(row.storage_path);
  getDb().prepare("DELETE FROM user_profile_photo_files WHERE user_id = ?").run(normalizedUserId);
  return { ok: true };
}
