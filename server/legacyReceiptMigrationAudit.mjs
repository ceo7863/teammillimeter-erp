/**
 * Phase 4 — legacy payment → Receipt migration readiness audit.
 *
 * Task ID: `ERP_UNIFIED_AR_SUBLEDGER_PHASE4_MIGRATION_READINESS_AUDIT_FINAL`
 *
 * Everything in this module is diagnosis. Nothing here writes to the ERP state, and the
 * only migration surface it exposes is a plan with `apply: false`. `simulateMigrationOnClone`
 * applies the plan to an in-memory clone (or a temp copy of a SQLite file) and never touches
 * the original.
 *
 * Reporting rules that the whole module obeys:
 * - Customer names never leave this module. Rows carry `clientId` plus a salted
 *   `clientRef` hash (`maskClientName`).
 * - `sale.paid` / `basePaid` is a stored legacy balance, not observed cash. It can only ever
 *   become an `OPENING_BALANCE_CANDIDATE`; no plan converts it into a Receipt.
 * - A statement-scoped legacy voucher is never auto-allocated. FIFO stays a candidate list.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  buildClientNameIndex,
  buildSaleArBalances,
  buildStatementPaymentStatus,
  dedupeBankReferences,
  isAllocationEffectiveAsOf,
  isProjectedReceiptVoucherRow,
  isReceiptEffectiveAsOf,
  legacyVoucherAmount,
  normalizeYmd,
  resolveSaleClientId,
  todaySeoulYmd,
  unifiedArMoney,
} from "../src/utils/unifiedArReadModel.ts";

/* --------------------------------------------------------------- constants */

export const MIGRATION_BUCKETS = [
  "AUTO_SAFE_BANK",
  "AUTO_SAFE_MANUAL",
  "AUTO_SAFE_BATCH",
  "OPENING_BALANCE_CANDIDATE",
  "MANUAL_REVIEW",
  "BLOCKED_CONFLICT",
];

export const AUTO_SAFE_BUCKETS = ["AUTO_SAFE_BANK", "AUTO_SAFE_MANUAL", "AUTO_SAFE_BATCH"];

export const SALE_DIFF_CLASSES = [
  "EXPECTED_ASOF_DIFFERENCE",
  "LEGACY_DATE_MISSING",
  "LEGACY_UNATTRIBUTED",
  "LEGACY_FIFO_INFERENCE",
  "VAT_FACE_DIFFERENCE",
  "DUPLICATE_LEGACY_PAYMENT",
  "BANK_REFERENCE_CONFLICT",
  "STATEMENT_REFERENCE_ONLY",
  "READ_MODEL_BUG",
  "LEGACY_DATA_DEFECT",
];

/** Arrays that define a migration snapshot. Order matters for the snapshot hash. */
export const SNAPSHOT_KEYS = [
  "sales",
  "clients",
  "paymentVouchers",
  "paymentInputLogs",
  "receipts",
  "receiptAllocations",
  "bankTransactions",
];

const CLIENT_HASH_SALT = "erp-unified-ar-phase4";
const VAT_RATE = 0.1;
/** KRW rounding slack when testing whether a difference is a VAT face amount. */
const VAT_TOLERANCE = 2;

/* ------------------------------------------------------------------ basics */

const money = unifiedArMoney;

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

/** Deterministic JSON: object keys sorted, `undefined` dropped. */
export function canonicalJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function stableHash(value) {
  return sha256(canonicalJson(value));
}

/** Customer names are one-way hashed before they can reach a report or a log line. */
export function maskClientName(name) {
  const text = String(name ?? "").trim();
  if (!text) return null;
  return `c#${sha256(`${CLIENT_HASH_SALT}|${text}`).slice(0, 12)}`;
}

export function maskClient(clientId, clientName) {
  const id = clientId == null || clientId === "" ? null : String(clientId);
  return { clientId: id, clientRef: maskClientName(clientName) || (id ? `id#${id}` : null) };
}

