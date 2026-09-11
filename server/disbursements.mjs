/**
 * Contractor Disbursement ledger (AP twin of Receipts).
 * Payable authority = workItemId derived from sale worker lines.
 * Append-only allocations with reverse support. Isolated behind allowDisbursementMutation.
 */
import crypto from "crypto";
import { getErpState, saveErpState } from "./db.mjs";
import {
  filterPayablesByCutover,
  isDisbursementWriteAllowed,
  readApLedgerMeta,
  classifyBankToCashTransfer,
} from "./apLedgerCutover.mjs";

const SAVE_RETRY_ATTEMPTS = 8;

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function todaySeoul() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function makeError(code, message, status = 400, details = null) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (details) err.details = details;
  return err;
}

function hashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildWorkItemId(sale, workerIndex, worker = {}) {
  const saleId = String(sale?.id ?? "").trim();
  const sc = String(sale?.scScheduleId || "").trim();
  const workerKey = String(worker?.workerId || worker?.id || worker?.name || workerIndex).trim();
  if (sc) return `sc:${sc}:${workerKey}`;
  return `sale:${saleId}:${Number(workerIndex)}`;
}

export function listContractorPayablesFromSales(sales = [], options = {}) {
  const asOf = options.asOfDate || todaySeoul();
  const rows = [];
  for (const sale of sales || []) {
    if (!sale || sale.cancelled || sale.status === "cancelled") continue;
    const workers = Array.isArray(sale.workers) ? sale.workers : [];
    workers.forEach((worker, index) => {
      const hasLineSpend = worker?.lineSpend != null && worker.lineSpend !== "";
      const base = money(hasLineSpend ? worker.lineSpend : worker.payAmount ?? worker.amount);
      // Explicit meal/expense only when lineSpend absent — never invent from other jobs.
      const mealRaw = worker?.meal;
      const expenseRaw = worker?.expense;
      const meal = mealRaw == null || mealRaw === "" ? 0 : money(mealRaw);
      const expense = expenseRaw == null || expenseRaw === "" ? 0 : money(expenseRaw);
      const extras = hasLineSpend ? 0 : meal + expense;
      const due = base + extras - money(worker.deduction);
      if (due <= 0 && !options.includeZero) return;
      const workItemId = buildWorkItemId(sale, index, worker);
      rows.push({
        workItemId,
        saleId: sale.id,
        scScheduleId: sale.scScheduleId || null,
        workerId: worker.workerId || worker.id || null,
        workerName: String(worker.name || worker.workerName || "").trim(),
        workDate: String(sale.date || "").slice(0, 10),
        dueAmount: due,
        mealAmount: meal,
        expenseAmount: expense,
        deductionAmount: money(worker.deduction),
        lineSpend: hasLineSpend ? money(worker.lineSpend) : null,
        site: String(sale.site || sale.memo || ""),
        asOf,
        kind: "workItem",
      });
    });
  }
  return rows.sort(
    (a, b) =>
      String(a.workDate).localeCompare(String(b.workDate)) ||
      String(a.workItemId).localeCompare(String(b.workItemId)),
  );
}

function listDisbursements(data) {
  return Array.isArray(data?.disbursements) ? data.disbursements : [];
}

function listDisbursementAllocations(data) {
  return Array.isArray(data?.disbursementAllocations) ? data.disbursementAllocations : [];
}

function isAllocEffective(row, asOf = todaySeoul()) {
  if (!row || row.auditOnly) return false;
  if (row.status === "reversed" && !row.reversedEffectiveDate) return false;
  const from = String(row.effectiveFrom || row.allocationDate || "").slice(0, 10);
  if (from && from > asOf) return false;
  const to = String(row.reversedEffectiveDate || "").slice(0, 10);
  if (to && to <= asOf) return false;
  return true;
}

