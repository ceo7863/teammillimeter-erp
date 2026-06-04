import { DatabaseSync } from "node:sqlite";
import { getDb } from "../server/db.mjs";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);

const needles = ["\uD648\uB8E8\uB374\uC2A4", "\uD648\uB8E8\uB4E0\uC2A4", "\uB3D9\uD0C4", "\uC2E0\uC548", "\uC778\uC2A4\uBE4C"];
const date = "2026-05-08";

function matches(text) {
  const t = String(text || "");
  return needles.some((n) => t.includes(n));
}

const sales = (d.sales || []).filter(
  (s) => String(s.date || "").startsWith(date) && (matches(s.client) || matches(s.site)),
);
const vouchers = (d.paymentVouchers || []).filter(
  (v) =>
    matches(v.client) ||
    matches(v.site) ||
    sales.some((s) => String(s.id) === String(v.salesId)),
);

const STMT_IDS = [3367, 3477, 3498, 3529, 3564, 3584, 3600];
const stmtSales = STMT_IDS.map((id) => {
  const s = (d.sales || []).find((row) => String(row.id) === String(id));
  return s
    ? { id: s.id, date: s.date, amount: s.amount, client: s.client, site: s.site }
    : { id, missing: true };
});

function simulateApply(vouchers) {
  const copied = (d.sales || [])
    .filter((s) => STMT_IDS.includes(Number(s.id)))
    .map((row) => ({
      ...row,
      basePaid: row.paid ?? 0,
      voucherPaid: 0,
    }));
  const applyToRow = (row, amount) => {
    const unpaid = Math.max((row.amount || 0) - (row.basePaid || 0) - (row.voucherPaid || 0), 0);
    const applied = Math.min(unpaid, amount);
    row.voucherPaid += applied;
    return amount - applied;
  };
  for (const voucher of vouchers) {
    let remaining = Number(voucher.amount) || 0;
    let remainingFinal = Number(voucher.finalAmount ?? voucher.amount) || 0;
    const idSet = new Set(
      (voucher.statementSalesIds || []).map((id) => String(id)).concat(String(voucher.salesId)),
    );
    const scoped = copied
      .filter((row) => idSet.has(String(row.id)))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    for (const row of scoped) {
      if (remaining <= 0) break;
      remaining = applyToRow(row, remaining);
    }
    var _remainingFinal = remainingFinal;
    for (const row of scoped) {
      if (_remainingFinal <= 0) break;
      const unpaid = Math.max((row.amount || 0) - (row.basePaid || 0) - (row.voucherPaid || 0), 0);
      const applied = Math.min(unpaid, _remainingFinal);
      row.voucherPaid += applied;
      _remainingFinal -= applied;
    }
  }
  return copied.map((row) => ({
    id: row.id,
    date: row.date,
    amount: row.amount,
    paidSimAmount: Math.min((row.basePaid || 0) + row.voucherPaid, row.amount),
    voucherPaid: row.voucherPaid,
    unpaid: Math.max((row.amount || 0) - Math.min((row.basePaid || 0) + row.voucherPaid, row.amount), 0),
  }));
}

console.log(
  JSON.stringify(
    {
      statementSales: stmtSales,
      simulateAmountOnly: simulateApply(
        vouchers.map((v) => ({ ...v, finalAmount: undefined })),
      ),
      simulateWithFinal: simulateApply(vouchers),
      sales: sales.map((s) => ({
        id: s.id,
        date: s.date,
        client: s.client,
        site: s.site,
        amount: s.amount,
        paid: s.paid,
        paidAmount: s.paidAmount,
        salesAmount: s.salesAmount,
      })),
      vouchers: vouchers.map((v) => ({
        id: v.id,
        salesId: v.salesId,
        client: v.client,
        site: v.site,
        date: v.date,
        amount: v.amount,
        finalAmount: v.finalAmount,
        supplyAmount: v.supplyAmount,
        vatAmount: v.vatAmount,
        bankTransactionId: v.bankTransactionId,
        statementSalesIds: v.statementSalesIds,
      })),
    },
    null,
    2,
  ),
);
