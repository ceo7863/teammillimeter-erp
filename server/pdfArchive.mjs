import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";

function rowToMeta(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    createdAt: row.created_at,
    category: row.category,
    subjectName: row.subject_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    statementView: row.statement_view || undefined,
    fileSize: row.file_size,
    pageCount: row.page_count,
  };
}

export function initPdfArchiveStore() {
  fs.mkdirSync(config.pdfArchiveDir, { recursive: true });
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS pdf_archives (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      category TEXT NOT NULL,
      subject_name TEXT NOT NULL DEFAULT '',
      period_start TEXT NOT NULL DEFAULT '',
      period_end TEXT NOT NULL DEFAULT '',
      statement_view TEXT,
      file_size INTEGER NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 1,
      storage_path TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pdf_archives_created_at ON pdf_archives(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pdf_archives_category ON pdf_archives(category);
  `);

  const columns = getDb().prepare("PRAGMA table_info(pdf_archives)").all();
  if (!columns.some((column) => column.name === "share_token")) {
    getDb().exec(`ALTER TABLE pdf_archives ADD COLUMN share_token TEXT`);
    getDb().exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_archives_share_token ON pdf_archives(share_token)`);
  }
}

export function listPdfArchiveMetas() {
  const rows = getDb().prepare("SELECT * FROM pdf_archives ORDER BY created_at DESC").all();
  return rows.map(rowToMeta);
}

export function getPdfArchiveMetaById(id) {
  const row = getDb().prepare("SELECT * FROM pdf_archives WHERE id = ?").get(id);
  return row ? rowToMeta(row) : null;
}

export function createPdfArchive(buffer, meta, createdBy) {
  const id = `pdf-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const storagePath = path.join(config.pdfArchiveDir, `${id}.pdf`);
  fs.writeFileSync(storagePath, buffer);

  const createdAt = new Date().toISOString();
  getDb()
    .prepare(`
      INSERT INTO pdf_archives (
        id, file_name, created_at, category, subject_name,
        period_start, period_end, statement_view,
        file_size, page_count, storage_path, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      meta.fileName,
      createdAt,
      meta.category,
      meta.subjectName || "",
      meta.periodStart || "",
      meta.periodEnd || "",
      meta.statementView || null,
      buffer.length,
      meta.pageCount || 1,
      storagePath,
      createdBy || null,
    );

  return {
    id,
    fileName: meta.fileName,
    createdAt,
    category: meta.category,
    subjectName: meta.subjectName || "",
    periodStart: meta.periodStart || "",
    periodEnd: meta.periodEnd || "",
    statementView: meta.statementView,
    fileSize: buffer.length,
    pageCount: meta.pageCount || 1,
  };
}

export function getPdfArchiveFile(id) {
  const row = getDb().prepare("SELECT storage_path, file_name FROM pdf_archives WHERE id = ?").get(id);
  if (!row || !fs.existsSync(row.storage_path)) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
  };
}

export function deletePdfArchiveById(id) {
  const row = getDb().prepare("SELECT storage_path FROM pdf_archives WHERE id = ?").get(id);
  if (!row) return false;
  if (fs.existsSync(row.storage_path)) fs.unlinkSync(row.storage_path);
  getDb().prepare("DELETE FROM pdf_archives WHERE id = ?").run(id);
  return true;
}

export function ensurePdfArchiveShareToken(id) {
  const row = getDb().prepare("SELECT share_token FROM pdf_archives WHERE id = ?").get(id);
  if (!row) return null;
  if (row.share_token) return row.share_token;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString("hex");
    try {
      getDb().prepare("UPDATE pdf_archives SET share_token = ? WHERE id = ?").run(token, id);
      return token;
    } catch {
      // rare token collision — retry
    }
  }

  return null;
}

export function getPdfArchiveFileByShareToken(token) {
  const row = getDb()
    .prepare("SELECT storage_path, file_name FROM pdf_archives WHERE share_token = ?")
    .get(String(token || "").trim());
  if (!row || !fs.existsSync(row.storage_path)) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
  };
}
