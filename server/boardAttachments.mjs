import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";

function rowToMeta(row) {
  return {
    id: row.id,
    postId: row.post_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
  };
}

export function initBoardAttachmentStore() {
  fs.mkdirSync(config.boardAttachmentDir, { recursive: true });
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS board_attachments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_board_attachments_post_id ON board_attachments(post_id);
    CREATE INDEX IF NOT EXISTS idx_board_attachments_created_at ON board_attachments(created_at DESC);
  `);
}

function extFromFileName(fileName) {
  const ext = path.extname(String(fileName || ""));
  return ext || "";
}

export function createBoardAttachment(buffer, meta, createdBy) {
  const id = `att-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = extFromFileName(meta.fileName);
  const storagePath = path.join(config.boardAttachmentDir, `${id}${ext}`);
  fs.writeFileSync(storagePath, buffer);

  const createdAt = new Date().toISOString();
  getDb()
    .prepare(`
      INSERT INTO board_attachments (
        id, post_id, file_name, mime_type, file_size, created_at, storage_path, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      meta.postId || "",
      meta.fileName,
      meta.mimeType || "application/octet-stream",
      buffer.length,
      createdAt,
      storagePath,
      createdBy || null,
    );

  return {
    id,
    postId: meta.postId || "",
    fileName: meta.fileName,
    mimeType: meta.mimeType || "application/octet-stream",
    fileSize: buffer.length,
    createdAt,
  };
}

export function getBoardAttachmentFile(id) {
  const row = getDb().prepare("SELECT storage_path, file_name, mime_type FROM board_attachments WHERE id = ?").get(id);
  if (!row || !fs.existsSync(row.storage_path)) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type || "application/octet-stream",
  };
}

export function deleteBoardAttachmentById(id) {
  const row = getDb().prepare("SELECT storage_path FROM board_attachments WHERE id = ?").get(id);
  if (!row) return false;
  if (fs.existsSync(row.storage_path)) fs.unlinkSync(row.storage_path);
  getDb().prepare("DELETE FROM board_attachments WHERE id = ?").run(id);
  return true;
}

export function deleteBoardAttachmentsByPostId(postId) {
  const rows = getDb().prepare("SELECT id, storage_path FROM board_attachments WHERE post_id = ?").all(postId);
  for (const row of rows) {
    if (fs.existsSync(row.storage_path)) fs.unlinkSync(row.storage_path);
  }
  getDb().prepare("DELETE FROM board_attachments WHERE post_id = ?").run(postId);
  return rows.length;
}