export function summarizeDisbursement(disbursement, allocations = [], asOf = todaySeoul()) {
  const rows = (allocations || []).filter(
    (row) => String(row.disbursementId) === String(disbursement.id) && isAllocEffective(row, asOf),
  );
  const allocatedAmount = rows.reduce((sum, row) => sum + money(row.amount), 0);
  const grossAmount = money(disbursement.grossAmount);
  return {
    allocatedAmount,
    unallocatedAmount: Math.max(grossAmount - allocatedAmount, 0),
    allocationCount: rows.length,
  };
}

function workItemAllocated(allocations, disbursements, workItemId, asOf = todaySeoul()) {
  const disbById = new Map((disbursements || []).map((row) => [String(row.id), row]));
  let sum = 0;
  for (const row of allocations || []) {
    if (String(row.workItemId) !== String(workItemId)) continue;
    if (!isAllocEffective(row, asOf)) continue;
    const parent = disbById.get(String(row.disbursementId));
    if (!parent || parent.status === "reversed" || parent.reversedEffectiveDate) continue;
    if (parent.reversalOfDisbursementId) continue;
    sum += money(row.amount);
  }
  return sum;
}

export function listOpeningBalancePayables(data = {}) {
  const meta = readApLedgerMeta(data);
  return (meta.apOpeningBalances || []).map((row) => ({
    workItemId: `opening:${String(row.workerId || row.workerName || "").trim()}:${row.effectiveDate}:${row.operationId}`,
    saleId: null,
    scScheduleId: null,
    workerId: row.workerId || null,
    workerName: String(row.workerName || "").trim(),
    workDate: String(row.effectiveDate || "").slice(0, 10),
    dueAmount: money(row.openingAmount),
    mealAmount: 0,
    expenseAmount: 0,
    deductionAmount: 0,
    lineSpend: null,
    site: "기초 미지급",
    asOf: todaySeoul(),
    kind: "openingBalance",
  }));
}

export function listNewLedgerPayables(data = {}, options = {}) {
  const derived = listContractorPayablesFromSales(data?.sales || [], options);
  const filtered = filterPayablesByCutover(derived, data, options);
  const openings = listOpeningBalancePayables(data);
  return [...openings, ...filtered].sort(
    (a, b) =>
      // opening balances first (kind), then oldest workDate, then workItemId
      (a.kind === "openingBalance" ? 0 : 1) - (b.kind === "openingBalance" ? 0 : 1) ||
      String(a.workDate).localeCompare(String(b.workDate)) ||
      String(a.workItemId).localeCompare(String(b.workItemId)),
  );
}

export function proposeDisbursementFifo(payables, grossAmount, allocations = [], disbursements = [], asOf = todaySeoul()) {
  let remaining = money(grossAmount);
  const proposals = [];
  // Prefer opening balances, then oldest workDate (caller should already sort).
  const ordered = [...(payables || [])].sort(
    (a, b) =>
      (a.kind === "openingBalance" ? 0 : 1) - (b.kind === "openingBalance" ? 0 : 1) ||
      String(a.workDate).localeCompare(String(b.workDate)) ||
      String(a.workItemId).localeCompare(String(b.workItemId)),
  );
  for (const payable of ordered) {
    if (remaining <= 0) break;
    const unpaid = Math.max(money(payable.dueAmount) - workItemAllocated(allocations, disbursements, payable.workItemId, asOf), 0);
    if (unpaid <= 0) continue;
    const apply = Math.min(unpaid, remaining);
    proposals.push({ workItemId: payable.workItemId, amount: apply, saleId: payable.saleId, workerName: payable.workerName, kind: payable.kind });
    remaining -= apply;
  }
  return { allocations: proposals, unallocatedAmount: Math.max(remaining, 0), grossAmount: money(grossAmount) };
}

