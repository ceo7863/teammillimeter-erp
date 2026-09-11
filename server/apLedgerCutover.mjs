/**
 * AP forward-only cutover: legacy payouts stay READ_ONLY_FOREVER after activation.
 * Until activation, production keeps legacy writers; canonical Disbursement stays gated.
 *
 * Never invents cutover dates or opening balances without explicit approval APIs.
 */
import crypto from "crypto";

export const AP_LEDGER_POLICY = "FORWARD_ONLY_LEGACY_READ_ONLY";
export const OPENING_BALANCE_ZERO_START = "ZERO_START";
export const OPENING_BALANCE_APPROVED = "APPROVED_WORKER_OPENING_BALANCES";

function asIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toISOString();
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function ymdSeoul(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && raw.length === 10) return raw;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function readApLedgerMeta(data = {}) {
  const meta = data?.bankSyncMeta && typeof data.bankSyncMeta === "object" ? data.bankSyncMeta : {};
  return {
    apLedgerCutoverAt: asIso(meta.apLedgerCutoverAt) || null,
    apLedgerCutoverWorkDate: String(meta.apLedgerCutoverWorkDate || "").slice(0, 10) || null,
    apLedgerActivatedAt: asIso(meta.apLedgerActivatedAt) || null,
    apLedgerActivatedBy: meta.apLedgerActivatedBy ? String(meta.apLedgerActivatedBy) : null,
    apLedgerPolicy: meta.apLedgerPolicy || null,
    openingBalancePolicy: meta.openingBalancePolicy || null,
    disbursementWriteEnabled: meta.disbursementWriteEnabled === true,
    legacyApPayoutPolicy: meta.legacyApPayoutPolicy || null,
    apOpeningBalances: Array.isArray(meta.apOpeningBalances) ? meta.apOpeningBalances : [],
    emergencyDisbursementWritePause: meta.emergencyDisbursementWritePause === true,
    apCutoverOperationId: meta.apCutoverOperationId ? String(meta.apCutoverOperationId) : null,
  };
}

export function isApLedgerActivated(data = {}) {
  const meta = readApLedgerMeta(data);
  return Boolean(meta.apLedgerActivatedAt && meta.apLedgerCutoverWorkDate);
}

export function isDisbursementWriteAllowed(data = {}, options = {}) {
  if (options.forceEnable === true) return true;
  const meta = readApLedgerMeta(data);
  if (!isApLedgerActivated(data)) return false;
  if (meta.disbursementWriteEnabled !== true) return false;
  if (meta.emergencyDisbursementWritePause === true) return false;
  if (options.clientFlag === false) return false;
  if (options.clientFlag === true) return true;
  return true;
}

export function isLegacyApWriterFrozen(data = {}) {
  const meta = readApLedgerMeta(data);
  return (
    isApLedgerActivated(data) &&
    (meta.legacyApPayoutPolicy === "READ_ONLY_FOREVER" || meta.apLedgerPolicy === AP_LEDGER_POLICY)
  );
}

/**
 * workDate eligibility for NEW payables — Asia/Seoul calendar date.
 * Inclusive of cutover work date. Late-entered historical dates stay out.
 */
export function isWorkDateEligibleForNewPayable(workDate, cutoverWorkDate) {
  const work = ymdSeoul(workDate);
  const cut = String(cutoverWorkDate || "").slice(0, 10);
  if (!cut) return false;
  if (!work || !/^\d{4}-\d{2}-\d{2}$/.test(work)) return false;
  return work >= cut;
}

export function filterPayablesByCutover(payables = [], data = {}, options = {}) {
  const meta = readApLedgerMeta(data);
  if (!meta.apLedgerCutoverWorkDate && !options.cutoverWorkDate) {
    // No cutover configured: do not expose full historical derived payables as "new unpaid".
    return options.exposeAllWithoutCutover === true ? payables : [];
  }
  const cut = options.cutoverWorkDate || meta.apLedgerCutoverWorkDate;
  return (payables || []).filter((row) => isWorkDateEligibleForNewPayable(row.workDate, cut));
}

/**
 * Explicit meal/expense only — null/undefined/"" are absent (treat as 0 for math, never invent).
 */
export function resolveExplicitExpenseAmount(raw) {
  if (raw == null) return { present: false, amount: 0 };
  if (raw === "") return { present: false, amount: 0 };
  return { present: true, amount: money(raw) };
}

export function buildCanonicalPayableDue(worker = {}) {
  const hasLineSpend = worker?.lineSpend != null && worker.lineSpend !== "";
  const base = money(hasLineSpend ? worker.lineSpend : worker.payAmount ?? worker.amount);
  const meal = resolveExplicitExpenseAmount(worker.meal);
  const expense = resolveExplicitExpenseAmount(worker.expense);
  const extras = hasLineSpend ? 0 : meal.amount + expense.amount;
  const deduction = money(worker.deduction);
  return {
    dueAmount: Math.max(0, base + extras - deduction),
    mealAmount: meal.amount,
    mealPresent: meal.present,
    expenseAmount: expense.amount,
    expensePresent: expense.present,
    deductionAmount: deduction,
    lineSpend: hasLineSpend ? money(worker.lineSpend) : null,
  };
}

