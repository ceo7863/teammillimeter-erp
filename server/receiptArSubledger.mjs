import {
  isAllocationEffectiveAsOf,
  listReceiptAllocations,
  listReceipts,
  receiptMoney,
  saleBelongsToClient,
  shiftSeoulDate,
  summarizeReceiptAsOf,
  todaySeoul,
} from "./receipts.mjs";

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

function billedAsOf(sales, asOf) {
  return (sales || []).reduce((sum, sale) => {
    const saleDate = String(sale.date || "").slice(0, 10);
    if (!saleDate || saleDate > asOf) return sum;
    return sum + receiptMoney(sale.amount);
  }, 0);
}

function appliedAllocationsAsOf(allocations, receipts, clientId, asOf) {
  const receiptById = new Map((receipts || []).map((row) => [String(row.id), row]));
  return (allocations || []).reduce((sum, allocation) => {
    if (!isAllocationEffectiveAsOf(allocation, receiptById, asOf)) return sum;
    const receipt = receiptById.get(String(allocation.receiptId));
    if (!receipt || String(receipt.clientId) !== String(clientId)) return sum;
    return sum + receiptMoney(allocation.amount);
  }, 0);
}

function unallocatedPrepaidAsOf(receipts, allocations, clientId, asOf) {
  let prepaid = 0;
  let gross = 0;
  let allocated = 0;
  for (const receipt of receipts || []) {
    if (String(receipt.clientId) !== String(clientId)) continue;
    if (receipt.reversalOfReceiptId) continue;
    const summary = summarizeReceiptAsOf(receipt, allocations, asOf);
    prepaid += summary.unallocatedAmount;
    if (String(receipt.receiptDate || "") <= asOf) {
      const reversedAt = receipt.reversedEffectiveDate ? String(receipt.reversedEffectiveDate).slice(0, 10) : null;
      if (!reversedAt || asOf < reversedAt) {
        gross += receiptMoney(receipt.grossAmount);
        allocated += summary.allocatedAmount;
      }
    }
  }
  return {
    unallocatedPrepaid: prepaid,
    grossToEnd: gross,
    allocatedToEnd: allocated,
    ok: gross === allocated + prepaid,
  };
}

function periodCashEvents(receipts, clientId, start, end) {
  const rows = [];
  let periodReceiptsGross = 0;
  for (const receipt of receipts || []) {
    if (String(receipt.clientId) !== String(clientId)) continue;
    const date = String(receipt.receiptDate || "").slice(0, 10);
    if (!date) continue;
    if (start && date < start) continue;
    if (end && date > end) continue;

    const gross = receiptMoney(receipt.grossAmount);
    if (receipt.reversalOfReceiptId) {
      periodReceiptsGross += gross; // negative
    } else {
      periodReceiptsGross += Math.abs(gross);
    }
    rows.push({
      id: receipt.id,
      receiptNo: receipt.receiptNo,
      receiptDate: date,
      grossAmount: gross,
      channel: receipt.channel,
      source: receipt.source,
      status: receipt.status,
      bankTransactionId: receipt.bankTransactionId,
      sentStatementId: receipt.sentStatementId,
      reversalOfReceiptId: receipt.reversalOfReceiptId || null,
      reversedEffectiveDate: receipt.reversedEffectiveDate || null,
      memo: receipt.memo || "",
    });
  }
  return { rows, periodReceiptsGross };
}

/**
 * As-of client AR subledger.
 *
 * openingAr / closingAr are computed directly from billed and applied allocations
 * effective on the day before start / on endDate.
 * periodAppliedAllocations = closingApplied - openingApplied (net period change).
 * Historical snapshots do not change when later reverse/reallocate events occur.
 */
export function buildClientArSubledger(data, { clientId, startDate, endDate } = {}) {
  const clients = data.clients || [];
  const client = resolveClient(clients, clientId);
  const clientName = String(client.name || "").trim();
  const start = startDate ? String(startDate).slice(0, 10) : "";
  const end = endDate ? String(endDate).slice(0, 10) : todaySeoul();

  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const receiptById = new Map(receipts.map((row) => [String(row.id), row]));
  const sales = (data.sales || []).filter((sale) => saleBelongsToClient(sale, client, clients));

  const openingAsOf = start ? shiftSeoulDate(start, -1) : null;
  const openingBilled = openingAsOf ? billedAsOf(sales, openingAsOf) : 0;
  const openingAppliedAllocations = openingAsOf
    ? appliedAllocationsAsOf(allocations, receipts, client.id, openingAsOf)
    : 0;
  const closingBilled = billedAsOf(sales, end);
  const closingAppliedAllocations = appliedAllocationsAsOf(allocations, receipts, client.id, end);

  const periodBilled = closingBilled - openingBilled;
  const periodAppliedAllocations = closingAppliedAllocations - openingAppliedAllocations;
  const periodDebitAdjustments = 0;
  const periodCreditAdjustments = 0;

  const openingAr = Math.max(openingBilled - openingAppliedAllocations, 0);
  const closingAr = Math.max(closingBilled - closingAppliedAllocations, 0);

  const { rows: periodReceiptRows, periodReceiptsGross } = periodCashEvents(
    receipts,
    client.id,
    start,
    end,
  );

  // Enrich period receipt rows with as-of end summary for non-reversal docs dated in period
  const enrichedReceipts = periodReceiptRows.map((row) => {
    const receipt = receipts.find((item) => String(item.id) === String(row.id));
    const summary = receipt ? summarizeReceiptAsOf(receipt, allocations, end) : null;
    return {
      ...row,
      allocatedAmount: summary?.allocatedAmount ?? 0,
      unallocatedAmount: summary?.unallocatedAmount ?? 0,
    };
  });

  const prepaid = unallocatedPrepaidAsOf(receipts, allocations, client.id, end);
  const periodAllocatedReceipts = enrichedReceipts
    .filter((row) => !row.reversalOfReceiptId)
    .reduce((sum, row) => sum + (row.allocatedAmount || 0), 0);

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
        if (String(allocation.saleId) !== String(sale.id)) continue;
        if (!isAllocationEffectiveAsOf(allocation, receiptById, end)) continue;
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

  return {
    clientId: String(client.id),
    clientName,
    startDate: start || null,
    endDate: end || null,
    openingAsOf: openingAsOf || null,
    openingAr,
    openingBilled,
    openingAppliedAllocations,
    closingBilled,
    closingAppliedAllocations,
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
    unallocatedPrepaid: prepaid.unallocatedPrepaid,
    cashIdentity: {
      ok: prepaid.ok,
      grossToEnd: prepaid.grossToEnd,
      allocatedToEnd: prepaid.allocatedToEnd,
      unallocatedPrepaid: prepaid.unallocatedPrepaid,
    },
    sales: saleRows,
    receipts: enrichedReceipts,
    policyNotes: {
      billedAmountSource: "sale.amount (unchanged; no VAT transform)",
      receiptVat: "forbidden — allocations use billed remaining only",
      asOf:
        "opening/closing AR use allocations effective on as-of dates; later reverse/reallocate does not rewrite history",
      arReduction: "effective allocations by effectiveFrom/reversedEffectiveDate; prepaid does not reduce AR",
      adjustments: "not implemented (always 0)",
      clientIdentity: "sale.clientId authoritative; legacy unique name fallback only",
    },
  };
}
