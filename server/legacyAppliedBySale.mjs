/**
 * Frozen legacy coverage per sale, for the Receipt write path.
 *
 * Receipt allocation capacity must be `billed - legacy applied - receipt allocated`.
 * Legacy is measured without any receipt allocations so a Receipt can never claim capacity
 * the frozen voucher ledger already settled (the read model gives Receipts priority, which
 * would otherwise hide the overlap and report the voucher as client credit instead).
 * Receipts are still passed so vouchers superseded by a bank Receipt stay suppressed.
 */
import { buildSaleArBalances } from "../src/utils/unifiedArReadModel.ts";

export function buildLegacyAppliedBySale(data = {}) {
  const result = buildSaleArBalances({
    sales: Array.isArray(data.sales) ? data.sales : [],
    clients: Array.isArray(data.clients) ? data.clients : [],
    receipts: Array.isArray(data.receipts) ? data.receipts : [],
    receiptAllocations: [],
    paymentVouchers: Array.isArray(data.paymentVouchers) ? data.paymentVouchers : [],
    bankTransactions: Array.isArray(data.bankTransactions) ? data.bankTransactions : [],
  });
  const bySale = new Map();
  for (const row of result.sales) {
    if (row.legacyAppliedAmount > 0) bySale.set(String(row.saleId), row.legacyAppliedAmount);
  }
  return bySale;
}

export function legacyAppliedForSale(legacyAppliedBySale, saleId) {
  if (!(legacyAppliedBySale instanceof Map)) return 0;
  return Number(legacyAppliedBySale.get(String(saleId))) || 0;
}