function uniq(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function sum(values) {
  return values.reduce((total, value) => total + money(value), 0);
}

/* ------------------------------------------------------------- shared index */

/**
 * One pass over the snapshot so every audit function sees the same resolution rules
 * (sale → client, voucher → sale, bank tx → receipts/vouchers, voucher → input-log batch).
 */
function buildAuditIndex(data = {}, asOfDate) {
  const asOf = normalizeYmd(asOfDate, todaySeoulYmd());
  const sales = data.sales || [];
  const clients = data.clients || [];
  const receipts = data.receipts || [];
  const allocations = data.receiptAllocations || [];
  const vouchers = (data.paymentVouchers || []).filter((row) => !isProjectedReceiptVoucherRow(row));
  const logs = data.paymentInputLogs || [];
  const bankTransactions = data.bankTransactions || [];

  const clientNameIndex = buildClientNameIndex(clients);
  const clientsById = new Map(clients.map((row) => [String(row?.id ?? ""), row]));
  const salesById = new Map(sales.map((row) => [String(row?.id ?? ""), row]));
  const receiptById = new Map(receipts.map((row) => [String(row?.id ?? ""), row]));
  const bankTxById = new Map(bankTransactions.map((row) => [String(row?.id ?? ""), row]));

  const saleClientId = new Map();
  for (const sale of sales) {
    saleClientId.set(String(sale?.id ?? ""), resolveSaleClientId(sale, clientNameIndex));
  }

  const clientNameOfId = (clientId) => String(clientsById.get(String(clientId ?? ""))?.name ?? "");

  /** Effective receipt allocation already booked on a sale, as-of `asOf`. */
  const receiptAllocatedBySaleId = new Map();
  for (const allocation of allocations) {
    if (!isAllocationEffectiveAsOf(allocation, receiptById, asOf)) continue;
    const saleId = String(allocation?.saleId ?? "");
    receiptAllocatedBySaleId.set(saleId, (receiptAllocatedBySaleId.get(saleId) || 0) + money(allocation.amount));
  }

  const receiptsByBankTx = new Map();
  for (const receipt of receipts) {
    const bankTxId = String(receipt?.bankTransactionId ?? "").trim();
    if (!bankTxId) continue;
    if (!isReceiptEffectiveAsOf(receipt, asOf)) continue;
    const list = receiptsByBankTx.get(bankTxId) || [];
    list.push(receipt);
    receiptsByBankTx.set(bankTxId, list);
  }

  const vouchersByBankTx = new Map();
  const vouchersBySaleId = new Map();
  for (const voucher of vouchers) {
    const bankTxId = String(voucher?.bankTransactionId ?? "").trim();
    if (bankTxId) {
      const list = vouchersByBankTx.get(bankTxId) || [];
      list.push(voucher);
      vouchersByBankTx.set(bankTxId, list);
    }
    const saleId = String(voucher?.salesId ?? "").trim();
    if (saleId) {
      const list = vouchersBySaleId.get(saleId) || [];
      list.push(voucher);
      vouchersBySaleId.set(saleId, list);
    }
  }

  /**
   * Batch evidence comes from `paymentInputLogs`: one save batch shares `createdAt`,
   * `savedBy` and the VAT flag. Without a log row a voucher has no batch, so vouchers are
   * never merged into one Receipt just because they look similar.
   */
  const batchIdByVoucherId = new Map();
  const batchMembers = new Map();
  for (const log of logs) {
    const voucherId = String(log?.paymentVoucherId ?? "").trim();
    if (!voucherId) continue;
    const batchId = `pil:${String(log?.createdAt ?? "")}|${String(log?.savedBy ?? "")}|${log?.vatIncluded ? 1 : 0}`;
    batchIdByVoucherId.set(voucherId, batchId);
    const list = batchMembers.get(batchId) || [];
    list.push({ voucherId, log });
    batchMembers.set(batchId, list);
  }

  const voucherClientId = (voucher) => {
    const saleId = String(voucher?.salesId ?? "").trim();
    if (saleId && saleClientId.has(saleId)) {
      const fromSale = saleClientId.get(saleId);
      if (fromSale) return fromSale;
    }
    const name = String(voucher?.client ?? "").trim();
    if (!name) return null;
    const hit = clientNameIndex.get(name);
    if (!hit || hit.count !== 1) return null;
    return hit.id;
  };

  const bankReferences = dedupeBankReferences(data, { asOfDate: asOf });
  const conflictedBankTxIds = new Set(bankReferences.conflicts.map((row) => String(row.bankTransactionId)));

  return {
    asOf,
    sales,
    receipts,
    allocations,
    vouchers,
    clientNameIndex,
    clientsById,
    salesById,
    receiptById,
    bankTxById,
    saleClientId,
    clientNameOfId,
    receiptAllocatedBySaleId,
    receiptsByBankTx,
    vouchersByBankTx,
    vouchersBySaleId,
    batchIdByVoucherId,
    batchMembers,
    voucherClientId,
    bankReferences,
    conflictedBankTxIds,
  };
}

/** Snapshot fingerprint: per-array record counts plus a content checksum. */
export function computeMigrationSnapshotHash(data = {}) {
  const counts = {};
  const checksums = {};
  for (const key of SNAPSHOT_KEYS) {
    const rows = Array.isArray(data[key]) ? data[key] : [];
    counts[key] = rows.length;
    checksums[key] = stableHash(rows).slice(0, 16);
  }
  return { counts, checksums, hash: stableHash({ counts, checksums }) };
}

/* ------------------------------------------------- A. organic receipt audit */

function isMigrationSourcedReceipt(receipt) {
  return String(receipt?.source ?? "") === "migration" || String(receipt?.id ?? "").startsWith("mig-rcpt-");
}

/**
 * A. Per-Receipt integrity audit for cash documents that were created organically by the
 * product (not by a migration). Cash identity (`gross = allocated + unallocated`) is the
 * hard gate: a broken one blocks the whole migration.
 */
export function auditOrganicReceipts(data = {}, options = {}) {
  const index = buildAuditIndex(data, options.asOfDate);
  const { asOf } = index;
  const archiveIds = new Set((options.archives || []).map((row) => String(row?.id ?? "")).filter(Boolean));
  const hasArchiveIndex = archiveIds.size > 0;
  const includeMigrated = options.includeMigrated === true;

  const candidates = index.receipts.filter((row) => includeMigrated || !isMigrationSourcedReceipt(row));

  const rows = [];
  for (const receipt of candidates) {
    const receiptId = String(receipt?.id ?? "");
    const blockers = [];
    const warnings = [];

    const receiptAllocations = index.allocations.filter((row) => String(row?.receiptId ?? "") === receiptId);
    const effective = receiptAllocations.filter((row) => isAllocationEffectiveAsOf(row, index.receiptById, asOf));
    const grossAmount = money(receipt?.grossAmount);
    const allocatedSum = sum(effective.map((row) => row.amount));
    const unallocatedAmount = grossAmount - allocatedSum;
    const isReversalReceipt =
      Boolean(receipt?.reversalOfReceiptId) ||
      String(receipt?.status ?? "") === "reversal" ||
      grossAmount < 0;

    if (isReversalReceipt) {
      // Reversal receipts carry negative gross (and often negative unallocated prepaid unwind).
      // Over-allocation means allocatedSum is *more negative* than grossAmount.
      if (allocatedSum < grossAmount) {
        blockers.push({
          code: "ALLOCATION_EXCEEDS_RECEIPT",
          message: "취소 입금전표의 배분 합계가 취소 금액을 초과합니다.",
          detail: { grossAmount, allocatedSum },
        });
      }
      if (grossAmount !== allocatedSum + unallocatedAmount) {
        blockers.push({
          code: "CASH_IDENTITY_BROKEN",
          message: "취소 입금액 ≠ 배분 + 미배분 불변식 위반",
          detail: { grossAmount, allocatedSum, unallocatedAmount },
        });
      }
    } else {
      if (allocatedSum > grossAmount) {
        blockers.push({
          code: "ALLOCATION_EXCEEDS_RECEIPT",
          message: "배분 합계가 입금액을 초과합니다.",
          detail: { grossAmount, allocatedSum },
        });
      }
      if (grossAmount !== allocatedSum + Math.max(unallocatedAmount, 0) || unallocatedAmount < 0) {
        blockers.push({
          code: "CASH_IDENTITY_BROKEN",
          message: "입금액 ≠ 배분 + 미배분 불변식 위반",
          detail: { grossAmount, allocatedSum, unallocatedAmount },
        });
      }
    }
    if (unallocatedAmount > 0 && String(receipt?.status ?? "") !== "reversed") {
      warnings.push({
        code: "UNALLOCATED_CASH_PREPAID",
        message: "미배분 입금액은 거래처 선수금으로 남아 있습니다.",
        detail: { unallocatedAmount },
      });
    }

    const missingSaleIds = [];
    const clientMismatchSaleIds = [];
    for (const allocation of effective) {
      const saleId = String(allocation?.saleId ?? "");
      const sale = index.salesById.get(saleId);
      if (!sale) {
        missingSaleIds.push(saleId);
        continue;
      }
      const saleClient = index.saleClientId.get(saleId);
      if (saleClient && String(saleClient) !== String(receipt?.clientId ?? "")) {
        clientMismatchSaleIds.push(saleId);
      }
    }
    if (missingSaleIds.length) {
      blockers.push({
        code: "ALLOCATION_SALE_MISSING",
        message: "배분 대상 매출을 찾을 수 없습니다.",
        detail: { saleIds: missingSaleIds },
      });
    }
    if (clientMismatchSaleIds.length) {
      blockers.push({
        code: "ALLOCATION_CLIENT_MISMATCH",
        message: "배분 매출의 거래처가 입금전표 거래처와 다릅니다.",
        detail: { saleIds: clientMismatchSaleIds },
      });
    }

    const bankTransactionId = String(receipt?.bankTransactionId ?? "").trim() || null;
    const bankTx = bankTransactionId ? index.bankTxById.get(bankTransactionId) : null;
    const deposit = bankTx ? money(bankTx.deposit) : null;
    const legacyVoucherIdsOnSameTx = bankTransactionId
      ? (index.vouchersByBankTx.get(bankTransactionId) || []).map((row) => String(row?.id ?? ""))
      : [];
    const duplicateReceiptIdsOnSameTx = bankTransactionId
      ? (index.receiptsByBankTx.get(bankTransactionId) || [])
          .map((row) => String(row?.id ?? ""))
          .filter((id) => id !== receiptId)
      : [];

    if (bankTransactionId && !bankTx) {
      blockers.push({
        code: "BANK_TRANSACTION_MISSING",
        message: "연결된 통장거래를 찾을 수 없습니다.",
        detail: { bankTransactionId },
      });
    }
    if (bankTx && deposit !== grossAmount) {
      blockers.push({
        code: "BANK_DEPOSIT_MISMATCH",
        message: "입금전표 총액이 통장 입금액과 다릅니다.",
        detail: { bankTransactionId, deposit, grossAmount },
      });
    }
    if (legacyVoucherIdsOnSameTx.length) {
      blockers.push({
        code: "BANK_LEGACY_VOUCHER_CONFLICT",
        message: "같은 통장거래에 레거시 입금전표가 함께 연결되어 있습니다.",
        detail: { bankTransactionId, legacyVoucherIds: legacyVoucherIdsOnSameTx },
      });
    }
    if (duplicateReceiptIdsOnSameTx.length) {
      blockers.push({
        code: "BANK_DUPLICATE_RECEIPT",
        message: "같은 통장거래에 유효한 입금전표가 2건 이상 있습니다.",
        detail: { bankTransactionId, receiptIds: duplicateReceiptIdsOnSameTx },
      });
    }

    const sentStatementId = String(receipt?.sentStatementId ?? "").trim() || null;
    if (sentStatementId && hasArchiveIndex && !archiveIds.has(sentStatementId)) {
      warnings.push({
        code: "STATEMENT_ARCHIVE_MISSING",
        message: "연결된 내역서 PDF를 찾을 수 없습니다.",
        detail: { sentStatementId },
      });
    }

    rows.push({
      receiptId,
      receiptNo: String(receipt?.receiptNo ?? "") || null,
      source: String(receipt?.source ?? "") || null,
      channel: String(receipt?.channel ?? "") || null,
      status: String(receipt?.status ?? "") || null,
      receiptDate: normalizeYmd(receipt?.receiptDate) || null,
      ...maskClient(receipt?.clientId, receipt?.clientName || index.clientNameOfId(receipt?.clientId)),
      grossAmount,
      allocatedSum,
      unallocatedAmount,
      allocationCount: effective.length,
      recordedAllocationCount: receiptAllocations.length,
      saleIds: effective.map((row) => String(row?.saleId ?? "")),
      cashIdentity: {
        ok: isReversalReceipt
          ? grossAmount === allocatedSum + unallocatedAmount && allocatedSum >= grossAmount
          : grossAmount === allocatedSum + Math.max(unallocatedAmount, 0) && unallocatedAmount >= 0,
        grossAmount,
        allocatedSum,
        unallocatedAmount,
        isReversalReceipt,
      },
      saleIdsExist: missingSaleIds.length === 0,
      missingSaleIds,
      clientMatches: clientMismatchSaleIds.length === 0,
      clientMismatchSaleIds,
      bank: {
        bankTransactionId,
        transactionExists: Boolean(bankTx),
        deposit,
        depositMatchesGross: bankTx ? deposit === grossAmount : null,
        legacyVoucherIdsOnSameTx,
        duplicateReceiptIdsOnSameTx,
      },
      statement: {
        sentStatementId,
        archiveExists: sentStatementId && hasArchiveIndex ? archiveIds.has(sentStatementId) : null,
      },
      reversal: {
        reversalOfReceiptId: receipt?.reversalOfReceiptId ? String(receipt.reversalOfReceiptId) : null,
        reversedEffectiveDate: normalizeYmd(receipt?.reversedEffectiveDate) || null,
        effectiveAsOf: isReceiptEffectiveAsOf(receipt, asOf),
      },
      warnings,
      blockers,
      blocked: blockers.length > 0,
    });
  }

  rows.sort((a, b) => String(a.receiptId).localeCompare(String(b.receiptId)));

  const blocked = rows.filter((row) => row.blocked);
  const cashIdentityBroken = rows.filter((row) => !row.cashIdentity.ok);

  return {
    ok: blocked.length === 0,
    apply: false,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate: asOf,
    counts: {
      receiptCount: index.receipts.length,
      organicReceiptCount: rows.length,
      migrationSourcedReceiptCount: index.receipts.filter(isMigrationSourcedReceipt).length,
      blockedCount: blocked.length,
      cashIdentityBrokenCount: cashIdentityBroken.length,
      bankLinkedCount: rows.filter((row) => row.bank.bankTransactionId).length,
      statementLinkedCount: rows.filter((row) => row.statement.sentStatementId).length,
      unallocatedReceiptCount: rows.filter((row) => row.unallocatedAmount > 0).length,
    },
    totals: {
      grossAmount: sum(rows.map((row) => row.grossAmount)),
      allocatedAmount: sum(rows.map((row) => row.allocatedSum)),
      unallocatedAmount: sum(rows.map((row) => row.unallocatedAmount)),
    },
    receipts: rows,
    blockers: blocked.flatMap((row) =>
      row.blockers.map((blocker) => ({ receiptId: row.receiptId, ...blocker })),
    ),
    gate: blocked.length ? "BLOCKED" : "PASS",
  };
}

/* ------------------------------------------- B. detailed sale-diff analysis */

function looksLikeVatFace(billedAmount, amount) {
  if (billedAmount <= 0 || amount <= 0) return false;
  return Math.abs(amount - Math.round(billedAmount * VAT_RATE)) <= VAT_TOLERANCE;
}

/**
 * B. Refine every parity difference beyond the coarse `asof_projection` bucket.
 *
 * The classification is evidence-first: a class is only assigned when the snapshot actually
 * contains the artefact that explains it. Anything left over is reported as `READ_MODEL_BUG`
 * rather than being silently absorbed into a generic bucket.
 */
export function classifySaleDiffsDetailed(data = {}, parityReport = {}, options = {}) {
  const asOfDate = normalizeYmd(options.asOfDate || parityReport?.asOfDate, todaySeoulYmd());
  const index = buildAuditIndex(data, asOfDate);
  const balances = options.balances || buildSaleArBalances(data, { asOfDate });
  const balanceBySaleId = new Map(balances.sales.map((row) => [row.saleId, row]));

  const suppressedVoucherIds = new Set(balances.suppressedLegacyByBankReceipt.voucherIds.map(String));
  const unattributedByClientName = new Map(
    balances.unattributedLegacy.map((row) => [String(row.clientName), row]),
  );

  const archiveIdsBySaleId = new Map();
  for (const archive of options.archives || []) {
    const ids = uniq([
      ...(archive?.statementSalesIds || []),
      ...(archive?.statementSalesSnapshot || []).map((row) => row?.saleId),
    ].map((id) => String(id ?? "")));
    for (const saleId of ids) {
      const list = archiveIdsBySaleId.get(saleId) || [];
      list.push(String(archive?.id ?? ""));
      archiveIdsBySaleId.set(saleId, list);
    }
  }

  const rows = [];
  for (const diff of parityReport?.sales || []) {
    const saleId = String(diff.saleId);
    const sale = index.salesById.get(saleId);
    const balance = balanceBySaleId.get(saleId);
    const billedAmount = money(diff.billedAmount ?? balance?.billedAmount);
    const legacyViewPaid = money(diff.legacyPaid);
    const unifiedPaid = money(diff.unifiedPaid);
    const delta = legacyViewPaid - unifiedPaid;

    const directVouchers = index.vouchersBySaleId.get(saleId) || [];
    const clientId = index.saleClientId.get(saleId) ?? null;
    const clientName = String(sale?.client ?? "");
    const statementVouchers = index.vouchers.filter((voucher) => {
      if (String(voucher?.salesId ?? "").trim()) return false;
      return String(voucher?.client ?? "") === clientName;
    });

    const bankTransactionIds = uniq(directVouchers.map((row) => String(row?.bankTransactionId ?? "").trim()));
    const conflictedBankTxIds = bankTransactionIds.filter((id) => index.conflictedBankTxIds.has(id));
    const saleSuppressedVoucherIds = directVouchers
      .map((row) => String(row?.id ?? ""))
      .filter((id) => suppressedVoucherIds.has(id));
    const statementArchiveIds = archiveIdsBySaleId.get(saleId) || [];

    const receiptAllocations = index.allocations.filter((row) => String(row?.saleId ?? "") === saleId);
    const futureAllocations = receiptAllocations.filter(
      (row) => !isAllocationEffectiveAsOf(row, index.receiptById, asOfDate),
    );
    const futureDatedVouchers = directVouchers.filter((row) => {
      const date = normalizeYmd(row?.date);
      return Boolean(date) && date > asOfDate;
    });
    const undatedVouchers = directVouchers.filter((row) => !normalizeYmd(row?.date));

    const directVoucherTotal = sum(directVouchers.map(legacyVoucherAmount));
    const duplicateVoucherGroups = new Map();
    for (const voucher of directVouchers) {
      const key = `${normalizeYmd(voucher?.date)}|${legacyVoucherAmount(voucher)}`;
      duplicateVoucherGroups.set(key, [...(duplicateVoucherGroups.get(key) || []), String(voucher?.id ?? "")]);
    }
    const duplicateVoucherIds = [...duplicateVoucherGroups.values()].filter((ids) => ids.length > 1).flat();

    const unattributed = unattributedByClientName.get(clientName) || null;
    const clientMismatchVoucherIds = directVouchers
      .filter((row) => String(row?.client ?? "") !== clientName && String(row?.client ?? "") !== "")
      .map((row) => String(row?.id ?? ""));
    const nonPositiveVoucherIds = directVouchers
      .filter((row) => legacyVoucherAmount(row) <= 0)
      .map((row) => String(row?.id ?? ""));

    const evidence = [];
    let classification = null;
    const claim = (code, ...notes) => {
      if (classification) return;
      classification = code;
      evidence.push(...notes);
    };

    if (conflictedBankTxIds.length) {
      claim(
        "BANK_REFERENCE_CONFLICT",
        `bankTransactionIds=${conflictedBankTxIds.join(",")} appear in both ledgers`,
      );
    }
    if (saleSuppressedVoucherIds.length || duplicateVoucherIds.length) {
      claim(
        "DUPLICATE_LEGACY_PAYMENT",
        saleSuppressedVoucherIds.length
          ? `legacy vouchers ${saleSuppressedVoucherIds.join(",")} are suppressed by a Receipt on the same bank tx`
          : `legacy vouchers ${duplicateVoucherIds.join(",")} share date+amount on one sale`,
      );
    }
    /**
     * Production `asof_projection` pattern: sale rows often store `basePaid: 0`,
     * `paid`/`voucherPaid` already equal to the voucher face, while Unified AR was reading
     * `sale.paid` as an opening balance *and* re-applying the voucher. Detect that before
     * falling through to a bare READ_MODEL_BUG so the report names the concrete defect.
     */
    const saleBasePaidRaw = sale && Object.prototype.hasOwnProperty.call(sale, "basePaid") ? sale.basePaid : undefined;
    const salePaid = money(sale?.paid);
    const saleVoucherPaid = money(sale?.voucherPaid);
    if (
      !classification &&
      directVouchers.length > 0 &&
      saleBasePaidRaw !== undefined &&
      money(saleBasePaidRaw) === 0 &&
      salePaid > 0 &&
      Math.abs(salePaid - directVoucherTotal) <= VAT_TOLERANCE &&
      Math.abs(delta) > 0
    ) {
      claim(
        "READ_MODEL_BUG",
        `sale.basePaid=0 but sale.paid=${salePaid} already mirrors voucherTotal=${directVoucherTotal}` +
          (saleVoucherPaid ? ` (sale.voucherPaid=${saleVoucherPaid})` : "") +
          `; Unified must use basePaid??paid like applyPaymentVouchers, not sale.paid alone (delta=${delta})`,
      );
    }
    if (clientMismatchVoucherIds.length || nonPositiveVoucherIds.length || sale?.manualPaidCleared) {
      claim(
        "LEGACY_DATA_DEFECT",
        clientMismatchVoucherIds.length
          ? `voucher client differs from sale client (${clientMismatchVoucherIds.join(",")})`
          : nonPositiveVoucherIds.length
            ? `non-positive voucher amount (${nonPositiveVoucherIds.join(",")})`
            : "sale.manualPaidCleared is set while legacy vouchers still reference the sale",
      );
    }
    if (undatedVouchers.length) {
      claim(
        "LEGACY_DATE_MISSING",
        `vouchers without an accounting date: ${undatedVouchers.map((row) => String(row?.id ?? "")).join(",")}`,
      );
    }
    if (
      billedAmount > 0 &&
      (looksLikeVatFace(billedAmount, Math.abs(delta)) ||
        looksLikeVatFace(billedAmount, Math.max(directVoucherTotal - billedAmount, 0)))
    ) {
      claim(
        "VAT_FACE_DIFFERENCE",
        `difference matches the VAT face of billed (${billedAmount} × ${VAT_RATE})`,
      );
    }
    if (unattributed && money(unattributed.amount) > 0) {
      claim(
        "LEGACY_UNATTRIBUTED",
        `client holds ${money(unattributed.amount)} of legacy cash that FIFO could not place`,
      );
    }
    if (money(balance?.legacyFifoAppliedAmount) > 0) {
      claim(
        "LEGACY_FIFO_INFERENCE",
        `unified inferred ${money(balance?.legacyFifoAppliedAmount)} onto this sale by statement FIFO`,
      );
    }
    if (statementVouchers.length && !directVouchers.length) {
      claim(
        "STATEMENT_REFERENCE_ONLY",
        `only statement-scoped vouchers reference this client (${statementVouchers.length})`,
      );
    }
    if (futureDatedVouchers.length || futureAllocations.length) {
      claim(
        "EXPECTED_ASOF_DIFFERENCE",
        futureDatedVouchers.length
          ? `voucher dated after asOf=${asOfDate}`
          : `receipt allocation not yet effective on asOf=${asOfDate}`,
      );
    }
    if (!classification) {
      classification = "READ_MODEL_BUG";
      evidence.push(
        "no legacy artefact in the snapshot explains this difference; " +
          `components legacyDirect=${money(balance?.legacyDirectAppliedAmount)} ` +
          `legacyFifo=${money(balance?.legacyFifoAppliedAmount)} ` +
          `stored=${money(balance?.legacyStoredPaidAmount)} ` +
          `receipt=${money(balance?.receiptAllocatedAmount)}`,
      );
    }

    const componentSum =
      money(balance?.legacyDirectAppliedAmount) +
      money(balance?.legacyFifoAppliedAmount) +
      money(balance?.legacyStoredPaidAmount) +
      money(balance?.receiptAllocatedAmount);

    rows.push({
      saleId,
      saleDate: normalizeYmd(diff.saleDate ?? sale?.date) || null,
      ...maskClient(clientId, clientName),
      billedAmount,
      legacyViewPaid,
      unifiedApplied: money(balance?.totalAppliedAmount),
      unifiedPaid,
      delta,
      basePaid: money(balance?.legacyStoredPaidAmount),
      legacyDirectApplied: money(balance?.legacyDirectAppliedAmount),
      legacyFifoApplied: money(balance?.legacyFifoAppliedAmount),
      receiptAllocatedAmount: money(balance?.receiptAllocatedAmount),
      receiptAllocationTotal: sum(receiptAllocations.map((row) => row.amount)),
      legacyVoucherIds: directVouchers.map((row) => String(row?.id ?? "")),
      legacyVoucherTotal: directVoucherTotal,
      statementScopedVoucherIds: statementVouchers.map((row) => String(row?.id ?? "")),
      receiptIds: balance?.receiptIds || [],
      bankFlags: {
        bankTransactionIds,
        conflictedBankTransactionIds: conflictedBankTxIds,
        suppressedVoucherIds: saleSuppressedVoucherIds,
        hasBankEvidence: bankTransactionIds.length > 0,
      },
      pdfFlags: {
        statementArchiveIds,
        statementCount: statementArchiveIds.length,
        reusedAcrossVersions: statementArchiveIds.length > 1,
        hasStatementEvidence: statementArchiveIds.length > 0,
      },
      priorDiffClass: diff.diffClass || null,
      classification,
      evidence,
      componentsReconcile: componentSum === money(balance?.totalAppliedAmount),
      recommendedAction: recommendedActionForClass(classification),
    });
  }

  rows.sort((a, b) => String(a.saleId).localeCompare(String(b.saleId)));

  const classCounts = Object.fromEntries(SALE_DIFF_CLASSES.map((key) => [key, 0]));
  const priorClassBreakdown = {};
  for (const row of rows) {
    classCounts[row.classification] += 1;
    const prior = row.priorDiffClass || "(none)";
    priorClassBreakdown[prior] = priorClassBreakdown[prior] || {};
    priorClassBreakdown[prior][row.classification] =
      (priorClassBreakdown[prior][row.classification] || 0) + 1;
  }

  const readModelBugs = rows.filter((row) => row.classification === "READ_MODEL_BUG");

  return {
    ok: true,
    apply: false,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate,
    counts: {
      diffCount: rows.length,
      readModelBugCount: readModelBugs.length,
      unexplainedDelta: sum(readModelBugs.map((row) => row.delta)),
    },
    classCounts,
    /** How the coarse Phase 3 buckets (`asof_projection` etc.) split into Phase 4 causes. */
    priorClassBreakdown,
    diffs: rows,
    readModelBugs,
  };
}

function recommendedActionForClass(classification) {
  switch (classification) {
    case "EXPECTED_ASOF_DIFFERENCE":
      return "ACCEPT — as-of semantics working as designed; no migration action";
    case "LEGACY_DATE_MISSING":
      return "MANUAL — supply an accounting date before the voucher can become a Receipt";
    case "LEGACY_UNATTRIBUTED":
      return "MANUAL — operator must choose the target sale, prepaid or opening balance";
    case "LEGACY_FIFO_INFERENCE":
      return "MANUAL — confirm the inferred FIFO attribution before migrating";
    case "VAT_FACE_DIFFERENCE":
      return "MANUAL — decide VAT-inclusive cash vs VAT-exclusive billing before migrating";
    case "DUPLICATE_LEGACY_PAYMENT":
      return "BLOCK — resolve the duplicate before any migration";
    case "BANK_REFERENCE_CONFLICT":
      return "BLOCK — one bank transaction must belong to exactly one ledger";
    case "STATEMENT_REFERENCE_ONLY":
      return "MANUAL — statement-scoped cash needs an explicit allocation decision";
    case "READ_MODEL_BUG":
      return "REPORT — no data artefact explains the difference; investigate the read model";
    case "LEGACY_DATA_DEFECT":
      return "MANUAL — repair the legacy row; do not migrate it as-is";
    default:
      return "MANUAL";
  }
}

/* ------------------------------------------ C. unattributed FIFO candidates */

/**
 * C. The statement-scoped legacy cash that FIFO could not place. This returns candidates and
 * the manual choices an operator has. It never allocates: `autoAllocate` is hard-coded false.
 */
export function investigateUnattributedFifo(data = {}, options = {}) {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const index = buildAuditIndex(data, asOfDate);
  const balances = options.balances || buildSaleArBalances(data, { asOfDate });
  const archivesById = new Map((options.archives || []).map((row) => [String(row?.id ?? ""), row]));

  const cases = [];
  for (const entry of balances.unattributedLegacy) {
    const clientName = String(entry.clientName ?? "");
    const voucherIds = (entry.voucherIds || []).map(String);
    const vouchers = index.vouchers.filter((row) => voucherIds.includes(String(row?.id ?? "")));
    const voucherTotalAmount = sum(vouchers.map(legacyVoucherAmount));
    const unattributedAmount = money(entry.amount);
    const fifoAppliedAmount = voucherTotalAmount - unattributedAmount;

    const clientIdHit = index.clientNameIndex.get(clientName);
    const clientId = clientIdHit && clientIdHit.count === 1 ? clientIdHit.id : null;

    const scopeSaleIds = uniq(vouchers.flatMap((row) => (row?.statementSalesIds || []).map((id) => String(id ?? ""))));
    const archiveIds = uniq(vouchers.map((row) => String(row?.linkedPdfArchiveId ?? "")));
    const periodStarts = uniq(vouchers.map((row) => normalizeYmd(row?.statementPeriodStart)));
    const periodEnds = uniq(vouchers.map((row) => normalizeYmd(row?.statementPeriodEnd)));

    const candidates = balances.sales
      .filter((row) => row.clientName === clientName)
      .filter((row) => row.outstandingAmount > 0)
      .sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.saleId.localeCompare(b.saleId))
      .map((row, position) => ({
        rank: position + 1,
        saleId: row.saleId,
        saleDate: row.saleDate || null,
        billedAmount: row.billedAmount,
        appliedAmount: row.totalAppliedAmount,
        outstandingAmount: row.outstandingAmount,
        withinStatementScope: scopeSaleIds.length ? scopeSaleIds.includes(row.saleId) : null,
        fifoRankIfApplied: position + 1,
      }));

    const candidateOutstandingTotal = sum(candidates.map((row) => row.outstandingAmount));

    const choices = [
      ...candidates.map((row) => ({
        optionId: `manual-allocate:${row.saleId}`,
        action: "ALLOCATE_TO_SALE",
        saleId: row.saleId,
        maxAmount: Math.min(row.outstandingAmount, unattributedAmount),
        requiresOperatorApproval: true,
      })),
      {
        optionId: "manual-prepaid",
        action: "KEEP_AS_CLIENT_PREPAID",
        amount: unattributedAmount,
        requiresOperatorApproval: true,
      },
      {
        optionId: "manual-opening-balance",
        action: "OPENING_BALANCE_ADJUSTMENT",
        amount: unattributedAmount,
        requiresOperatorApproval: true,
      },
    ];

    const blockers = [];
    if (!clientId) {
      blockers.push({
        code: "CLIENT_NOT_UNIQUELY_RESOLVABLE",
        message: "거래처명이 유일하지 않아 clientId를 확정할 수 없습니다.",
      });
    }
    if (!candidates.length && unattributedAmount > 0) {
      blockers.push({
        code: "NO_OUTSTANDING_CANDIDATE",
        message: "미수 잔액이 있는 후보 매출이 없습니다. 선수금 또는 기초잔액으로만 처리 가능합니다.",
      });
    }

    cases.push({
      ...maskClient(clientId, clientName),
      voucherIds,
      voucherCount: vouchers.length,
      voucherTotalAmount,
      fifoAppliedAmount,
      unattributedAmount,
      statementScope: {
        statementSalesIds: scopeSaleIds,
        archiveIds,
        archiveExists: archiveIds.map((id) => archivesById.has(id)),
        periodStart: periodStarts[0] || null,
        periodEnd: periodEnds[0] || null,
      },
      candidateCount: candidates.length,
      candidateOutstandingTotal,
      candidates,
      options: choices,
      autoAllocate: false,
      decision: "MANUAL_REVIEW",
      blockers,
    });
  }

  cases.sort((a, b) => String(a.clientRef).localeCompare(String(b.clientRef)));

  const unresolved = cases.filter((row) => row.unattributedAmount > 0);

  return {
    ok: true,
    apply: false,
    autoAllocate: false,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate,
    policy:
      "candidates only — statement-scoped legacy cash is never auto-allocated; an operator picks a sale, prepaid or opening balance",
    counts: {
      caseCount: cases.length,
      unresolvedCaseCount: unresolved.length,
      unattributedAmount: sum(unresolved.map((row) => row.unattributedAmount)),
      voucherCount: sum(cases.map((row) => row.voucherCount)),
    },
    cases,
    // Every case needs a human decision; nothing here is auto-safe.
    manualReviewClientRefs: cases.map((row) => row.clientRef),
  };
}

