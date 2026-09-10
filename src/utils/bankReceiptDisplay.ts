/**
 * Phase 2 display model for a bank deposit's Receipt link.
 * Shared by the deposit-link modal and the transactions list so both show the
 * same receipt no / gross / allocated / unallocated / status.
 */

import { findBankTransactionOpenReceipt, type BankDepositLinkTx } from "./bankDepositLink";
import type { ReceiptAllocationRecord, ReceiptRecord } from "./receiptLedger";

export type BankReceiptStatus = "posted" | "partial" | "unallocated" | "reversed";

export type BankReceiptDisplay = {
  receiptId: string;
  receiptNo: string;
  clientName: string;
  receiptDate: string;
  grossAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  allocationCount: number;
  autoLinked: boolean;
  linkSourceLabel: string;
  status: BankReceiptStatus;
  statusLabel: string;
};

const STATUS_LABELS: Record<BankReceiptStatus, string> = {
  posted: "전기",
  partial: "일부배분",
  unallocated: "미배분",
  reversed: "취소",
};

function money(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

/** Allocation rows that still count toward the receipt today. */
export function listOpenReceiptAllocations(
  allocations: ReceiptAllocationRecord[],
  receiptId: string,
) {
  return (allocations || []).filter((row) => {
    if (String(row.receiptId) !== String(receiptId)) return false;
    if ((row as { auditOnly?: boolean }).auditOnly) return false;
    if ((row as { reversedEffectiveDate?: string }).reversedEffectiveDate) return false;
    if (row.status === "reversed") return false;
    return money(row.amount) > 0;
  });
}

export function resolveBankReceiptStatus(receipt: ReceiptRecord, allocatedAmount: number): BankReceiptStatus {
  if (receipt.status === "reversed" || (receipt as { reversedEffectiveDate?: string }).reversedEffectiveDate) {
    return "reversed";
  }
  const gross = money(receipt.grossAmount);
  if (allocatedAmount <= 0) return "unallocated";
  if (allocatedAmount < gross) return "partial";
  return "posted";
}

/** null when the deposit has no open receipt (unlinked or legacy voucher link). */
export function buildBankReceiptDisplay(
  tx: BankDepositLinkTx,
  receipts: ReceiptRecord[] = [],
  allocations: ReceiptAllocationRecord[] = [],
): BankReceiptDisplay | null {
  const receipt = findBankTransactionOpenReceipt(tx, { receipts }) as ReceiptRecord | null;
  if (!receipt) return null;

  const rows = listOpenReceiptAllocations(allocations, String(receipt.id));
  const allocatedAmount = rows.reduce((sum, row) => sum + money(row.amount), 0);
  const grossAmount = money(receipt.grossAmount);
  const status = resolveBankReceiptStatus(receipt, allocatedAmount);
  const autoLinked = receipt.source === "bank_auto";

  return {
    receiptId: String(receipt.id),
    receiptNo: String(receipt.receiptNo || ""),
    clientName: String(receipt.clientName || ""),
    receiptDate: String(receipt.receiptDate || "").slice(0, 10),
    grossAmount,
    allocatedAmount,
    unallocatedAmount: Math.max(grossAmount - allocatedAmount, 0),
    allocationCount: rows.length,
    autoLinked,
    linkSourceLabel: autoLinked ? "자동" : "수동",
    status,
    statusLabel: STATUS_LABELS[status],
  };
}
