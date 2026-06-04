/**
 * Repair Homeludens: 3 bank deposits (6/2) matched to PDF sent statements.
 * Usage: node scripts/repair-homeludens-three-deposits.mjs [databasePath]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { updatePdfArchiveMeta } from "../server/pdfArchive.mjs";

const CLIENT = "\uD648\uB8E8\uB4E0\uC2A4";
const REMOVE_VOUCHER_IDS = new Set([1780379378889, 1780379378890]);
const WATCH_SALE_IDS = [3367, 3477, 3498, 3529, 3564, 3584, 3600];

const DEPOSIT_BATCHES = [
  {
    txId: "917011fc-d1c7-407e-8edb-efcd85f2e433",
    depositFinal: 110_000,
    saleIds: [3367],
    archiveId: "pdf-1780295977175-2919b6d0",
    periodStart: "2026-04-23",
    periodEnd: "2026-04-23",
  },
  {
    txId: "fa1a9a0f-b53b-418f-8472-68c5e1d25a10",
    depositFinal: 451_000,
    saleIds: [3600],
    archiveId: "pdf-1780295956354-d11e2e36",
    periodStart: "2026-05-27",
    periodEnd: "2026-05-27",
  },
  {
    txId: "192ed4c4-7b13-48d5-bda1-17360aea421d",
    depositFinal: 3_613_390,
    saleIds: [3477, 3498, 3529, 3564, 3584],
    archiveId: "pdf-1780295934749-f97a05e8",
    periodStart: "2026-05-08",
    periodEnd: "2026-05-23",
  },
];

const SUMMARY_ARCHIVE_ID = "pdf-1780272996801-9e266df4";

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

function splitDepositAcrossSales(statementSales, paymentAmount, hasVat) {
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
    let remaining = Number(voucher.finalAmount ?? voucher.amount ?? 0) || 0;
    if (voucher.salesId) {
      const statementIds =
        voucher.statementSalesIds?.length > 1
          ? [...new Set([String(voucher.salesId), ...voucher.statementSalesIds.map((id) => String(id))])]
          : [String(voucher.salesId)];
      if (statementIds.length > 1) {
        const idSet = new Set(statementIds);
        copied
          .filter((row) => idSet.has(String(row.id)) && !row.manualPaidCleared)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)))
          .forEach((row) => {
            if (remaining <= 0) return;
            remaining = applyToRow(row, remaining);
          });
      } else {
        const target = copied.find((row) => String(row.id) === String(voucher.salesId));
        if (target) applyToRow(target, remaining);
      }
      return;
    }
  });

  return copied.map((row) => ({
    id: row.id,
    date: row.date,
    site: row.site,
    amount: row.amount,
    paid: Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0),
    unpaid: Math.max((row.amount || 0) - Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0), 0),
  }));
}

function createPaymentInputLogsFromVouchers(vouchers, savedBy = "repair-homeludens-3dep", batchId = Date.now()) {
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

function buildVouchersForBatch(batch, state, baseId) {
  const tx = (state.bankTransactions || []).find((row) => row.id === batch.txId);
  if (!tx) throw new Error(`Bank tx not found: ${batch.txId}`);

  const statementSales = batch.saleIds.map((salesId) => {
    const sale = (state.sales || []).find((row) => Number(row.id) === Number(salesId));
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

  const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
  const hasVat = Math.round(subtotal * 1.1) === batch.depositFinal;
  const splits =
    statementSales.length === 1
      ? [
          {
            ...statementSales[0],
            finalAmount: batch.depositFinal,
            supplyAmount: hasVat ? Math.round(batch.depositFinal / 1.1) : batch.depositFinal,
            vatAmount: hasVat ? batch.depositFinal - Math.round(batch.depositFinal / 1.1) : 0,
          },
        ]
      : splitDepositAcrossSales(statementSales, batch.depositFinal, hasVat);

  const splitTotal = splits.reduce((sum, row) => sum + row.finalAmount, 0);
  if (splitTotal !== batch.depositFinal) {
    throw new Error(`Split mismatch for ${batch.txId}: ${splitTotal} !== ${batch.depositFinal}`);
  }

  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const memo = `\uD1B5\uC7A5\uC785\uAE08(\uBCF4\uB0B8\uB0B4\uC5ED\uC11C) ${tx.description || tx.counterpartyName || ""}`.trim();

  return splits.map((row, index) => ({
    id: baseId + index,
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
    bankTransactionId: batch.txId,
    statementPeriodStart: batch.periodStart,
    statementPeriodEnd: batch.periodEnd,
    statementSalesIds: batch.saleIds,
    linkedPdfArchiveId: batch.archiveId,
    isPartialPayment: false,
    primary: index === 0,
    batch,
  }));
}

getDb();
const { data: state, version } = getErpState();
const depositTxIds = new Set(DEPOSIT_BATCHES.map((b) => b.txId));

const beforeWatch = applyPaymentVouchers(
  (state.sales || []).filter((s) => WATCH_SALE_IDS.includes(Number(s.id))),
  state.paymentVouchers || [],
);
console.log("BEFORE", JSON.stringify(beforeWatch, null, 2));

state.paymentVouchers = (state.paymentVouchers || []).filter((voucher) => {
  if (REMOVE_VOUCHER_IDS.has(Number(voucher.id))) return false;
  if (depositTxIds.has(String(voucher.bankTransactionId || ""))) return false;
  return true;
});

const removedLogIds = new Set([...REMOVE_VOUCHER_IDS].map(String));
state.paymentInputLogs = (state.paymentInputLogs || []).filter(
  (log) => !removedLogIds.has(String(log.paymentVoucherId)) && !depositTxIds.has(String(log.bankTransactionId || "")),
);

const allNewVouchers = [];
let baseId = Date.now();

for (const batch of DEPOSIT_BATCHES) {
  const vouchers = buildVouchersForBatch(batch, state, baseId);
  baseId += vouchers.length + 10;
  allNewVouchers.push(...vouchers);
}

state.paymentVouchers.push(...allNewVouchers.map(({ primary: _p, batch: _b, ...voucher }) => voucher));
const newLogs = createPaymentInputLogsFromVouchers(allNewVouchers);
state.paymentInputLogs.push(...newLogs);

const linkByTx = new Map();
for (const voucher of allNewVouchers) {
  if (!voucher.primary) continue;
  linkByTx.set(voucher.bankTransactionId, {
    voucherId: voucher.id,
    pdfArchiveId: voucher.linkedPdfArchiveId,
    salesId: allNewVouchers.filter((v) => v.bankTransactionId === voucher.bankTransactionId).length === 1 ? voucher.salesId : undefined,
  });
}

state.bankTransactions = (state.bankTransactions || []).map((row) => {
  const linked = linkByTx.get(row.id);
  if (!linked) return row;
  return {
    ...row,
    linkedPaymentVoucherId: linked.voucherId,
    linkedPdfArchiveId: linked.pdfArchiveId,
    linkedSubject: CLIENT,
    linkedSalesId: linked.salesId,
    matchConfirmedAt: row.matchConfirmedAt || new Date().toISOString(),
    matchConfirmedBy: row.matchConfirmedBy || "repair-homeludens-3dep",
    matchAutoLinked: true,
    folderId: row.folderId || "bank-folder-client-default",
  };
});

const saved = saveErpState(state, version, "repair-homeludens-3dep");
console.log("Saved ERP version", saved.version);

for (const batch of DEPOSIT_BATCHES) {
  const primary = allNewVouchers.find((v) => v.primary && v.bankTransactionId === batch.txId);
  updatePdfArchiveMeta(batch.archiveId, {
    paymentStatus: "confirmed",
    linkedBankTransactionId: batch.txId,
    linkedPaymentVoucherId: primary?.id,
    statementSalesIds: batch.saleIds,
  });
  console.log("PDF updated", batch.archiveId, batch.depositFinal);
}

updatePdfArchiveMeta(SUMMARY_ARCHIVE_ID, {
  paymentStatus: "confirmed",
  linkedBankTransactionId: "192ed4c4-7b13-48d5-bda1-17360aea421d",
  linkedPaymentVoucherId: allNewVouchers.find(
    (v) => v.primary && v.bankTransactionId === "192ed4c4-7b13-48d5-bda1-17360aea421d",
  )?.id,
});

const afterWatch = applyPaymentVouchers(
  (state.sales || []).filter((s) => WATCH_SALE_IDS.includes(Number(s.id))),
  state.paymentVouchers || [],
);
console.log("AFTER", JSON.stringify(afterWatch, null, 2));
console.log(
  "NEW VOUCHERS",
  JSON.stringify(
    allNewVouchers.map((v) => ({
      id: v.id,
      salesId: v.salesId,
      finalAmount: v.finalAmount,
      bankTransactionId: v.bankTransactionId,
      linkedPdfArchiveId: v.linkedPdfArchiveId,
    })),
    null,
    2,
  ),
);

console.log("\nRepair complete.");
