import { DatabaseSync } from "node:sqlite";

function applyPaymentVouchers(sales, vouchers) {
  const copied = sales.map((row) => ({
    ...row,
    basePaid: row.basePaid ?? row.paid ?? 0,
    voucherPaid: 0,
    manualPaidCleared: row.manualPaidCleared || false,
  }));
  const clientCredits = {};

  const applyToRow = (row, amount) => {
    const unpaid = Math.max((row.amount || 0) - (row.basePaid || 0) - (row.voucherPaid || 0), 0);
    const applied = Math.min(unpaid, amount);
    row.voucherPaid += applied;
    return amount - applied;
  };

  vouchers.forEach((voucher) => {
    let remaining = Number(String(voucher.amount ?? "").replace(/[^0-9.-]/g, "")) || 0;

    if (voucher.salesId) {
      const statementIds = voucher.statementSalesIds?.length
        ? [...new Set([String(voucher.salesId), ...voucher.statementSalesIds.map((id) => String(id))])]
        : [String(voucher.salesId)];

      if (statementIds.length > 1) {
        const idSet = new Set(statementIds);
        copied
          .filter((row) => idSet.has(String(row.id)) && !row.manualPaidCleared)
          .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
          .forEach((row) => {
            if (remaining <= 0) return;
            remaining = applyToRow(row, remaining);
          });
      } else {
        const target = copied.find((row) => String(row.id) === String(voucher.salesId));
        if (target) remaining = applyToRow(target, remaining);
      }

      if (remaining > 0) clientCredits[voucher.client] = (clientCredits[voucher.client] || 0) + remaining;
      return;
    }

    let scopedRows = copied.filter((row) => row.client === voucher.client && !row.manualPaidCleared);
    if (voucher.statementSalesIds?.length) {
      const idSet = new Set(voucher.statementSalesIds.map((id) => String(id)));
      scopedRows = scopedRows.filter((row) => idSet.has(String(row.id)));
    }
    scopedRows
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
      .forEach((row) => {
        if (remaining <= 0) return;
        remaining = applyToRow(row, remaining);
      });
    if (remaining > 0) clientCredits[voucher.client] = (clientCredits[voucher.client] || 0) + remaining;
  });

  return copied.map((row) => ({
    ...row,
    paid: Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0),
  }));
}

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const applied = applyPaymentVouchers(d.sales || [], d.paymentVouchers || []);
for (const id of ["3590", "3597"]) {
  const row = applied.find((s) => String(s.id) === id);
  if (!row) continue;
  const unpaid = Math.max((row.amount || 0) - (row.paid || 0), 0);
  console.log({ id: row.id, site: row.site, amount: row.amount, paid: row.paid, unpaid });
}
