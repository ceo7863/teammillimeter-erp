/**
 * Unresolved bank-deposit exception queue helpers (plain JS for server routes).
 * Mirrors src/utils/financeExceptionInbox.ts filter rules.
 */

export const HISTORICAL_EXCEPTION_EXCLUDED_KINDS = new Set([
  "legacy_expense_mismatch",
  "legacy_unattributed_payment",
  "historical_expense_mismatch_492",
  "historical_unattributed_payout_156",
]);

export const INFORMATIONAL_AP_OFF_KINDS = new Set([
  "ap_inactive",
  "ap_ledger_inactive",
  "AP_INACTIVE",
  "AP_LEDGER_INACTIVE",
  "AP_OFF",
  "informational_ap_off",
  "informational",
]);

export const EXCEPTION_REASON_LABELS_KO = {
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

function trim(value) {
  return String(value ?? "").trim();
}

export function isHistoricalExcludedExceptionKind(kind) {
  return HISTORICAL_EXCEPTION_EXCLUDED_KINDS.has(String(kind || ""));
}

export function isInformationalApOffNotice(item = {}) {
  const kind = trim(item.kind || item.reasonCode);
  if (INFORMATIONAL_AP_OFF_KINDS.has(kind)) return true;
  const subject = trim(item.subject);
  if (/신규\s*지급\s*원장\s*활성화\s*전|AP\s*비활성|지급\s*원장\s*비활성/i.test(subject)) return true;
  return false;
}

export function formatExceptionReason(reasonCode) {
  const code = trim(reasonCode);
  if (!code) return "";
  return EXCEPTION_REASON_LABELS_KO[code] || code;
}

export function mapUnresolvedQueueToExceptionItems(queue = []) {
  const rows = Array.isArray(queue) ? queue : [];
  return rows.map((row, index) => {
    const bankTransactionId = trim(row?.bankTransactionId);
    const reasonCode = row?.reasonCode != null ? trim(row.reasonCode) : "";
    const status = trim(row?.status) || "needs_review";
    const rawKind = row?.kind != null ? trim(row.kind) : "";
    const exceptionId =
      trim(row?.exceptionId) ||
      (bankTransactionId ? `unresolved:${bankTransactionId}` : `unresolved:idx:${index}`);
    const ignored =
      row?.ignored === true || status === "ignored" || Boolean(row?.ignoredAt);
    return {
      exceptionId,
      bankTransactionId: bankTransactionId || null,
      receiptId: row?.receiptId != null ? trim(row.receiptId) || null : null,
      kind: rawKind || reasonCode || status || null,
      reasonCode: reasonCode || null,
      status,
      ignored,
      firstSeenAt: row?.firstSeenAt || null,
      transactionDate: row?.transactionDate ? String(row.transactionDate).slice(0, 10) : null,
      depositAmount: Number.isFinite(Number(row?.depositAmount))
        ? Math.round(Number(row.depositAmount))
        : 0,
      subject: row?.subject != null ? String(row.subject) : null,
      clientId: row?.clientId != null ? String(row.clientId) : null,
      lastCheckedAt: row?.lastCheckedAt || null,
    };
  });
}

export function isActionableFinanceException(item = {}) {
  if (!item || typeof item !== "object") return false;
  if (item.ignored) return false;
  const status = trim(item.status);
  if (status === "resolved" || status === "ignored") return false;
  const kind = trim(item.kind || item.reasonCode);
  if (kind && isHistoricalExcludedExceptionKind(kind)) return false;
  if (kind === "PRE_CUTOVER" || trim(item.reasonCode) === "PRE_CUTOVER") return false;
  if (isInformationalApOffNotice(item)) return false;
  return true;
}

export function dedupeFinanceExceptions(items = []) {
  const seen = new Set();
  const out = [];
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

export function filterActionableFinanceExceptions(items = []) {
  return dedupeFinanceExceptions((items || []).filter(isActionableFinanceException));
}

export function countActionableExceptionBadge(items) {
  return filterActionableFinanceExceptions(items).length;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Mutate only unresolvedDepositQueue (ignore). Does not touch Receipt/sale ledgers.
 */
export function ignoreUnresolvedDepositInMeta(bankSyncMeta = {}, bankTransactionId, options = {}) {
  const txId = trim(bankTransactionId);
  if (!txId) {
    const err = new Error("bankTransactionId required");
    err.status = 400;
    err.code = "BANK_TRANSACTION_ID_REQUIRED";
    throw err;
  }
  const meta =
    bankSyncMeta && typeof bankSyncMeta === "object" ? { ...bankSyncMeta } : {};
  const queue = Array.isArray(meta.unresolvedDepositQueue)
    ? meta.unresolvedDepositQueue.map((row) => ({ ...row }))
    : [];
  const ops =
    meta.unresolvedDepositOps && typeof meta.unresolvedDepositOps === "object"
      ? { ...meta.unresolvedDepositOps }
      : {};
  const operationId = trim(options.operationId);
  if (operationId && ops[operationId]) {
    const prior = ops[operationId];
    if (prior.action === "ignore" && String(prior.bankTransactionId) === txId) {
      const items = mapUnresolvedQueueToExceptionItems(queue);
      return {
        ok: true,
        idempotent: true,
        unresolved: queue,
        actionable: filterActionableFinanceExceptions(items),
        actionableCount: filterActionableFinanceExceptions(items).length,
        bankSyncMeta: meta,
      };
    }
  }

  const idx = queue.findIndex((row) => trim(row?.bankTransactionId) === txId);
  const checkedAt = nowIso();
  if (idx >= 0) {
    const row = queue[idx];
    const alreadyIgnored = row.status === "ignored" || row.ignored === true;
    queue[idx] = {
      ...row,
      status: "ignored",
      ignored: true,
      lastCheckedAt: checkedAt,
      ignoredAt: row.ignoredAt || checkedAt,
    };
    if (operationId) {
      ops[operationId] = { action: "ignore", bankTransactionId: txId, at: checkedAt };
    }
    meta.unresolvedDepositQueue = queue;
    meta.unresolvedDepositOps = ops;
    const items = mapUnresolvedQueueToExceptionItems(queue);
    const actionable = filterActionableFinanceExceptions(items);
    return {
      ok: true,
      idempotent: alreadyIgnored,
      unresolved: queue,
      actionable,
      actionableCount: actionable.length,
      bankSyncMeta: meta,
    };
  }

  // Not in queue yet — still record an ignored sentinel so GET stays consistent.
  queue.push({
    bankTransactionId: txId,
    status: "ignored",
    ignored: true,
    reasonCode: options.reasonCode || null,
    firstSeenAt: checkedAt,
    lastCheckedAt: checkedAt,
    ignoredAt: checkedAt,
    depositAmount: 0,
    transactionDate: null,
    subject: null,
    clientId: null,
    receiptId: null,
  });
  if (operationId) {
    ops[operationId] = { action: "ignore", bankTransactionId: txId, at: checkedAt };
  }
  meta.unresolvedDepositQueue = queue;
  meta.unresolvedDepositOps = ops;
  const items = mapUnresolvedQueueToExceptionItems(queue);
  const actionable = filterActionableFinanceExceptions(items);
  return {
    ok: true,
    idempotent: false,
    unresolved: queue,
    actionable,
    actionableCount: actionable.length,
    bankSyncMeta: meta,
  };
}

/**
 * Soft retry: clear ignored, set needs_review, bump lastCheckedAt.
 * Optionally merge decideBankDepositAction fields when provided (no Receipt writers).
 */
export function retryUnresolvedDepositInMeta(bankSyncMeta = {}, bankTransactionId, options = {}) {
  const txId = trim(bankTransactionId);
  if (!txId) {
    const err = new Error("bankTransactionId required");
    err.status = 400;
    err.code = "BANK_TRANSACTION_ID_REQUIRED";
    throw err;
  }
  const meta =
    bankSyncMeta && typeof bankSyncMeta === "object" ? { ...bankSyncMeta } : {};
  const queue = Array.isArray(meta.unresolvedDepositQueue)
    ? meta.unresolvedDepositQueue.map((row) => ({ ...row }))
    : [];
  const ops =
    meta.unresolvedDepositOps && typeof meta.unresolvedDepositOps === "object"
      ? { ...meta.unresolvedDepositOps }
      : {};
  const operationId = trim(options.operationId);
  if (operationId && ops[operationId]) {
    const prior = ops[operationId];
    if (prior.action === "retry" && String(prior.bankTransactionId) === txId) {
      const items = mapUnresolvedQueueToExceptionItems(queue);
      const actionable = filterActionableFinanceExceptions(items);
      return {
        ok: true,
        idempotent: true,
        unresolved: queue,
        actionable,
        actionableCount: actionable.length,
        bankSyncMeta: meta,
      };
    }
  }

  const checkedAt = nowIso();
  const decision = options.decision && typeof options.decision === "object" ? options.decision : null;
  let nextStatus = "needs_review";
  let nextReason = null;
  let remove = false;
  if (decision) {
    if (decision.action === "skip" && (decision.status === "receipt_posted" || decision.reasonCode === "DUPLICATE_BANK_RECEIPT")) {
      remove = true;
    } else if (decision.action === "skip" && decision.reasonCode === "PRE_CUTOVER") {
      nextStatus = "ignored";
      nextReason = "PRE_CUTOVER";
    } else if (decision.action === "queue" || decision.action === "skip") {
      nextStatus = decision.status === "ignored" ? "ignored" : "needs_review";
      nextReason = decision.reasonCode || null;
    } else if (decision.action === "post_receipt") {
      // Do not invent receipt writers here — leave actionable for client/bank-sync.
      nextStatus = "needs_review";
      nextReason = decision.reasonCode || null;
    }
  }

  const idx = queue.findIndex((row) => trim(row?.bankTransactionId) === txId);
  if (remove) {
    const nextQueue = idx >= 0 ? queue.filter((_, i) => i !== idx) : queue;
    if (operationId) {
      ops[operationId] = { action: "retry", bankTransactionId: txId, at: checkedAt, removed: true };
    }
    meta.unresolvedDepositQueue = nextQueue;
    meta.unresolvedDepositOps = ops;
    const items = mapUnresolvedQueueToExceptionItems(nextQueue);
    const actionable = filterActionableFinanceExceptions(items);
    return {
      ok: true,
      idempotent: false,
      unresolved: nextQueue,
      actionable,
      actionableCount: actionable.length,
      bankSyncMeta: meta,
      decision,
    };
  }

  const base =
    idx >= 0
      ? queue[idx]
      : {
          bankTransactionId: txId,
          firstSeenAt: checkedAt,
          depositAmount: 0,
          transactionDate: null,
          subject: null,
          clientId: null,
          receiptId: null,
        };
  const nextRow = {
    ...base,
    status: nextStatus,
    reasonCode: nextReason != null ? nextReason : base.reasonCode || null,
    ignored: nextStatus === "ignored",
    lastCheckedAt: checkedAt,
    subject: decision?.subject != null ? decision.subject : base.subject,
    clientId: decision?.clientId != null ? decision.clientId : base.clientId,
    depositAmount:
      decision?.depositAmount != null ? decision.depositAmount : base.depositAmount,
    transactionDate:
      decision?.transactionDate != null ? decision.transactionDate : base.transactionDate,
  };
  if (nextStatus !== "ignored") {
    delete nextRow.ignoredAt;
  }
  if (idx >= 0) queue[idx] = nextRow;
  else queue.push(nextRow);

  if (operationId) {
    ops[operationId] = { action: "retry", bankTransactionId: txId, at: checkedAt };
  }
  meta.unresolvedDepositQueue = queue;
  meta.unresolvedDepositOps = ops;
  const items = mapUnresolvedQueueToExceptionItems(queue);
  const actionable = filterActionableFinanceExceptions(items);
  return {
    ok: true,
    idempotent: false,
    unresolved: queue,
    actionable,
    actionableCount: actionable.length,
    bankSyncMeta: meta,
    decision,
  };
}
