/**
 * Phase 2 unified AR — atomic bank deposit ↔ Receipt service.
 *
 * Bank deposits become Receipt + ReceiptAllocation rows. paymentVouchers /
 * paymentInputLogs / linkedPaymentVoucherId are never written here: a Receipt
 * link and a legacy voucher link are mutually exclusive by construction.
 *
 * Every mutation is one saveErpState({ allowReceiptMutation: true }) call so a
 * failure can never leave a bank row pointing at a missing receipt (or the other
 * way round). VERSION_CONFLICT retries the whole plan against fresh state.
 */

import crypto from "crypto";
import { getErpState, saveErpState } from "./db.mjs";
import {
  listReceiptAllocations,
  listReceipts,
  planCreateAndPostReceipt,
  planReverseReceipt,
  receiptError,
  receiptMoney,
  summarizeReceipt,
  todaySeoul,
} from "./receipts.mjs";
import { config } from "./config.mjs";
import {
  getBankDepositLinkKind,
  findBankTransactionOpenReceipt,
  isOpenDepositReceipt,
} from "../src/utils/bankDepositLink.ts";
import { resolveAutoLinkLinkedSubject } from "../src/utils/bankTransactions.ts";
import {
  DEFAULT_CLIENT_FOLDER_ID,
  isCardCompanyDeposit,
} from "../src/utils/bankTransactionFolders.ts";

const SAVE_RETRY_ATTEMPTS = 8;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function makeError(code, message, status = 400, extra = {}) {
  return receiptError(code, message, status, extra);
}

function listBankTransactions(data = {}) {
  return Array.isArray(data.bankTransactions) ? data.bankTransactions : [];
}

/**
 * Receipt date for a bank deposit = Seoul calendar day of the transaction.
 * Values that already carry an explicit offset are converted; naive values are
 * taken verbatim so they match the YMD used everywhere else in bank matching.
 */
export function resolveBankTxSeoulYmd(transactionAt) {
  const text = String(transactionAt || "").trim();
  if (!text) return todaySeoul();
  const head = text.slice(0, 10);
  const hasExplicitZone = /(Z|[+-]\d{2}:?\d{2})$/.test(text);
  if (!hasExplicitZone) {
    return YMD_RE.test(head) ? head : todaySeoul();
  }
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) {
    return YMD_RE.test(head) ? head : todaySeoul();
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(parsed);
}

/* ------------------------------------------------------------------ cutover */

