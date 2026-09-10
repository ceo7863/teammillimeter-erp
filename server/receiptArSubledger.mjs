import {
  listReceiptAllocations,
  listReceipts,
  receiptMoney,
  summarizeReceipt,
} from "./receipts.mjs";

function inRange(date, start, end) {
  const d = String(date || "").slice(0, 10);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function resolveClient(clients, clientId) {
  const id = String(clientId || "").trim();
  const client = (clients || []).find((row) => String(row.id) === id);
  if (!client) {
    const err = new Error("거래처를 찾을 수 없습니다.");
    err.status = 404;
    err.code = "CLIENT_NOT_FOUND";
    throw err;
  }
  return client;
}

function postedAllocAmountBySale(allocations) {
  const map = new Map();
  for (const row of allocations || []) {
    if (row.status !== "posted") continue;
    const key = String(row.saleId);
    map.set(key, (map.get(key) || 0) + receiptMoney(row.amount));
  }
  return map;
}

/**
 * Client AR subledger for a period.
 * Opening AR = billed before start - posted allocations dated before start - adjustments before start (currently 0).
 * No customer data mutation.
 */
export function buildClientArSubledger(data, { clientId, startDate, endDate } = {}) {
  const client = resolveClient(data.clients || [], clientId);
  const clientName = String(client.name || "").trim();
  const start = startDate ? String(startDate).slice(0, 10) : "";
  const end = endDate ? String(endDate).slice(0, 10) : "";

  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const sales = (data.sales || []).filter((sale) => String(sale.client || "").trim() === clientName);

  const allocBySale = postedAllocAmountBySale(allocations);
  const receiptById = new Map(receipts.map((row) => [String(row.id), row]));

  const allocationDate = (allocation) => {
    const receipt = receiptById.get(String(allocation.receiptId));
    return String(receipt?.receiptDate || allocation.createdAt || "").slice(0, 10);
  };

  let openingBilled = 0;
  let openingAllocated = 0;
  let periodSales = 0;
  let periodReceiptsGross = 0;
  let periodAdjustments = 0;
  let closingUnallocated = 0;

  for (const sale of sales) {
    const billed = receiptMoney(sale.amount);
    const saleDate = String(sale.date || "").slice(0, 10);
    if (start && saleDate && saleDate < start) openingBilled += billed;
    if (inRange(saleDate, start, end)) periodSales += billed;
  }

  for (const allocation of allocations) {
    if (allocation.status !== "posted") continue;
    const receipt = receiptById.get(String(allocation.receiptId));
    if (!receipt || String(receipt.clientId) !== String(client.id)) continue;
    if (receipt.status === "draft") continue;
    const amount = receiptMoney(allocation.amount);
    const date = allocationDate(allocation);
    if (start && date && date < start) openingAllocated += amount;
  }

  const periodReceiptRows = [];
  for (const receipt of receipts) {
    if (String(receipt.clientId) !== String(client.id)) continue;
    if (receipt.status === "draft") continue;
    if (!inRange(receipt.receiptDate, start, end)) continue;
    const rows = allocations.filter((row) => String(row.receiptId) === String(receipt.id));
    const summary = summarizeReceipt(receipt, rows);
    periodReceiptsGross += receiptMoney(receipt.grossAmount);
    if (receipt.status === "posted" && !receipt.reversalOfReceiptId) {
      closingUnallocated += summary.unallocatedAmount;
    }
    periodReceiptRows.push({
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      receiptDate: receipt.receiptDate,
      grossAmount: receiptMoney(receipt.grossAmount),
      allocatedAmount: summary.allocatedAmount,
      unallocatedAmount: summary.unallocatedAmount,
      channel: receipt.channel,
      source: receipt.source,
      status: receipt.status,
      bankTransactionId: receipt.bankTransactionId,
      sentStatementId: receipt.sentStatementId,
      memo: receipt.memo || "",
    });
  }

  // Unallocated prepaid as of end: all posted non-reversal receipts for client up to end
  let unallocatedPrepaid = 0;
  for (const receipt of receipts) {
    if (String(receipt.clientId) !== String(client.id)) continue;
    if (receipt.status !== "posted") continue;
    if (receipt.reversalOfReceiptId) continue;
    if (end && String(receipt.receiptDate || "") > end) continue;
    const rows = allocations.filter(
      (row) => String(row.receiptId) === String(receipt.id) && row.status === "posted",
    );
    const summary = summarizeReceipt(receipt, rows);
    unallocatedPrepaid += summary.unallocatedAmount;
  }

  const saleRows = sales
    .filter((sale) => {
      const date = String(sale.date || "").slice(0, 10);
      if (end && date > end) return false;
      return true;
    })
    .map((sale) => {
      const billed = receiptMoney(sale.amount);
      const allocated = allocBySale.get(String(sale.id)) || 0;
      // Only count allocations dated <= end
      let allocatedToEnd = 0;
      for (const allocation of allocations) {
        if (allocation.status !== "posted") continue;
        if (String(allocation.saleId) !== String(sale.id)) continue;
        const date = allocationDate(allocation);
        if (end && date > end) continue;
        allocatedToEnd += receiptMoney(allocation.amount);
      }
      return {
        saleId: sale.id,
        date: sale.date,
        site: sale.site || sale.memo || "",
        billedAmount: billed,
        allocatedAmount: allocatedToEnd,
        balance: Math.max(billed - allocatedToEnd, 0),
        voucherNo: sale.voucherNo || sale.id,
      };
    })
    .filter((row) => {
      if (!start) return true;
      // include opening open balances and period activity
      const sale = sales.find((s) => String(s.id) === String(row.saleId));
      const saleDate = String(sale?.date || "").slice(0, 10);
      return saleDate >= start || row.balance > 0 || row.allocatedAmount > 0;
    });

  const openingAr = Math.max(openingBilled - openingAllocated - 0, 0);
  const closingAr = Math.max(openingAr + periodSales - periodReceiptsGross - periodAdjustments, 0);

  return {
    clientId: String(client.id),
    clientName,
    startDate: start || null,
    endDate: end || null,
    openingAr,
    periodSales,
    periodReceipts: periodReceiptsGross,
    periodAdjustments,
    closingAr,
    unallocatedPrepaid,
    periodUnallocatedIncrease: closingUnallocated,
    sales: saleRows,
    receipts: periodReceiptRows,
    policyNotes: {
      billedAmountSource: "sale.amount (unchanged; no VAT transform)",
      receiptVat: "forbidden — allocations use billed remaining only",
      adjustments: "not implemented in Phase 1 (always 0)",
    },
  };
}
