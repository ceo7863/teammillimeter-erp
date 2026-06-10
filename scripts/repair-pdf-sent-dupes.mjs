/**
 * Remove duplicate sent-statement PDF archives, migrating share links to the keeper.
 * Usage: DATABASE_PATH=/path/to/erp.sqlite node scripts/repair-pdf-sent-dupes.mjs
 */
import fs from "fs";
import { migratePdfArchiveShareLink, updatePdfArchiveMeta } from "../server/pdfArchive.mjs";

function buildKey(row) {
  const view = row.category === "statement-client" ? row.statement_view || "summary" : "";
  return [row.category, row.subject_name?.trim(), row.period_start || "", row.period_end || "", view].join("|");
}

function rank(row) {
  let score = 0;
  if (row.linked_bank_transaction_id) score += 100;
  if (row.linked_payment_voucher_id) score += 80;
  if (row.statement_sales_ids) score += 15;
  if (row.payment_status === "confirmed") score += 40;
  else if (row.payment_status === "partial") score += 20;
  if (row.share_link_url) score += 10;
  return score;
}

function parseStatementSalesIds(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id).trim()).filter(Boolean).sort();
  } catch {
    return [];
  }
}

function buildMergePatch(keeper, duplicates) {
  const patch = {};
  const salesIds = new Set(parseStatementSalesIds(keeper.statement_sales_ids));
  for (const row of duplicates) {
    for (const id of parseStatementSalesIds(row.statement_sales_ids)) salesIds.add(id);
  }
  if (salesIds.size > parseStatementSalesIds(keeper.statement_sales_ids).length) {
    patch.statementSalesIds = [...salesIds];
  }
  if (!keeper.linked_bank_transaction_id) {
    const linked = duplicates.find((row) => row.linked_bank_transaction_id);
    if (linked?.linked_bank_transaction_id) patch.linkedBankTransactionId = linked.linked_bank_transaction_id;
  }
  if (!keeper.linked_payment_voucher_id) {
    const linked = duplicates.find((row) => row.linked_payment_voucher_id);
    if (linked?.linked_payment_voucher_id) patch.linkedPaymentVoucherId = linked.linked_payment_voucher_id;
  }
  if (!keeper.payment_status || keeper.payment_status === "pending") {
    const ranked = duplicates
      .map((row) => row.payment_status)
      .filter(Boolean);
    const best = ranked.find((status) => status === "confirmed") || ranked.find((status) => status === "partial");
    if (best) patch.paymentStatus = best;
  }
  if (keeper.statement_total_amount == null) {
    const amount = duplicates.find((row) => row.statement_total_amount != null)?.statement_total_amount;
    if (amount != null) patch.statementTotalAmount = Number(amount);
  }
  if (!String(keeper.share_link_url || "").trim()) {
    const linked = duplicates.find((row) => String(row.share_link_url || "").trim());
    if (linked?.share_link_url) patch.shareLinkUrl = linked.share_link_url;
  }
  return Object.keys(patch).length ? patch : null;
}

const { getDb } = await import("../server/db.mjs");
const db = getDb();
const sent = db.prepare("SELECT * FROM pdf_archives WHERE sent_via_link = 1").all();
const byKey = new Map();

for (const row of sent) {
  const key = buildKey(row);
  const list = byKey.get(key) || [];
  list.push(row);
  byKey.set(key, list);
}

let removed = 0;
let migrated = 0;
for (const [key, group] of byKey) {
  if (group.length < 2) continue;
  const sorted = [...group].sort(
    (a, b) => rank(b) - rank(a) || String(b.created_at).localeCompare(String(a.created_at)),
  );
  const keeper = sorted[0];
  const duplicates = sorted.slice(1);
  console.log("keep:", keeper.subject_name, keeper.id, "key:", key);

  const patch = buildMergePatch(keeper, duplicates);
  if (patch) updatePdfArchiveMeta(keeper.id, patch);

  for (const row of duplicates) {
    const beforeToken = db.prepare("SELECT share_token FROM pdf_archives WHERE id = ?").get(keeper.id)?.share_token;
    migratePdfArchiveShareLink(keeper.id, row.id);
    const afterToken = db.prepare("SELECT share_token FROM pdf_archives WHERE id = ?").get(keeper.id)?.share_token;
    if (!beforeToken && afterToken) migrated += 1;

    console.log("  delete:", row.id, row.created_at);
    if (row.storage_path && fs.existsSync(row.storage_path)) fs.unlinkSync(row.storage_path);
    db.prepare("DELETE FROM pdf_archives WHERE id = ?").run(row.id);
    removed += 1;
  }
}

console.log("removed", removed, "share links migrated", migrated);
