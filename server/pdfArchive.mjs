import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getDb, getErpState, runInTransaction } from "./db.mjs";

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

function parseStatementSalesSnapshot(raw) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map((row) => ({
        saleId: row?.saleId != null ? String(row.saleId) : "",
        billedAmount: Number(row?.billedAmount) || 0,
      }))
      .filter((row) => row.saleId);
  } catch {
    return undefined;
  }
}

/**
 * Phase 3 statement regeneration policy.
 *
 * Regenerating a statement PDF must never move cash: Receipts and allocations stay bound to
 * `saleId`, so the archive version only records which sales it covered and what they were
 * billed at render time. Client totals dedupe by `saleId`, so the same sale appearing on
 * several archive versions is counted once.
 */
export function buildStatementSalesSnapshot(statementSalesIds, sales = []) {
  if (!Array.isArray(statementSalesIds) || !statementSalesIds.length) return null;
  const salesById = new Map((sales || []).map((row) => [String(row?.id ?? ""), row]));
  const seen = new Set();
  const rows = [];
  for (const rawId of statementSalesIds) {
    const saleId = String(rawId ?? "").trim();
    if (!saleId || seen.has(saleId)) continue;
    seen.add(saleId);
    const sale = salesById.get(saleId);
    rows.push({ saleId, billedAmount: Math.round(Number(sale?.amount) || 0) });
  }
  return rows.length ? rows : null;
}

function serializeStatementSalesSnapshot(statementSalesIds) {
  if (!Array.isArray(statementSalesIds) || !statementSalesIds.length) return null;
  let sales = [];
  try {
    sales = getErpState(["sales"]).data?.sales || [];
  } catch {
    sales = [];
  }
  const snapshot = buildStatementSalesSnapshot(statementSalesIds, sales);
  return snapshot ? JSON.stringify(snapshot) : null;
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
    linkedReceiptId: row.linked_receipt_id || undefined,
    shareLinkUrl: row.share_link_url || undefined,
    statementSalesIds: parseStatementSalesIds(row.statement_sales_ids),
    statementSalesSnapshot: parseStatementSalesSnapshot(row.statement_sales_snapshot),
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
  /** Phase 2 unified AR: statement ↔ Receipt link (replaces linked_payment_voucher_id). */
  ensurePdfArchiveColumn("linked_receipt_id", "TEXT");
  ensurePdfArchiveColumn("share_link_url", "TEXT");
  ensurePdfArchiveColumn("statement_sales_ids", "TEXT");
  /** Phase 3: `[{ saleId, billedAmount }]` captured when the version was rendered. */
  ensurePdfArchiveColumn("statement_sales_snapshot", "TEXT");

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
        statement_sales_ids, statement_sales_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      serializeStatementSalesSnapshot(meta.statementSalesIds),
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
    linked_receipt_id:
      patch.linkedReceiptId != null ? String(patch.linkedReceiptId) : row.linked_receipt_id,
    share_link_url: patch.shareLinkUrl != null ? patch.shareLinkUrl : row.share_link_url,
    statement_sales_ids:
      patch.statementSalesIds != null
        ? serializeStatementSalesIds(patch.statementSalesIds)
        : row.statement_sales_ids,
    // A regenerated statement keeps its original snapshot unless the covered sales change.
    statement_sales_snapshot:
      patch.statementSalesIds != null
        ? serializeStatementSalesSnapshot(patch.statementSalesIds)
        : row.statement_sales_snapshot,
  };

  getDb()
    .prepare(`
      UPDATE pdf_archives SET
        sent_via_link = ?,
        statement_total_amount = ?,
        payment_status = ?,
        linked_bank_transaction_id = ?,
        linked_payment_voucher_id = ?,
        linked_receipt_id = ?,
        share_link_url = ?,
        statement_sales_ids = ?,
        statement_sales_snapshot = ?
      WHERE id = ?
    `)
    .run(
      next.sent_via_link,
      next.statement_total_amount,
      next.payment_status,
      next.linked_bank_transaction_id,
      next.linked_payment_voucher_id,
      next.linked_receipt_id,
      next.share_link_url,
      next.statement_sales_ids,
      next.statement_sales_snapshot,
      id,
    );

  return getPdfArchiveMetaById(id);
}

/**
 * Regenerate the rendered PDF in place. Deliberately touches only file metadata: the
 * statement's `statement_sales_ids` / snapshot, payment status cache and Receipt link are
 * preserved, so re-rendering never detaches a Receipt or double-counts a sale.
 */
export function replacePdfArchiveFile(id, buffer, patch = {}) {
  const row = getDb().prepare("SELECT * FROM pdf_archives WHERE id = ?").get(id);
  if (!row) return null;
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("PDF 파일이 비어 있습니다.");
  }

  fs.writeFileSync(row.storage_path, buffer);

  const fileName = patch.fileName != null ? String(patch.fileName) : row.file_name;
  const pageCount = patch.pageCount != null ? Number(patch.pageCount) || 1 : row.page_count;

  getDb()
    .prepare(
      `
      UPDATE pdf_archives SET
        file_name = ?,
        file_size = ?,
        page_count = ?
      WHERE id = ?
    `,
    )
    .run(fileName, buffer.length, pageCount, id);

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

function extractShareTokenFromUrl(url) {
  const match = String(url || "").match(/\/pdf-share\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]).trim() : "";
}

/** Move share_token / share_link_url from duplicate to keeper so customer links keep working. */
export function migratePdfArchiveShareLink(keeperId, duplicateId) {
  if (!keeperId || !duplicateId || keeperId === duplicateId) {
    return getPdfArchiveMetaById(keeperId);
  }

  const db = getDb();
  const keeper = db
    .prepare("SELECT id, share_token, share_link_url FROM pdf_archives WHERE id = ?")
    .get(keeperId);
  const duplicate = db
    .prepare("SELECT id, share_token, share_link_url FROM pdf_archives WHERE id = ?")
    .get(duplicateId);
  if (!keeper || !duplicate) return getPdfArchiveMetaById(keeperId);

  const keeperToken = String(keeper.share_token || "").trim();
  const duplicateToken = String(duplicate.share_token || "").trim();
  const keeperUrl = String(keeper.share_link_url || "").trim();
  const duplicateUrl = String(duplicate.share_link_url || "").trim();
  const effectiveDuplicateToken = duplicateToken || extractShareTokenFromUrl(duplicateUrl);

  let nextToken = keeperToken;
  let nextUrl = keeperUrl;

  if (!keeperToken && effectiveDuplicateToken) {
    nextToken = effectiveDuplicateToken;
    if (!keeperUrl && duplicateUrl) nextUrl = duplicateUrl;
  } else if (!keeperUrl && duplicateUrl) {
    nextUrl = duplicateUrl;
  }

  const tokenChanged = Boolean(nextToken && nextToken !== keeperToken);
  const urlChanged = Boolean(nextUrl && nextUrl !== keeperUrl);
  if (!tokenChanged && !urlChanged) return getPdfArchiveMetaById(keeperId);

  runInTransaction(db, () => {
    if (tokenChanged) {
      db.prepare("UPDATE pdf_archives SET share_token = NULL WHERE id = ?").run(duplicateId);
      db.prepare("UPDATE pdf_archives SET share_token = ? WHERE id = ?").run(nextToken, keeperId);
    }
    if (urlChanged) {
      db.prepare("UPDATE pdf_archives SET share_link_url = ? WHERE id = ?").run(nextUrl, keeperId);
    }
  });

  return getPdfArchiveMetaById(keeperId);
}
