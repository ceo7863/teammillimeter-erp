import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();

const KEY_TX_IDS = [
  "30d5f454-0ea4-4a24-ab99-d81e44f39302",
  "734dd91d-dd09-446a-be30-2cd1622843dd",
];

function pickTx(t) {
  return {
    id: t.id,
    date: String(t.transactionAt || "").slice(0, 10),
    deposit: t.deposit,
    counterparty: t.counterpartyName,
    linkedSubject: t.linkedSubject,
    folderId: t.folderId,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    linkedPdfArchiveId: t.linkedPdfArchiveId,
    linkedSalesId: t.linkedSalesId,
    matchAutoLinked: t.matchAutoLinked,
    matchConfirmedAt: t.matchConfirmedAt,
    matchConfirmedBy: t.matchConfirmedBy,
    classifiedAt: t.classifiedAt,
    memo: t.memo,
  };
}

const txs = (data.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  const sub = String(t.linkedSubject || "");
  const cp = String(t.counterpartyName || "");
  const desc = String(t.description || "");
  return (
    KEY_TX_IDS.includes(t.id) ||
    ((d >= "2026-05-24" && d <= "2026-05-31") &&
      (sub.includes("\uC6B0\uB9BC") ||
        sub.includes("\uC2A4\uD14C\uC778") ||
        cp.includes("\uC6B0\uB9BC") ||
        desc.includes("\uC6B0\uB9BC")))
  );
});

console.log("=== BANK TX (", txs.length, ") ===");
for (const t of txs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(JSON.stringify(pickTx(t)));
}

console.log("\n=== VOUCHERS ===");
for (const t of txs) {
  const vouchers = (data.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === String(t.id));
  if (!vouchers.length) continue;
  console.log("tx", t.id);
  for (const v of vouchers) {
    console.log(
      JSON.stringify({
        id: v.id,
        client: v.client,
        site: v.site,
        amount: v.finalAmount,
        salesId: v.salesId,
        pdf: v.linkedPdfArchiveId,
        createdAt: v.createdAt,
      }),
    );
  }
}

const stain = (data.clients || []).find((c) => String(c.name || "") === "\uC2A4\uD14C\uC778");
const urim = (data.clients || []).find((c) => String(c.name || "") === "\uC6B0\uB9BC");
console.log("\n=== CLIENTS ===");
console.log("stain", stain ? { id: stain.id, name: stain.name, aliases: stain.depositNameAliases, manager: stain.manager } : null);
console.log("urim", urim ? { id: urim.id, name: urim.name, aliases: urim.depositNameAliases, manager: urim.manager } : null);

console.log("\n=== SALES (stain/urim May) ===");
const maySales = (data.sales || []).filter((s) => {
  const d = String(s.date || "");
  return d >= "2026-05-24" && d <= "2026-05-31" && (s.client === "\uC2A4\uD14C\uC778" || s.client === "\uC6B0\uB9BC");
});
for (const s of maySales.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  console.log(JSON.stringify({ id: s.id, date: s.date, client: s.client, site: s.site, amount: s.amount, paid: s.paid }));
}

