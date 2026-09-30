/**
 * Report collection figures from the canonical ledgers.
 *
 * - 실제입금: posted Receipt gross by receiptDate (a reversal is its own negative Receipt on
 *   the reversal date, so it counts exactly once) plus frozen legacy vouchers by voucher date,
 *   skipping any voucher whose bank deposit already has a Receipt.
 * - 매출충당: Receipt allocations by effectiveFrom, minus closings by reversedEffectiveDate.
 * - 미배정 선수금: Receipt gross − effective allocations, as of the period end.
 * - 미수조정: ARAdjustment signed amounts by effectiveDate (reversal rows carry the sign).
 * - 잔여미수: canonical outstanding of the period's sales, ± period adjustments.
 * Channel (bank/cash/…) only splits cash; it never changes billed, VAT or allocation.
 */
import {
  isAllocationEffectiveAsOf,
  isProjectedReceiptVoucherRow,
  isReceiptEffectiveAsOf,
  legacyVoucherAmount,
  unifiedArMoney,
} from "./unifiedArReadModel";

type ReceiptLike = {
  id?: string | number;
  clientId?: string | number | null;
  clientName?: string;
  receiptDate?: string;
  grossAmount?: number;
  channel?: string;
  bankTransactionId?: string | number | null;
  status?: string;
  reversalOfReceiptId?: string | null;
  reversedEffectiveDate?: string | null;
};

type AllocationLike = {
  id?: string | number;
  receiptId?: string | number;
  saleId?: string | number;
  amount?: number;
  effectiveFrom?: string;
  reversedEffectiveDate?: string | null;
  effectiveTo?: string | null;
  auditOnly?: boolean;
  status?: string;
};

type LegacyVoucherLike = {
  id?: string | number;
  client?: string;
  date?: string;
  amount?: number;
  finalAmount?: number;
  bankTransactionId?: string | number | null;
  sourceLedger?: string;
};

type AdjustmentLike = {
  clientId?: string | number | null;
  clientName?: string;
  effectiveDate?: string;
  signedAmount?: number;
};

type SaleLike = {
  id?: string | number;
  client?: string;
  date?: string;
  amount?: number;
  appliedAmount?: number;
  outstandingAmount?: number;
  paid?: number;
};

export type CollectionChannel = "bank" | "cash" | "personal_account" | "other" | "legacy";

export type CollectionLedgerSummary = {
  startDate: string;
  endDate: string;
  actualReceipts: {
    total: number;
    receiptTotal: number;
    legacyTotal: number;
    byChannel: Record<CollectionChannel, number>;
    byClientName: Record<string, number>;
  };
  periodAllocations: { total: number; byClientName: Record<string, number> };
  unappliedPrepaid: { total: number; byClientName: Record<string, number> };
  adjustments: { net: number; byClientName: Record<string, number> };
  periodSales: { billed: number; applied: number; outstanding: number };
  closingOutstanding: number;
};