function saveDisbursementsAtomic(mutator, actor) {
  for (let attempt = 0; attempt < SAVE_RETRY_ATTEMPTS; attempt += 1) {
    const state = getErpState();
    const data = state.data || {};
    const disbursements = [...listDisbursements(data)];
    const allocations = [...listDisbursementAllocations(data)];
    const payables = listContractorPayablesFromSales(data.sales || []);
    const result = mutator({ data, disbursements, allocations, payables, sales: data.sales || [], actor, version: state.version });
    if (result.shortCircuit) return result.value;
    try {
      const saved = saveErpState(
        {
          ...data,
          disbursements: result.disbursements,
          disbursementAllocations: result.allocations,
          contractorPayables: result.payablesSnapshot || payables,
        },
        state.version,
        actor,
        { allowDisbursementMutation: true },
      );
      return { ...result.value, version: saved.version, updatedAt: saved.updatedAt };
    } catch (error) {
      if (error?.status !== 409 || attempt === SAVE_RETRY_ATTEMPTS - 1) throw error;
    }
  }
  throw makeError("DISBURSEMENT_SAVE_FAILED", "지급전표 저장에 실패했습니다.", 500);
}

export function createAndPostDisbursement(input, actor = "system") {
  return saveDisbursementsAtomic(({ data, disbursements, allocations, sales }) => {
    const raw = input || {};
    if (!isDisbursementWriteAllowed(data, { forceEnable: raw.forceEnable === true || raw.__testBypassCutover === true })) {
      throw makeError(
        "AP_LEDGER_WRITE_DISABLED",
        "신규 지급 원장이 활성화되지 않았습니다. 컷오버 승인 전입니다.",
        403,
      );
    }
    const operationId = String(raw.operationId || raw.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");
    const grossAmount = money(raw.grossAmount);
    if (grossAmount <= 0) throw makeError("INVALID_AMOUNT", "지급액은 0보다 커야 합니다.");
    const workerName = String(raw.workerName || "").trim();
    const workerId = raw.workerId == null || raw.workerId === "" ? null : String(raw.workerId);
    if (!workerName && !workerId) throw makeError("WORKER_REQUIRED", "시공자를 지정해 주세요.");

    const bankTransactionId =
      raw.bankTransactionId == null || raw.bankTransactionId === "" ? null : String(raw.bankTransactionId);
    if (bankTransactionId) {
      const bankTx = (data.bankTransactions || []).find((row) => String(row?.id) === bankTransactionId);
      const transfer = classifyBankToCashTransfer(bankTx || { memo: raw.memo, description: raw.description });
      if (!transfer.allowDisbursement && raw.allowBankToCashAsPayout !== true) {
        throw makeError(transfer.code || "BANK_TO_CASH_TRANSFER", transfer.message, 400);
      }
    }

    const prior = disbursements.find((row) => String(row.operationId || "") === operationId);
    const payloadHash = hashPayload({
      workerId,
      workerName,
      disbursementDate: String(raw.disbursementDate || todaySeoul()).slice(0, 10),
      grossAmount,
      channel: String(raw.channel || "cash"),
      bankTransactionId,
      allocations: Array.isArray(raw.allocations)
        ? raw.allocations
            .map((row) => ({ workItemId: String(row.workItemId), amount: money(row.amount) }))
            .sort((a, b) => a.workItemId.localeCompare(b.workItemId))
        : null,
    });
    if (prior) {
      if (prior.payloadHash && prior.payloadHash !== payloadHash && raw.allocations) {
        throw makeError("IDEMPOTENCY_CONFLICT", "동일 operationId에 다른 payload가 전달되었습니다.", 409);
      }
      const rows = allocations.filter((a) => String(a.disbursementId) === String(prior.id));
      return {
        shortCircuit: true,
        value: { ok: true, idempotent: true, disbursement: prior, allocations: rows, summary: summarizeDisbursement(prior, rows) },
      };
    }

    if (bankTransactionId) {
      const conflict = disbursements.find(
        (row) =>
          String(row.bankTransactionId || "") === bankTransactionId &&
          !row.reversalOfDisbursementId &&
          row.status !== "reversed" &&
          !row.reversedEffectiveDate,
      );
      if (conflict) {
        throw makeError("BANK_TX_ALREADY_POSTED", "동일 통장출금에 이미 지급전표가 있습니다.", 409, {
          disbursementId: conflict.id,
        });
      }
    }

    const disbursementDate = String(raw.disbursementDate || todaySeoul()).slice(0, 10);
    const channel = String(raw.channel || "cash");
    const ledgerPayables = listNewLedgerPayables(data, {
      exposeAllWithoutCutover: raw.__testBypassCutover === true || raw.forceEnable === true,
    }).filter((row) => {
      if (workerId && String(row.workerId || "") === workerId) return true;
      if (workerName && String(row.workerName || "") === workerName) return true;
      return false;
    });

    let allocInput = Array.isArray(raw.allocations) ? raw.allocations : null;
    if (!allocInput || !allocInput.length) {
      allocInput = proposeDisbursementFifo(ledgerPayables, grossAmount, allocations, disbursements, disbursementDate).allocations;
    }

    const id = `disb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const disbursement = {
      id,
      disbursementNo: `D-${disbursementDate.replaceAll("-", "")}-${String(disbursements.length + 1).padStart(4, "0")}`,
      workerId,
      workerName,
      disbursementDate,
      grossAmount,
      channel,
      method: String(raw.method || channel),
      source: String(raw.source || "manual"),
      bankTransactionId,
      memo: String(raw.memo || ""),
      paidBy: String(raw.paidBy || actor || ""),
      receivedBy: String(raw.receivedBy || workerName || ""),
      operationId,
      payloadHash,
      status: "posted",
      createdAt: new Date().toISOString(),
      createdBy: actor,
    };

    const nextAllocations = [...allocations];
    let allocatedSum = 0;
    for (const row of allocInput || []) {
      const amount = money(row.amount);
      if (amount <= 0) continue;
      const workItemId = String(row.workItemId || "").trim();
      if (!workItemId) throw makeError("WORK_ITEM_REQUIRED", "workItemId가 필요합니다.");
      const payable = ledgerPayables.find((p) => p.workItemId === workItemId);
      const unpaid = payable
        ? Math.max(money(payable.dueAmount) - workItemAllocated(allocations, disbursements, workItemId, disbursementDate), 0)
        : amount;
      if (payable && amount > unpaid) {
        throw makeError("OVER_ALLOCATION", "지급배정이 미지급액을 초과합니다.", 400, { workItemId, unpaid, amount });
      }
      allocatedSum += amount;
      nextAllocations.push({
        id: `dalloc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        disbursementId: id,
        workItemId,
        saleId: row.saleId || payable?.saleId || null,
        amount,
        effectiveFrom: disbursementDate,
        status: "posted",
        createdAt: new Date().toISOString(),
      });
    }
    if (allocatedSum > grossAmount) {
      throw makeError("OVER_ALLOCATION", "배정 합계가 지급액을 초과합니다.");
    }

    const nextDisbursements = [...disbursements, disbursement];
    const summary = summarizeDisbursement(disbursement, nextAllocations, disbursementDate);
    return {
      disbursements: nextDisbursements,
      allocations: nextAllocations,
      payablesSnapshot: listNewLedgerPayables(
        { ...data, sales },
        { exposeAllWithoutCutover: raw.__testBypassCutover === true || raw.forceEnable === true },
      ),
      value: {
        ok: true,
        idempotent: false,
        disbursement,
        allocations: nextAllocations.filter((row) => String(row.disbursementId) === id),
        summary,
      },
    };
  }, actor);
}

