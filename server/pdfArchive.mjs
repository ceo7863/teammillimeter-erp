import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";

function parseStatementSalesIds(raw) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((id) => id);
  } catch {
    return undefined;
  }
}

function serializeStatementSalesIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return null;
  return JSON.stringify(ids.map((id) => id));
}

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
    sentViaLink: Boolean(row.sent_via_link),
    statementTotalAmount:
      row.statement_total_amount != null ? Number(row.statement_total_amount) : undefined,
    paymentStatus: row.payment_status || undefined,
    linkedBankTransactionId: row.linked_bank_transaction_id || undefined,
    linkedPaymentVoucherId:
      row.linked_payment_voucher_id != null && row.linked_payment_voucher_id !== ""
        ? row.linked_payment_voucher_id
        : undefined,
    shareLinkUrl: row.share_link_url || undefined,
    statementSalesIds: parseStatementSalesIds(row.statement_sales_ids),
  };
}

function ensurePdfArchiveColumn(name, definition) {
  const columns = getDb().prepare("PRAGMA table_info(pdf_archives)").all();
  if (!columns.some((column) => column.name === name)) {
    getDb().exec(`ALTER TABLE pdf_archives ADD COLUMN ${name} ${definition}`);
  }
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

  ensurePdfArchiveColumn("share_token", "TEXT");
  ensurePdfArchiveColumn("sent_via_link", "INTEGER NOT NULL DEFAULT 0");
  ensurePdfArchiveColumn("statement_total_amount", "INTEGER");
  ensurePdfArchiveColumn("payment_status", "TEXT");
  ensurePdfArchiveColumn("linked_bank_transaction_id", "TEXT");
  ensurePdfArchiveColumn("linked_payment_voucher_id", "TEXT");
  ensurePdfArchiveColumn("share_link_url", "TEXT");
  ensurePdfArchiveColumn("statement_sales_ids", "TEXT");

  getDb().exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_archives_share_token ON pdf_archives(share_token)`);
  getDb().exec(`CREATE INDEX IF NOT EXISTS idx_pdf_archives_sent_via_link ON pdf_archives(sent_via_link)`);
}

export function listPdfArchiveMetas() {
  const rows = getDb().prepare("SELECT * FROM pdf_archives ORDER BY created_at DESC").all();
  return rows.map(rowToMeta);
}

export function listSentStatementArchiveMetas() {
  const rows = getDb()
    .prepare("SELECT * FROM pdf_archives WHERE sent_via_link = 1 ORDER BY created_at DESC")
    .all();
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
  const sentViaLink = meta.sentViaLink ? 1 : 0;
  const paymentStatus = meta.paymentStatus || (meta.sentViaLink ? "pending" : null);

  getDb()
    .prepare(`
      INSERT INTO pdf_archives (
        id, file_name, created_at, category, subject_name,
        period_start, period_end, statement_view,
        file_size, page_count, storage_path, created_by,
        sent_via_link, statement_total_amount, payment_status, share_link_url,
        statement_sales_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      sentViaLink,
      meta.statementTotalAmount != null ? Number(meta.statementTotalAmount) : null,
      paymentStatus,
      meta.shareLinkUrl || null,
      serializeStatementSalesIds(meta.statementSalesIds),
    );

  return rowToMeta(
    getDb().prepare("SELECT * FROM pdf_archives WHERE id = ?").get(id)
  );
}

export function updatePdfArchiveMeta(id, patch = {}) {
  const row = getDb().prepare("SELECT * FROM pdf_archives WHERE id = ?").get(id);
  if (!row) return null;

  const next = {
    sent_via_link: patch.sentViaLink != null ? (patch.sentViaLink ? 1 : 0) : row.sent_via_link,
    statement_total_amount:
      patch.statementTotalAmount != null ? Number(patch.statementTotalAmount) : row.statement_total_amount,
    payment_status: patch.paymentStatus != null ? patch.paymentStatus : row.payment_status,
    linked_bank_transaction_id:
      patch.linkedBankTransactionId != null ? patch.linkedBankTransactionId : row.linked_bank_transaction_id,
    linked_payment_voucher_id:
      patch.linkedPaymentVoucherId != null ? String(patch.linkedPaymentVoucherId) : row.linked_payment_voucher_id,
    share_link_url: patch.shareLinkUrl != null ? patch.shareLinkUrl : row.share_link_url,
    statement_sales_ids:
      patch.statementSalesIds != null
        ? serializeStatementSalesIds(patch.statementSalesIds)
        : row.statement_sales_ids,
  };

  getDb()
    .prepare(`
      UPDATE pdf_archives SET
        sent_via_link = ?,
        statement_total_amount = ?,
        payment_status = ?,
        linked_bank_transaction_id = ?,
        linked_payment_voucher_id = ?,
        share_link_url = ?,
        statement_sales_ids = ?
      WHERE id = ?
    `)
    .run(
      next.sent_via_link,
      next.statement_total_amount,
      next.payment_status,
      next.linked_bank_transaction_id,
      next.linked_payment_voucher_id,
      next.share_link_url,
      next.statement_sales_ids,
      id,
    );

  return getPdfArchiveMetaById(id);
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
