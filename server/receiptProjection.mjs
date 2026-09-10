/**
 * Legacy compatibility projection: Receipt/Allocation → paymentVoucher-shaped rows.
 * Never write these projected rows back into paymentVouchers.
 * Only effective posted allocations on non-reversal posted receipts are projected.
 */

import {
  isEffectivePostedAllocation,
  listReceiptAllocations,
  listReceipts,
  receiptMoney,
} from "./receipts.mjs";

const CHANNEL_TO_DEPOSIT = {
  cash: "cash",
  personal_account: "personal",
  bank: "bank",
  other: "other",
};

export function projectReceiptsToLegacyPaymentVouchers(data = {}) {
  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const receiptById = new Map(receipts.map((row) => [String(row.id), row]));
  const clientsById = new Map((data.clients || []).map((row) => [String(row.id), row]));
  const salesById = new Map((data.sales || []).map((row) => [String(row.id), row]));

  const vouchers = [];
  for (const receipt of receipts) {
    if (!receipt) continue;
    if (receipt.status !== "posted") continue;
    if (receipt.reversalOfReceiptId) continue;

    const client = clientsById.get(String(receipt.clientId));
    const clientName = String(receipt.clientName || client?.name || "");
    const depositChannel = CHANNEL_TO_DEPOSIT[receipt.channel] || "other";
    const rows = allocations.filter(
      (row) => String(row.receiptId) === String(receipt.id) && isEffectivePostedAllocation(row, receiptById),
    );

    for (const allocation of rows) {
      const sale = salesById.get(String(allocation.saleId));
      const amount = receiptMoney(allocation.amount);
      vouchers.push({
        id: `receipt-alloc:${allocation.id}`,
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        allocationId: allocation.id,
        salesId: allocation.saleId,
        date: receipt.receiptDate,
        client: clientName || String(sale?.client || ""),
        site: String(allocation.site || sale?.site || sale?.memo || ""),
        amount,
        supplyAmount: amount,
        vatType: "excluded",
        vatAmount: 0,
        finalAmount: amount,
        memo: receipt.memo || "",
        depositChannel,
        bankTransactionId: receipt.bankTransactionId || undefined,
        linkedPdfArchiveId: receipt.sentStatementId || undefined,
        sourceLedger: "receipt",
        receiptSource: receipt.source,
      });
    }
  }

  return vouchers;
}

export function mergeLegacyVouchersWithReceiptProjection(legacyVouchers = [], projected = []) {
  const legacy = Array.isArray(legacyVouchers) ? legacyVouchers : [];
  const projectedRows = Array.isArray(projected) ? projected : [];
  return [...legacy, ...projectedRows];
}

export function buildEffectivePaymentVouchers(data = {}) {
  const projected = projectReceiptsToLegacyPaymentVouchers(data);
  return mergeLegacyVouchersWithReceiptProjection(data.paymentVouchers || [], projected);
}

export function isProjectedLegacyVoucher(voucher) {
  return Boolean(voucher?.sourceLedger === "receipt" || String(voucher?.id || "").startsWith("receipt"));
}