export function reverseDisbursement(disbursementId, input = {}, actor = "system") {
  return saveDisbursementsAtomic(({ data, disbursements, allocations, sales }) => {
    if (!isDisbursementWriteAllowed(data, { forceEnable: input.forceEnable === true || input.__testBypassCutover === true })) {
      throw makeError("AP_LEDGER_WRITE_DISABLED", "신규 지급 원장이 활성화되지 않았습니다.", 403);
    }
    const target = disbursements.find((row) => String(row.id) === String(disbursementId));
    if (!target) throw makeError("DISBURSEMENT_NOT_FOUND", "지급전표를 찾을 수 없습니다.", 404);
    if (target.reversalOfDisbursementId) throw makeError("ALREADY_REVERSAL", "취소전표는 다시 취소할 수 없습니다.");
    if (target.status === "reversed" || target.reversedEffectiveDate) {
      throw makeError("ALREADY_REVERSED", "이미 취소된 지급전표입니다.", 409);
    }
    const operationId = String(input.operationId || input.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");
    const prior = disbursements.find((row) => String(row.operationId || "") === operationId);
    if (prior) {
      return {
        shortCircuit: true,
        value: { ok: true, idempotent: true, disbursement: prior },
      };
    }
    const reversalEffectiveDate = String(input.reversalEffectiveDate || todaySeoul()).slice(0, 10);
    const reversalId = `disb_rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const reversal = {
      id: reversalId,
      disbursementNo: `${target.disbursementNo}-R`,
      workerId: target.workerId,
      workerName: target.workerName,
      disbursementDate: reversalEffectiveDate,
      grossAmount: -money(target.grossAmount),
      channel: target.channel,
      method: target.method,
      source: "reverse",
      bankTransactionId: null,
      memo: String(input.memo || `reverse ${target.id}`),
      operationId,
      payloadHash: hashPayload({ disbursementId: target.id, reversalEffectiveDate }),
      status: "posted",
      reversalOfDisbursementId: target.id,
      createdAt: new Date().toISOString(),
      createdBy: actor,
    };
    const nextDisbursements = disbursements.map((row) =>
      String(row.id) === String(target.id)
        ? { ...row, status: "reversed", reversedEffectiveDate: reversalEffectiveDate, reversedAt: new Date().toISOString() }
        : row,
    );
    nextDisbursements.push(reversal);
    const nextAllocations = allocations.map((row) =>
      String(row.disbursementId) === String(target.id) && isAllocEffective(row, reversalEffectiveDate)
        ? { ...row, reversedEffectiveDate: reversalEffectiveDate, status: "reversed" }
        : row,
    );
    return {
      disbursements: nextDisbursements,
      allocations: nextAllocations,
      payablesSnapshot: listContractorPayablesFromSales(sales),
      value: { ok: true, idempotent: false, disbursement: reversal, original: { ...target, status: "reversed", reversedEffectiveDate: reversalEffectiveDate } },
    };
  }, actor);
}

export function registerDisbursement(input, actor = "system") {
  return createAndPostDisbursement(input, actor);
}

export function getWorkerApBalance(workerNameOrId, data, asOf = todaySeoul()) {
  const key = String(workerNameOrId || "").trim();
  const payables = listNewLedgerPayables(data || {}).filter(
    (row) => String(row.workerId || "") === key || String(row.workerName || "") === key,
  );
  const disbursements = listDisbursements(data);
  const allocations = listDisbursementAllocations(data);
  let due = 0;
  let paid = 0;
  for (const payable of payables) {
    due += money(payable.dueAmount);
    paid += workItemAllocated(allocations, disbursements, payable.workItemId, asOf);
  }
  let advance = 0;
  for (const disb of disbursements) {
    if (disb.reversalOfDisbursementId || disb.status === "reversed") continue;
    if (String(disb.workerId || "") !== key && String(disb.workerName || "") !== key) continue;
    advance += summarizeDisbursement(disb, allocations, asOf).unallocatedAmount;
  }
  const meta = readApLedgerMeta(data || {});
  return {
    dueAmount: due,
    paidAmount: paid,
    outstanding: Math.max(due - paid, 0),
    unallocatedAdvance: advance,
    netExposure: Math.max(due - paid, 0) - advance,
    ledger: "new",
    cutoverWorkDate: meta.apLedgerCutoverWorkDate,
    activated: Boolean(meta.apLedgerActivatedAt),
  };
}

export {
  listDisbursements,
  listDisbursementAllocations,
  workItemAllocated,
  money as disbursementMoney,
  makeError as disbursementError,
};
