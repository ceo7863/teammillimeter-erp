/**
 * Bank deposit status from the canonical ledgers (Receipt + Allocation, frozen legacy
 * vouchers). A bank link on its own only proves an 입금전표 exists; how much of the
 * deposit reached which sale comes from open allocations, never from the link fields.
 */
import { findBankTransactionOpenReceipt, type BankDepositLinkTx } from "./bankDepositLink";
import { listOpenReceiptAllocations } from "./bankReceiptDisplay";
import type { ReceiptAllocationRecord, ReceiptRecord } from "./receiptLedger";

export type BankDepositCanonicalStatus =
  | "client_review"
  | "unapplied"
  | "partial"
  | "fully_applied"
  | "reversed"
  | "legacy"
  | "conflict"
  | "none";

export const BANK_DEPOSIT_STATUS_LABELS: Record<BankDepositCanonicalStatus, string> = {
  client_review: "거래처 확인 필요",
  unapplied: "입금전표 생성 완료 · 미배정 입금",
  partial: "입금전표 생성 완료 · 부분 충당",
  fully_applied: "입금전표 생성 완료 · 완전 충당",
  reversed: "취소",
  legacy: "레거시 연결",
  conflict: "중복/충돌 검토 필요",
  none: "-",
};

export type BankDepositStatusTone = "success" | "warning" | "danger" | "muted";

/** Only a fully applied (or frozen legacy) deposit is green; a bare link never is. */
export function bankDepositStatusTone(
  status: BankDepositCanonicalStatus | null | undefined,
): BankDepositStatusTone | null {
  switch (status) {
    case "fully_applied":
    case "legacy":
      return "success";
    case "unapplied":
    case "partial":
      return "warning";
    case "conflict":
      return "danger";
    case "reversed":
    case "client_review":
      return "muted";
    default:
      return null;
  }
}

export type BankDepositCanonicalStatusResult = {
  status: BankDepositCanonicalStatus;
  label: string;
  receiptId: string | null;
  grossAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  conflictReason: "BANK_REFERENCE_CONFLICT" | "LEGACY_RECEIPT_DOUBLE_COVERAGE" | null;
};

type LegacyVoucherLike = {
  id?: string | number;
  bankTransactionId?: string | number | null;
  sourceLedger?: string;
};

export type BankDepositCanonicalStatusContext = {
  receipts?: ReceiptRecord[];
  receiptAllocations?: ReceiptAllocationRecord[];
  /** Raw legacy vouchers; projected receipt rows are ignored. */
  paymentVouchers?: LegacyVoucherLike[];
  /** Sales covered by both a Receipt allocation and a legacy voucher (read-model error). */
  doubleCoverageSaleIds?: Set<string>;
};

function money(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function isProjectedVoucher(voucher: LegacyVoucherLike) {
  return voucher?.sourceLedger === "receipt" || String(voucher?.id ?? "").startsWith("receipt-alloc:");
}

function hasLegacyLink(
  tx: BankDepositLinkTx & { deposit?: number },
  vouchers: LegacyVoucherLike[],
) {
  if (tx.linkedPaymentVoucherId != null && String(tx.linkedPaymentVoucherId).trim() !== "") return true;
  const txId = String(tx.id ?? "");
  return vouchers.some(
    (row) => !isProjectedVoucher(row) && String(row?.bankTransactionId ?? "") === txId,
  );
}

function result(
  status: BankDepositCanonicalStatus,
  extra: Partial<BankDepositCanonicalStatusResult> = {},
): BankDepositCanonicalStatusResult {
  return {
    status,
    label: BANK_DEPOSIT_STATUS_LABELS[status],
    receiptId: null,
    grossAmount: 0,
    allocatedAmount: 0,
    unallocatedAmount: 0,
    conflictReason: null,
    ...extra,
  };
}

export function resolveBankDepositCanonicalStatus(
  tx: BankDepositLinkTx & { deposit?: number },
  context: BankDepositCanonicalStatusContext = {},
): BankDepositCanonicalStatusResult {
  if (money(tx?.deposit) <= 0) return result("none");
  const receipts = context.receipts || [];
  const allocations = context.receiptAllocations || [];
  const legacyLinked = hasLegacyLink(tx, context.paymentVouchers || []);
  const receipt = findBankTransactionOpenReceipt(tx, { receipts }) as ReceiptRecord | null;

  if (receipt) {
    const rows = listOpenReceiptAllocations(allocations, String(receipt.id));
    const grossAmount = money(receipt.grossAmount);
    const allocatedAmount = rows.reduce((sum, row) => sum + money(row.amount), 0);
    const amounts = {
      receiptId: String(receipt.id),
      grossAmount,
      allocatedAmount,
      unallocatedAmount: Math.max(grossAmount - allocatedAmount, 0),
    };
    if (legacyLinked) {
      return result("conflict", { ...amounts, conflictReason: "BANK_REFERENCE_CONFLICT" });
    }
    const doubleCovered = context.doubleCoverageSaleIds;
    if (doubleCovered?.size && rows.some((row) => doubleCovered.has(String(row.saleId)))) {
      return result("conflict", { ...amounts, conflictReason: "LEGACY_RECEIPT_DOUBLE_COVERAGE" });
    }
    if (allocatedAmount <= 0) return result("unapplied", amounts);
    if (allocatedAmount < grossAmount) return result("partial", amounts);
    return result("fully_applied", amounts);
  }

  if (legacyLinked) return result("legacy");

  const txId = String(tx.id ?? "");
  const reversed = receipts.some(
    (row) =>
      String(row?.bankTransactionId ?? "") === txId &&
      !row.reversalOfReceiptId &&
      (row.status === "reversed" || Boolean((row as { reversedEffectiveDate?: string }).reversedEffectiveDate)),
  );
  if (reversed) return result("reversed");
  return result("client_review");
}

export function buildBankDepositStatusByTxId(
  transactions: Array<BankDepositLinkTx & { deposit?: number }>,
  context: BankDepositCanonicalStatusContext,
): Map<string, BankDepositCanonicalStatusResult> {
  const vouchersByTx = new Map<string, LegacyVoucherLike[]>();
  for (const voucher of context.paymentVouchers || []) {
    const txId = String(voucher?.bankTransactionId ?? "").trim();
    if (!txId || isProjectedVoucher(voucher)) continue;
    const list = vouchersByTx.get(txId) || [];
    list.push(voucher);
    vouchersByTx.set(txId, list);
  }
  const map = new Map<string, BankDepositCanonicalStatusResult>();
  for (const tx of transactions || []) {
    if (money(tx?.deposit) <= 0) continue;
    map.set(
      String(tx.id),
      resolveBankDepositCanonicalStatus(tx, {
        ...context,
        paymentVouchers: vouchersByTx.get(String(tx.id)) || [],
      }),
    );
  }
  return map;
}