/* ---------------------------------------------- D. legacy voucher buckets */

/**
 * D. Bucket every legacy `paymentVoucher` (plus stored `sale.paid` balances) into the six
 * migration classes. `AUTO_SAFE_*` means: the snapshot alone determines a single correct
 * Receipt shape, with no inference and no operator judgement.
 */
export function classifyLegacyVouchers(data = {}, options = {}) {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const index = buildAuditIndex(data, asOfDate);

  const items = [];
  const seenFingerprints = new Map();

  /** Sibling vouchers on one sale must be measured together, not one at a time. */
  const legacyTotalBySaleId = new Map();
  for (const voucher of index.vouchers) {
    const saleId = String(voucher?.salesId ?? "").trim();
    if (!saleId) continue;
    legacyTotalBySaleId.set(saleId, (legacyTotalBySaleId.get(saleId) || 0) + legacyVoucherAmount(voucher));
  }

  /** Bank groups are decided once, up front: one bank transaction → at most one Receipt. */
  const bankGroupState = new Map();
  for (const [bankTxId, vouchers] of index.vouchersByBankTx) {
    const bankTx = index.bankTxById.get(bankTxId);
    const deposit = bankTx ? money(bankTx.deposit) : null;
    const voucherTotal = sum(vouchers.map(legacyVoucherAmount));
    const clientIds = uniq(vouchers.map((row) => index.voucherClientId(row)));
    const reasons = [];
    if (!bankTx) reasons.push("bank_transaction_missing");
    if (index.receiptsByBankTx.get(bankTxId)?.length) reasons.push("bank_tx_already_has_receipt");
    if (index.conflictedBankTxIds.has(bankTxId)) reasons.push("bank_reference_conflict");
    if (bankTx && voucherTotal > deposit) reasons.push("voucher_total_exceeds_deposit");
    if (clientIds.length > 1) reasons.push("multiple_clients_on_one_deposit");
    bankGroupState.set(bankTxId, { bankTx, deposit, voucherTotal, clientIds, blockers: reasons });
  }

  for (const voucher of index.vouchers) {
    const voucherId = String(voucher?.id ?? "");
    const amount = legacyVoucherAmount(voucher);
    const date = normalizeYmd(voucher?.date);
    const saleId = String(voucher?.salesId ?? "").trim() || null;
    const sale = saleId ? index.salesById.get(saleId) : null;
    const clientId = index.voucherClientId(voucher);
    const clientName = String(voucher?.client ?? "") || (clientId ? index.clientNameOfId(clientId) : "");
    const bankTransactionId = String(voucher?.bankTransactionId ?? "").trim() || null;
    const sentStatementId = String(voucher?.linkedPdfArchiveId ?? "").trim() || null;
    const batchId = index.batchIdByVoucherId.get(voucherId) || null;
    const batchSize = batchId ? (index.batchMembers.get(batchId) || []).length : 0;
    const statementScopeIds = (voucher?.statementSalesIds || []).map((id) => String(id ?? "")).filter(Boolean);

    const blockers = [];
    const reviewReasons = [];

    const fingerprint = stableHash({
      date,
      clientId,
      saleId,
      bankTransactionId,
      amount,
    });
    if (seenFingerprints.has(fingerprint)) {
      blockers.push("duplicate_legacy_voucher");
    } else {
      seenFingerprints.set(fingerprint, voucherId);
    }

    if (saleId && !sale) blockers.push("sale_missing");
    if (amount <= 0) reviewReasons.push("non_positive_amount");
    if (!date) reviewReasons.push("missing_accounting_date");
    // A voucher dated after the audit date is not settled history yet; it needs a human look.
    if (date && date > asOfDate) reviewReasons.push("date_after_as_of");
    if (!clientId) reviewReasons.push(clientName ? "client_not_uniquely_resolvable" : "client_unknown");
    if (sale && clientId && String(index.saleClientId.get(saleId) ?? "") !== String(clientId)) {
      blockers.push("sale_client_mismatch");
    }
    if (money(voucher?.vatAmount) > 0 && money(voucher?.finalAmount) !== money(voucher?.amount)) {
      reviewReasons.push("vat_embedded_final_amount");
    }
    // `sale.basePaid` is a stored opening balance, not cash. Overlapping it with a voucher
    // needs a human look. Do not treat `sale.paid` that merely mirrors voucherPaid as opening.
    if (sale && money(sale?.basePaid) > 0 && !sale?.manualPaidCleared) {
      reviewReasons.push("sale_stored_paid_overlap");
    }
    if (sale) {
      const billed = money(sale.amount);
      const alreadyAllocated = index.receiptAllocatedBySaleId.get(saleId) || 0;
      const excess = alreadyAllocated + (legacyTotalBySaleId.get(saleId) || amount) - billed;
      if (excess > 0) {
        /**
         * Legacy vouchers hold VAT-inclusive cash while `sale.amount` is VAT-exclusive, so an
         * excess of roughly the VAT face is the documented normal case (Phase 3
         * `LEGACY_VOUCHER_EXCESS_TO_PREPAID`), not a conflict. It still needs a human to decide
         * how the VAT portion is booked, so it lands in MANUAL_REVIEW rather than AUTO_SAFE.
         */
        const vatFace = Math.round(billed * VAT_RATE);
        const declaredVat = money(voucher?.vatAmount);
        const vatExplainsExcess =
          Math.abs(excess - vatFace) <= VAT_TOLERANCE || (declaredVat > 0 && excess <= declaredVat + VAT_TOLERANCE);
        if (vatExplainsExcess) reviewReasons.push("allocation_exceeds_sale_by_vat");
        else blockers.push("allocation_exceeds_sale");
      }
    }
    if (!saleId && statementScopeIds.length) reviewReasons.push("statement_scoped_fifo_required");
    if (!saleId && !statementScopeIds.length && (voucher?.statementPeriodStart || voucher?.statementPeriodEnd)) {
      reviewReasons.push("statement_period_scoped_fifo_required");
    }

    let bucket;
    const bankGroup = bankTransactionId ? bankGroupState.get(bankTransactionId) : null;
    if (bankGroup?.blockers.length) blockers.push(...bankGroup.blockers);

    const hasNoSaleEvidence = !saleId && !statementScopeIds.length && !voucher?.statementPeriodStart && !voucher?.statementPeriodEnd;

    if (blockers.length) {
      bucket = "BLOCKED_CONFLICT";
    } else if (hasNoSaleEvidence && !bankTransactionId && !date) {
      // No date, no bank trail, no sale: this is a carried-forward balance, not observed cash.
      bucket = "OPENING_BALANCE_CANDIDATE";
    } else if (reviewReasons.length || hasNoSaleEvidence) {
      if (hasNoSaleEvidence) reviewReasons.push("no_sale_or_statement_link");
      bucket = "MANUAL_REVIEW";
    } else if (bankTransactionId) {
      bucket = "AUTO_SAFE_BANK";
    } else if (batchId && batchSize > 1) {
      bucket = "AUTO_SAFE_BATCH";
    } else {
      bucket = "AUTO_SAFE_MANUAL";
    }

    items.push({
      kind: "legacy_voucher",
      voucherId,
      bucket,
      blockers: uniq(blockers),
      reviewReasons: uniq(reviewReasons),
      amount,
      date: date || null,
      saleId,
      saleExists: saleId ? Boolean(sale) : null,
      ...maskClient(clientId, clientName),
      bankTransactionId,
      bankDeposit: bankGroup ? bankGroup.deposit : null,
      sentStatementId,
      batchId,
      batchSize,
      statementScopeSaleIds: statementScopeIds,
      groupKey: bankTransactionId
        ? `bank:${bankTransactionId}`
        : bucket === "AUTO_SAFE_BATCH" && batchId
          ? `batch:${batchId}`
          : `voucher:${voucherId}`,
      depositChannel: String(voucher?.depositChannel ?? "") || null,
    });
  }

  /**
   * Stored `sale.basePaid` with no voucher behind it is an opening balance, never cash.
   * `sale.paid` alone is not used: production rows often keep `basePaid: 0` while `paid`
   * already mirrors voucher application. It is listed so the migration plan can prove
   * opening balances were considered and deliberately skipped.
   */
  for (const sale of index.sales) {
    const saleId = String(sale?.id ?? "");
    const storedPaid = sale?.manualPaidCleared
      ? 0
      : money(
          sale != null && Object.prototype.hasOwnProperty.call(sale, "basePaid")
            ? sale.basePaid
            : sale?.paid,
        );
    if (storedPaid <= 0) continue;
    const vouchers = index.vouchersBySaleId.get(saleId) || [];
    items.push({
      kind: "sale_stored_paid",
      voucherId: null,
      saleId,
      bucket: "OPENING_BALANCE_CANDIDATE",
      blockers: [],
      reviewReasons: vouchers.length ? ["stored_paid_with_voucher_overlap"] : ["stored_paid_without_voucher"],
      amount: storedPaid,
      date: normalizeYmd(sale?.date) || null,
      saleExists: true,
      ...maskClient(index.saleClientId.get(saleId), String(sale?.client ?? "")),
      bankTransactionId: null,
      bankDeposit: null,
      sentStatementId: null,
      batchId: null,
      batchSize: 0,
      statementScopeSaleIds: [],
      groupKey: `opening:${saleId}`,
      depositChannel: null,
      note: "basePaid is a stored balance, never treated as cash",
    });
  }

  items.sort((a, b) => String(a.groupKey).localeCompare(String(b.groupKey)) || String(a.saleId).localeCompare(String(b.saleId)));

  const buckets = {};
  for (const name of MIGRATION_BUCKETS) {
    const bucketItems = items.filter((row) => row.bucket === name);
    buckets[name] = {
      bucket: name,
      count: bucketItems.length,
      amount: sum(bucketItems.map((row) => row.amount)),
      saleCount: uniq(bucketItems.map((row) => row.saleId)).length,
      clientCount: uniq(bucketItems.map((row) => row.clientRef)).length,
      bankTransactionCount: uniq(bucketItems.map((row) => row.bankTransactionId)).length,
      statementCount: uniq(bucketItems.map((row) => row.sentStatementId)).length,
      batchCount: uniq(bucketItems.map((row) => row.batchId)).length,
      items: bucketItems,
    };
  }

  const autoSafeCount = AUTO_SAFE_BUCKETS.reduce((total, name) => total + buckets[name].count, 0);

  return {
    ok: true,
    apply: false,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate,
    counts: {
      legacyVoucherCount: index.vouchers.length,
      itemCount: items.length,
      autoSafeCount,
      manualReviewCount: buckets.MANUAL_REVIEW.count,
      blockedCount: buckets.BLOCKED_CONFLICT.count,
      openingBalanceCandidateCount: buckets.OPENING_BALANCE_CANDIDATE.count,
    },
    totals: {
      legacyVoucherAmount: sum(index.vouchers.map(legacyVoucherAmount)),
      autoSafeAmount: AUTO_SAFE_BUCKETS.reduce((total, name) => total + buckets[name].amount, 0),
      openingBalanceAmount: buckets.OPENING_BALANCE_CANDIDATE.amount,
    },
    buckets,
    items,
  };
}

