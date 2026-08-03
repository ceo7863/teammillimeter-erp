import type { BankTransaction } from "@/utils/bankTransactions";
import type { PdfArchiveMeta } from "@/utils/pdfArchive";

export type BankSentStatementAllocationKind =
  | "none"
  | "archive_only"
  | "partial"
  | "complete";

export type BankSentStatementAllocationSummary = {
  kind: BankSentStatementAllocationKind;
  /** User-facing match status; never treats archive-only as confirmed. */
  statusLabel: string;
  statementTotalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  voucherCount: number;
  allocatedSalesCount: number;
  statementSalesCount: number;
};

type VoucherLike = {
  id?: number | string;
  bankTransactionId?: string | number;
  salesId?: number | string;
  finalAmount?: number;
  amount?: number;
  linkedPdfArchiveId?: string;
};

const LABEL_COMPLETE = "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC785\uAE08\uD655\uC778";
const LABEL_NEEDS_ALLOCATION = "\uC804\uD45C \uBC30\uBD84 \uD544\uC694";
const LABEL_LINKED = "\uC785\uAE08 \uC5F0\uACB0\uC644\uB8CC";
const LABEL_UNLINKED = "\uBBF8\uC5F0\uACB0";

export function listPaymentVouchersForBankTx(
  bankTransactionId: string | number,
  paymentVouchers: VoucherLike[] = [],
) {
  const bankId = String(bankTransactionId);
  return paymentVouchers.filter((voucher) => String(voucher.bankTransactionId || "") === bankId);
}

function sumAllocatedAmount(vouchers: VoucherLike[]) {
  return vouchers.reduce(
    (sum, voucher) => sum + Math.round(Number(voucher.finalAmount ?? voucher.amount ?? 0)),
    0,
  );
}

export function summarizeBankSentStatementAllocation(options: {
  tx: Pick<BankTransaction, "id" | "deposit" | "linkedPdfArchiveId" | "linkedPaymentVoucherId">;
  paymentVouchers?: VoucherLike[];
  archive?: Pick<PdfArchiveMeta, "id" | "statementTotalAmount" | "statementSalesIds"> | null;
}): BankSentStatementAllocationSummary | null {
  const archiveId = String(options.tx.linkedPdfArchiveId || "").trim();
  if (!archiveId) return null;

  const vouchers = listPaymentVouchersForBankTx(options.tx.id, options.paymentVouchers || []);
  const allocatedAmount = sumAllocatedAmount(vouchers);
  const allocatedSalesIds = new Set(
    vouchers
      .map((voucher) => String(voucher.salesId ?? "").trim())
      .filter(Boolean),
  );
  const statementSalesIds = Array.isArray(options.archive?.statementSalesIds)
    ? options.archive!.statementSalesIds.map((id) => String(id))
    : [];
  const statementSalesCount = statementSalesIds.length;
  const statementTotalAmount = Math.round(
    Number(options.archive?.statementTotalAmount || options.tx.deposit || 0),
  );
  const unallocatedAmount = Math.max(0, statementTotalAmount - allocatedAmount);

  let kind: BankSentStatementAllocationKind;
  if (!vouchers.length) {
    kind = "archive_only";
  } else if (
    statementSalesCount > 0 &&
    allocatedSalesIds.size >= statementSalesCount &&
    unallocatedAmount <= 0
  ) {
    kind = "complete";
  } else if (statementSalesCount > 0 && allocatedSalesIds.size < statementSalesCount) {
    kind = "partial";
  } else if (unallocatedAmount > 0) {
    kind = "partial";
  } else {
    kind = "complete";
  }

  return {
    kind,
    statusLabel: kind === "complete" ? LABEL_COMPLETE : LABEL_NEEDS_ALLOCATION,
    statementTotalAmount,
    allocatedAmount,
    unallocatedAmount,
    voucherCount: vouchers.length,
    allocatedSalesCount: allocatedSalesIds.size,
    statementSalesCount,
  };
}

export function resolveBankMatchStatusLabelFromAllocation(options: {
  tx: Pick<BankTransaction, "id" | "deposit" | "linkedPdfArchiveId" | "linkedPaymentVoucherId">;
  paymentVouchers?: VoucherLike[];
  archive?: Pick<PdfArchiveMeta, "id" | "statementTotalAmount" | "statementSalesIds"> | null;
}) {
  const summary = summarizeBankSentStatementAllocation(options);
  if (summary) return summary.statusLabel;
  if (options.tx.linkedPaymentVoucherId) return LABEL_LINKED;
  if (Number(options.tx.deposit || 0) > 0) return LABEL_UNLINKED;
  return "-";
}

/** Read-only: bank txs with linked archive but incomplete individual voucher allocation. */
export function listIncompleteBankSentStatementAllocations(options: {
  bankTransactions: Array<
    Pick<BankTransaction, "id" | "deposit" | "linkedPdfArchiveId" | "linkedPaymentVoucherId" | "linkedSubject" | "transactionAt">
  >;
  paymentVouchers?: VoucherLike[];
  archives?: Array<Pick<PdfArchiveMeta, "id" | "subjectName" | "statementTotalAmount" | "statementSalesIds">>;
}) {
  const archiveById = new Map((options.archives || []).map((row) => [String(row.id), row]));
  const rows: Array<{
    bankTransactionId: string;
    client: string;
    transactionDate: string;
    depositAmount: number;
    kind: BankSentStatementAllocationKind;
    statementTotalAmount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    voucherCount: number;
    allocatedSalesCount: number;
    statementSalesCount: number;
  }> = [];

  for (const tx of options.bankTransactions) {
    if (!tx.linkedPdfArchiveId) continue;
    const archive = archiveById.get(String(tx.linkedPdfArchiveId));
    const summary = summarizeBankSentStatementAllocation({
      tx,
      paymentVouchers: options.paymentVouchers,
      archive,
    });
    if (!summary || summary.kind === "complete") continue;
    rows.push({
      bankTransactionId: String(tx.id),
      client: String(archive?.subjectName || tx.linkedSubject || "").trim(),
      transactionDate: String(tx.transactionAt || "").slice(0, 10),
      depositAmount: Math.round(Number(tx.deposit || 0)),
      kind: summary.kind,
      statementTotalAmount: summary.statementTotalAmount,
      allocatedAmount: summary.allocatedAmount,
      unallocatedAmount: summary.unallocatedAmount,
      voucherCount: summary.voucherCount,
      allocatedSalesCount: summary.allocatedSalesCount,
      statementSalesCount: summary.statementSalesCount,
    });
  }
  return rows;
}
