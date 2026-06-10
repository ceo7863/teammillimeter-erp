/**
 * Repair: 2026-06-02 deposit (Lee Jong-hyuk / Custom) linked in PDF but missing payment vouchers.
 * Usage: node scripts/repair-custom-jun2-bank-match.mjs [databasePath]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { updatePdfArchiveMeta } from "../server/pdfArchive.mjs";

const TX_ID = "68b4527f-2ad2-4b7f-9c53-37448e8480c9";
const ARCHIVE_ID = "pdf-1780274040742-940a3d9d";
const PRIMARY_VOUCHER_ID = 1780482779057;
const SALE_IDS = [3440, 3478, 3499];
const DEPOSIT_FINAL = 825_000;
const CLIENT = "\uCEE4\uC2A4\uD140";
const PERIOD_START = "2026-05-04";
const PERIOD_END = "2026-05-11";

function parseMoney(value) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function saleWorkerCount(sale) {
  if (sale.workers?.length) return sale.workers.length;
  return String(sale.worker || "")
    .split(",")
    .filter(Boolean).length;
}

function distributeAmountByWeight(items, totalAmount) {
  const totalWeight = items.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return new Map();

  const allocations = items.map((row) => {
    const exact = (totalAmount * row.weight) / totalWeight;
    return { key: row.key, floor: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });

  let remainder = totalAmount - allocations.reduce((sum, row) => sum + row.floor, 0);
  const sorted = [...allocations].sort((a, b) => b.fraction - a.fraction);
  const result = new Map();
  sorted.forEach((row, index) => {
    const extra = index < remainder ? 1 : 0;
    result.set(row.key, row.floor + extra);
  });
  return result;
}

function splitPaymentAcrossSales(statementSales, paymentAmount, hasVat) {
  const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
  if (subtotal <= 0) return [];

  const finalBySale = distributeAmountByWeight(
    statementSales.map((row) => ({ key: String(row.salesId), weight: row.statementAmount })),
    paymentAmount,
  );

  return statementSales
    .map((row) => {
      const finalAmount = finalBySale.get(String(row.salesId)) || 0;
      const supplyAmount = hasVat ? Math.max(0, Math.round(finalAmount / 1.1)) : finalAmount;
      const vatAmount = Math.max(0, finalAmount - supplyAmount);
      return { ...row, finalAmount, supplyAmount, vatAmount };
    })
    .filter((row) => row.finalAmount > 0);
}

function applyPaymentVouchers(salesRows, voucherRows) {
  const copied = salesRows.map((row) => ({
    ...row,
    basePaid: row.basePaid ?? row.paid ?? 0,
    voucherPaid: 0,
    manualPaidCleared: row.manualPaidCleared || false,
  }));

  const applyToRow = (row, amount) => {
    const unpaid = Math.max((row.amount || 0) - (row.basePaid || 0) - (row.voucherPaid || 0), 0);
    const applied = Math.min(unpaid, amount);
    row.voucherPaid += applied;
    return amount - applied;
  };

  voucherRows.forEach((voucher) => {
    let remaining = parseMoney(voucher.finalAmount ?? voucher.amount);

    if (voucher.salesId) {
      const target = copied.find((row) => String(row.id) === String(voucher.salesId));
      if (target) remaining = applyToRow(target, remaining);
      return;
    }

    let scopedRows = copied.filter((row) => row.client === voucher.client && !row.manualPaidCleared);
    if (voucher.statementSalesIds?.length) {
      const idSet = new Set(voucher.statementSalesIds.map((id) => String(id)));
      scopedRows = scopedRows.filter((row) => idSet.has(String(row.id)));
    } else if (voucher.statementPeriodStart || voucher.statementPeriodEnd) {
      scopedRows = scopedRows.filter((row) => {
        const date = String(row.date || "");
        if (voucher.statementPeriodStart && date < voucher.statementPeriodStart) return false;
        if (voucher.statementPeriodEnd && date > voucher.statementPeriodEnd) return false;
        return true;
      });
    }

    scopedRows
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)))
      .forEach((row) => {
        if (remaining <= 0) return;
        remaining = applyToRow(row, remaining);
      });
  });

  return copied.map((row) => ({
    id: row.id,
    date: row.date,
    client: row.client,
    amount: row.amount,
    paid: Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0),
  }));
}

function createPaymentInputLogsFromVouchers(vouchers, savedBy = "repair-custom-jun2", batchId = Date.now()) {
  const createdAt = new Date().toISOString();
  return vouchers.map((voucher, index) => ({
    id: `${batchId}-${index}`,
    createdAt,
    paymentDate: voucher.date || "",
    client: voucher.client || "",
    site: voucher.site || "",
    salesId: voucher.salesId,
    supplyAmount: voucher.amount || 0,
    vatAmount: voucher.vatAmount || 0,
    finalAmount: voucher.finalAmount ?? voucher.amount ?? 0,
    vatIncluded: voucher.vatType !== "excluded",
    savedBy,
    paymentVoucherId: voucher.id,
  }));
}

function logSales(label, salesRows, voucherRows) {
  const applied = applyPaymentVouchers(salesRows, voucherRows);
  console.log(`\n=== ${label} ===`);
  for (const id of SALE_IDS) {
    const row = applied.find((sale) => String(sale.id) === String(id));
    console.log(
      row
        ? {
            id: row.id,
            date: row.date,
            amount: row.amount,
            paid: row.paid,
            unpaid: Math.max((row.amount || 0) - (row.paid || 0), 0),
          }
        : { id, found: false },
    );
  }
}

getDb();
const { data: state, version } = getErpState();

const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank transaction not found:", TX_ID);
  process.exit(1);
}

const existingForTx = (state.paymentVouchers || []).filter(
  (v) => String(v.bankTransactionId || "") === TX_ID,
);
if (existingForTx.length) {
  console.log("Already has vouchers for bank tx:", existingForTx.map((v) => v.id));
  process.exit(0);
}

logSales("BEFORE", state.sales || [], state.paymentVouchers || []);

const statementSales = SALE_IDS.map((salesId) => {
  const sale = (state.sales || []).find((row) => String(row.id) === String(salesId));
  if (!sale) throw new Error(`Sale not found: ${salesId}`);
  return {
    salesId: sale.id,
    statementAmount: Number(sale.amount) || 0,
    site: sale.site,
    salesAmount: sale.amount,
    workerCount: saleWorkerCount(sale),
  };
});

const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
const hasVat = Math.round(subtotal * 1.1) === DEPOSIT_FINAL;
const splits = splitPaymentAcrossSales(statementSales, DEPOSIT_FINAL, hasVat);
if (splits.length !== SALE_IDS.length) {
  throw new Error(`Expected ${SALE_IDS.length} voucher splits, got ${splits.length}`);
}

const splitTotal = splits.reduce((sum, row) => sum + row.finalAmount, 0);
if (splitTotal !== DEPOSIT_FINAL) {
  throw new Error(`Split total mismatch: ${splitTotal} !== ${DEPOSIT_FINAL}`);
}

const txDate = String(tx.transactionAt || "").slice(0, 10);
const memo = `\uD1B5\uC7A5\uC785\uAE08(\uBCF4\uB0B8\uB0B4\uC5ED\uC11C) ${tx.description || tx.counterpartyName || ""}`.trim();
const newVouchers = splits.map((row, index) => ({
  id: index === 0 ? PRIMARY_VOUCHER_ID : PRIMARY_VOUCHER_ID + index,
  salesId: row.salesId,
  date: txDate,
  client: CLIENT,
  site: String(row.site || ""),
  workerCount: row.workerCount || 0,
  totalSalesAmount: row.salesAmount || row.statementAmount,
  amount: row.supplyAmount,
  vatType: hasVat ? "included" : "excluded",
  supplyAmount: row.supplyAmount,
  vatAmount: row.vatAmount,
  finalAmount: row.finalAmount,
  memo,
  bankTransactionId: TX_ID,
  statementPeriodStart: PERIOD_START,
  statementPeriodEnd: PERIOD_END,
  statementSalesIds: SALE_IDS,
  linkedPdfArchiveId: ARCHIVE_ID,
}));

const newLogs = createPaymentInputLogsFromVouchers(newVouchers);
const primaryVoucher = newVouchers[0];

state.paymentVouchers = [...(state.paymentVouchers || []), ...newVouchers];
state.paymentInputLogs = [...(state.paymentInputLogs || []), ...newLogs];

state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedPaymentVoucherId: primaryVoucher.id,
        linkedPdfArchiveId: ARCHIVE_ID,
        linkedSubject: CLIENT,
        linkedSalesId: newVouchers.length === 1 ? primaryVoucher.salesId : undefined,
        matchConfirmedAt: row.matchConfirmedAt || new Date().toISOString(),
        matchConfirmedBy: row.matchConfirmedBy || "repair-custom-jun2",
        matchAutoLinked: row.matchAutoLinked ?? true,
        folderId: row.folderId || "bank-folder-client-default",
      }
    : row,
);

const saved = saveErpState(state, version, "repair-custom-jun2");
console.log("Saved ERP state version", saved.version);

const archiveMeta = updatePdfArchiveMeta(ARCHIVE_ID, {
  statementSalesIds: SALE_IDS,
  paymentStatus: "confirmed",
  linkedBankTransactionId: TX_ID,
  linkedPaymentVoucherId: primaryVoucher.id,
});
console.log("Updated PDF archive:", archiveMeta?.id);

console.log("\nNew vouchers:");
for (const voucher of newVouchers) {
  console.log({
    id: voucher.id,
    salesId: voucher.salesId,
    supplyAmount: voucher.supplyAmount,
    vatAmount: voucher.vatAmount,
    finalAmount: voucher.finalAmount,
  });
}

logSales("AFTER", state.sales || [], state.paymentVouchers || []);
console.log("\nRepair complete.");
