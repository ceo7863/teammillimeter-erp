import crypto from "crypto";
import { getErpState, saveErpState } from "./db.mjs";
import {
  loadSentStatementSaleIdsForClient,
  proposeFifoAllocationsScoped,
  planPrepaidAutoApply,
} from "./canonicalCollection.mjs";

const SAVE_RETRY_ATTEMPTS = 8;
const RECEIPT_CHANNELS = new Set(["bank", "cash", "personal_account", "other"]);
const RECEIPT_SOURCES = new Set([
  "bank_auto",
  "bank_manual",
  "calendar",
  "receivables",
  "sent_statement",
  "migration",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function nowIso() {
  return new Date().toISOString();
}

export function todaySeoul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function normalizeSeoulDate(value, label = "date") {
  const text = String(value || "").trim().slice(0, 10);
  if (!DATE_RE.test(text)) {
    throw makeError("INVALID_DATE", `${label}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const [y, m, d] = text.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    throw makeError("INVALID_DATE", `${label}가 올바른 날짜가 아닙니다.`);
  }
  return text;
}

export function shiftSeoulDate(ymd, deltaDays) {
  const base = normalizeSeoulDate(ymd);
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function makeError(code, message, status = 400, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

export function listReceipts(data = {}) {
  return Array.isArray(data.receipts) ? data.receipts : [];
}

export function listReceiptAllocations(data = {}) {
  return Array.isArray(data.receiptAllocations) ? data.receiptAllocations : [];
}

/** Deterministic defaults for rows created before as-of fields existed. */
export function resolveAllocationEffectiveFrom(allocation, receipt) {
  return String(
    allocation?.effectiveFrom ||
      allocation?.allocationEffectiveDate ||
      receipt?.receiptDate ||
      String(allocation?.createdAt || "").slice(0, 10) ||
      "",
  ).slice(0, 10);
}

export function resolveAllocationReversedEffectiveDate(allocation) {
  const value = allocation?.reversedEffectiveDate || allocation?.effectiveTo || null;
  return value ? String(value).slice(0, 10) : null;
}

/**
 * As-of effectiveness: ignores current status alone.
 * Allocation is effective on asOf when effectiveFrom <= asOf < reversedEffectiveDate (if set).
 * Audit-only / reversal-document rows never apply.
 */
export function isAllocationEffectiveAsOf(allocation, receiptById, asOfDate) {
  if (!allocation) return false;
  if (allocation.auditOnly) return false;
  if (money(allocation.amount) <= 0) return false;
  const asOf = normalizeSeoulDate(asOfDate || todaySeoul(), "asOf");
  const receipt = receiptById?.get(String(allocation.receiptId));
  if (receipt?.reversalOfReceiptId) return false;
  const from = resolveAllocationEffectiveFrom(allocation, receipt);
  if (!from || asOf < from) return false;
  const until = resolveAllocationReversedEffectiveDate(allocation);
  if (until && asOf >= until) return false;
  return true;
}

/** Current-state helper used by projection / remaining balance (as-of today). */
export function isEffectivePostedAllocation(allocation, receiptById = null, asOfDate = null) {
  return isAllocationEffectiveAsOf(allocation, receiptById, asOfDate || todaySeoul());
}

export function summarizeReceiptAsOf(receipt, allocations = [], asOfDate = null) {
  const asOf = asOfDate || todaySeoul();
  const receiptById = new Map([[String(receipt.id), receipt]]);
  if (receipt.reversalOfReceiptId) {
    return { allocatedAmount: 0, unallocatedAmount: 0, allocationCount: 0 };
  }
  const receiptDate = String(receipt.receiptDate || "").slice(0, 10);
  if (receiptDate && asOf < receiptDate) {
    return { allocatedAmount: 0, unallocatedAmount: 0, allocationCount: 0 };
  }
  const reversedAt = receipt.reversedEffectiveDate ? String(receipt.reversedEffectiveDate).slice(0, 10) : null;
  if (reversedAt && asOf >= reversedAt) {
    return { allocatedAmount: 0, unallocatedAmount: 0, allocationCount: 0 };
  }
  const rows = (allocations || []).filter(
    (row) => String(row.receiptId) === String(receipt.id) && isAllocationEffectiveAsOf(row, receiptById, asOf),
  );
  const allocatedAmount = rows.reduce((sum, row) => sum + money(row.amount), 0);
  const grossAmount = money(receipt.grossAmount);
  const unallocatedAmount = Math.max(grossAmount - allocatedAmount, 0);
  return {
    allocatedAmount,
    unallocatedAmount,
    allocationCount: rows.length,
  };
}

export function summarizeReceipt(receipt, allocations = []) {
  return summarizeReceiptAsOf(receipt, allocations, todaySeoul());
}

export function assertCashIdentity(grossAmount, allocatedAmount, unallocatedAmount) {
  const gross = money(grossAmount);
  const allocated = money(allocatedAmount);
  const unallocated = money(unallocatedAmount);
  if (gross < 0) return true;
  if (allocated + unallocated !== gross) {
    throw makeError(
      "CASH_IDENTITY_BROKEN",
      `입금액(${gross}) ≠ 배분(${allocated}) + 미배분(${unallocated}) 불변식 위반`,
      500,
    );
  }
  return true;
}

export function canonicalizeCreatePayload(input, clientId) {
  const receiptDate = normalizeSeoulDate(input?.receiptDate || todaySeoul(), "receiptDate");
  const defaultAllocDate = input?.allocationEffectiveDate
    ? normalizeSeoulDate(input.allocationEffectiveDate, "allocationEffectiveDate")
    : receiptDate;
  const allocations = (Array.isArray(input?.allocations) ? input.allocations : [])
    .map((row) => ({
      saleId: String(row?.saleId ?? row?.salesId ?? ""),
      amount: money(row?.amount),
      effectiveFrom: normalizeSeoulDate(
        row?.effectiveFrom || row?.allocationEffectiveDate || defaultAllocDate,
        "allocationEffectiveDate",
      ),
    }))
    .filter((row) => row.saleId && row.amount > 0)
    .sort(
      (a, b) =>
        a.saleId.localeCompare(b.saleId) ||
        a.amount - b.amount ||
        a.effectiveFrom.localeCompare(b.effectiveFrom),
    );

  let grossAmount = money(input?.grossAmount);
  if (!grossAmount && allocations.length) {
    grossAmount = allocations.reduce((sum, row) => sum + row.amount, 0);
  }

  return {
    action: "create",
    clientId: String(clientId),
    receiptDate,
    grossAmount,
    channel: String(input?.channel || "").trim(),
    source: String(input?.source || "").trim(),
    bankTransactionId:
      input?.bankTransactionId == null || input?.bankTransactionId === ""
        ? null
        : String(input.bankTransactionId),
    sentStatementId:
      input?.sentStatementId == null || input?.sentStatementId === ""
        ? null
        : String(input.sentStatementId),
    allocations,
  };
}

export function canonicalizeReversePayload(receiptId, reversalEffectiveDate) {
  return {
    action: "reverse",
    receiptId: String(receiptId),
    reversalEffectiveDate: normalizeSeoulDate(reversalEffectiveDate, "reversalEffectiveDate"),
  };
}

export function canonicalizeReallocatePayload(receiptId, allocationsInput, effectiveDate) {
  const allocations = (Array.isArray(allocationsInput) ? allocationsInput : [])
    .map((row) => ({
      saleId: String(row?.saleId ?? row?.salesId ?? ""),
      amount: money(row?.amount),
    }))
    .filter((row) => row.saleId && row.amount > 0)
    .sort((a, b) => a.saleId.localeCompare(b.saleId) || a.amount - b.amount);
  return {
    action: "reallocate",
    receiptId: String(receiptId),
    effectiveDate: normalizeSeoulDate(effectiveDate, "effectiveDate"),
    allocations,
  };
}

export function hashPayload(canonical) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function resolveClientId(clients, { clientId, clientName }) {
  const id = String(clientId || "").trim();
  if (id) {
    const byId = (clients || []).find((row) => String(row.id) === id);
    if (!byId) throw makeError("CLIENT_NOT_FOUND", "거래처 ID를 찾을 수 없습니다.", 404);
    return String(byId.id);
  }
  const name = String(clientName || "").trim();
  if (!name) throw makeError("CLIENT_REQUIRED", "거래처 ID 또는 이름이 필요합니다.");
  const matches = (clients || []).filter((row) => String(row.name || "").trim() === name);
  if (matches.length === 0) throw makeError("CLIENT_NOT_FOUND", `거래처 '${name}'를 찾을 수 없습니다.`, 404);
  if (matches.length > 1) {
    throw makeError(
      "CLIENT_AMBIGUOUS",
      `동명 거래처가 ${matches.length}건입니다. clientId로 지정해 주세요.`,
      409,
      { candidates: matches.map((row) => ({ id: row.id, name: row.name })), manualReview: true },
    );
  }
  return String(matches[0].id);
}

export function saleBelongsToClient(sale, client, clients = []) {
  if (!sale || !client) return false;
  const clientId = String(client.id);
  if (sale.clientId != null && String(sale.clientId).trim() !== "") {
    return String(sale.clientId) === clientId;
  }
  const name = String(sale.client || "").trim();
  if (!name) return false;
  const matches = (clients || []).filter((row) => String(row.name || "").trim() === name);
  if (matches.length !== 1) return false;
  return String(matches[0].id) === clientId;
}

function findSale(sales, saleId) {
  return (sales || []).find((row) => String(row.id) === String(saleId));
}

export function saleAllocatedAsOf(allocations, receipts, saleId, asOfDate, excludeReceiptId = null) {
  const receiptById = new Map((receipts || []).map((row) => [String(row.id), row]));
  return (allocations || [])
    .filter((row) => {
      if (String(row.saleId) !== String(saleId)) return false;
      if (excludeReceiptId != null && String(row.receiptId) === String(excludeReceiptId)) return false;
      return isAllocationEffectiveAsOf(row, receiptById, asOfDate);
    })
    .reduce((sum, row) => sum + money(row.amount), 0);
}

function saleAllocatedPosted(allocations, receipts, saleId, excludeReceiptId = null) {
  return saleAllocatedAsOf(allocations, receipts, saleId, todaySeoul(), excludeReceiptId);
}

function nextReceiptNo(receipts) {
  const stamp = todaySeoul().replace(/-/g, "");
  const prefix = `RCP-${stamp}-`;
  let maxSeq = 0;
  for (const row of receipts || []) {
    const no = String(row.receiptNo || "");
    if (!no.startsWith(prefix)) continue;
    const seq = Number(no.slice(prefix.length));
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

function normalizeChannel(value) {
  const channel = String(value || "").trim();
  if (!RECEIPT_CHANNELS.has(channel)) {
    throw makeError("INVALID_CHANNEL", "channel은 bank|cash|personal_account|other 중 하나여야 합니다.");
  }
  return channel;
}

function normalizeSource(value) {
  const source = String(value || "").trim();
  if (!RECEIPT_SOURCES.has(source)) {
    throw makeError(
      "INVALID_SOURCE",
      "source는 bank_auto|bank_manual|calendar|receivables|sent_statement|migration 중 하나여야 합니다.",
    );
  }
  return source;
}

function listAccountingEventDates(receipt, allocations = []) {
  const dates = [];
  if (receipt?.receiptDate) dates.push(String(receipt.receiptDate).slice(0, 10));
  if (receipt?.reversedEffectiveDate) dates.push(String(receipt.reversedEffectiveDate).slice(0, 10));
  for (const event of Array.isArray(receipt?.reallocationEvents) ? receipt.reallocationEvents : []) {
    if (event?.effectiveDate) dates.push(String(event.effectiveDate).slice(0, 10));
  }
  for (const row of allocations || []) {
    if (String(row.receiptId) !== String(receipt.id)) continue;
    if (row.auditOnly) continue;
    if (row.effectiveFrom) dates.push(String(row.effectiveFrom).slice(0, 10));
    if (row.reversedEffectiveDate) dates.push(String(row.reversedEffectiveDate).slice(0, 10));
    if (row.effectiveTo) dates.push(String(row.effectiveTo).slice(0, 10));
  }
  return dates.filter(Boolean).sort();
}

function assertNotBeforeReceiptDate(receipt, eventDate, label) {
  const receiptDate = String(receipt.receiptDate || "").slice(0, 10);
  if (eventDate < receiptDate) {
    throw makeError(
      "EVENT_BEFORE_RECEIPT_DATE",
      `${label}(${eventDate})는 입금일(${receiptDate})보다 이전일 수 없습니다.`,
      400,
    );
  }
}

function assertNoLaterAccountingEvent(receipt, eventDate, allocations = []) {
  const later = listAccountingEventDates(receipt, allocations).filter((date) => date > eventDate);
  if (later.length) {
    throw makeError(
      "OUT_OF_ORDER_ACCOUNTING_EVENT",
      `이미 더 늦은 회계 사건(${later[later.length - 1]})이 있어 ${eventDate} 사건을 삽입할 수 없습니다.`,
      409,
      { latestEventDate: later[later.length - 1], requestedDate: eventDate },
    );
  }
}

function normalizeAllocationsInput(
  rawAllocations,
  sales,
  receipts,
  allocations,
  client,
  clients,
  {
    excludeReceiptId = null,
    asOfDate = null,
    defaultEffectiveFrom = null,
  } = {},
) {
  const asOf = asOfDate || todaySeoul();
  const normalized = [];
  for (const raw of Array.isArray(rawAllocations) ? rawAllocations : []) {
    const saleId = raw?.saleId ?? raw?.salesId;
    if (saleId == null || saleId === "") {
      throw makeError("ALLOCATION_SALE_REQUIRED", "배분에 saleId가 필요합니다.");
    }
    const sale = findSale(sales, saleId);
    if (!sale) throw makeError("SALE_NOT_FOUND", `매출전표 ${saleId}를 찾을 수 없습니다.`, 404);
    if (!saleBelongsToClient(sale, client, clients)) {
      throw makeError(
        "CLIENT_SALE_MISMATCH",
        `매출 ${saleId}가 입금전표 거래처(clientId=${client.id})와 일치하지 않습니다.`,
        400,
      );
    }
    const amount = money(raw.amount);
    if (amount <= 0) throw makeError("ALLOCATION_AMOUNT_INVALID", "배분액은 0보다 커야 합니다.");
    const effectiveFrom = normalizeSeoulDate(
      raw?.effectiveFrom || raw?.allocationEffectiveDate || defaultEffectiveFrom || asOf,
      "allocationEffectiveDate",
    );
    const billed = money(sale.amount);
    const already = saleAllocatedAsOf(allocations, receipts, saleId, effectiveFrom, excludeReceiptId);
    const remaining = Math.max(billed - already, 0);
    if (amount > remaining) {
      throw makeError(
        "ALLOCATION_EXCEEDS_SALE",
        `매출 ${saleId} 미수잔액(${remaining})을 초과하는 배분입니다.`,
        400,
        { saleId, remaining, amount, asOf: effectiveFrom },
      );
    }
    normalized.push({
      saleId: sale.id,
      amount,
      site: String(sale.site || sale.memo || ""),
      effectiveFrom,
    });
  }
  return normalized;
}

function findByOperationId(receipts, operationId) {
  const key = String(operationId || "").trim();
  if (!key) return null;
  return (receipts || []).find((row) => String(row.operationId || "") === key) || null;
}

function findReallocationEvent(receipts, operationId) {
  const key = String(operationId || "").trim();
  if (!key) return null;
  for (const receipt of receipts || []) {
    const events = Array.isArray(receipt.reallocationEvents) ? receipt.reallocationEvents : [];
    const hit = events.find((event) => String(event.operationId || "") === key);
    if (hit) return { receipt, event: hit };
  }
  return null;
}

function assertBankTxUnique(receipts, bankTransactionId, excludeReceiptId = null) {
  const bankId = bankTransactionId == null || bankTransactionId === "" ? null : String(bankTransactionId);
  if (!bankId) return;
  const conflict = (receipts || []).find((row) => {
    if (row.reversalOfReceiptId) return false;
    if (row.reversedEffectiveDate) return false;
    if (row.status === "reversed") return false;
    if (String(row.bankTransactionId || "") !== bankId) return false;
    if (excludeReceiptId != null && String(row.id) === String(excludeReceiptId)) return false;
    return true;
  });
  if (conflict) {
    throw makeError(
      "BANK_TX_ALREADY_POSTED",
      "동일 통장거래에 이미 posted 입금전표가 있습니다.",
      409,
      { receiptId: conflict.id, receiptNo: conflict.receiptNo },
    );
  }
}

function assertIdempotentMatch(existingHash, payloadHash, operationId, existingId = null) {
  if (String(existingHash || "") === String(payloadHash)) return;
  throw makeError(
    "IDEMPOTENCY_CONFLICT",
    "동일 operationId에 다른 입금 payload가 요청되었습니다.",
    409,
    { operationId, existingReceiptId: existingId },
  );
}

/** Accepts either `{ allocations }` or a raw ERP data slice `{ receiptAllocations }`. */
function normalizePlanContext(context) {
  const source = context || {};
  return {
    receipts: Array.isArray(source.receipts) ? source.receipts : [],
    allocations: Array.isArray(source.allocations)
      ? source.allocations
      : Array.isArray(source.receiptAllocations)
        ? source.receiptAllocations
        : [],
    sales: Array.isArray(source.sales) ? source.sales : [],
    clients: Array.isArray(source.clients) ? source.clients : [],
  };
}

function saveReceiptsDomainAtomic(mutator, actor) {
  for (let attempt = 0; attempt < SAVE_RETRY_ATTEMPTS; attempt += 1) {
    const state = getErpState();
    const data = state.data || {};
    const receipts = [...listReceipts(data)];
    const allocations = [...listReceiptAllocations(data)];
    const result = mutator({
      data,
      receipts,
      allocations,
      sales: data.sales || [],
      clients: data.clients || [],
      actor,
      version: state.version,
    });
    if (result.shortCircuit) return result.value;
    try {
      const saved = saveErpState(
        {
          ...data,
          receipts: result.receipts,
          receiptAllocations: result.allocations,
        },
        state.version,
        actor,
        { allowReceiptMutation: true },
      );
      return {
        ...result.value,
        version: saved.version,
        updatedAt: saved.updatedAt,
      };
    } catch (error) {
      if (error?.status !== 409 || attempt === SAVE_RETRY_ATTEMPTS - 1) throw error;
    }
  }
  throw makeError("RECEIPT_SAVE_FAILED", "입금전표 저장에 실패했습니다.", 500);
}

/**
 * Pure planner: computes the next receipts/allocations arrays for a create+post.
 * Never touches the database, so callers can compose it with other domain writes
 * (bank transactions) inside a single saveErpState transaction.
 *
 * Returns `{ shortCircuit: true, value }` for an idempotent replay, otherwise
 * `{ receipts, allocations, value }`.
 */
export function planCreateAndPostReceipt(context, input, actor = "system") {
  return (({ receipts, allocations, sales, clients }) => {
    const raw = input || {};
    const operationId = String(raw.operationId || raw.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");

    if (raw.status && String(raw.status).trim() !== "posted") {
      throw makeError("DRAFT_NOT_ALLOWED", "생성 API는 posted만 허용합니다.");
    }

    const clientId = resolveClientId(clients, {
      clientId: raw.clientId,
      clientName: raw.clientName || raw.client,
    });
    const client = (clients || []).find((row) => String(row.id) === String(clientId));
    const canonical = canonicalizeCreatePayload(raw, clientId);
    const payloadHash = hashPayload(canonical);

    const existing = findByOperationId(receipts, operationId);
    if (existing) {
      assertIdempotentMatch(existing.payloadHash, payloadHash, operationId, existing.id);
      const existingAllocs = allocations.filter((row) => String(row.receiptId) === String(existing.id));
      return {
        shortCircuit: true,
        value: {
          ok: true,
          idempotent: true,
          receipt: existing,
          allocations: existingAllocs.filter((row) =>
            isAllocationEffectiveAsOf(row, new Map([[String(existing.id), existing]]), todaySeoul()),
          ),
          summary: summarizeReceipt(existing, existingAllocs),
        },
      };
    }

    const channel = normalizeChannel(canonical.channel);
    const source = normalizeSource(canonical.source);
    for (const draft of canonical.allocations) {
      if (draft.effectiveFrom < canonical.receiptDate) {
        throw makeError("EVENT_BEFORE_RECEIPT_DATE", "배분 효력일은 입금일보다 이전일 수 없습니다.");
      }
    }
    const allocationDrafts = normalizeAllocationsInput(
      canonical.allocations,
      sales,
      receipts,
      allocations,
      client,
      clients,
      { asOfDate: canonical.receiptDate, defaultEffectiveFrom: canonical.receiptDate },
    );
    const allocatedSum = allocationDrafts.reduce((sum, row) => sum + row.amount, 0);
    const grossAmount = canonical.grossAmount;
    if (grossAmount <= 0) throw makeError("GROSS_AMOUNT_REQUIRED", "입금액(grossAmount)이 필요합니다.");
    if (allocatedSum > grossAmount) {
      throw makeError("ALLOCATION_EXCEEDS_RECEIPT", "배분 합계가 입금전표 금액을 초과할 수 없습니다.");
    }
    assertBankTxUnique(receipts, canonical.bankTransactionId);

    const receiptId = makeId("rcp");
    const createdAt = nowIso();
    const receipt = {
      id: receiptId,
      receiptNo: nextReceiptNo(receipts),
      clientId,
      clientName: String(client?.name || ""),
      receiptDate: canonical.receiptDate,
      grossAmount,
      currency: "KRW",
      channel,
      source,
      status: "posted",
      bankTransactionId: canonical.bankTransactionId,
      sentStatementId: canonical.sentStatementId,
      operationId,
      idempotencyKey: operationId,
      payloadHash,
      payloadSnapshot: canonical,
      memo: String(raw.memo || "").trim(),
      createdAt,
      createdBy: actor,
      postedAt: createdAt,
      postedBy: actor,
      reversalOfReceiptId: null,
      reversedEffectiveDate: null,
      reallocationEvents: [],
      version: 1,
    };

    const nextAllocations = allocationDrafts.map((draft) => ({
      id: makeId("ral"),
      receiptId,
      saleId: draft.saleId,
      amount: draft.amount,
      status: "posted",
      effectiveFrom: draft.effectiveFrom,
      reversedEffectiveDate: null,
      createdAt,
      createdBy: actor,
      reversalOfAllocationId: null,
      site: draft.site,
    }));

    const summary = summarizeReceiptAsOf(receipt, nextAllocations, todaySeoul());
    assertCashIdentity(receipt.grossAmount, summary.allocatedAmount, summary.unallocatedAmount);

    return {
      receipts: [receipt, ...receipts],
      allocations: [...nextAllocations, ...allocations],
      value: {
        ok: true,
        idempotent: false,
        receipt,
        allocations: nextAllocations,
        summary,
      },
    };
  })(normalizePlanContext(context));
}

export function createAndPostReceipt(input, actor = "system") {
  return saveReceiptsDomainAtomic(
    (context) => planCreateAndPostReceipt(context, input, actor),
    actor,
  );
}

export function getReceiptById(receiptId) {
  const state = getErpState(["receipts", "sales", "clients"]);
  const receipts = listReceipts(state.data);
  const allocations = listReceiptAllocations(state.data);
  const receipt = receipts.find((row) => String(row.id) === String(receiptId));
  if (!receipt) throw makeError("RECEIPT_NOT_FOUND", "입금전표를 찾을 수 없습니다.", 404);
  const rows = allocations.filter((row) => String(row.receiptId) === String(receipt.id));
  return {
    receipt,
    allocations: rows,
    summary: summarizeReceipt(receipt, rows),
    version: state.version,
  };
}

/**
 * Append-only reallocation with effectiveDate.
 * Previous currently-open allocations get reversedEffectiveDate = effectiveDate.
 * New rows get effectiveFrom = effectiveDate. History is never deleted.
 */
export function replaceReceiptAllocations(receiptId, input, actor = "system") {
  return saveReceiptsDomainAtomic(({ receipts, allocations, sales, clients }) => {
    const raw = input || {};
    const operationId = String(raw.operationId || raw.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "재배분에 operationId가 필요합니다.");

    const receipt = receipts.find((row) => String(row.id) === String(receiptId));
    if (!receipt) throw makeError("RECEIPT_NOT_FOUND", "입금전표를 찾을 수 없습니다.", 404);
    if (receipt.reversalOfReceiptId) {
      throw makeError("RECEIPT_NOT_POSTED", "취소전표는 재배분할 수 없습니다.");
    }
    if (receipt.reversedEffectiveDate || receipt.status === "reversed") {
      throw makeError("RECEIPT_ALREADY_REVERSED", "이미 취소된 입금전표는 재배분할 수 없습니다.", 409);
    }

    const effectiveDate = normalizeSeoulDate(raw.effectiveDate || todaySeoul(), "effectiveDate");
    const canonical = canonicalizeReallocatePayload(receipt.id, raw.allocations, effectiveDate);
    const payloadHash = hashPayload(canonical);
    const priorEvent = findReallocationEvent(receipts, operationId);
    if (priorEvent) {
      assertIdempotentMatch(priorEvent.event.payloadHash, payloadHash, operationId, receipt.id);
      const currentRows = allocations.filter((row) => String(row.receiptId) === String(receipt.id));
      return {
        shortCircuit: true,
        value: {
          ok: true,
          idempotent: true,
          receipt: priorEvent.receipt,
          allocations: currentRows.filter((row) =>
            isAllocationEffectiveAsOf(row, new Map([[String(receipt.id), priorEvent.receipt]]), todaySeoul()),
          ),
          summary: summarizeReceipt(priorEvent.receipt, currentRows),
          reallocationEvent: priorEvent.event,
        },
      };
    }

    assertNotBeforeReceiptDate(receipt, effectiveDate, "재배분 효력일");
    assertNoLaterAccountingEvent(receipt, effectiveDate, allocations);

    const client = (clients || []).find((row) => String(row.id) === String(receipt.clientId));
    if (!client) throw makeError("CLIENT_NOT_FOUND", "거래처 ID를 찾을 수 없습니다.", 404);

    const drafts = normalizeAllocationsInput(canonical.allocations, sales, receipts, allocations, client, clients, {
      excludeReceiptId: receipt.id,
      asOfDate: effectiveDate,
      defaultEffectiveFrom: effectiveDate,
    });
    const allocatedSum = drafts.reduce((sum, row) => sum + row.amount, 0);
    if (allocatedSum > money(receipt.grossAmount)) {
      throw makeError("ALLOCATION_EXCEEDS_RECEIPT", "배분 합계가 입금전표 금액을 초과할 수 없습니다.");
    }

    const createdAt = nowIso();
    const receiptById = new Map([[String(receipt.id), receipt]]);
    const previousOpen = allocations.filter(
      (row) =>
        String(row.receiptId) === String(receipt.id) && isAllocationEffectiveAsOf(row, receiptById, effectiveDate),
    );
    // Also close any open rows whose effectiveFrom <= effectiveDate and not yet closed
    const previousAllocatedSum = previousOpen.reduce((sum, row) => sum + money(row.amount), 0);
    const reversedIds = previousOpen.map((row) => row.id);
    const nextRows = drafts.map((draft) => ({
      id: makeId("ral"),
      receiptId: receipt.id,
      saleId: draft.saleId,
      amount: draft.amount,
      status: "posted",
      effectiveFrom: effectiveDate,
      reversedEffectiveDate: null,
      createdAt,
      createdBy: actor,
      reversalOfAllocationId: null,
      site: draft.site,
      reallocationOperationId: operationId,
    }));

    const event = {
      operationId,
      payloadHash,
      payloadSnapshot: canonical,
      effectiveDate,
      at: createdAt,
      by: actor,
      reversedAllocationIds: reversedIds,
      newAllocationIds: nextRows.map((row) => row.id),
      previousAllocatedSum,
      newAllocatedSum: allocatedSum,
    };

    const nextReceipt = {
      ...receipt,
      version: (Number(receipt.version) || 1) + 1,
      reallocationEvents: [...(Array.isArray(receipt.reallocationEvents) ? receipt.reallocationEvents : []), event],
      lastReallocationAt: createdAt,
      lastReallocationBy: actor,
      lastReallocationOperationId: operationId,
      lastReallocationEffectiveDate: effectiveDate,
    };

    const closedIdSet = new Set(reversedIds.map(String));
    const nextAllocations = allocations.map((row) => {
      if (!closedIdSet.has(String(row.id))) return row;
      return {
        ...row,
        status: "reversed",
        reversedEffectiveDate: effectiveDate,
        effectiveTo: effectiveDate,
        reversedAt: createdAt,
        reversedBy: actor,
        reversedByOperationId: operationId,
      };
    });

    const summary = summarizeReceiptAsOf(nextReceipt, [...nextRows, ...nextAllocations], todaySeoul());
    assertCashIdentity(nextReceipt.grossAmount, summary.allocatedAmount, summary.unallocatedAmount);

    return {
      receipts: receipts.map((row) => (String(row.id) === String(receipt.id) ? nextReceipt : row)),
      allocations: [...nextRows, ...nextAllocations],
      value: {
        ok: true,
        idempotent: false,
        receipt: nextReceipt,
        allocations: nextRows,
        summary,
        reallocationEvent: event,
      },
    };
  }, actor);
}

/**
 * Reverse with as-of integrity:
 * - Set reversedEffectiveDate on original receipt/open allocations (= reversal receiptDate)
 * - Keep historical effectiveness for asOf < reversedEffectiveDate
 * - Append reversal cash document (negative gross) on reversal date
 * - Reversal allocation rows are audit-only
 */
export function planReverseReceipt(context, receiptId, input = {}, actor = "system") {
  return (({ receipts, allocations }) => {
    const original = receipts.find((row) => String(row.id) === String(receiptId));
    if (!original) throw makeError("RECEIPT_NOT_FOUND", "입금전표를 찾을 수 없습니다.", 404);
    if (original.reversalOfReceiptId) {
      throw makeError("RECEIPT_NOT_POSTED", "취소전표는 다시 취소할 수 없습니다.");
    }

    const operationId = String(input.operationId || input.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "취소에 operationId가 필요합니다.");

    const reversalEffectiveDate = normalizeSeoulDate(
      input.receiptDate || input.reversalEffectiveDate || input.effectiveDate || todaySeoul(),
      "reversalEffectiveDate",
    );
    const canonical = canonicalizeReversePayload(original.id, reversalEffectiveDate);
    const payloadHash = hashPayload(canonical);
    const existing = findByOperationId(receipts, operationId);
    if (existing) {
      assertIdempotentMatch(existing.payloadHash, payloadHash, operationId, existing.id);
      const existingAllocs = allocations.filter((row) => String(row.receiptId) === String(existing.id));
      const originalNow = receipts.find((row) => String(row.id) === String(original.id)) || original;
      return {
        shortCircuit: true,
        value: {
          ok: true,
          idempotent: true,
          receipt: existing,
          allocations: existingAllocs,
          original: originalNow,
          summary: summarizeReceipt(existing, existingAllocs),
        },
      };
    }

    if (original.reversedEffectiveDate || original.status === "reversed") {
      throw makeError("RECEIPT_ALREADY_REVERSED", "이미 취소된 입금전표입니다.", 409);
    }
    if (original.status !== "posted") {
      throw makeError("RECEIPT_NOT_POSTED", "posted 입금전표만 취소할 수 있습니다.");
    }

    assertNotBeforeReceiptDate(original, reversalEffectiveDate, "취소 효력일");
    assertNoLaterAccountingEvent(original, reversalEffectiveDate, allocations);

    const createdAt = nowIso();
    const reversalId = makeId("rcp");
    const reversal = {
      id: reversalId,
      receiptNo: nextReceiptNo(receipts),
      clientId: original.clientId,
      clientName: original.clientName,
      receiptDate: reversalEffectiveDate,
      grossAmount: -money(original.grossAmount),
      currency: "KRW",
      channel: original.channel,
      source: original.source,
      status: "posted",
      bankTransactionId: null,
      sentStatementId: null,
      operationId,
      idempotencyKey: operationId,
      payloadHash,
      payloadSnapshot: canonical,
      memo: String(input.memo || `취소: ${original.receiptNo}`).trim(),
      createdAt,
      createdBy: actor,
      postedAt: createdAt,
      postedBy: actor,
      reversalOfReceiptId: original.id,
      reversalEffectiveDate,
      reversedEffectiveDate: null,
      reallocationEvents: [],
      version: 1,
    };

    const receiptById = new Map([[String(original.id), original]]);
    const originalOpenAllocs = allocations.filter(
      (row) =>
        String(row.receiptId) === String(original.id) &&
        isAllocationEffectiveAsOf(row, receiptById, reversalEffectiveDate),
    );
    const reversalAllocs = originalOpenAllocs.map((row) => ({
      id: makeId("ral"),
      receiptId: reversalId,
      saleId: row.saleId,
      amount: money(row.amount),
      status: "reversed",
      effectiveFrom: reversalEffectiveDate,
      reversedEffectiveDate: reversalEffectiveDate,
      createdAt,
      createdBy: actor,
      reversalOfAllocationId: row.id,
      auditOnly: true,
    }));

    const closedIds = new Set(originalOpenAllocs.map((row) => String(row.id)));
    const nextAllocations = allocations.map((row) => {
      if (!closedIds.has(String(row.id))) return row;
      return {
        ...row,
        status: "reversed",
        reversedEffectiveDate: reversalEffectiveDate,
        effectiveTo: reversalEffectiveDate,
        reversedAt: createdAt,
        reversedBy: actor,
        reversedByOperationId: operationId,
      };
    });

    const nextReceipts = receipts.map((row) =>
      String(row.id) === String(original.id)
        ? {
            ...row,
            status: "reversed",
            reversedEffectiveDate: reversalEffectiveDate,
            reversedAt: createdAt,
            reversedBy: actor,
            reversedByOperationId: operationId,
            version: (Number(row.version) || 1) + 1,
          }
        : row,
    );

    return {
      receipts: [reversal, ...nextReceipts],
      allocations: [...reversalAllocs, ...nextAllocations],
      value: {
        ok: true,
        idempotent: false,
        receipt: reversal,
        allocations: reversalAllocs,
        original: {
          ...original,
          status: "reversed",
          reversedEffectiveDate: reversalEffectiveDate,
          reversedAt: createdAt,
          reversedBy: actor,
        },
        summary: summarizeReceipt(reversal, reversalAllocs),
      },
    };
  })(normalizePlanContext(context));
}

export function reverseReceipt(receiptId, input = {}, actor = "system") {
  return saveReceiptsDomainAtomic(
    (context) => planReverseReceipt(context, receiptId, input, actor),
    actor,
  );
}

export function deleteReceiptForbidden() {
  throw makeError(
    "RECEIPT_DELETE_FORBIDDEN",
    "posted 입금전표는 직접 삭제할 수 없습니다. 취소전표를 사용하세요.",
    405,
  );
}

export function proposeFifoAllocations(
  sales,
  clientOrId,
  grossAmount,
  existingAllocations = [],
  receipts = [],
  clients = [],
  asOfDate = null,
) {
  const amountLeftStart = money(grossAmount);
  let remaining = amountLeftStart;
  const asOf = asOfDate || todaySeoul();
  const client =
    clientOrId && typeof clientOrId === "object"
      ? clientOrId
      : (() => {
          const key = String(clientOrId || "").trim();
          return (
            (clients || []).find((row) => String(row.id) === key) ||
            ((clients || []).filter((row) => String(row.name || "").trim() === key).length === 1
              ? (clients || []).find((row) => String(row.name || "").trim() === key)
              : { id: key, name: key })
          );
        })();

  const scoped = (sales || [])
    .filter((sale) => saleBelongsToClient(sale, client, clients))
    .sort(
      (a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.id).localeCompare(String(b.id)),
    );

  const proposals = [];
  for (const sale of scoped) {
    if (remaining <= 0) break;
    const billed = money(sale.amount);
    const allocated = saleAllocatedAsOf(existingAllocations, receipts, sale.id, asOf);
    const unpaid = Math.max(billed - allocated, 0);
    if (unpaid <= 0) continue;
    const apply = Math.min(unpaid, remaining);
    proposals.push({ saleId: sale.id, amount: apply });
    remaining -= apply;
  }
  return {
    allocations: proposals,
    unallocatedAmount: Math.max(remaining, 0),
    grossAmount: amountLeftStart,
  };
}

export { money as receiptMoney, makeError as receiptError };


/**
 * Official non-bank collection entry: sent-statement-scoped FIFO by default.
 */
export function registerCanonicalReceipt(input, actor = "system") {
  const raw = input || {};
  const state = getErpState(["sales", "receipts", "clients"]);
  const data = state.data || {};
  const clients = data.clients || [];
  const sales = data.sales || [];
  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const clientKey = raw.clientId || raw.clientName;
  const client =
    clients.find((row) => String(row.id) === String(clientKey)) ||
    clients.find((row) => String(row.name || "").trim() === String(raw.clientName || clientKey || "").trim()) ||
    null;
  if (!client) {
    throw makeError("CLIENT_NOT_FOUND", "거래처를 찾을 수 없습니다.", 404, { clientKey });
  }

  let allocationsInput = Array.isArray(raw.allocations) ? raw.allocations : null;
  let scopeMeta = null;
  if ((!allocationsInput || !allocationsInput.length) && raw.autoAllocate !== false) {
    const scope = loadSentStatementSaleIdsForClient(client, { requireSent: raw.requireSentStatements !== false });
    scopeMeta = { saleIds: scope.saleIds, documentCount: scope.documents.length };
    const fifo = proposeFifoAllocationsScoped(proposeFifoAllocations, {
      sales,
      client,
      grossAmount: raw.grossAmount,
      allocations,
      receipts,
      clients,
      asOfDate: raw.receiptDate || null,
      saleIdAllowlist: scope.saleIdSet,
      requireAllowlist: raw.requireSentStatements !== false,
    });
    allocationsInput = fifo.allocations;
  }

  const result = createAndPostReceipt(
    { ...raw, clientId: client.id, clientName: client.name, allocations: allocationsInput || [] },
    actor,
  );
  return { ...result, scope: scopeMeta };
}

export function applyPrepaidForStatementSales({ statementSalesIds, actor = "system", effectiveDate = null }) {
  const targetSaleIds = (statementSalesIds || []).map((id) => String(id));
  if (!targetSaleIds.length) return { ok: true, appliedTotal: 0, results: [] };
  const state = getErpState(["sales", "receipts", "clients"]);
  const data = state.data || {};
  const plan = planPrepaidAutoApply({
    receipts: listReceipts(data),
    allocations: listReceiptAllocations(data),
    sales: data.sales || [],
    targetSaleIds,
    asOfDate: effectiveDate || todaySeoul(),
    saleAllocatedAsOf,
    summarizeReceipt,
  });
  const results = [];
  const day = effectiveDate || todaySeoul();
  for (const patch of plan.patches) {
    const operationId =
      "prepaid-auto:" + patch.receiptId + ":" + targetSaleIds.slice().sort().join(",") + ":" + day;
    try {
      const out = replaceReceiptAllocations(
        patch.receiptId,
        {
          operationId,
          effectiveDate: day,
          allocations: patch.allocations,
          memo: "auto-apply prepaid after statement send",
        },
        actor,
      );
      results.push({
        receiptId: patch.receiptId,
        ok: true,
        idempotent: Boolean(out.idempotent),
        appliedFromPrepaid: patch.appliedFromPrepaid,
      });
    } catch (error) {
      results.push({
        receiptId: patch.receiptId,
        ok: false,
        code: error.code || "APPLY_FAILED",
        message: error.message,
      });
    }
  }
  return { ok: true, appliedTotal: plan.appliedTotal, results };
}
