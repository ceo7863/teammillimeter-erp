import { getDb, getErpState } from "../server/db.mjs";
import { DatabaseSync } from "node:sqlite";

getDb();
const { data } = getErpState();
const db = new DatabaseSync(process.env.DATABASE_PATH || "data/erp.sqlite");

const TX_ID = "30d5f454-0ea4-4a24-ab99-d81e44f39302";
const URIM = "\uC6B0\uB9BC";

const cols = db.prepare("PRAGMA table_info(pdf_archives)").all().map((c) => c.name);
console.log("pdf_archives columns:", cols.join(", "));

const pdfs = db
  .prepare(`SELECT id, subject_name, period_start, period_end, payment_status, linked_bank_transaction_id, linked_payment_voucher_id FROM pdf_archives WHERE subject_name LIKE ? OR period_start LIKE ?`)
  .all(`%${URIM}%`, "2026-05%");

console.log("PDF archives:", pdfs.length);
for (const p of pdfs) console.log(JSON.stringify(p));

const txPdf = db.prepare("SELECT id, subject_name, payment_status, linked_bank_transaction_id FROM pdf_archives WHERE linked_bank_transaction_id = ?").all(TX_ID);
console.log("\nPDF linked to May29 tx:", txPdf.length);
for (const p of txPdf) console.log(JSON.stringify(p));

const orphanVouchers = (data.paymentVouchers || []).filter((v) => {
  const d = String(v.paymentDate || v.date || "").slice(0, 10);
  return d === "2026-05-29" && v.client === URIM;
});
console.log("\nMay29 urim vouchers:", orphanVouchers.length);
for (const v of orphanVouchers) {
  console.log(JSON.stringify({ id: v.id, client: v.client, bankTx: v.bankTransactionId, amount: v.finalAmount, pdf: v.linkedPdfArchiveId }));
}

const auditCount = (data.auditLogs || []).length;
const bankAuditCount = (data.auditLogs || []).filter((l) => l.entityType === "bankTransaction").length;
console.log("\nAudit totals:", { all: auditCount, bankTx: bankAuditCount });

const recentBankAudits = (data.auditLogs || [])
  .filter((l) => l.entityType === "bankTransaction")
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  .slice(0, 5);
console.log("Recent bank audits:");
for (const a of recentBankAudits) {
  console.log(JSON.stringify({ at: a.createdAt, id: a.entityId?.slice?.(0, 8), action: a.action, by: a.actorName }));
}

try {
  const versions = db.prepare("SELECT version, updated_at, updated_by FROM erp_state_meta ORDER BY version DESC LIMIT 8").all();
  console.log("\nRecent ERP saves:");
  for (const v of versions) console.log(JSON.stringify(v));
} catch {
  try {
    const versions = db.prepare("SELECT version, updated_at, updated_by FROM erp_versions ORDER BY version DESC LIMIT 8").all();
    console.log("\nRecent ERP saves:");
    for (const v of versions) console.log(JSON.stringify(v));
  } catch (e) {
    console.log("no version table", e.message);
  }
}