export function canonicalizeLegacyApDataset(data = {}) {
  const monthly = [...(data.workerMonthlyActualVouchers || [])]
    .map((row) => ({
      id: String(row?.id ?? ""),
      workerName: String(row?.workerName ?? ""),
      status: String(row?.status ?? ""),
      cancelled: Boolean(row?.cancelled),
      entryCount: Array.isArray(row?.entries) ? row.entries.length : 0,
      paidSum: (Array.isArray(row?.entries) ? row.entries : []).reduce(
        (sum, entry) => sum + money(entry?.paidAmount ?? entry?.amount ?? entry?.transferAmount),
        0,
      ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const payouts = [...(data.workerPayoutVouchers || [])]
    .map((row) => ({
      id: String(row?.id ?? ""),
      workerName: String(row?.workerName ?? ""),
      amount: money(row?.amount ?? row?.finalAmount ?? row?.paidAmount),
      cancelled: Boolean(row?.cancelled),
      date: String(row?.date || row?.paymentDate || "").slice(0, 10),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const bankLinks = [...(data.bankTransactions || [])]
    .filter((row) => row?.linkedWorkerMonthlyPaymentVoucherId)
    .map((row) => ({
      id: String(row?.id ?? ""),
      voucherId: String(row.linkedWorkerMonthlyPaymentVoucherId),
      withdrawal: money(row?.withdrawal),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { monthly, payouts, bankLinks };
}

export function computeLegacyApDatasetHash(data = {}) {
  return sha256Hex(stableStringify(canonicalizeLegacyApDataset(data)));
}

export function countLegacyApRows(data = {}) {
  const monthly = data.workerMonthlyActualVouchers || [];
  const payouts = data.workerPayoutVouchers || [];
  const bankLinks = (data.bankTransactions || []).filter((row) => row?.linkedWorkerMonthlyPaymentVoucherId);
  let monthlyEntries = 0;
  for (const row of monthly) monthlyEntries += Array.isArray(row?.entries) ? row.entries.length : 0;
  return {
    workerMonthlyActualVouchers: monthly.length,
    workerMonthlyActualEntries: monthlyEntries,
    workerPayoutVouchers: payouts.length,
    bankWorkerLinks: bankLinks.length,
    disbursements: (data.disbursements || []).length,
    disbursementAllocations: (data.disbursementAllocations || []).length,
    apOpeningBalances: readApLedgerMeta(data).apOpeningBalances.length,
  };
}

/**
 * Preview-only activation plan. Does NOT mutate. Apply requires separate approved call.
 */
export function previewApCutoverActivation(input = {}, data = {}) {
  const cutoverWorkDate = String(input.apLedgerCutoverWorkDate || "").slice(0, 10);
  const openingBalancePolicy = input.openingBalancePolicy || OPENING_BALANCE_ZERO_START;
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverWorkDate)) {
    errors.push({ code: "CUTOVER_WORK_DATE_REQUIRED", message: "apLedgerCutoverWorkDate (YYYY-MM-DD, Asia/Seoul) required" });
  }
  if (![OPENING_BALANCE_ZERO_START, OPENING_BALANCE_APPROVED].includes(openingBalancePolicy)) {
    errors.push({ code: "OPENING_BALANCE_POLICY_INVALID", message: "openingBalancePolicy invalid" });
  }
  if (openingBalancePolicy === OPENING_BALANCE_APPROVED) {
    const rows = Array.isArray(input.openingBalances) ? input.openingBalances : [];
    if (!rows.length) {
      errors.push({ code: "OPENING_BALANCES_REQUIRED", message: "APPROVED_WORKER_OPENING_BALANCES requires rows" });
    }
  }
  const existing = readApLedgerMeta(data);
  if (existing.apLedgerActivatedAt) {
    errors.push({ code: "ALREADY_ACTIVATED", message: "AP ledger already activated" });
  }

  const allPayables = typeof input.listPayables === "function" ? input.listPayables() : [];
  const eligible = filterPayablesByCutover(allPayables, data, { cutoverWorkDate });
  const excluded = (allPayables || []).length - eligible.length;

  return {
    ok: errors.length === 0,
    errors,
    plan: {
      apLedgerCutoverWorkDate: cutoverWorkDate || null,
      apLedgerCutoverAt: input.apLedgerCutoverAt ? asIso(input.apLedgerCutoverAt) : null,
      apLedgerPolicy: AP_LEDGER_POLICY,
      openingBalancePolicy,
      legacyApPayoutPolicy: "READ_ONLY_FOREVER",
      disbursementWriteEnabled: false, // still requires separate flag flip after approval
      eligiblePayableCount: eligible.length,
      excludedPreCutoverCount: excluded,
      openingBalanceCount:
        openingBalancePolicy === OPENING_BALANCE_APPROVED ? (input.openingBalances || []).length : 0,
      note: "Preview only. Activation apply requires admin + confirmationToken + exact version.",
    },
  };
}

export function previewOpeningBalances(rows = []) {
  const normalized = [];
  const errors = [];
  for (const row of rows || []) {
    const workerName = String(row?.workerName || "").trim();
    const workerId = row?.workerId != null ? String(row.workerId) : null;
    const openingAmount = money(row?.openingAmount);
    const effectiveDate = String(row?.effectiveDate || "").slice(0, 10);
    const operationId = String(row?.operationId || "").trim();
    if (!workerName) errors.push({ code: "WORKER_NAME_REQUIRED", row });
    if (openingAmount <= 0) errors.push({ code: "OPENING_AMOUNT_REQUIRED", row });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) errors.push({ code: "EFFECTIVE_DATE_REQUIRED", row });
    if (!operationId) errors.push({ code: "OPERATION_ID_REQUIRED", row });
    normalized.push({
      workerId,
      workerName,
      openingAmount,
      effectiveDate,
      memo: String(row?.memo || ""),
      approvedBy: String(row?.approvedBy || ""),
      operationId,
      payloadHash: sha256Hex(
        stableStringify({
          workerId,
          workerName,
          openingAmount,
          effectiveDate,
          memo: String(row?.memo || ""),
        }),
      ),
    });
  }
  return { ok: errors.length === 0, errors, openingBalances: normalized };
}

/**
 * Apply cutover activation into bankSyncMeta — intended for throwaway tests / future approved admin call.
 * Production deploy of this task must NOT call this against customer DB.
 */
export function applyApCutoverActivationToMeta(bankSyncMeta = {}, plan = {}, actor = "system", nowIso = null) {
  const now = nowIso || new Date().toISOString();
  return {
    ...bankSyncMeta,
    apLedgerCutoverAt: plan.apLedgerCutoverAt || now,
    apLedgerCutoverWorkDate: plan.apLedgerCutoverWorkDate,
    apLedgerActivatedAt: now,
    apLedgerActivatedBy: String(actor || "system"),
    apLedgerPolicy: AP_LEDGER_POLICY,
    openingBalancePolicy: plan.openingBalancePolicy || OPENING_BALANCE_ZERO_START,
    legacyApPayoutPolicy: "READ_ONLY_FOREVER",
    disbursementWriteEnabled: plan.disbursementWriteEnabled === true,
    apOpeningBalances: Array.isArray(plan.openingBalances) ? plan.openingBalances : bankSyncMeta.apOpeningBalances || [],
  };
}

/**
 * Freeze planner for legacy AP arrays when cutover activated.
 */
export function planLegacyApArrayWriteFreeze(existingRows = [], incomingRows, options = {}) {
  if (options.allowWorkerApLegacyMutation === true || options.allowLegacyApMutation === true) {
    return {
      rows: Array.isArray(incomingRows) ? incomingRows : existingRows,
      blocked: false,
      blockedCreates: 0,
      blockedUpdates: 0,
      blockedDeletes: 0,
    };
  }
  const existing = Array.isArray(existingRows) ? existingRows : [];
  if (!Array.isArray(incomingRows)) {
    return { rows: existing, blocked: false, blockedCreates: 0, blockedUpdates: 0, blockedDeletes: 0 };
  }
  // Always keep existing verbatim when frozen — no create/update/delete.
  const sameLength = incomingRows.length === existing.length;
  let identical = sameLength;
  if (sameLength) {
    const a = sha256Hex(stableStringify(existing));
    const b = sha256Hex(stableStringify(incomingRows));
    identical = a === b;
  }
  return {
    rows: existing,
    blocked: !identical,
    blockedCreates: Math.max(0, incomingRows.length - existing.length),
    blockedUpdates: identical ? 0 : 1,
    blockedDeletes: Math.max(0, existing.length - incomingRows.length),
  };
}

export function classifyBankToCashTransfer(tx = {}) {
  const memo = `${tx.memo || ""} ${tx.description || ""} ${tx.counterpartyName || ""}`;
  if (/현금\s*인출|시재\s*인출|금고|BANK_TO_CASH/i.test(memo)) {
    return {
      kind: "BANK_TO_CASH_TRANSFER",
      allowDisbursement: false,
      code: "BANK_TO_CASH_TRANSFER",
      message: "통장→현금 인출은 시공자 지급이 아닙니다. 실제 전달 시 현금 Disbursement를 등록하세요.",
    };
  }
  return { kind: "payout_candidate", allowDisbursement: true };
}

export { ymdSeoul, money as apMoney, sha256Hex };
