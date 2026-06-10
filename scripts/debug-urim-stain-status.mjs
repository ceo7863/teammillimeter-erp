import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();

const ids = [
  "30d5f454-0ea4-4a24-ab99-d81e44f39302",
  "734dd91d-dd09-446a-be30-2cd1622843dd",
];

const txs = (data.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  const sub = String(t.linkedSubject || "");
  const cp = String(t.counterpartyName || "");
  return (
    ids.includes(t.id) ||
    ((d === "2026-05-26" || d === "2026-05-29" || d === "2026-05-27") &&
      (sub.includes("\uC6B0\uB9BC") || sub.includes("\uC2A4\uD14C\uC778") || cp.includes("\uC6B0\uB9BC")))
  );
});

console.log("=== BANK TX ===");
for (const t of txs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(JSON.stringify({
    id: t.id,
    date: String(t.transactionAt).slice(0, 10),
    deposit: t.deposit,
    counterparty: t.counterpartyName,
    linkedSubject: t.linkedSubject,
    folderId: t.folderId,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    linkedPdfArchiveId: t.linkedPdfArchiveId,
    matchAutoLinked: t.matchAutoLinked,
    matchConfirmedAt: t.matchConfirmedAt,
    classifiedAt: t.classifiedAt,
    memo: t.memo,
  }));
}

console.log("\n=== VOUCHERS ===");
for (const t of txs) {
  const vouchers = (data.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === String(t.id));
  if (!vouchers.length) continue;
  console.log("tx", t.id.slice(0, 8));
  for (const v of vouchers) {
    console.log(JSON.stringify({ id: v.id, client: v.client, site: v.site, amount: v.finalAmount, pdf: v.linkedPdfArchiveId }));
  }
}

const stain = (data.clients || []).find((c) => String(c.name || "") === "\uC2A4\uD14C\uC778");
const urim = (data.clients || []).find((c) => String(c.name || "") === "\uC6B0\uB9BC");
console.log("\n=== CLIENTS ===");
console.log("stain", stain ? { name: stain.name, aliases: stain.depositNameAliases } : null);
console.log("urim", urim ? { name: urim.name, aliases: urim.depositNameAliases } : null);

console.log("\n=== AUDITS (recent) ===");
for (const t of txs) {
  const audits = (data.auditLogs || [])
    .filter((l) => l.entityType === "bankTransaction" && l.entityId === t.id)
    .slice(-5);
  if (!audits.length) continue;
  console.log("tx", t.id.slice(0, 8));
  for (const a of audits) {
    console.log(JSON.stringify({
      at: a.createdAt,
      by: a.actorName || a.actor,
      before: { linkedSubject: a.before?.linkedSubject, matchAutoLinked: a.before?.matchAutoLinked, folderId: a.before?.folderId },
      after: { linkedSubject: a.after?.linkedSubject, matchAutoLinked: a.after?.matchAutoLinked, folderId: a.after?.folderId },
    }));
  }
}

const pdfId = "pdf-1780037547123-bf151613";
const vouchers529 = (data.paymentVouchers || []).filter(
  (v) =>
    String(v.bankTransactionId || "") === "30d5f454-0ea4-4a24-ab99-d81e44f39302" ||
    String(v.linkedPdfArchiveId || "") === pdfId,
);
console.log("\n=== VOUCHERS 5/29 / PDF ===");
for (const v of vouchers529) {
  console.log(JSON.stringify({ id: v.id, client: v.client, bankTx: v.bankTransactionId, pdf: v.linkedPdfArchiveId, amount: v.finalAmount }));
}
