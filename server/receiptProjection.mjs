/**
 * Legacy compatibility projection: Receipt/Allocation → paymentVoucher-shaped rows.
 * Never write these projected rows back into paymentVouchers.
 */

import { listReceiptAllocations, listReceipts, receiptMoney } from "./receipts.mjs";

const CHANNEL_TO_DEPOSIT = {
  cash: "cash",
  personal_account: "personal",
  bank: "bank",
  other: "other",
};

export function projectReceiptsToLegacyPaymentVouchers(data = {}, options = {}) {
  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const includeReversed = options.includeReversed === true;
  const clientsById = new Map((data.clients || []).map((row) => [String(row.id), row]));
  const salesById = new Map((data.sales || []).map((row) => [String(row.id), row]));

  const vouchers = [];
  for (const receipt of receipts) {
    if (!receipt) continue;
    if (receipt.status === "reversed" && !includeReversed) continue;
    if (receipt.status === "draft") continue;
    if (receipt.reversalOfReceiptId) {
      // Reversal rows are accounting events; skip projecting negative vouchers into legacy paid math
      // unless explicitly requested. Net effect is handled by original status=reversed (excluded).
      if (!includeReversed) continue;
    }

    const client = clientsById.get(String(receipt.clientId));
    const clientName = String(receipt.clientName || client?.name || "");
    const depositChannel = CHANNEL_TO_DEPOSIT[receipt.channel] || "other";
    const rows = allocations.filter(
      (row) => String(row.receiptId) === String(receipt.id) && row.status === "posted",
    );

    if (!rows.length) {
      vouchers.push({
        id: `receipt:${receipt.id}:unallocated`,
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        salesId: undefined,
        date: receipt.receiptDate,
        client: clientName,
        site: "",
        amount: receiptMoney(receipt.grossAmount),
        supplyAmount: receiptMoney(receipt.grossAmount),
        vatType: "excluded",
        vatAmount: 0,
        finalAmount: receiptMoney(receipt.grossAmount),
        memo: receipt.memo || "",
        depositChannel,
        bankTransactionId: receipt.bankTransactionId || undefined,
        linkedPdfArchiveId: receipt.sentStatementId || undefined,
        sourceLedger: "receipt",
        receiptSource: receipt.source,
        isUnallocatedReceipt: true,
      });
      continue;
    }

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
  // Keep legacy rows as-is; append projected receipt rows. Do not replace legacy by id.
  return [...legacy, ...projectedRows];
}

export function buildEffectivePaymentVouchers(data = {}) {
  const projected = projectReceiptsToLegacyPaymentVouchers(data);
  return mergeLegacyVouchersWithReceiptProjection(data.paymentVouchers || [], projected);
}

export function isProjectedLegacyVoucher(voucher) {
  return Boolean(voucher?.sourceLedger === "receipt" || String(voucher?.id || "").startsWith("receipt"));
}