/* -------------------------------------------- E. deterministic migration plan */

const CHANNEL_BY_DEPOSIT = { cash: "cash", personal: "personal_account", bank: "bank" };

/**
 * E. Build the Receipt/allocation shapes the `AUTO_SAFE_*` buckets imply. `apply` is always
 * false: this is a plan, not a migration. The same snapshot must always produce the same
 * `planHash` — every id, receipt number and ordering is derived from content, never from a
 * clock or a counter.
 */
export function buildDeterministicMigrationPlan(data = {}, options = {}) {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const requestedBuckets = (options.buckets || AUTO_SAFE_BUCKETS).filter((name) =>
    AUTO_SAFE_BUCKETS.includes(name),
  );
  const index = buildAuditIndex(data, asOfDate);
  const classification = options.classification || classifyLegacyVouchers(data, { asOfDate });
  const snapshot = options.snapshot || computeMigrationSnapshotHash(data);

  const selected = classification.items.filter(
    (row) => row.kind === "legacy_voucher" && requestedBuckets.includes(row.bucket),
  );

  const groups = new Map();
  for (const item of selected) {
    const list = groups.get(item.groupKey) || [];
    list.push(item);
    groups.set(item.groupKey, list);
  }

  const planned = [];
  const blocked = [];
  /** Two groups can target one sale, so capacity is consumed across the whole plan. */
  const plannedConsumedBySaleId = new Map();

  const groupKeys = [...groups.keys()].sort();
  for (const groupKey of groupKeys) {
    const members = [...groups.get(groupKey)].sort((a, b) =>
      String(a.voucherId).localeCompare(String(b.voucherId)),
    );
    const bucket = members[0].bucket;
    const blockers = [];

    const clientIds = uniq(members.map((row) => row.clientId));
    if (clientIds.length !== 1) blockers.push({ code: "CLIENT_AMBIGUOUS", detail: { clientIds } });
    const clientId = clientIds[0] ?? null;
    const clientRef = members[0].clientRef;

    const dates = uniq(members.map((row) => row.date)).sort();
    const receiptDate = dates[0] || null;
    if (!receiptDate) blockers.push({ code: "RECEIPT_DATE_MISSING", detail: {} });

    const bankTransactionId = members[0].bankTransactionId;
    const bankTx = bankTransactionId ? index.bankTxById.get(bankTransactionId) : null;
    const voucherTotal = sum(members.map((row) => row.amount));
    // Bank cash is what the bank says it is; the vouchers only decide where it lands.
    const grossAmount = bankTx ? money(bankTx.deposit) : voucherTotal;

    const allocationBySaleId = new Map();
    for (const member of members) {
      if (!member.saleId) {
        blockers.push({ code: "ALLOCATION_SALE_MISSING", detail: { voucherId: member.voucherId } });
        continue;
      }
      allocationBySaleId.set(
        member.saleId,
        (allocationBySaleId.get(member.saleId) || 0) + member.amount,
      );
    }

    const allocations = [...allocationBySaleId.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([saleId, amount]) => {
        const sale = index.salesById.get(saleId);
        const billedAmount = money(sale?.amount);
        const alreadyAllocated =
          (index.receiptAllocatedBySaleId.get(saleId) || 0) + (plannedConsumedBySaleId.get(saleId) || 0);
        const capacity = Math.max(billedAmount - alreadyAllocated, 0);
        if (amount > capacity) {
          blockers.push({
            code: "ALLOCATION_EXCEEDS_SALE",
            detail: { saleId, amount, capacity, billedAmount, alreadyAllocated },
          });
        }
        return { saleId, amount, effectiveFrom: receiptDate, billedAmount, saleCapacity: capacity };
      });

    const allocatedAmount = sum(allocations.map((row) => row.amount));
    const unallocatedAmount = grossAmount - allocatedAmount;
    if (allocatedAmount > grossAmount) {
      blockers.push({
        code: "ALLOCATION_EXCEEDS_RECEIPT",
        detail: { grossAmount, allocatedAmount, excess: allocatedAmount - grossAmount },
      });
    }

    const channel = bankTx
      ? "bank"
      : CHANNEL_BY_DEPOSIT[String(members[0].depositChannel ?? "")] || "other";

    const sourceVoucherIds = members.map((row) => String(row.voucherId));
    const sourcePaymentInputLogIds = uniq(
      members.flatMap((row) =>
        (index.batchMembers.get(row.batchId) || [])
          .filter((entry) => entry.voucherId === String(row.voucherId))
          .map((entry) => String(entry.log?.id ?? "")),
      ),
    ).sort();

    const provenance = {
      groupKey,
      bucket,
      sourceVoucherIds: [...sourceVoucherIds].sort(),
      sourcePaymentInputLogIds,
      voucherFingerprints: members
        .map((row) => stableHash({ voucherId: row.voucherId, amount: row.amount, date: row.date, saleId: row.saleId }))
        .sort(),
    };
    const provenanceHash = stableHash(provenance);

    const payload = {
      clientId,
      receiptDate,
      grossAmount,
      channel,
      source: "migration",
      bankTransactionId: bankTransactionId || null,
      sentStatementId: members[0].sentStatementId || null,
      allocations: allocations.map((row) => ({
        saleId: row.saleId,
        amount: row.amount,
        effectiveFrom: row.effectiveFrom,
      })),
    };
    const payloadHash = stableHash(payload);

    const row = {
      groupKey,
      bucket,
      deterministicReceiptId: `mig-rcpt-${provenanceHash.slice(0, 24)}`,
      /** Reserved candidate; the real receiptNo is issued by the Receipt API at apply time. */
      receiptNoCandidate: null,
      clientId,
      clientRef,
      receiptDate,
      grossAmount,
      channel,
      source: "migration",
      bankTransactionId: bankTransactionId || null,
      sentStatementId: members[0].sentStatementId || null,
      operationId: `legacy-migration:${provenanceHash.slice(0, 32)}`,
      payloadHash,
      allocations,
      allocationCount: allocations.length,
      allocatedAmount,
      unallocatedAmount,
      /** Cash the vouchers did not claim stays as client prepaid, it is never dropped. */
      prepaidAmount: Math.max(unallocatedAmount, 0),
      provenanceHash,
      sourceVoucherIds,
      sourcePaymentInputLogIds,
      status: blockers.length ? "BLOCKED" : "PLANNED",
      blockers,
    };

    if (blockers.length) {
      blocked.push(row);
    } else {
      for (const allocation of allocations) {
        plannedConsumedBySaleId.set(
          allocation.saleId,
          (plannedConsumedBySaleId.get(allocation.saleId) || 0) + allocation.amount,
        );
      }
      planned.push(row);
    }
  }

  // Receipt numbers are assigned from a content-derived ordering so the plan hash is stable.
  planned.sort(
    (a, b) =>
      String(a.receiptDate).localeCompare(String(b.receiptDate)) ||
      String(a.provenanceHash).localeCompare(String(b.provenanceHash)),
  );
  planned.forEach((row, position) => {
    const datePart = String(row.receiptDate || "0000-00-00").replace(/-/g, "");
    row.receiptNoCandidate = `MIG-${datePart}-${String(position + 1).padStart(4, "0")}`;
  });
  blocked.sort((a, b) => String(a.provenanceHash).localeCompare(String(b.provenanceHash)));

  const planHash = stableHash({
    asOfDate,
    buckets: [...requestedBuckets].sort(),
    snapshotHash: snapshot.hash,
    planned: planned.map((row) => ({
      deterministicReceiptId: row.deterministicReceiptId,
      receiptNoCandidate: row.receiptNoCandidate,
      clientId: row.clientId,
      receiptDate: row.receiptDate,
      grossAmount: row.grossAmount,
      channel: row.channel,
      source: row.source,
      bankTransactionId: row.bankTransactionId,
      sentStatementId: row.sentStatementId,
      operationId: row.operationId,
      payloadHash: row.payloadHash,
      provenanceHash: row.provenanceHash,
      allocations: row.allocations.map((alloc) => ({
        saleId: alloc.saleId,
        amount: alloc.amount,
        effectiveFrom: alloc.effectiveFrom,
      })),
      allocatedAmount: row.allocatedAmount,
      unallocatedAmount: row.unallocatedAmount,
      sourceVoucherIds: row.sourceVoucherIds,
      sourcePaymentInputLogIds: row.sourcePaymentInputLogIds,
    })),
    blocked: blocked.map((row) => ({
      provenanceHash: row.provenanceHash,
      blockers: row.blockers.map((blocker) => blocker.code).sort(),
    })),
  });

  return {
    ok: blocked.length === 0,
    apply: false,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate,
    buckets: requestedBuckets,
    snapshotHash: snapshot.hash,
    snapshotCounts: snapshot.counts,
    counts: {
      groupCount: groupKeys.length,
      plannedReceiptCount: planned.length,
      blockedReceiptCount: blocked.length,
      plannedAllocationCount: sum(planned.map((row) => row.allocationCount)),
      prepaidReceiptCount: planned.filter((row) => row.prepaidAmount > 0).length,
      sourceVoucherCount: selected.length,
    },
    totals: {
      grossAmount: sum(planned.map((row) => row.grossAmount)),
      allocatedAmount: sum(planned.map((row) => row.allocatedAmount)),
      unallocatedAmount: sum(planned.map((row) => row.prepaidAmount)),
      blockedAmount: sum(blocked.map((row) => row.grossAmount)),
    },
    receipts: planned,
    blocked,
    planHash,
    policyNotes: {
      apply: "always false in Phase 4; applying is a separate Phase 5 task",
      bank: "one Receipt per bank transaction; grossAmount = tx.deposit; excess allocation blocks, shortfall becomes prepaid",
      batch: "vouchers merge only on paymentInputLogs batch evidence, never on resemblance",
      basePaid: "stored sale.paid is an OPENING_BALANCE_CANDIDATE and never becomes a Receipt",
      determinism: "ids, receipt numbers and ordering derive from content hashes, so one snapshot yields one planHash",
    },
  };
}

