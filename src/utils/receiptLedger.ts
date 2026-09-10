export type ReceiptChannel = "bank" | "cash" | "personal_account" | "other";
export type ReceiptSource =
  | "bank_auto"
  | "bank_manual"
  | "calendar"
  | "receivables"
  | "sent_statement"
  | "migration";
export type ReceiptStatus = "draft" | "posted" | "reversed";

export type ReceiptRecord = {
  id: string;
  receiptNo: string;
  clientId: string;
  clientName?: string;
  receiptDate: string;
  grossAmount: number;
  currency?: string;
  channel: ReceiptChannel;
  source: ReceiptSource;
  status: ReceiptStatus;
  bankTransactionId?: string | null;
  sentStatementId?: string | null;
  operationId?: string;
  idempotencyKey?: string;
  memo?: string;
  createdAt?: string;
  createdBy?: string;
  postedAt?: string | null;
  postedBy?: string | null;
  reversalOfReceiptId?: string | null;
  version?: number;
};

export type ReceiptAllocationRecord = {
  id: string;
  receiptId: string;
  saleId: number | string;
  amount: number;
  status: "posted" | "reversed";
  createdAt?: string;
  createdBy?: string;
  reversalOfAllocationId?: string | null;
  site?: string;
};

export type ReceiptSummary = {
  allocatedAmount: number;
  unallocatedAmount: number;
  allocationCount: number;
};

export type CreateReceiptInput = {
  operationId: string;
  clientId?: string | number;
  clientName?: string;
  client?: string;
  receiptDate?: string;
  grossAmount?: number;
  channel: ReceiptChannel;
  source: ReceiptSource;
  status?: ReceiptStatus;
  bankTransactionId?: string | number | null;
  sentStatementId?: string | null;
  memo?: string;
  allocations?: Array<{ saleId: number | string; amount: number }>;
};

export function makeReceiptOperationId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function depositChannelToReceiptChannel(
  depositChannel: string | undefined | null,
): ReceiptChannel {
  if (depositChannel === "cash") return "cash";
  if (depositChannel === "bank") return "bank";
  if (depositChannel === "personal") return "personal_account";
  return "personal_account";
}

export function projectReceiptsToLegacyPaymentVouchers(
  receipts: ReceiptRecord[] = [],
  allocations: ReceiptAllocationRecord[] = [],
  clients: Array<{ id?: string | number; name?: string }> = [],
) {
  const clientsById = new Map(clients.map((row) => [String(row.id), row]));
  const vouchers: Array<Record<string, unknown>> = [];

  for (const receipt of receipts) {
    if (!receipt || receipt.status !== "posted") continue;
    if (receipt.reversalOfReceiptId) continue;

    const clientName = String(receipt.clientName || clientsById.get(String(receipt.clientId))?.name || "");
    const depositChannel =
      receipt.channel === "cash"
        ? "cash"
        : receipt.channel === "bank"
          ? "bank"
          : receipt.channel === "personal_account"
            ? "personal"
            : "other";

    const rows = allocations.filter(
      (row) => String(row.receiptId) === String(receipt.id) && row.status === "posted",
    );

    for (const allocation of rows) {
      const amount = Number(allocation.amount) || 0;
      vouchers.push({
        id: `receipt-alloc:${allocation.id}`,
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        allocationId: allocation.id,
        salesId: allocation.saleId,
        date: receipt.receiptDate,
        client: clientName,
        site: allocation.site || "",
        amount,
        supplyAmount: amount,
        vatType: "excluded",
        vatAmount: 0,
        finalAmount: amount,
        memo: receipt.memo || "",
        depositChannel,
        bankTransactionId: receipt.bankTransactionId || undefined,
        sourceLedger: "receipt",
        receiptSource: receipt.source,
      });
    }
  }

  return vouchers;
}

export function mergeEffectivePaymentVouchers(
  legacyVouchers: unknown[] = [],
  projected: unknown[] = [],
) {
  return [...(legacyVouchers || []), ...(projected || [])];
}

export function isProjectedReceiptVoucher(voucher: { id?: unknown; sourceLedger?: unknown }) {
  return voucher?.sourceLedger === "receipt" || String(voucher?.id || "").startsWith("receipt");
}

export function formatReceiptSaveMessage(result: {
  receipt?: ReceiptRecord;
  summary?: ReceiptSummary;
}) {
  const no = result.receipt?.receiptNo || "";
  const gross = Number(result.receipt?.grossAmount) || 0;
  const allocated = Number(result.summary?.allocatedAmount) || 0;
  const unallocated = Number(result.summary?.unallocatedAmount) || 0;
  return `입금전표 ${no} · 입금 ${gross.toLocaleString("ko-KR")} · 배분 ${allocated.toLocaleString("ko-KR")} · 미배분 ${unallocated.toLocaleString("ko-KR")}`;
}
