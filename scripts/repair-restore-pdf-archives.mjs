import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { getDb, getErpState } from "../server/db.mjs";
import { initPdfArchiveStore } from "../server/pdfArchive.mjs";
import { config } from "../server/config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const backupPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(rootDir, "data/erp.sqlite.bak-202606010611");

function loadBackupPdfRows(dbPath) {
  const tmp = path.join(rootDir, "data", `.pdf-restore-src-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  const rows = db.prepare("SELECT * FROM pdf_archives").all();
  db.close();
  fs.unlinkSync(tmp);
  return rows;
}

function fileIdFromName(fileName) {
  return fileName.replace(/\.pdf$/i, "");
}

function inferSubjectFromFileName(fileName) {
  const base = fileName.replace(/\.pdf$/i, "");
  return base.startsWith("pdf-") ? "\uBCF5\uAD6C PDF" : base;
}

function buildStubRow(fileName, stat) {
  const id = fileIdFromName(fileName);
  const storagePath = path.join(config.pdfArchiveDir, fileName);
  const createdAt = stat?.mtime?.toISOString?.() || new Date().toISOString();
  return {
    id,
    file_name: fileName,
    created_at: createdAt,
    category: "statement-client",
    subject_name: inferSubjectFromFileName(fileName),
    period_start: createdAt.slice(0, 10),
    period_end: createdAt.slice(0, 10),
    statement_view: null,
    file_size: stat?.size || 0,
    page_count: 1,
    storage_path: storagePath,
    created_by: "repair-restore-pdf-archives",
    share_token: null,
    sent_via_link: 0,
    statement_total_amount: null,
    payment_status: null,
    linked_bank_transaction_id: null,
    linked_payment_voucher_id: null,
    share_link_url: null,
    statement_sales_ids: null,
  };
}

function enrichFromStatementFolders(row, folders) {
  for (const folder of folders) {
    for (const item of folder.items || []) {
      if (String(item.pdfArchiveId || "") !== String(row.id)) continue;
      return {
        ...row,
        subject_name: folder.clientName || folder.workerName || row.subject_name,
        period_start: item.periodStart || row.period_start,
        period_end: item.periodEnd || row.period_end,
        category: folder.workerName ? "statement-worker" : "statement-client",
        statement_view: item.statementView || row.statement_view,
      };
    }
  }
  return row;
}

function main() {
  const backupRows = loadBackupPdfRows(backupPath);
  const { data } = getErpState();
  const statementFolders = data.statementFolders || [];

  const pdfDir = config.pdfArchiveDir;
  const diskFiles = fs.existsSync(pdfDir)
    ? fs.readdirSync(pdfDir).filter((name) => name.toLowerCase().endsWith(".pdf"))
    : [];

  const mergedById = new Map();
  for (const row of backupRows) {
    mergedById.set(String(row.id), { ...row });
  }

  for (const fileName of diskFiles) {
    const id = fileIdFromName(fileName);
    if (mergedById.has(id)) continue;
    const stat = fs.statSync(path.join(pdfDir, fileName));
    const stub = buildStubRow(fileName, stat);
    mergedById.set(id, enrichFromStatementFolders(stub, statementFolders));
  }

  const finalRows = [...mergedById.values()].map((row) =>
    enrichFromStatementFolders(row, statementFolders),
  );

  const summary = {
    dryRun,
    backupPath,
    backupRows: backupRows.length,
    diskFiles: diskFiles.length,
    restoredRows: finalRows.length,
    addedFromDisk: finalRows.length - backupRows.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (dryRun) return;

  const db = getDb();
  db.exec("DROP TABLE IF EXISTS pdf_archives");
  initPdfArchiveStore();

  const insert = db.prepare(`
    INSERT INTO pdf_archives (
      id, file_name, created_at, category, subject_name,
      period_start, period_end, statement_view,
      file_size, page_count, storage_path, created_by,
      share_token, sent_via_link, statement_total_amount, payment_status,
      linked_bank_transaction_id, linked_payment_voucher_id, share_link_url,
      statement_sales_ids
    ) VALUES (
      @id, @file_name, @created_at, @category, @subject_name,
      @period_start, @period_end, @statement_view,
      @file_size, @page_count, @storage_path, @created_by,
      @share_token, @sent_via_link, @statement_total_amount, @payment_status,
      @linked_bank_transaction_id, @linked_payment_voucher_id, @share_link_url,
      @statement_sales_ids
    )
  `);

  db.exec("BEGIN");
  try {
    for (const row of finalRows) {
      insert.run(row);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const count = db.prepare("SELECT COUNT(*) AS c FROM pdf_archives").get().c;
  console.log(JSON.stringify({ ok: true, pdfArchives: count }));
}

main();
