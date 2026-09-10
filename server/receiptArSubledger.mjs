import {
  isEffectivePostedAllocation,
  listReceiptAllocations,
  listReceipts,
  receiptMoney,
  saleBelongsToClient,
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

/**
 * Client AR subledger for a period.
 *
 * closingAr =
 *   openingAr + periodBilled + periodDebitAdjustments
 *   - periodAppliedAllocations - periodCreditAdjustments
 *
 * Unallocated prepaid does NOT reduce AR.
 * periodReceiptsGross is cash inflow (separate from AR application).
 */
export function buildClientArSubledger(data, { clientId, startDate, endDate } = {}) {
  const clients = data.clients || [];
  const client = resolveClient(clients, clientId);
  const clientName = String(client.name || "").trim();
  const start = startDate ? String(startDate).slice(0, 10) : "";
  const end = endDate ? String(endDate).slice(0, 10) : "";

  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const receiptById = new Map(receipts.map((row) => [String(row.id), row]));

  const sales = (data.sales || []).filter((sale) => saleBelongsToClient(sale, client, clients));

  const allocationDate = (allocation) => {
    const receipt = receiptById.get(String(allocation.receiptId));
    return String(receipt?.receiptDate || allocation.createdAt || "").slice(0, 10);
  };

  let openingBilled = 0;
  let openingAppliedAllocations = 0;
  let periodBilled = 0;
  let periodAppliedAllocations = 0;
  let periodReceiptsGross = 0;
  let periodAllocatedReceipts = 0;
  let periodDebitAdjustments = 0;
  let periodCreditAdjustments = 0;

  for (const sale of sales) {
    const billed = receiptMoney(sale.amount);
    const saleDate = String(sale.date || "").slice(0, 10);
    if (start && saleDate && saleDate < start) openingBilled += billed;
    if (inRange(saleDate, start, end)) periodBilled += billed;
  }

  for (const allocation of allocations) {
    if (!isEffectivePostedAllocation(allocation, receiptById)) continue;
    const receipt = receiptById.get(String(allocation.receiptId));
    if (!receipt || String(receipt.clientId) !== String(client.id)) continue;
    const amount = receiptMoney(allocation.amount);
    const date = allocationDate(allocation);
    if (start && date && date < start) openingAppliedAllocations += amount;
    if (inRange(date, start, end)) periodAppliedAllocations += amount;
  }

  const periodReceiptRows = [];
  for (const receipt of receipts) {
    if (String(receipt.clientId) !== String(client.id)) continue;
    if (receipt.status === "draft") continue;
    if (!inRange(receipt.receiptDate, start, end)) continue;

    const rows = allocations.filter((row) => String(row.receiptId) === String(receipt.id));
    const summary = summarizeReceipt(receipt, rows);
    const gross = receiptMoney(receipt.grossAmount);

    // Cash inflow by event date: originals contribute +gross (even if later reversed),
    // reversal documents contribute negative grossAmount.
    if (receipt.reversalOfReceiptId) {
      periodReceiptsGross += gross; // already negative
    } else {
      periodReceiptsGross += Math.abs(gross);
    }

    if (receipt.status === "posted" && !receipt.reversalOfReceiptId) {
      periodAllocatedReceipts += summary.allocatedAmount;
    }

    periodReceiptRows.push({
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      receiptDate: receipt.receiptDate,
      grossAmount: gross,
      allocatedAmount: summary.allocatedAmount,
      unallocatedAmount: summary.unallocatedAmount,
      channel: receipt.channel,
      source: receipt.source,
      status: receipt.status,
      bankTransactionId: receipt.bankTransactionId,
      sentStatementId: receipt.sentStatementId,
      reversalOfReceiptId: receipt.reversalOfReceiptId || null,
      memo: receipt.memo || "",
    });
  }

  // Unallocated prepaid as of end date: posted non-reversal receipts dated <= end
  let unallocatedPrepaid = 0;
  let totalGrossToEnd = 0;
  let totalAllocatedToEnd = 0;
  for (const receipt of receipts) {
    if (String(receipt.clientId) !== String(client.id)) continue;
    if (receipt.reversalOfReceiptId) continue;
    if (receipt.status !== "posted") continue;
    if (end && String(receipt.receiptDate || "") > end) continue;
    const rows = allocations.filter((row) => String(row.receiptId) === String(receipt.id));
    const summary = summarizeReceipt(receipt, rows);
    unallocatedPrepaid += summary.unallocatedAmount;
    totalGrossToEnd += receiptMoney(receipt.grossAmount);
    totalAllocatedToEnd += summary.allocatedAmount;
  }

  const cashIdentityOk = totalGrossToEnd === totalAllocatedToEnd + unallocatedPrepaid;

  const saleRows = sales
    .filter((sale) => {
      const date = String(sale.date || "").slice(0, 10);
      if (end && date > end) return false;
      return true;
    })
    .map((sale) => {
      const billed = receiptMoney(sale.amount);
      let allocatedToEnd = 0;
      for (const allocation of allocations) {
        if (!isEffectivePostedAllocation(allocation, receiptById)) continue;
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
        clientId: sale.clientId ?? null,
      };
    })
    .filter((row) => {
      if (!start) return true;
      const sale = sales.find((s) => String(s.id) === String(row.saleId));
      const saleDate = String(sale?.date || "").slice(0, 10);
      return saleDate >= start || row.balance > 0 || row.allocatedAmount > 0;
    });

  const openingAr = Math.max(openingBilled - openingAppliedAllocations, 0);
  const closingAr = Math.max(
    openingAr + periodBilled + periodDebitAdjustments - periodAppliedAllocations - periodCreditAdjustments,
    0,
  );

  return {
    clientId: String(client.id),
    clientName,
    startDate: start || null,
    endDate: end || null,
    openingAr,
    periodSales: periodBilled,
    periodBilled,
    periodAppliedAllocations,
    periodReceipts: periodReceiptsGross,
    periodReceiptsGross,
    periodAllocatedReceipts,
    periodDebitAdjustments,
    periodCreditAdjustments,
    periodAdjustments: periodDebitAdjustments - periodCreditAdjustments,
    closingAr,
    unallocatedPrepaid,
    cashIdentity: {
      ok: cashIdentityOk,
      grossToEnd: totalGrossToEnd,
      allocatedToEnd: totalAllocatedToEnd,
      unallocatedPrepaid,
    },
    sales: saleRows,
    receipts: periodReceiptRows,
    policyNotes: {
      billedAmountSource: "sale.amount (unchanged; no VAT transform)",
      receiptVat: "forbidden — allocations use billed remaining only",
      arReduction: "effective posted allocations only; unallocated prepaid does not reduce AR",
      adjustments: "not implemented in Phase 1 (always 0)",
      clientIdentity: "sale.clientId authoritative; legacy unique name fallback only",
    },
  };
}
