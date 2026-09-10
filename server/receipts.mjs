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
const RECEIPT_STATUSES = new Set(["draft", "posted", "reversed"]);
const ALLOCATION_STATUSES = new Set(["posted", "reversed"]);

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

export function summarizeReceipt(receipt, allocations = []) {
  const rows = allocations.filter(
    (row) => String(row.receiptId) === String(receipt.id) && row.status === "posted",
  );
  const allocatedAmount = rows.reduce((sum, row) => sum + money(row.amount), 0);
  const grossAmount = money(receipt.grossAmount);
  return {
    allocatedAmount,
    unallocatedAmount: Math.max(grossAmount - allocatedAmount, 0),
    allocationCount: rows.length,
  };
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
      { candidates: matches.map((row) => ({ id: row.id, name: row.name })) },
    );
  }
  return String(matches[0].id);
}

function findSale(sales, saleId) {
  return (sales || []).find((row) => String(row.id) === String(saleId));
}

function postedAllocationsForSale(allocations, saleId, excludeReceiptId = null) {
  return (allocations || []).filter((row) => {
    if (row.status !== "posted") return false;
    if (String(row.saleId) !== String(saleId)) return false;
    if (excludeReceiptId != null && String(row.receiptId) === String(excludeReceiptId)) return false;
    return true;
  });
}

function saleBilledAmount(sale) {
  return money(sale?.amount);
}

