/**
 * Client-side unresolved deposit exception helpers.
 * Filter rules mirror server/financeExceptionInbox.mjs.
 */
import {
  HISTORICAL_EXCEPTION_EXCLUDED,
  isHistoricalExcludedExceptionKind,
  countActionableExceptionBadge as countActionableExceptionBadgeBase,
} from "./financeInformationArchitecture";

export { HISTORICAL_EXCEPTION_EXCLUDED, isHistoricalExcludedExceptionKind };

export const INFORMATIONAL_AP_OFF_KINDS = new Set([
  "ap_inactive",
  "ap_ledger_inactive",
  "AP_INACTIVE",
  "AP_LEDGER_INACTIVE",
  "AP_OFF",
  "informational_ap_off",
  "informational",
]);

export const EXCEPTION_REASON_LABELS_KO: Record<string, string> = {
  PRE_CUTOVER: "컷오버 이전 입금",
  CLIENT_NOT_FOUND: "거래처 미확인",
  CLIENT_AMBIGUOUS: "거래처 복수 후보",
  MANUAL_OVERRIDE_REQUIRED: "수동 확인 필요",
  CASH_TRANSFER: "시재/내부이체",
  CARD_SETTLEMENT: "카드사 정산",
  NO_SENT_SALES: "발송 내역서 없음",
  STATEMENT_SALE_IDS_MISSING: "내역서 매출 누락",
  STATEMENT_FULLY_PAID: "내역서 완납",
  MULTIPLE_CANDIDATES: "복수 후보",
  DATE_OUT_OF_RANGE: "일자 범위 밖",
  RECEIPT_POSTED_UNAPPLIED: "입금 등록·미배분",
  RECEIPT_PARTIALLY_ALLOCATED: "부분 배분",
  DUPLICATE_BANK_RECEIPT: "중복 통장 입금",
  IDEMPOTENCY_CONFLICT: "멱등 충돌",
  VERSION_CONFLICT: "버전 충돌",
  INTERNAL_ERROR: "내부 오류",
  needs_review: "확인 필요",
  ignored: "무시됨",
  resolved: "해결됨",
};

export type FinanceExceptionItem = {
  exceptionId: string;
  bankTransactionId: string | null;
  receiptId: string | null;
  kind: string | null;
  reasonCode: string | null;
  status: string;
  ignored: boolean;
  firstSeenAt: string | null;
  transactionDate: string | null;
  depositAmount: number;
  subject: string | null;
  clientId: string | null;
  lastCheckedAt: string | null;
};

function trim(value: unknown): string {
  return String(value ?? "").trim();
}

export function formatExceptionReason(reasonCode: string | null | undefined): string {
  const code = trim(reasonCode);
  if (!code) return "";
  return EXCEPTION_REASON_LABELS_KO[code] || code;
}

export function isInformationalApOffNotice(item: {
  kind?: string | null;
  reasonCode?: string | null;
  subject?: string | null;
}): boolean {
  const kind = trim(item.kind || item.reasonCode);
  if (INFORMATIONAL_AP_OFF_KINDS.has(kind)) return true;
  const subject = trim(item.subject);
  if (/신규\s*지급\s*원장\s*활성화\s*전|AP\s*비활성|지급\s*원장\s*비활성/i.test(subject)) return true;
  return false;
}

export function mapUnresolvedQueueToExceptionItems(queue: unknown[] | null | undefined): FinanceExceptionItem[] {
  const rows = Array.isArray(queue) ? queue : [];
  return rows.map((raw, index) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const bankTransactionId = trim(row.bankTransactionId);
    const reasonCode = row.reasonCode != null ? trim(row.reasonCode) : "";
    const status = trim(row.status) || "needs_review";
    const rawKind = row.kind != null ? trim(row.kind) : "";
    const exceptionId =
      trim(row.exceptionId) ||
      (bankTransactionId ? `unresolved:${bankTransactionId}` : `unresolved:idx:${index}`);
    const ignored =
      row.ignored === true || status === "ignored" || Boolean(row.ignoredAt);
    return {
      exceptionId,
      bankTransactionId: bankTransactionId || null,
      receiptId: row.receiptId != null ? trim(row.receiptId) || null : null,
      kind: rawKind || reasonCode || status || null,
      reasonCode: reasonCode || null,
      status,
      ignored,
      firstSeenAt: row.firstSeenAt != null ? String(row.firstSeenAt) : null,
      transactionDate: row.transactionDate ? String(row.transactionDate).slice(0, 10) : null,
      depositAmount: Number.isFinite(Number(row.depositAmount)) ? Math.round(Number(row.depositAmount)) : 0,
      subject: row.subject != null ? String(row.subject) : null,
      clientId: row.clientId != null ? String(row.clientId) : null,
      lastCheckedAt: row.lastCheckedAt != null ? String(row.lastCheckedAt) : null,
    };
  });
}

export function isActionableFinanceException(item: {
  kind?: string | null;
  reasonCode?: string | null;
  status?: string | null;
  ignored?: boolean;
  subject?: string | null;
}): boolean {
  if (!item) return false;
  if (item.ignored) return false;
  const status = trim(item.status);
  if (status === "resolved" || status === "ignored") return false;
  const kind = trim(item.kind || item.reasonCode);
  if (kind && isHistoricalExcludedExceptionKind(kind)) return false;
  if (kind === "PRE_CUTOVER" || trim(item.reasonCode) === "PRE_CUTOVER") return false;
  if (isInformationalApOffNotice(item)) return false;
  return true;
}

export function dedupeFinanceExceptions<T extends { bankTransactionId?: string | null; exceptionId?: string | null }>(
  items: T[] | null | undefined,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items || []) {
    const key = trim(item?.bankTransactionId) || trim(item?.exceptionId);
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function filterActionableFinanceExceptions(
  items: FinanceExceptionItem[] | null | undefined,
): FinanceExceptionItem[] {
  return dedupeFinanceExceptions((items || []).filter(isActionableFinanceException));
}

/** Badge count with PRE_CUTOVER + informational AP-off exclusions. */
export function countActionableExceptionBadge(
  items: Array<{ kind?: string; reasonCode?: string; status?: string; ignored?: boolean; subject?: string }> | null | undefined,
): number {
  if (!items?.length) return 0;
  return items.filter((item) => isActionableFinanceException(item)).length;
}

/** Re-export base IA badge helper for callers that only need historical filters. */
export { countActionableExceptionBadgeBase };
