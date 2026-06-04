import { DatabaseSync } from "node:sqlite";

function buildAutoLinkedSaleIdSet(paymentVouchers, bankTransactions, sales) {
  const autoTxIds = new Set(
    bankTransactions.filter((tx) => tx.matchAutoLinked === true).map((tx) => String(tx.id)),
  );
  const saleIds = new Set();
  paymentVouchers.forEach((voucher) => {
    if (!voucher.bankTransactionId || !autoTxIds.has(String(voucher.bankTransactionId))) return;
    if (voucher.salesId != null && voucher.salesId !== "") saleIds.add(String(voucher.salesId));
    voucher.statementSalesIds?.forEach((id) => {
      if (id == null || id === "") return;
      const key = String(id);
      if (key === String(voucher.salesId)) return;
      const sale = sales.find((row) => String(row.id) === key);
      if (!sales.length || (Number(sale?.paid) || 0) > 0) saleIds.add(key);
    });
  });
  return saleIds;
}

const CLIENT = "\uD648\uB8E8\uB374\uC2A4";
const TARGET_DEPOSIT = 3_613_390;
const WATCH_SALE_IDS = [3367, 3477, 3498, 3529, 3564, 3584, 3600];

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const deposits = (d.bankTransactions || []).filter((t) => {
  if (t.deposit <= 0) return false;
  const text = [t.description, t.counterpartyName, t.linkedSubject, t.memo].join(" ");
  return text.includes("\uB8E8") || String(t.linkedSubject || "") === CLIENT;
});

const targetTx = deposits.find((t) => t.deposit === TARGET_DEPOSIT);
const vouchers = (d.paymentVouchers || []).filter(
  (v) =>
    String(v.client || "") === CLIENT ||
    (targetTx && String(v.bankTransactionId || "") === String(targetTx.id)),
);

const autoLinkedSaleIds = buildAutoLinkedSaleIdSet(
  d.paymentVouchers || [],
  d.bankTransactions || [],
  d.sales || [],
);

const sales = WATCH_SALE_IDS.map((id) => {
  const sale = (d.sales || []).find((row) => Number(row.id) === id);
  return sale
    ? {
        id: sale.id,
        date: sale.date,
        site: sale.site,
        amount: sale.amount,
        paid: sale.paid,
        autoBadge: autoLinkedSaleIds.has(String(id)),
      }
    : { id, missing: true };
});

console.log(
  JSON.stringify(
    {
      targetTx: targetTx
        ? {
            id: targetTx.id,
            transactionAt: targetTx.transactionAt,
            deposit: targetTx.deposit,
            matchAutoLinked: targetTx.matchAutoLinked,
            linkedPaymentVoucherId: targetTx.linkedPaymentVoucherId,
            linkedPdfArchiveId: targetTx.linkedPdfArchiveId,
          }
        : null,
      vouchersOnTargetTx: vouchers
        .filter((v) => targetTx && String(v.bankTransactionId) === String(targetTx.id))
        .map((v) => ({
          id: v.id,
          salesId: v.salesId,
          finalAmount: v.finalAmount,
          statementSalesIds: v.statementSalesIds,
        })),
      autoLinkedSaleIds: [...autoLinkedSaleIds].filter((id) => WATCH_SALE_IDS.includes(Number(id))),
      sales,
      allHomeludensDeposits: deposits
        .sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))
        .map((t) => ({
          id: t.id,
          at: String(t.transactionAt).slice(0, 10),
          deposit: t.deposit,
          matchAutoLinked: t.matchAutoLinked,
          linkedPaymentVoucherId: t.linkedPaymentVoucherId,
        })),
    },
    null,
    2,
  ),
);