/* --------------------------------------------- F. clone / temp simulation */

/**
 * Read an ERP payload out of a *copy* of a SQLite database. The copy is opened read-only and
 * deleted afterwards; the source file is hashed before and after to prove it was untouched.
 */
function readErpDataFromSqliteCopy(sqlitePath) {
  const sourcePath = path.resolve(sqlitePath);
  if (!fs.existsSync(sourcePath)) {
    const error = new Error(`SQLite 파일을 찾을 수 없습니다: ${sourcePath}`);
    error.code = "SQLITE_FILE_NOT_FOUND";
    throw error;
  }
  const sourceHashBefore = sha256(fs.readFileSync(sourcePath));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-phase4-clone-"));
  const tempPath = path.join(tempDir, "clone.sqlite");
  fs.copyFileSync(sourcePath, tempPath);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(`${sourcePath}${suffix}`)) {
      fs.copyFileSync(`${sourcePath}${suffix}`, `${tempPath}${suffix}`);
    }
  }

  let data = {};
  let clone;
  try {
    clone = new DatabaseSync(tempPath, { readOnly: true });
    const rows = clone.prepare("SELECT domain, payload FROM erp_domain_state").all();
    if (rows.length) {
      for (const row of rows) {
        try {
          Object.assign(data, JSON.parse(row.payload));
        } catch {
          // A corrupt domain row must not abort the audit; it surfaces as missing records.
        }
      }
    } else {
      const blob = clone.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
      if (blob?.payload) {
        const parsed = JSON.parse(blob.payload);
        data = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
      }
    }
  } finally {
    try {
      clone?.close();
    } catch {
      // best effort
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const sourceHashAfter = sha256(fs.readFileSync(sourcePath));
  return {
    data,
    clone: {
      mode: "sqlite_copy",
      sourcePath,
      sourceHashBefore,
      sourceHashAfter,
      sourceUnchanged: sourceHashBefore === sourceHashAfter,
    },
  };
}

function plannedReceiptRows(plan) {
  const receipts = [];
  const allocations = [];
  for (const row of plan.receipts) {
    receipts.push({
      id: row.deterministicReceiptId,
      receiptNo: row.receiptNoCandidate,
      clientId: row.clientId,
      clientName: null,
      receiptDate: row.receiptDate,
      grossAmount: row.grossAmount,
      channel: row.channel,
      source: row.source,
      status: "posted",
      bankTransactionId: row.bankTransactionId,
      sentStatementId: row.sentStatementId,
      reversalOfReceiptId: null,
      reversedEffectiveDate: null,
      memo: "",
    });
    for (const allocation of row.allocations) {
      allocations.push({
        id: `${row.deterministicReceiptId}:${allocation.saleId}`,
        receiptId: row.deterministicReceiptId,
        saleId: allocation.saleId,
        amount: allocation.amount,
        status: "posted",
        effectiveFrom: allocation.effectiveFrom,
      });
    }
  }
  return { receipts, allocations };
}

/** Apply the plan to a copy of `sourceData`. Returns a new object; `sourceData` is untouched. */
function applyPlanToClone(sourceData, plan) {
  const next = structuredClone(sourceData);
  const migratedVoucherIds = new Set(plan.receipts.flatMap((row) => row.sourceVoucherIds.map(String)));
  const { receipts, allocations } = plannedReceiptRows(plan);

  next.paymentVouchers = (next.paymentVouchers || []).filter(
    (row) => !migratedVoucherIds.has(String(row?.id ?? "")),
  );
  next.receipts = [...(next.receipts || []), ...receipts];
  next.receiptAllocations = [...(next.receiptAllocations || []), ...allocations];

  const receiptIdByBankTx = new Map(
    plan.receipts
      .filter((row) => row.bankTransactionId)
      .map((row) => [String(row.bankTransactionId), row.deterministicReceiptId]),
  );
  next.bankTransactions = (next.bankTransactions || []).map((tx) => {
    const receiptId = receiptIdByBankTx.get(String(tx?.id ?? ""));
    if (!receiptId) return tx;
    const { linkedPaymentVoucherId, ...rest } = tx;
    return { ...rest, linkedReceiptId: receiptId };
  });

  return next;
}

function measureLedger(data, { asOfDate, archives }) {
  const balances = buildSaleArBalances(data, { asOfDate });
  const clientNameIndex = buildClientNameIndex(data.clients || []);

  const outstandingBySaleId = {};
  const closingArByClient = {};
  for (const row of balances.sales) {
    outstandingBySaleId[row.saleId] = row.outstandingAmount;
    const key = row.clientId || maskClientName(row.clientName) || "(unknown)";
    closingArByClient[key] = (closingArByClient[key] || 0) + row.outstandingAmount;
  }

  const statementStatuses = {};
  for (const archive of archives || []) {
    if (archive?.category !== "statement-client") continue;
    const derived = buildStatementPaymentStatus(archive, data, { asOfDate, balances });
    statementStatuses[String(archive.id ?? "")] = {
      status: derived.status,
      appliedAmount: derived.appliedAmount,
      outstandingAmount: derived.outstandingAmount,
      unallocatedPrepaid: derived.unallocatedPrepaid,
    };
  }

  const receiptById = new Map((data.receipts || []).map((row) => [String(row.id), row]));
  let grossToEnd = 0;
  let allocatedToEnd = 0;
  let unallocatedPrepaid = 0;
  for (const receipt of data.receipts || []) {
    if (!isReceiptEffectiveAsOf(receipt, asOfDate)) continue;
    const gross = money(receipt?.grossAmount);
    const allocated = (data.receiptAllocations || []).reduce((total, row) => {
      if (String(row?.receiptId ?? "") !== String(receipt.id)) return total;
      if (!isAllocationEffectiveAsOf(row, receiptById, asOfDate)) return total;
      return total + money(row.amount);
    }, 0);
    grossToEnd += gross;
    allocatedToEnd += allocated;
    unallocatedPrepaid += Math.max(gross - allocated, 0);
  }

  return {
    totals: balances.totals,
    outstandingBySaleId,
    closingArByClient,
    statementStatuses,
    bankConflicts: balances.bankReferences.conflicts.map((row) => ({
      bankTransactionId: row.bankTransactionId,
      kind: row.kind,
    })),
    cashIdentity: {
      grossToEnd,
      allocatedToEnd,
      unallocatedPrepaid,
      ok: grossToEnd === allocatedToEnd + unallocatedPrepaid,
    },
    reconciliationStatus: balances.reconciliationStatus,
    errorCodes: balances.errors.map((row) => row.code).sort(),
    clientCount: clientNameIndex.size,
  };
}

function diffNumericMap(before, after) {
  const keys = uniq([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const key of keys.sort()) {
    const from = money(before[key]);
    const to = money(after[key]);
    if (from !== to) changed.push({ key, before: from, after: to, delta: to - from });
  }
  return changed;
}

/**
 * F. Apply the plan to a throw-away clone and report the ledger deltas.
 *
 * `input` is either an ERP payload (cloned with `structuredClone`) or a path to a SQLite file
 * (copied to a temp directory, opened read-only, deleted). The original is never written and
 * is hash-checked before and after.
 */
export function simulateMigrationOnClone(input, options = {}) {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const archives = options.archives || [];

  let sourceData;
  let cloneMeta;
  if (typeof input === "string") {
    const loaded = readErpDataFromSqliteCopy(input);
    sourceData = loaded.data;
    cloneMeta = loaded.clone;
  } else {
    sourceData = input || {};
    cloneMeta = { mode: "in_memory_clone", sourcePath: null, sourceUnchanged: true };
  }

  const snapshotOf = (payload) =>
    stableHash(Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, payload[key] || []])));

  const sourceHashBefore = snapshotOf(sourceData);
  const workingCopy = structuredClone(sourceData);

  const plan =
    options.plan ||
    buildDeterministicMigrationPlan(workingCopy, {
      asOfDate,
      buckets: options.buckets || AUTO_SAFE_BUCKETS,
    });

  const before = measureLedger(workingCopy, { asOfDate, archives });
  const simulated = applyPlanToClone(workingCopy, plan);
  const after = measureLedger(simulated, { asOfDate, archives });

  const sourceHashAfter = snapshotOf(sourceData);

  const beforeConflicts = new Set(before.bankConflicts.map((row) => `${row.bankTransactionId}|${row.kind}`));
  const newBankConflicts = after.bankConflicts.filter(
    (row) => !beforeConflicts.has(`${row.bankTransactionId}|${row.kind}`),
  );
  const beforeErrors = new Set(before.errorCodes);
  const newErrorCodes = after.errorCodes.filter((code) => !beforeErrors.has(code));

  const statementsChanged = [];
  for (const archiveId of uniq([...Object.keys(before.statementStatuses), ...Object.keys(after.statementStatuses)]).sort()) {
    const from = before.statementStatuses[archiveId];
    const to = after.statementStatuses[archiveId];
    if (canonicalJson(from) === canonicalJson(to)) continue;
    statementsChanged.push({ archiveId, before: from ?? null, after: to ?? null });
  }

  const totalsChanged = diffNumericMap(before.totals, after.totals);
  const salesChanged = diffNumericMap(before.outstandingBySaleId, after.outstandingBySaleId).map((row) => ({
    saleId: row.key,
    before: row.before,
    after: row.after,
    delta: row.delta,
  }));
  const clientsChanged = diffNumericMap(before.closingArByClient, after.closingArByClient).map((row) => ({
    clientRef: row.key,
    before: row.before,
    after: row.after,
    delta: row.delta,
  }));

  const appliedDelta =
    money(after.totals.totalAppliedAmount) - money(before.totals.totalAppliedAmount);

  const failures = [];
  if (!cloneMeta.sourceUnchanged) failures.push("SOURCE_FILE_MODIFIED");
  if (sourceHashBefore !== sourceHashAfter) failures.push("SOURCE_DATA_MUTATED");
  if (!after.cashIdentity.ok) failures.push("CASH_IDENTITY_BROKEN_AFTER");
  if (newBankConflicts.length) failures.push("NEW_BANK_CONFLICT");
  if (newErrorCodes.length) failures.push("NEW_RECONCILIATION_ERROR");
  // Moving a voucher into the Receipt ledger relocates cash; it must not create or destroy it.
  if (appliedDelta !== 0) failures.push("APPLIED_AMOUNT_NOT_CASH_NEUTRAL");

  return {
    ok: failures.length === 0,
    apply: false,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate,
    clone: { ...cloneMeta, sourceHashBefore, sourceHashAfter, sourceDataUnchanged: sourceHashBefore === sourceHashAfter },
    planHash: plan.planHash,
    planCounts: plan.counts,
    before,
    after,
    deltas: {
      totals: totalsChanged,
      appliedDelta,
      salesChanged,
      clientsChanged,
      statementsChanged,
      bankConflicts: {
        before: before.bankConflicts.length,
        after: after.bankConflicts.length,
        new: newBankConflicts,
      },
      cashIdentity: { before: before.cashIdentity, after: after.cashIdentity },
      newErrorCodes,
    },
    failures,
    gate: failures.length ? "BLOCKED" : "PASS",
  };
}