console.log("\n=== AUDITS bankTransaction ===");
for (const t of txs) {
  const audits = (data.auditLogs || [])
    .filter((l) => l.entityType === "bankTransaction" && l.entityId === t.id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (!audits.length) continue;
  console.log("tx", t.id.slice(0, 8), "count", audits.length);
  for (const a of audits) {
    console.log(
      JSON.stringify({
        at: a.createdAt,
        action: a.action,
        by: a.actorName || a.actor,
        before: {
          linkedSubject: a.before?.linkedSubject,
          matchAutoLinked: a.before?.matchAutoLinked,
          folderId: a.before?.folderId,
          classifiedAt: a.before?.classifiedAt,
          linkedPaymentVoucherId: a.before?.linkedPaymentVoucherId,
        },
        after: {
          linkedSubject: a.after?.linkedSubject,
          matchAutoLinked: a.after?.matchAutoLinked,
          folderId: a.after?.folderId,
          classifiedAt: a.after?.classifiedAt,
          linkedPaymentVoucherId: a.after?.linkedPaymentVoucherId,
        },
      }),
    );
  }
}

console.log("\n=== AUDITS sale (stain/urim) ===");
const saleAudits = (data.auditLogs || [])
  .filter((l) => {
    if (l.entityType !== "sale") return false;
    const blob = JSON.stringify(l);
    return blob.includes("\uC2A4\uD14C\uC778") || blob.includes("\uC6B0\uB9BC");
  })
  .filter((l) => String(l.createdAt || "") >= "2026-05-24")
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
for (const a of saleAudits.slice(-15)) {
  console.log(
    JSON.stringify({
      at: a.createdAt,
      label: a.entityLabel,
      action: a.action,
      by: a.actorName || a.actor,
      beforeClient: a.before?.client,
      afterClient: a.after?.client,
    }),
  );
}

console.log("\n=== MAY 26 ALL BANK TX ===");
const may26All = (data.bankTransactions || []).filter((t) => String(t.transactionAt || "").slice(0, 10) === "2026-05-26");
console.log("count", may26All.length);
for (const t of may26All) {
  console.log(JSON.stringify(pickTx(t)));
}

console.log("\n=== STAIN linkedSubject TXS (all) ===");
const stainLinked = (data.bankTransactions || []).filter((t) => String(t.linkedSubject || "").includes("\uC2A4\uD14C\uC778"));
for (const t of stainLinked) {
  console.log(JSON.stringify(pickTx(t)));
}

console.log("\n=== PAYMENT VOUCHERS stain/urim May ===");
const mayVouchers = (data.paymentVouchers || []).filter((v) => {
  const d = String(v.paymentDate || v.date || v.createdAt || "").slice(0, 10);
  return d >= "2026-05-24" && d <= "2026-05-31" && (v.client === "\uC2A4\uD14C\uC778" || v.client === "\uC6B0\uB9BC");
});
for (const v of mayVouchers) {
  console.log(JSON.stringify({ id: v.id, date: v.paymentDate || v.date, client: v.client, site: v.site, bankTx: v.bankTransactionId, amount: v.finalAmount }));
}

console.log("\n=== DELETED VOUCHERS for key txs ===");
for (const id of KEY_TX_IDS) {
  const allVouchers = (data.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === id);
  console.log(id.slice(0, 8), "vouchers", allVouchers.length);
}

console.log("\n=== ALL AUDITS mentioning key tx ids ===");
for (const id of KEY_TX_IDS) {
  const audits = (data.auditLogs || []).filter((l) => JSON.stringify(l).includes(id));
  console.log(id.slice(0, 8), "audit hits", audits.length);
  for (const a of audits.slice(-5)) {
    console.log(JSON.stringify({ at: a.createdAt, type: a.entityType, entityId: a.entityId, action: a.action }));
  }
}

console.log("\n=== PDF for May 29 candidate ===");
const pdfs = (data.pdfArchives || []).filter((p) => String(p.subject_name || "").includes("\uC6B0\uB9BC") || String(p.period_label || "").includes("2026-05-2"));
console.log("pdf count", pdfs.length);
for (const p of pdfs.slice(0, 10)) {
  console.log(JSON.stringify({ id: p.id, subject: p.subject_name, period: p.period_label, status: p.payment_status, linkedTx: p.linked_bank_transaction_id }));
}

console.log("\n=== PDF ARCHIVES linked ===");
for (const t of txs.filter((row) => row.linkedPdfArchiveId)) {
  const pdf = (data.pdfArchives || []).find((p) => p.id === t.linkedPdfArchiveId);
  console.log(
    JSON.stringify({
      txId: t.id.slice(0, 8),
      pdfId: t.linkedPdfArchiveId,
      subject: pdf?.subject_name,
      period: pdf?.period_label,
      paymentStatus: pdf?.payment_status,
    }),
  );
}
