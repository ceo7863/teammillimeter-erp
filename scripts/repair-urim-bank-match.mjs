/**
 * Repair ?? 5/27 bank deposit ? sent statement match.
 * Usage: DATABASE_PATH=/path/to/erp.sqlite node scripts/repair-urim-bank-match.mjs
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { updatePdfArchiveMeta } from "../server/pdfArchive.mjs";

const TX_ID = "734dd91d-dd09-446a-be30-2cd1622843dd";
const OLD_VOUCHER_ID = 1779862164779;
const ARCHIVE_ID = "pdf-1779858029253-c6f3eb03";
const SALE_IDS = [3560, 3571, 3577];
const DEPOSIT_FINAL = 2_646_270;
const CLIENT = "\uC6B0\uB9BC";
const PERIOD_START = "2026-05-20";
const PERIOD_END = "2026-05-22";
const WATCH_SALE_IDS = [...SALE_IDS, 2824, 2834, 2848, 2853];

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
    paymentAmount
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
    let remaining = parseMoney(voucher.amount);

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
    site: row.site,
    amount: row.amount,
    paid: Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0),
  }));
}

function logPaidStatus(label, salesRows, voucherRows) {
  const applied = applyPaymentVouchers(salesRows, voucherRows);
  console.log(`\n=== ${label} ===`);
  for (const id of WATCH_SALE_IDS) {
    const row = applied.find((sale) => String(sale.id) === String(id));
    if (!row) {
      console.log({ id, found: false });
      continue;
    }
    console.log({
      id: row.id,
      date: row.date,
      client: row.client,
      amount: row.amount,
      paid: row.paid,
      unpaid: Math.max((row.amount || 0) - (row.paid || 0), 0),
      site: row.site,
    });
  }
}

function createPaymentInputLogsFromVouchers(vouchers, savedBy = "repair-urim-bank-match", batchId = Date.now()) {
  const createdAt = new Date().toISOString();
  return vouchers.map((voucher, index) => {
    const vatIncluded = voucher.vatType !== "excluded";
    return {
      id: `${batchId}-${index}`,
      createdAt,
      paymentDate: voucher.date || "",
      client: voucher.client || "",
      site: voucher.site || "",
      salesId: voucher.salesId,
      supplyAmount: voucher.amount || 0,
      vatAmount: voucher.vatAmount || 0,
      finalAmount: voucher.finalAmount ?? voucher.amount ?? 0,
      vatIncluded,
      savedBy,
      paymentVoucherId: voucher.id,
    };
  });
}

getDb();
const { data: state, version } = getErpState();

const oldVoucher = (state.paymentVouchers || []).find((v) => String(v.id) === String(OLD_VOUCHER_ID));
if (!oldVoucher) {
  console.error("Old voucher not found:", OLD_VOUCHER_ID);
  process.exit(1);
}

const tx = (state.bankTransactions || []).find((row) => row.id === TX_ID);
if (!tx) {
  console.error("Bank transaction not found:", TX_ID);
  process.exit(1);
}

logPaidStatus("BEFORE (current vouchers)", state.sales || [], state.paymentVouchers || []);

const statementSales = SALE_IDS.map((salesId) => {
  const sale = (state.sales || []).find((row) => String(row.id) === String(salesId));
  if (!sale) throw new Error(`Sale not found: ${salesId}`);
  return {
    salesId: sale.id,
    statementAmount: Number(sale.amount) || 0,
    site: sale.site,
    salesAmount: sale.amount,
    workerCount: saleWorkerCount(sale),
    sale,
  };
});

const splits = splitPaymentAcrossSales(statementSales, DEPOSIT_FINAL, true);
if (splits.length !== SALE_IDS.length) {
  throw new Error(`Expected ${SALE_IDS.length} voucher splits, got ${splits.length}`);
}

const splitTotal = splits.reduce((sum, row) => sum + row.finalAmount, 0);
if (splitTotal !== DEPOSIT_FINAL) {
  throw new Error(`Split total mismatch: ${splitTotal} !== ${DEPOSIT_FINAL}`);
}

const baseId = Date.now();
const memo = `\uD1B5\uC7A5\uC785\uAE08(\uBCF4\uB0B8\uB0B4\uC5ED\uC11C) ${tx.description || tx.counterpartyName || ""}`.trim();
const newVouchers = splits.map((row, index) => ({
  id: baseId + index,
  salesId: row.salesId,
  date: String(tx.transactionAt || "").slice(0, 10),
  client: CLIENT,
  site: String(row.site || ""),
  workerCount: row.workerCount || 0,
  totalSalesAmount: row.salesAmount || row.statementAmount,
  amount: row.supplyAmount,
  vatType: "included",
  supplyAmount: row.supplyAmount,
  vatAmount: row.vatAmount,
  finalAmount: row.finalAmount,
  memo,
  bankTransactionId: TX_ID,
  statementPeriodStart: PERIOD_START,
  statementPeriodEnd: PERIOD_END,
  statementSalesIds: SALE_IDS,
}));

const newLogs = createPaymentInputLogsFromVouchers(newVouchers);
const primaryVoucher = newVouchers[0];

state.paymentVouchers = (state.paymentVouchers || []).filter((v) => String(v.id) !== String(OLD_VOUCHER_ID));
state.paymentVouchers.push(...newVouchers);

state.paymentInputLogs = (state.paymentInputLogs || []).filter(
  (log) => String(log.paymentVoucherId) !== String(OLD_VOUCHER_ID)
);
state.paymentInputLogs.push(...newLogs);

state.bankTransactions = (state.bankTransactions || []).map((row) =>
  row.id === TX_ID
    ? {
        ...row,
        linkedPaymentVoucherId: primaryVoucher.id,
        linkedPdfArchiveId: ARCHIVE_ID,
        linkedSubject: CLIENT,
        linkedSalesId: undefined,
      }
    : row
);

const saved = saveErpState(state, version, "repair-urim-bank-match");
console.log("\nSaved ERP state version", saved.version);

const archiveMeta = updatePdfArchiveMeta(ARCHIVE_ID, {
  statementSalesIds: SALE_IDS,
  paymentStatus: "confirmed",
  linkedBankTransactionId: TX_ID,
  linkedPaymentVoucherId: primaryVoucher.id,
});
console.log("Updated PDF archive:", archiveMeta?.id, archiveMeta?.statementSalesIds);

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

logPaidStatus("AFTER (repaired vouchers)", state.sales || [], state.paymentVouchers || []);

console.log("\nRepair complete.");