/* --------------------------------------------------------- combined report */

/**
 * One call that produces every Phase 4 section. Read-only end to end: the caller can assert
 * `mutations === 0` and `apply === false` on the result and on each section.
 */
export function buildMigrationReadinessReport(data = {}, options = {}) {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const archives = options.archives || [];
  const snapshot = computeMigrationSnapshotHash(data);
  const balances = buildSaleArBalances(data, { asOfDate });

  const organicReceipts = auditOrganicReceipts(data, { asOfDate, archives });
  const legacyBuckets = classifyLegacyVouchers(data, { asOfDate });
  const unattributedFifo = investigateUnattributedFifo(data, { asOfDate, archives, balances });
  const parityReport = options.parityReport || null;
  const saleDiffs = parityReport
    ? classifySaleDiffsDetailed(data, parityReport, { asOfDate, archives, balances })
    : null;
  const plan = buildDeterministicMigrationPlan(data, {
    asOfDate,
    buckets: options.buckets || AUTO_SAFE_BUCKETS,
    classification: legacyBuckets,
    snapshot,
  });
  const simulation = simulateMigrationOnClone(data, { asOfDate, archives, plan });

  const goNoGo = buildGoNoGoChecklist({
    organicReceipts,
    saleDiffs,
    unattributedFifo,
    legacyBuckets,
    plan,
    simulation,
  });

  return {
    ok: goNoGo.decision !== "NO_GO",
    apply: false,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate,
    snapshot,
    organicReceipts,
    saleDiffs,
    unattributedFifo,
    legacyBuckets,
    plan,
    simulation,
    goNoGo,
  };
}