/** Configured cutover instant, if the deploy pinned one via env. */
export function getConfiguredBankReceiptCutoverAt() {
  const raw = String(config.autoDeposit?.receiptCutoverAt || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

export function readBankReceiptCutoverAt(data = {}) {
  const stored = String(data?.bankSyncMeta?.bankReceiptCutoverAt || "").trim();
  if (stored) return stored;
  return getConfiguredBankReceiptCutoverAt();
}

/**
 * Stamp the Phase 2 cutover on first use so pre-existing deposits stay
 * diagnostics-only forever. Returns the patched bankSyncMeta (never mutates).
 */
export function ensureBankReceiptCutoverAt(data = {}, nowIso = new Date().toISOString()) {
  const existing = String(data?.bankSyncMeta?.bankReceiptCutoverAt || "").trim();
  if (existing) {
    return { bankSyncMeta: data.bankSyncMeta || {}, cutoverAt: existing, created: false };
  }
  const cutoverAt = getConfiguredBankReceiptCutoverAt() || String(nowIso);
  return {
    bankSyncMeta: { ...(data.bankSyncMeta || {}), bankReceiptCutoverAt: cutoverAt },
    cutoverAt,
    created: true,
  };
}

export function bankReceiptCutoverYmd(cutoverAt) {
  const raw = String(cutoverAt || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return raw.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(parsed);
}

/**
 * Auto-link may only post Receipts for deposits that arrived after cutover:
 * either the row was created after it, or this very sync just imported it.
 */
export function isBankTxReceiptAutoLinkEligible(tx, options = {}) {
  if (!tx) return false;
  const cutoverAt = String(options.cutoverAt || "").trim();
  if (!cutoverAt) return false;
  const addedIds = options.addedIds instanceof Set ? options.addedIds : new Set(options.addedIds || []);
  if (addedIds.has(String(tx.id))) return true;
  const createdAt = String(tx.createdAt || "").trim();
  if (!createdAt) return false;
  return createdAt >= cutoverAt;
}

/* -------------------------------------------------------------- validation */

function requireDepositBankTx(data, bankTransactionId) {
  const txId = String(bankTransactionId || "").trim();
  if (!txId) throw makeError("BANK_TX_REQUIRED", "통장거래 id가 필요합니다.");
  const tx = listBankTransactions(data).find((row) => String(row?.id) === txId);
  if (!tx) throw makeError("BANK_TX_NOT_FOUND", "통장거래를 찾을 수 없습니다.", 404);
  if (receiptMoney(tx.deposit) <= 0) {
    throw makeError("BANK_TX_NOT_DEPOSIT", "입금 거래만 입금전표로 전기할 수 있습니다.");
  }
  if (receiptMoney(tx.withdrawal) > 0) {
    throw makeError("BANK_TX_NOT_DEPOSIT", "출금이 포함된 거래는 입금전표로 전기할 수 없습니다.");
  }
  if (isCardCompanyDeposit(tx)) {
    throw makeError("BANK_TX_CARD_COMPANY", "카드사 입금은 매출채권 입금전표 대상이 아닙니다.");
  }
  return tx;
}

function normalizeAllocationInput(rawAllocations) {
  return (Array.isArray(rawAllocations) ? rawAllocations : [])
    .map((row) => ({
      saleId: String(row?.saleId ?? row?.salesId ?? "").trim(),
      amount: receiptMoney(row?.amount),
    }))
    .filter((row) => row.saleId && row.amount > 0);
}

function resolveBankReceiptClientId(clients, input) {
  const id = String(input?.clientId ?? "").trim();
  if (!id) throw makeError("CLIENT_REQUIRED", "거래처(clientId)가 필요합니다.");
  const client = (clients || []).find((row) => String(row.id) === id);
  if (!client) throw makeError("CLIENT_NOT_FOUND", "거래처 ID를 찾을 수 없습니다.", 404);
  return client;
}

function normalizeReceiptLinkSource(input) {
  const raw = String(input?.receiptLinkSource || input?.source || "bank_manual").trim();
  if (raw === "bank_auto") return "bank_auto";
  if (raw === "bank_manual") return "bank_manual";
  throw makeError("INVALID_SOURCE", "source는 bank_manual|bank_auto만 허용합니다.");
}

/* ------------------------------------------------------- bank field patches */

/**
 * Denormalized bank-side link fields. Deliberately omits linkedPaymentVoucherId:
 * a Receipt link must never masquerade as a legacy voucher link.
 */
export function buildBankReceiptLinkPatch(tx, options) {
  const { receipt, allocations = [], clientName, source, actor, linkedAt } = options;
  const at = linkedAt || new Date().toISOString();
  const autoLinked = source === "bank_auto";
  const singleAllocation = allocations.length === 1 ? allocations[0] : null;

  return {
    linkedReceiptId: String(receipt.id),
    receiptLinkSource: source,
    receiptLinkedAt: at,
    receiptLinkedBy: actor,
    ...(receipt.sentStatementId ? { linkedPdfArchiveId: String(receipt.sentStatementId) } : {}),
    linkedSubject: autoLinked
      ? resolveAutoLinkLinkedSubject(tx, clientName)
      : clientName || tx.linkedSubject,
    ...(singleAllocation ? { linkedSalesId: singleAllocation.saleId } : {}),
    matchConfirmedAt: at,
    matchConfirmedBy: actor,
    matchAutoLinked: autoLinked,
    folderId: tx.folderId || DEFAULT_CLIENT_FOLDER_ID,
  };
}

const RECEIPT_LINK_CLEAR_KEYS = [
  "linkedReceiptId",
  "receiptLinkSource",
  "receiptLinkedAt",
  "receiptLinkedBy",
  "matchAutoLinked",
  "matchConfirmedAt",
  "matchConfirmedBy",
  "linkedSalesId",
];

function clearBankReceiptLinkFields(tx, receipt) {
  const keys = [...RECEIPT_LINK_CLEAR_KEYS];
  if (receipt?.sentStatementId && String(tx.linkedPdfArchiveId || "") === String(receipt.sentStatementId)) {
    keys.push("linkedPdfArchiveId");
  }
  const next = { ...tx };
  let changed = false;
  for (const key of keys) {
    if (next[key] === undefined) continue;
    delete next[key];
    changed = true;
  }
  return { tx: next, changed };
}

/* ------------------------------------------------------------- public API */

export function makeBankReceiptOperationId(txId, source) {
  if (source === "bank_auto") return `bank-receipt:auto:${txId}`;
  return `bank-receipt:manual:${txId}:${crypto.randomUUID()}`;
}

export function makeBankReceiptReverseOperationId(txId, receiptId) {
  return `bank-receipt:reverse:${txId}:${receiptId}`;
}

function buildReceiptResult(receipt, allocations, extra = {}) {
  const rows = (allocations || []).filter((row) => String(row.receiptId) === String(receipt.id));
  return {
    ok: true,
    receipt,
    allocations: rows,
    summary: summarizeReceipt(receipt, rows),
    ...extra,
  };
}

/**
 * Post a Receipt for a bank deposit and link the bank row, atomically.
 *
 * grossAmount always equals tx.deposit — a client-supplied gross is ignored so a
 * stale UI can never post a cash amount the bank never received.
 */
export function createBankTransactionReceipt(bankTransactionId, input = {}, actor = "system") {
  const source = normalizeReceiptLinkSource(input);

  for (let attempt = 0; attempt < SAVE_RETRY_ATTEMPTS; attempt += 1) {
    const state = getErpState();
    const data = state.data || {};
    const receipts = listReceipts(data);
    const allocations = listReceiptAllocations(data);
    const tx = requireDepositBankTx(data, bankTransactionId);

    const operationId =
      String(input.operationId || input.idempotencyKey || "").trim() ||
      makeBankReceiptOperationId(tx.id, source);

    // Replay of a known operationId must resolve through the receipt planner
    // (idempotent hit or IDEMPOTENCY_CONFLICT) before the occupancy check,
    // otherwise a retried request would be rejected as "already linked".
    const priorReceipt = receipts.find((row) => String(row.operationId || "") === operationId);
    if (!priorReceipt) {
      const linkKind = getBankDepositLinkKind(tx, {
        receipts,
        paymentVouchers: data.paymentVouchers || [],
      });
      if (linkKind === "receipt") {
        const open = findBankTransactionOpenReceipt(tx, { receipts });
        throw makeError("BANK_TX_ALREADY_POSTED", "이미 입금전표가 전기된 통장거래입니다.", 409, {
          receiptId: open?.id ? String(open.id) : String(tx.linkedReceiptId || ""),
          linkKind,
        });
      }
      if (linkKind === "legacy") {
        throw makeError(
          "BANK_TX_LEGACY_LINKED",
          "레거시 입금전표(paymentVoucher)가 연결된 통장거래입니다. 기존 연결을 먼저 해제해 주세요.",
          409,
          { linkKind },
        );
      }
    }

    const client = resolveBankReceiptClientId(data.clients || [], input);
    const plannerInput = {
      operationId,
      clientId: String(client.id),
      receiptDate: resolveBankTxSeoulYmd(tx.transactionAt),
      grossAmount: receiptMoney(tx.deposit),
      channel: "bank",
      source,
      bankTransactionId: String(tx.id),
      sentStatementId: input.sentStatementId || null,
      memo: input.memo || "",
      allocations: normalizeAllocationInput(input.allocations),
    };

    const planned = planCreateAndPostReceipt(
      { receipts, allocations, sales: data.sales || [], clients: data.clients || [] },
      plannerInput,
      actor,
    );

    if (planned.shortCircuit) {
      // Idempotent replay. Repair the bank link only if a previous attempt lost
      // the ERP save race after the receipt row landed.
      const existing = planned.value.receipt;
      if (String(tx.linkedReceiptId || "") === String(existing.id)) {
        return {
          ...planned.value,
          version: state.version,
          bankTransactionId: String(tx.id),
          bankTransaction: tx,
        };
      }
      const patch = buildBankReceiptLinkPatch(tx, {
        receipt: existing,
        allocations: planned.value.allocations || [],
        clientName: String(client.name || ""),
        source,
        actor,
      });
      try {
        const repairedBankTransactions = listBankTransactions(data).map((row) =>
          String(row.id) === String(tx.id) ? { ...row, ...patch } : row,
        );
        const saved = saveErpState(
          { ...data, bankTransactions: repairedBankTransactions },
          state.version,
          actor,
          { allowReceiptMutation: true },
        );
        return {
          ...planned.value,
          version: saved.version,
          updatedAt: saved.updatedAt,
          bankTransactionId: String(tx.id),
          bankTransaction: repairedBankTransactions.find((row) => String(row.id) === String(tx.id)),
        };
      } catch (error) {
        if (error?.status !== 409 || attempt === SAVE_RETRY_ATTEMPTS - 1) throw error;
        continue;
      }
    }

    const patch = buildBankReceiptLinkPatch(tx, {
      receipt: planned.value.receipt,
      allocations: planned.value.allocations || [],
      clientName: String(client.name || ""),
      source,
      actor,
    });
    const nextBankTransactions = listBankTransactions(data).map((row) =>
      String(row.id) === String(tx.id) ? { ...row, ...patch } : row,
    );

    try {
      const saved = saveErpState(
        {
          ...data,
          receipts: planned.receipts,
          receiptAllocations: planned.allocations,
          bankTransactions: nextBankTransactions,
        },
        state.version,
        actor,
        { allowReceiptMutation: true },
      );
      return {
        ...planned.value,
        version: saved.version,
        updatedAt: saved.updatedAt,
        bankTransactionId: String(tx.id),
        bankTransaction: nextBankTransactions.find((row) => String(row.id) === String(tx.id)),
      };
    } catch (error) {
      if (error?.status !== 409 || attempt === SAVE_RETRY_ATTEMPTS - 1) throw error;
    }
  }

  throw makeError("BANK_RECEIPT_SAVE_FAILED", "통장 입금전표 저장에 실패했습니다.", 500);
}

/** Reverse the deposit's Receipt and release the bank row, atomically. */
export function reverseBankTransactionReceipt(bankTransactionId, input = {}, actor = "system") {
  for (let attempt = 0; attempt < SAVE_RETRY_ATTEMPTS; attempt += 1) {
    const state = getErpState();
    const data = state.data || {};
    const receipts = listReceipts(data);
    const allocations = listReceiptAllocations(data);

    const txId = String(bankTransactionId || "").trim();
    const tx = listBankTransactions(data).find((row) => String(row?.id) === txId);
    if (!tx) throw makeError("BANK_TX_NOT_FOUND", "통장거래를 찾을 수 없습니다.", 404);

    const linkKind = getBankDepositLinkKind(tx, {
      receipts,
      paymentVouchers: data.paymentVouchers || [],
    });
    if (linkKind === "legacy") {
      throw makeError(
        "BANK_TX_LEGACY_LINKED",
        "레거시 입금전표(paymentVoucher) 연결은 기존 해제 경로를 사용해 주세요.",
        409,
        { linkKind },
      );
    }

    const explicitOperationId = String(input.operationId || input.idempotencyKey || "").trim();
    const open = findBankTransactionOpenReceipt(tx, { receipts });
    let receiptId = String(open?.id || input.receiptId || tx.linkedReceiptId || "").trim();
    if (!receiptId && explicitOperationId) {
      // Replay after a successful reverse: the bank link is already gone, so
      // recover the original receipt from the reversal document itself.
      const priorReversal = receipts.find(
        (row) => String(row.operationId || "") === explicitOperationId && row.reversalOfReceiptId,
      );
      if (priorReversal) receiptId = String(priorReversal.reversalOfReceiptId);
    }
    if (!receiptId) {
      throw makeError("BANK_RECEIPT_NOT_FOUND", "취소할 입금전표 연결이 없습니다.", 404);
    }

    const operationId = explicitOperationId || makeBankReceiptReverseOperationId(tx.id, receiptId);

    const planned = planReverseReceipt(
      { receipts, allocations },
      receiptId,
      { ...input, operationId },
      actor,
    );

    const target = planned.shortCircuit
      ? receipts.find((row) => String(row.id) === receiptId)
      : planned.value.original;
    const { tx: clearedTx, changed: bankNeedsPatch } = clearBankReceiptLinkFields(tx, target);

    if (planned.shortCircuit && !bankNeedsPatch) {
      return { ...planned.value, version: state.version, bankTransactionId: String(tx.id) };
    }

    const nextBankTransactions = listBankTransactions(data).map((row) =>
      String(row.id) === String(tx.id) ? clearedTx : row,
    );

    try {
      const saved = saveErpState(
        {
          ...data,
          ...(planned.shortCircuit
            ? {}
            : { receipts: planned.receipts, receiptAllocations: planned.allocations }),
          bankTransactions: nextBankTransactions,
        },
        state.version,
        actor,
        { allowReceiptMutation: true },
      );
      return {
        ...planned.value,
        version: saved.version,
        updatedAt: saved.updatedAt,
        bankTransactionId: String(tx.id),
        bankTransaction: clearedTx,
      };
    } catch (error) {
      if (error?.status !== 409 || attempt === SAVE_RETRY_ATTEMPTS - 1) throw error;
    }
  }

  throw makeError("BANK_RECEIPT_SAVE_FAILED", "통장 입금전표 취소에 실패했습니다.", 500);
}

/** Read-only view of the receipt currently linked to a bank deposit. */
export function getBankTransactionReceipt(bankTransactionId) {
  const state = getErpState();
  const data = state.data || {};
  const txId = String(bankTransactionId || "").trim();
  const tx = listBankTransactions(data).find((row) => String(row?.id) === txId);
  if (!tx) throw makeError("BANK_TX_NOT_FOUND", "통장거래를 찾을 수 없습니다.", 404);

  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const linkKind = getBankDepositLinkKind(tx, {
    receipts,
    paymentVouchers: data.paymentVouchers || [],
  });
  const receipt = findBankTransactionOpenReceipt(tx, { receipts });

  return {
    ok: true,
    bankTransactionId: txId,
    linkKind,
    receipt: receipt || null,
    ...(receipt
      ? buildReceiptResult(receipt, allocations)
      : { allocations: [], summary: { allocatedAmount: 0, unallocatedAmount: 0, allocationCount: 0 } }),
    version: state.version,
  };
}

/* -------------------------------------------------------------- diagnostics */

/** Read-only Phase 2 counters (no mutation) for the dry-run route/script. */
export function buildBankReceiptPhase2Diagnostics(data = {}) {
  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);
  const transactions = listBankTransactions(data);
  const paymentVouchers = data.paymentVouchers || [];
  const cutoverAt = readBankReceiptCutoverAt(data);
  const cutoverYmd = bankReceiptCutoverYmd(cutoverAt);

  const counts = {
    deposits: 0,
    receiptLinked: 0,
    legacyLinked: 0,
    unlinked: 0,
    unlinkedPreCutover: 0,
    unlinkedPostCutover: 0,
    cardCompanyDeposits: 0,
    fakeVoucherIdOnReceiptLink: 0,
  };

  for (const tx of transactions) {
    if (receiptMoney(tx.deposit) <= 0) continue;
    counts.deposits += 1;
    if (isCardCompanyDeposit(tx)) counts.cardCompanyDeposits += 1;
    const kind = getBankDepositLinkKind(tx, { receipts, paymentVouchers });
    if (kind === "receipt") {
      counts.receiptLinked += 1;
      if (tx.linkedPaymentVoucherId != null && tx.linkedPaymentVoucherId !== "") {
        counts.fakeVoucherIdOnReceiptLink += 1;
      }
      continue;
    }
    if (kind === "legacy") {
      counts.legacyLinked += 1;
      continue;
    }
    counts.unlinked += 1;
    const createdAt = String(tx.createdAt || "");
    if (cutoverAt && createdAt && createdAt >= cutoverAt) counts.unlinkedPostCutover += 1;
    else counts.unlinkedPreCutover += 1;
  }

  const bankReceipts = receipts.filter((row) => row.channel === "bank" && row.bankTransactionId);
  const openBankReceipts = bankReceipts.filter((row) => isOpenDepositReceipt(row));
  const orphanReceipts = openBankReceipts.filter(
    (row) => !transactions.some((tx) => String(tx.id) === String(row.bankTransactionId)),
  );
  const grossMismatch = openBankReceipts.filter((row) => {
    const tx = transactions.find((item) => String(item.id) === String(row.bankTransactionId));
    if (!tx) return false;
    return receiptMoney(tx.deposit) !== receiptMoney(row.grossAmount);
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    asOf: todaySeoul(),
    cutoverAt: cutoverAt || null,
    cutoverYmd: cutoverYmd || null,
    cutoverSource: data?.bankSyncMeta?.bankReceiptCutoverAt
      ? "bankSyncMeta"
      : getConfiguredBankReceiptCutoverAt()
        ? "env"
        : "unset",
    bankTransactions: counts,
    receipts: {
      total: receipts.length,
      bankChannelLinked: bankReceipts.length,
      openBankLinked: openBankReceipts.length,
      allocations: allocations.length,
      bankAuto: openBankReceipts.filter((row) => row.source === "bank_auto").length,
      bankManual: openBankReceipts.filter((row) => row.source === "bank_manual").length,
      orphanBankTransactionIds: orphanReceipts.map((row) => String(row.bankTransactionId)),
      grossMismatchReceiptIds: grossMismatch.map((row) => String(row.id)),
    },
    legacy: {
      paymentVouchers: paymentVouchers.length,
      paymentInputLogs: Array.isArray(data.paymentInputLogs) ? data.paymentInputLogs.length : 0,
    },
  };
}

export function getBankReceiptPhase2DryRun() {
  const state = getErpState();
  return { ...buildBankReceiptPhase2Diagnostics(state.data || {}), version: state.version };
}