function saleAllocatedPosted(allocations, saleId, excludeReceiptId = null) {
  return postedAllocationsForSale(allocations, saleId, excludeReceiptId).reduce(
    (sum, row) => sum + money(row.amount),
    0,
  );
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

function normalizeAllocationsInput(rawAllocations, sales, existingAllocations, excludeReceiptId = null) {
  const allocations = Array.isArray(rawAllocations) ? rawAllocations : [];
  const normalized = [];
  for (const raw of allocations) {
    const saleId = raw?.saleId ?? raw?.salesId;
    if (saleId == null || saleId === "") {
      throw makeError("ALLOCATION_SALE_REQUIRED", "배분에 saleId가 필요합니다.");
    }
    const sale = findSale(sales, saleId);
    if (!sale) throw makeError("SALE_NOT_FOUND", `매출전표 ${saleId}를 찾을 수 없습니다.`, 404);
    const amount = money(raw.amount);
    if (amount <= 0) throw makeError("ALLOCATION_AMOUNT_INVALID", "배분액은 0보다 커야 합니다.");
    const billed = saleBilledAmount(sale);
    const already = saleAllocatedPosted(existingAllocations, saleId, excludeReceiptId);
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
      clientName: String(sale.client || ""),
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

function assertBankTxUnique(receipts, bankTransactionId, excludeReceiptId = null) {
  const bankId = bankTransactionId == null || bankTransactionId === "" ? null : String(bankTransactionId);
  if (!bankId) return;
  const conflict = (receipts || []).find((row) => {
    if (row.status !== "posted") return false;
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

function buildReceiptPayload(input, ctx) {
  const {
    clients,
    sales,
    receipts,
    allocations,
    actor,
  } = ctx;

  const operationId = String(input.operationId || input.idempotencyKey || "").trim();
  if (!operationId) throw makeError("OPERATION_ID_REQUIRED", "operationId가 필요합니다.");

  const existing = findByOperationId(receipts, operationId);
  if (existing) {
    const existingAllocs = allocations.filter((row) => String(row.receiptId) === String(existing.id));
    return { idempotent: true, receipt: existing, allocations: existingAllocs };
  }

  const channel = normalizeChannel(input.channel);
  const source = normalizeSource(input.source);
  const status = String(input.status || "posted").trim();
  if (!RECEIPT_STATUSES.has(status)) throw makeError("INVALID_STATUS", "status가 올바르지 않습니다.");
  if (status === "reversed") throw makeError("INVALID_STATUS", "생성 시 reversed는 허용되지 않습니다.");

  const clientId = resolveClientId(clients, {
    clientId: input.clientId,
    clientName: input.clientName || input.client,
  });
  const client = (clients || []).find((row) => String(row.id) === String(clientId));
  const clientName = String(client?.name || input.clientName || input.client || "");

  const allocationDrafts = normalizeAllocationsInput(input.allocations, sales, allocations);
  for (const draft of allocationDrafts) {
    if (String(draft.clientName || "").trim() && String(draft.clientName).trim() !== clientName) {
      throw makeError(
        "CLIENT_SALE_MISMATCH",
        `매출 ${draft.saleId}의 거래처가 입금전표 거래처와 다릅니다.`,
        400,
      );
    }
  }

  const allocatedSum = allocationDrafts.reduce((sum, row) => sum + row.amount, 0);
  let grossAmount = money(input.grossAmount);
  if (!grossAmount && allocatedSum > 0) grossAmount = allocatedSum;
  if (grossAmount <= 0) throw makeError("GROSS_AMOUNT_REQUIRED", "입금액(grossAmount)이 필요합니다.");
  if (allocatedSum > grossAmount) {
    throw makeError("ALLOCATION_EXCEEDS_RECEIPT", "배분 합계가 입금전표 금액을 초과할 수 없습니다.");
  }

  assertBankTxUnique(receipts, input.bankTransactionId);

  const receiptId = makeId("rcp");
  const createdAt = nowIso();
  const receipt = {
    id: receiptId,
    receiptNo: nextReceiptNo(receipts),
    clientId,
    clientName,
    receiptDate: String(input.receiptDate || todaySeoul()).slice(0, 10),
    grossAmount,
    currency: "KRW",
    channel,
    source,
    status,
    bankTransactionId:
      input.bankTransactionId == null || input.bankTransactionId === ""
        ? null
        : String(input.bankTransactionId),
    sentStatementId:
      input.sentStatementId == null || input.sentStatementId === ""
        ? null
        : String(input.sentStatementId),
    operationId,
    idempotencyKey: operationId,
    memo: String(input.memo || "").trim(),
    createdAt,
    createdBy: actor,
    postedAt: status === "posted" ? createdAt : null,
    postedBy: status === "posted" ? actor : null,
    reversalOfReceiptId: null,
    version: 1,
  };

  const nextAllocations = allocationDrafts.map((draft) => ({
    id: makeId("ral"),
    receiptId,
    saleId: draft.saleId,
    amount: draft.amount,
    status: status === "posted" ? "posted" : "posted",
    createdAt,
    createdBy: actor,
    reversalOfAllocationId: null,
    site: draft.site,
  }));

  if (status === "draft") {
    for (const row of nextAllocations) row.status = "posted";
  }

  return { idempotent: false, receipt, allocations: nextAllocations };
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
      // Use immediate full-state save (not coalesced domain queue) so concurrent
      // distinct receipts cannot overwrite each other inside a 200ms coalesce window.
      const saved = saveErpState(
        {
          ...data,
          receipts: result.receipts,
          receiptAllocations: result.allocations,
        },
        state.version,
        actor,
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
    const built = buildReceiptPayload(input || {}, { clients, sales, receipts, allocations, actor });
    if (built.idempotent) {
      return {
        shortCircuit: true,
        value: {
          ok: true,
          idempotent: true,
          receipt: built.receipt,
          allocations: built.allocations,
          summary: summarizeReceipt(built.receipt, built.allocations),
        },
      };
    }
    return {
      receipts: [built.receipt, ...receipts],
      allocations: [...built.allocations, ...allocations],
      value: {
        ok: true,
        idempotent: false,
        receipt: built.receipt,
        allocations: built.allocations,
        summary: summarizeReceipt(built.receipt, built.allocations),
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

export function replaceReceiptAllocations(receiptId, input, actor = "system") {
  return saveReceiptsDomainAtomic(({ receipts, allocations, sales }) => {
    const receipt = receipts.find((row) => String(row.id) === String(receiptId));
    if (!receipt) throw makeError("RECEIPT_NOT_FOUND", "입금전표를 찾을 수 없습니다.", 404);
    if (receipt.status !== "posted") {
      throw makeError("RECEIPT_NOT_POSTED", "posted 입금전표만 배분을 변경할 수 있습니다.");
    }
    const drafts = normalizeAllocationsInput(input?.allocations, sales, allocations, receipt.id);
    const allocatedSum = drafts.reduce((sum, row) => sum + row.amount, 0);
    if (allocatedSum > money(receipt.grossAmount)) {
      throw makeError("ALLOCATION_EXCEEDS_RECEIPT", "배분 합계가 입금전표 금액을 초과할 수 없습니다.");
    }
    const createdAt = nowIso();
    const kept = allocations.filter((row) => String(row.receiptId) !== String(receipt.id));
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
    }));
    const nextReceipt = { ...receipt, version: (Number(receipt.version) || 1) + 1 };
    return {
      receipts: receipts.map((row) => (String(row.id) === String(receipt.id) ? nextReceipt : row)),
      allocations: [...nextRows, ...kept],
      value: {
        ok: true,
        receipt: nextReceipt,
        allocations: nextRows,
        summary: summarizeReceipt(nextReceipt, nextRows),
      },
    };
  }, actor);
}

export function reverseReceipt(receiptId, input = {}, actor = "system") {
  return saveReceiptsDomainAtomic(({ receipts, allocations }) => {
    const original = receipts.find((row) => String(row.id) === String(receiptId));
    if (!original) throw makeError("RECEIPT_NOT_FOUND", "입금전표를 찾을 수 없습니다.", 404);
    if (original.status === "reversed") {
      throw makeError("RECEIPT_ALREADY_REVERSED", "이미 취소된 입금전표입니다.", 409);
    }
    if (original.status !== "posted") {
      throw makeError("RECEIPT_NOT_POSTED", "posted 입금전표만 취소할 수 있습니다.");
    }

    const operationId = String(input.operationId || input.idempotencyKey || "").trim() || `rev:${original.id}`;
    const existing = findByOperationId(receipts, operationId);
    if (existing) {
      const existingAllocs = allocations.filter((row) => String(row.receiptId) === String(existing.id));
      return {
        shortCircuit: true,
        value: {
          ok: true,
          idempotent: true,
          receipt: existing,
          allocations: existingAllocs,
          original,
          summary: summarizeReceipt(existing, existingAllocs),
        },
      };
    }

    const createdAt = nowIso();
    const reversalId = makeId("rcp");
    const reversal = {
      ...original,
      id: reversalId,
      receiptNo: nextReceiptNo(receipts),
      grossAmount: -money(original.grossAmount),
      status: "posted",
      operationId,
      idempotencyKey: operationId,
      memo: String(input.memo || `취소: ${original.receiptNo}`).trim(),
      createdAt,
      createdBy: actor,
      postedAt: createdAt,
      postedBy: actor,
      reversalOfReceiptId: original.id,
      bankTransactionId: null,
      version: 1,
      source: original.source,
      channel: original.channel,
    };

    const originalAllocs = allocations.filter(
      (row) => String(row.receiptId) === String(original.id) && row.status === "posted",
    );
    const reversalAllocs = originalAllocs.map((row) => ({
      id: makeId("ral"),
      receiptId: reversalId,
      saleId: row.saleId,
      amount: -money(row.amount),
      status: "posted",
      createdAt,
      createdBy: actor,
      reversalOfAllocationId: row.id,
    }));

    const nextAllocations = allocations.map((row) =>
      String(row.receiptId) === String(original.id) && row.status === "posted"
        ? { ...row, status: "reversed" }
        : row,
    );

    const nextReceipts = receipts.map((row) =>
      String(row.id) === String(original.id) ? { ...row, status: "reversed", version: (Number(row.version) || 1) + 1 } : row,
    );

    return {
      receipts: [reversal, ...nextReceipts],
      allocations: [...reversalAllocs, ...nextAllocations],
      value: {
        ok: true,
        idempotent: false,
        receipt: reversal,
        allocations: reversalAllocs,
        original: { ...original, status: "reversed" },
        summary: summarizeReceipt(reversal, reversalAllocs),
      },
    };
  }, actor);
}

export function deleteReceiptForbidden() {
  throw makeError("RECEIPT_DELETE_FORBIDDEN", "posted 입금전표는 직접 삭제할 수 없습니다. 취소전표를 사용하세요.", 405);
}

export function assertAllocationStatus(status) {
  if (!ALLOCATION_STATUSES.has(status)) {
    throw makeError("INVALID_ALLOCATION_STATUS", "allocation status가 올바르지 않습니다.");
  }
}

export function proposeFifoAllocations(sales, clientIdOrName, grossAmount, existingAllocations = []) {
  const amountLeftStart = money(grossAmount);
  let remaining = amountLeftStart;
  const name = String(clientIdOrName || "").trim();
  const scoped = (sales || [])
    .filter((sale) => {
      const clientMatch =
        String(sale.clientId || "") === name || String(sale.client || "").trim() === name;
      return clientMatch;
    })
    .sort(
      (a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.id).localeCompare(String(b.id)),
    );

  const proposals = [];
  for (const sale of scoped) {
    if (remaining <= 0) break;
    const billed = saleBilledAmount(sale);
    const allocated = saleAllocatedPosted(existingAllocations, sale.id);
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
