import crypto from "crypto";
import { getErpState, saveErpState } from "./db.mjs";

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

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function todaySeoul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
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

/** Effective (AR-affecting) allocations only. */
export function isEffectivePostedAllocation(allocation, receiptById = null) {
  if (!allocation || allocation.status !== "posted") return false;
  if (money(allocation.amount) <= 0) return false;
  if (receiptById) {
    const receipt = receiptById.get(String(allocation.receiptId));
    if (!receipt) return false;
    if (receipt.status !== "posted") return false;
    if (receipt.reversalOfReceiptId) return false;
  }
  return true;
}

export function summarizeReceipt(receipt, allocations = []) {
  const receiptById = new Map([[String(receipt.id), receipt]]);
  const rows = (allocations || []).filter(
    (row) => String(row.receiptId) === String(receipt.id) && isEffectivePostedAllocation(row, receiptById),
  );
  const allocatedAmount = rows.reduce((sum, row) => sum + money(row.amount), 0);
  const grossAmount = money(receipt.grossAmount);
  const unallocatedAmount =
    receipt.reversalOfReceiptId || grossAmount < 0
      ? 0
      : Math.max(grossAmount - allocatedAmount, 0);
  return {
    allocatedAmount,
    unallocatedAmount,
    allocationCount: rows.length,
  };
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
  const allocations = (Array.isArray(input?.allocations) ? input.allocations : [])
    .map((row) => ({
      saleId: String(row?.saleId ?? row?.salesId ?? ""),
      amount: money(row?.amount),
    }))
    .filter((row) => row.saleId && row.amount > 0)
    .sort((a, b) => a.saleId.localeCompare(b.saleId) || a.amount - b.amount);

  let grossAmount = money(input?.grossAmount);
  if (!grossAmount && allocations.length) {
    grossAmount = allocations.reduce((sum, row) => sum + row.amount, 0);
  }

  return {
    action: "create",
    clientId: String(clientId),
    receiptDate: String(input?.receiptDate || todaySeoul()).slice(0, 10),
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

export function canonicalizeReversePayload(receiptId) {
  return { action: "reverse", receiptId: String(receiptId) };
}

export function canonicalizeReallocatePayload(receiptId, allocationsInput) {
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

/**
 * Sale belongs to client by authoritative clientId when present.
 * Legacy name mapping only when sale has no clientId and the name uniquely maps.
 */
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

function effectiveAllocations(allocations, receipts) {
  const receiptById = new Map((receipts || []).map((row) => [String(row.id), row]));
  return (allocations || []).filter((row) => isEffectivePostedAllocation(row, receiptById));
}

function saleAllocatedPosted(allocations, receipts, saleId, excludeReceiptId = null) {
  return effectiveAllocations(allocations, receipts)
    .filter((row) => {
      if (String(row.saleId) !== String(saleId)) return false;
      if (excludeReceiptId != null && String(row.receiptId) === String(excludeReceiptId)) return false;
      return true;
    })
    .reduce((sum, row) => sum + money(row.amount), 0);
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

function normalizeAllocationsInput(rawAllocations, sales, receipts, allocations, client, clients, excludeReceiptId = null) {
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
    const billed = money(sale.amount);
    const already = saleAllocatedPosted(allocations, receipts, saleId, excludeReceiptId);
    const remaining = Math.max(billed - already, 0);
    if (amount > remaining) {
      throw makeError(
        "ALLOCATION_EXCEEDS_SALE",
        `매출 ${saleId} 미수잔액(${remaining})을 초과하는 배분입니다.`,
        400,
        { saleId, remaining, amount },
      );
    }
    normalized.push({
      saleId: sale.id,
      amount,
      site: String(sale.site || sale.memo || ""),
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
    if (row.status !== "posted") return false;
    if (row.reversalOfReceiptId) return false;
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

function assertIdempotentMatch(existing, payloadHash, operationId) {
  if (String(existing.payloadHash || "") === String(payloadHash)) return;
  throw makeError(
    "IDEMPOTENCY_CONFLICT",
    "동일 operationId에 다른 입금 payload가 요청되었습니다.",
    409,
    { operationId, existingReceiptId: existing.id },
  );
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

export function createAndPostReceipt(input, actor = "system") {
  return saveReceiptsDomainAtomic(({ receipts, allocations, sales, clients }) => {
    const raw = input || {};
    const operationId = String(raw.operationId || raw.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");

    if (raw.status && String(raw.status).trim() !== "posted") {
      throw makeError("DRAFT_NOT_ALLOWED", "Phase 1 생성 API는 posted만 허용합니다.");
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
      assertIdempotentMatch(existing, payloadHash, operationId);
      const existingAllocs = allocations.filter((row) => String(row.receiptId) === String(existing.id));
      return {
        shortCircuit: true,
        value: {
          ok: true,
          idempotent: true,
          receipt: existing,
          allocations: existingAllocs.filter((row) => row.status === "posted"),
          summary: summarizeReceipt(existing, existingAllocs),
        },
      };
    }

    const channel = normalizeChannel(canonical.channel);
    const source = normalizeSource(canonical.source);
    const allocationDrafts = normalizeAllocationsInput(
      canonical.allocations,
      sales,
      receipts,
      allocations,
      client,
      clients,
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
      reallocationEvents: [],
      version: 1,
    };

    const nextAllocations = allocationDrafts.map((draft) => ({
      id: makeId("ral"),
      receiptId,
      saleId: draft.saleId,
      amount: draft.amount,
      status: "posted",
      createdAt,
      createdBy: actor,
      reversalOfAllocationId: null,
      site: draft.site,
    }));

    const summary = summarizeReceipt(receipt, nextAllocations);
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
  }, actor);
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
 * Append-only reallocation:
 * mark previous posted allocations reversed, append new posted rows.
 * Never physically deletes allocation history.
 */
export function replaceReceiptAllocations(receiptId, input, actor = "system") {
  return saveReceiptsDomainAtomic(({ receipts, allocations, sales, clients }) => {
    const raw = input || {};
    const operationId = String(raw.operationId || raw.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "재배분에 operationId가 필요합니다.");

    const receipt = receipts.find((row) => String(row.id) === String(receiptId));
    if (!receipt) throw makeError("RECEIPT_NOT_FOUND", "입금전표를 찾을 수 없습니다.", 404);
    if (receipt.status !== "posted" || receipt.reversalOfReceiptId) {
      throw makeError("RECEIPT_NOT_POSTED", "posted 입금전표만 배분을 변경할 수 있습니다.");
    }

    const canonical = canonicalizeReallocatePayload(receipt.id, raw.allocations);
    const payloadHash = hashPayload(canonical);
    const priorEvent = findReallocationEvent(receipts, operationId);
    if (priorEvent) {
      if (String(priorEvent.event.payloadHash || "") !== payloadHash) {
        throw makeError(
          "IDEMPOTENCY_CONFLICT",
          "동일 operationId에 다른 재배분 payload가 요청되었습니다.",
          409,
          { operationId },
        );
      }
      const currentRows = allocations.filter((row) => String(row.receiptId) === String(receipt.id));
      return {
        shortCircuit: true,
        value: {
          ok: true,
          idempotent: true,
          receipt: priorEvent.receipt,
          allocations: currentRows.filter((row) => row.status === "posted"),
          summary: summarizeReceipt(priorEvent.receipt, currentRows),
          reallocationEvent: priorEvent.event,
        },
      };
    }

    const client = (clients || []).find((row) => String(row.id) === String(receipt.clientId));
    if (!client) throw makeError("CLIENT_NOT_FOUND", "거래처 ID를 찾을 수 없습니다.", 404);

    const drafts = normalizeAllocationsInput(
      canonical.allocations,
      sales,
      receipts,
      allocations,
      client,
      clients,
      receipt.id,
    );
    const allocatedSum = drafts.reduce((sum, row) => sum + row.amount, 0);
    if (allocatedSum > money(receipt.grossAmount)) {
      throw makeError("ALLOCATION_EXCEEDS_RECEIPT", "배분 합계가 입금전표 금액을 초과할 수 없습니다.");
    }

    const createdAt = nowIso();
    const previousPosted = allocations.filter(
      (row) => String(row.receiptId) === String(receipt.id) && row.status === "posted",
    );
    const previousAllocatedSum = previousPosted.reduce((sum, row) => sum + money(row.amount), 0);
    const reversedIds = previousPosted.map((row) => row.id);
    const nextRows = drafts.map((draft) => ({
      id: makeId("ral"),
      receiptId: receipt.id,
      saleId: draft.saleId,
      amount: draft.amount,
      status: "posted",
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
    };

    const nextAllocations = allocations.map((row) =>
      String(row.receiptId) === String(receipt.id) && row.status === "posted"
        ? {
            ...row,
            status: "reversed",
            reversedAt: createdAt,
            reversedBy: actor,
            reversedByOperationId: operationId,
          }
        : row,
    );

    const summary = summarizeReceipt(nextReceipt, [...nextRows, ...nextAllocations]);
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
 * Reversal policy (append-only, single model):
 * - Mark original receipt + its posted allocations as reversed (excluded from effective AR).
 * - Append reversal receipt (grossAmount negative) for cash-period display / audit.
 * - Reversal allocations are status=reversed (audit only) — NOT posted — so AR restores exactly once.
 */
export function reverseReceipt(receiptId, input = {}, actor = "system") {
  return saveReceiptsDomainAtomic(({ receipts, allocations }) => {
    const original = receipts.find((row) => String(row.id) === String(receiptId));
    if (!original) throw makeError("RECEIPT_NOT_FOUND", "입금전표를 찾을 수 없습니다.", 404);
    if (original.reversalOfReceiptId) {
      throw makeError("RECEIPT_NOT_POSTED", "취소전표는 다시 취소할 수 없습니다.");
    }

    const operationId = String(input.operationId || input.idempotencyKey || "").trim();
    if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "취소에 operationId가 필요합니다.");

    const canonical = canonicalizeReversePayload(original.id);
    const payloadHash = hashPayload(canonical);
    const existing = findByOperationId(receipts, operationId);
    if (existing) {
      assertIdempotentMatch(existing, payloadHash, operationId);
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

    if (original.status === "reversed") {
      throw makeError("RECEIPT_ALREADY_REVERSED", "이미 취소된 입금전표입니다.", 409);
    }
    if (original.status !== "posted") {
      throw makeError("RECEIPT_NOT_POSTED", "posted 입금전표만 취소할 수 있습니다.");
    }

    const createdAt = nowIso();
    const reversalId = makeId("rcp");
    const reversal = {
      id: reversalId,
      receiptNo: nextReceiptNo(receipts),
      clientId: original.clientId,
      clientName: original.clientName,
      receiptDate: String(input.receiptDate || todaySeoul()).slice(0, 10),
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
      reallocationEvents: [],
      version: 1,
    };

    const originalAllocs = allocations.filter(
      (row) => String(row.receiptId) === String(original.id) && row.status === "posted",
    );
    // Audit-only reversal allocation rows (status=reversed) — excluded from effective AR.
    const reversalAllocs = originalAllocs.map((row) => ({
      id: makeId("ral"),
      receiptId: reversalId,
      saleId: row.saleId,
      amount: money(row.amount),
      status: "reversed",
      createdAt,
      createdBy: actor,
      reversalOfAllocationId: row.id,
      auditOnly: true,
    }));

    const nextAllocations = allocations.map((row) =>
      String(row.receiptId) === String(original.id) && row.status === "posted"
        ? {
            ...row,
            status: "reversed",
            reversedAt: createdAt,
            reversedBy: actor,
            reversedByOperationId: operationId,
          }
        : row,
    );

    const nextReceipts = receipts.map((row) =>
      String(row.id) === String(original.id)
        ? {
            ...row,
            status: "reversed",
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
          reversedAt: createdAt,
          reversedBy: actor,
        },
        summary: summarizeReceipt(reversal, reversalAllocs),
      },
    };
  }, actor);
}

export function deleteReceiptForbidden() {
  throw makeError(
    "RECEIPT_DELETE_FORBIDDEN",
    "posted 입금전표는 직접 삭제할 수 없습니다. 취소전표를 사용하세요.",
    405,
  );
}

export function proposeFifoAllocations(sales, clientOrId, grossAmount, existingAllocations = [], receipts = [], clients = []) {
  const amountLeftStart = money(grossAmount);
  let remaining = amountLeftStart;
  const key = String(clientOrId || "").trim();
  const client =
    (clients || []).find((row) => String(row.id) === key) ||
    ((clients || []).filter((row) => String(row.name || "").trim() === key).length === 1
      ? (clients || []).find((row) => String(row.name || "").trim() === key)
      : { id: key, name: key });

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
    const allocated = saleAllocatedPosted(existingAllocations, receipts, sale.id);
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
