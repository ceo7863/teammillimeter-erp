import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();

const txs = (data.bankTransactions || []).filter((t) => {
  const cp = String(t.counterpartyName || "");
  const sub = String(t.linkedSubject || "");
  const desc = String(t.description || "");
  return (
    cp.includes("\uC6B0\uB9BC") ||
    sub.includes("\uC6B0\uB9BC") ||
    sub.includes("\uC2A4\uD14C\uC778") ||
    desc.includes("\uC6B0\uB9BC")
  );
});

console.log("matching txs:", txs.length);
for (const t of txs.sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt))).slice(0, 15)) {
  console.log(
    JSON.stringify({
      id: t.id,
      date: String(t.transactionAt).slice(0, 10),
      deposit: t.deposit,
      counterparty: t.counterpartyName,
      linkedSubject: t.linkedSubject,
      folderId: t.folderId,
      linkedPaymentVoucherId: t.linkedPaymentVoucherId,
      linkedPdfArchiveId: t.linkedPdfArchiveId,
      classifiedAt: t.classifiedAt,
      memo: t.memo,
    }),
  );
}

const stain = (data.clients || []).find((c) => String(c.name || "").includes("\uC2A4\uD14C\uC778"));
const urim = (data.clients || []).find((c) => String(c.name || "").includes("\uC6B0\uB9BC"));
console.log("stain:", stain ? { name: stain.name, aliases: stain.depositNameAliases } : null);
console.log("urim:", urim ? { name: urim.name, aliases: urim.depositNameAliases } : null);

for (const t of txs) {
  const audits = (data.auditLogs || [])
    .filter((l) => l.entityType === "bankTransaction" && l.entityId === t.id)
    .slice(-8);
  console.log("\naudits for", t.id.slice(0, 8), "count", audits.length);
  for (const a of audits) {
    console.log(
      JSON.stringify({
        at: a.createdAt,
        action: a.action,
        by: a.actorName || a.actor,
        beforeLinked: a.before?.linkedSubject,
        afterLinked: a.after?.linkedSubject,
        beforeFolder: a.before?.folderId,
        afterFolder: a.after?.folderId,
      }),
    );
  }

  const vouchers = (data.paymentVouchers || []).filter((v) => v.bankTransactionId === t.id);
  if (vouchers.length) {
    console.log(
      "vouchers:",
      vouchers.map((v) => ({ id: v.id, client: v.client, site: v.site, amount: v.finalAmount })),
    );
  }
  if (t.linkedPdfArchiveId) {
    const pdf = (data.pdfArchives || []).find((p) => p.id === t.linkedPdfArchiveId);
    console.log("pdf:", pdf ? { id: pdf.id, subject: pdf.subject_name, period: pdf.period_label } : t.linkedPdfArchiveId);
  }
}

const stainLinked = (data.bankTransactions || []).filter((t) => String(t.linkedSubject || "") === "\uC2A4\uD14C\uC778");
console.log("\nstain linkedSubject txs:", stainLinked.length);
