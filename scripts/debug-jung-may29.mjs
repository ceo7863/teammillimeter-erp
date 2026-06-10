import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();

const txs = (data.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  const blob = JSON.stringify(t);
  return d === "2026-05-29" && (blob.includes("\uC815\uC885\uC6B1") || blob.includes("\uD06C\uB808\uC138") || blob.includes("\uD06C\uB808"));
});

console.log("=== 5/29 matching txs ===", txs.length);
for (const t of txs) {
  console.log(JSON.stringify({
    id: t.id,
    date: String(t.transactionAt).slice(0, 10),
    deposit: t.deposit,
    withdrawal: t.withdrawal,
    counterparty: t.counterpartyName,
    description: t.description,
    linkedSubject: t.linkedSubject,
    folderId: t.folderId,
    memo: t.memo,
    classifiedAt: t.classifiedAt,
    linkedPaymentVoucherId: t.linkedPaymentVoucherId,
    linkedSalesId: t.linkedSalesId,
  }, null, 2));
}

const cresse = (data.clients || []).filter((c) => String(c.name || "").includes("\uD06C\uB808"));
console.log("\n=== clients 크레세 ===", cresse.map((c) => ({ name: c.name, aliases: c.depositNameAliases })));

const jung = (data.clients || []).filter((c) => String(c.name || "").includes("\uC815\uC885"));
console.log("=== clients 정종욱 ===", jung.map((c) => ({ name: c.name, aliases: c.depositNameAliases })));

for (const t of txs) {
  const vouchers = (data.paymentVouchers || []).filter((v) => String(v.bankTransactionId) === String(t.id));
  if (vouchers.length) console.log("vouchers", t.id.slice(0, 8), vouchers.map((v) => ({ client: v.client, site: v.site })));
}