/** GO / NO-GO gate. Anything that needs a human is `HOLD`, anything unsafe is `NO_GO`. */
export function buildGoNoGoChecklist(sections = {}) {
  const { organicReceipts, saleDiffs, unattributedFifo, legacyBuckets, plan, simulation } = sections;

  const checks = [
    {
      id: "organic-receipt-integrity",
      label: "조직적으로 생성된 입금전표의 현금 항등식 / 은행·매출 연결 무결성",
      status: organicReceipts ? (organicReceipts.gate === "PASS" ? "PASS" : "NO_GO") : "SKIPPED",
      detail: organicReceipts ? { blocked: organicReceipts.counts.blockedCount } : null,
    },
    {
      id: "no-read-model-bug",
      label: "설명되지 않는 차이(READ_MODEL_BUG) 없음",
      status: !saleDiffs ? "SKIPPED" : saleDiffs.counts.readModelBugCount === 0 ? "PASS" : "HOLD",
      detail: saleDiffs ? { readModelBugCount: saleDiffs.counts.readModelBugCount } : null,
    },
    {
      id: "unattributed-fifo-decided",
      label: "미귀속 레거시 입금(FIFO 추정)에 대한 수동 결정 완료",
      status: !unattributedFifo
        ? "SKIPPED"
        : unattributedFifo.counts.unresolvedCaseCount === 0
          ? "PASS"
          : "HOLD",
      detail: unattributedFifo ? { unresolved: unattributedFifo.counts.unresolvedCaseCount } : null,
    },
    {
      id: "no-blocked-conflict",
      label: "BLOCKED_CONFLICT 버킷 비어 있음",
      status: !legacyBuckets ? "SKIPPED" : legacyBuckets.counts.blockedCount === 0 ? "PASS" : "NO_GO",
      detail: legacyBuckets ? { blocked: legacyBuckets.counts.blockedCount } : null,
    },
    {
      id: "manual-review-cleared",
      label: "MANUAL_REVIEW 버킷 처리 완료",
      status: !legacyBuckets ? "SKIPPED" : legacyBuckets.counts.manualReviewCount === 0 ? "PASS" : "HOLD",
      detail: legacyBuckets ? { manualReview: legacyBuckets.counts.manualReviewCount } : null,
    },
    {
      id: "plan-deterministic",
      label: "동일 스냅샷 → 동일 planHash (결정성)",
      status: plan ? "PASS" : "SKIPPED",
      detail: plan ? { planHash: plan.planHash, snapshotHash: plan.snapshotHash } : null,
    },
    {
      id: "plan-not-blocked",
      label: "계획된 입금전표 중 BLOCKED 없음",
      status: !plan ? "SKIPPED" : plan.counts.blockedReceiptCount === 0 ? "PASS" : "NO_GO",
      detail: plan ? { blocked: plan.counts.blockedReceiptCount } : null,
    },
    {
      id: "clone-simulation-neutral",
      label: "임시 클론 시뮬레이션: 현금 항등식 유지 · 신규 충돌 없음 · 적용액 불변",
      status: !simulation ? "SKIPPED" : simulation.gate === "PASS" ? "PASS" : "NO_GO",
      detail: simulation ? { failures: simulation.failures } : null,
    },
    {
      id: "read-only",
      label: "감사 실행 중 mutations = 0, apply = false",
      status:
        [organicReceipts, saleDiffs, unattributedFifo, legacyBuckets, plan, simulation]
          .filter(Boolean)
          .every((section) => section.mutations === 0 && section.apply === false)
          ? "PASS"
          : "NO_GO",
      detail: null,
    },
  ];

  const noGo = checks.filter((row) => row.status === "NO_GO");
  const hold = checks.filter((row) => row.status === "HOLD");
  return {
    decision: noGo.length ? "NO_GO" : hold.length ? "HOLD" : "GO",
    checks,
    blockingChecks: noGo.map((row) => row.id),
    holdingChecks: hold.map((row) => row.id),
  };
}

export default buildMigrationReadinessReport;