function ymd(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function inRange(day: string, start: string, end: string) {
  if (!day) return false;
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

function add(map: Record<string, number>, key: string, amount: number) {
  if (!amount) return;
  map[key] = (map[key] || 0) + amount;
}

function normalizeChannel(value: unknown): CollectionChannel {
  const channel = String(value ?? "");
  if (channel === "bank" || channel === "cash" || channel === "personal_account") return channel;
  return "other";
}

export function buildCollectionLedgerSummary(input: {
  sales?: SaleLike[];
  receipts?: ReceiptLike[];
  receiptAllocations?: AllocationLike[];
  paymentVouchers?: LegacyVoucherLike[];
  arAdjustments?: AdjustmentLike[];
  clients?: Array<{ id?: string | number; name?: string }>;
  startDate?: string;
  endDate?: string;
  todayYmd?: string;
}): CollectionLedgerSummary {
  const start = ymd(input.startDate);
  const end = ymd(input.endDate);
  const asOf = end || ymd(input.todayYmd) || "9999-12-31";
  const receipts = input.receipts || [];
  const allocations = input.receiptAllocations || [];
  const clientNameById = new Map((input.clients || []).map((row) => [String(row?.id ?? ""), String(row?.name ?? "")]));
  const receiptById = new Map(receipts.map((row) => [String(row.id), row]));
  const receiptClientName = (receipt: ReceiptLike | undefined) =>
    String(receipt?.clientName || clientNameById.get(String(receipt?.clientId ?? "")) || "(미지정)");

  const byChannel: Record<CollectionChannel, number> = { bank: 0, cash: 0, personal_account: 0, other: 0, legacy: 0 };
  const actualByClient: Record<string, number> = {};
  let receiptTotal = 0;
  const bankTxWithReceipt = new Set<string>();
  for (const receipt of receipts) {
    const bankTxId = String(receipt.bankTransactionId ?? "").trim();
    if (bankTxId && isReceiptEffectiveAsOf(receipt as never, asOf)) bankTxWithReceipt.add(bankTxId);
    const day = ymd(receipt.receiptDate);
    if (!inRange(day, start, end)) continue;
    const gross = unifiedArMoney(receipt.grossAmount);
    receiptTotal += gross;
    byChannel[normalizeChannel(receipt.channel)] += gross;
    add(actualByClient, receiptClientName(receipt), gross);
  }

  let legacyTotal = 0;
  for (const voucher of input.paymentVouchers || []) {
    if (isProjectedReceiptVoucherRow(voucher as never)) continue;
    const bankTxId = String(voucher.bankTransactionId ?? "").trim();
    if (bankTxId && bankTxWithReceipt.has(bankTxId)) continue;
    const day = ymd(voucher.date);
    if (!inRange(day, start, end)) continue;
    const amount = legacyVoucherAmount(voucher as never);
    legacyTotal += amount;
    byChannel.legacy += amount;
    add(actualByClient, String(voucher.client || "(미지정)"), amount);
  }

  const allocationsByClient: Record<string, number> = {};
  let allocationTotal = 0;
  for (const row of allocations) {
    if (row.auditOnly) continue;
    const amount = unifiedArMoney(row.amount);
    const clientName = receiptClientName(receiptById.get(String(row.receiptId)));
    if (inRange(ymd(row.effectiveFrom), start, end)) {
      allocationTotal += amount;
      add(allocationsByClient, clientName, amount);
    }
    const closed = ymd(row.reversedEffectiveDate || row.effectiveTo);
    if (closed && inRange(closed, start, end)) {
      allocationTotal -= amount;
      add(allocationsByClient, clientName, -amount);
    }
  }

  const prepaidByClient: Record<string, number> = {};
  let prepaidTotal = 0;
  for (const receipt of receipts) {
    if (!isReceiptEffectiveAsOf(receipt as never, asOf)) continue;
    const gross = unifiedArMoney(receipt.grossAmount);
    const allocated = allocations.reduce((sum, row) => {
      if (String(row.receiptId) !== String(receipt.id)) return sum;
      if (!isAllocationEffectiveAsOf(row as never, receiptById as never, asOf)) return sum;
      return sum + unifiedArMoney(row.amount);
    }, 0);
    const unallocated = Math.max(gross - allocated, 0);
    if (unallocated <= 0) continue;
    prepaidTotal += unallocated;
    add(prepaidByClient, receiptClientName(receipt), unallocated);
  }

  const adjustmentsByClient: Record<string, number> = {};
  let adjustmentNet = 0;
  for (const row of input.arAdjustments || []) {
    if (!inRange(ymd(row.effectiveDate), start, end)) continue;
    const signed = unifiedArMoney(row.signedAmount);
    adjustmentNet += signed;
    add(
      adjustmentsByClient,
      String(row.clientName || clientNameById.get(String(row.clientId ?? "")) || "(미지정)"),
      signed,
    );
  }

  let billed = 0;
  let applied = 0;
  let outstanding = 0;
  for (const sale of input.sales || []) {
    if (!inRange(ymd(sale.date), start, end) && (start || end)) continue;
    const saleBilled = unifiedArMoney(sale.amount);
    const saleApplied = Math.min(unifiedArMoney(sale.appliedAmount ?? sale.paid), saleBilled);
    billed += saleBilled;
    applied += saleApplied;
    outstanding += Math.max(
      sale.outstandingAmount != null ? unifiedArMoney(sale.outstandingAmount) : saleBilled - saleApplied,
      0,
    );
  }

  return {
    startDate: start,
    endDate: end,
    actualReceipts: {
      total: receiptTotal + legacyTotal,
      receiptTotal,
      legacyTotal,
      byChannel,
      byClientName: actualByClient,
    },
    periodAllocations: { total: allocationTotal, byClientName: allocationsByClient },
    unappliedPrepaid: { total: prepaidTotal, byClientName: prepaidByClient },
    adjustments: { net: adjustmentNet, byClientName: adjustmentsByClient },
    periodSales: { billed, applied, outstanding },
    closingOutstanding: Math.max(outstanding + adjustmentNet, 0),
  };
}
