/**
 * Unified AR ledger cutover stabilization.
 *
 * Task ID: `ERP_UNIFIED_AR_LEDGER_CUTOVER_STABILIZATION_FINAL`
 *
 * Policy:
 * - Past legacy paymentVouchers / paymentInputLogs / basePaid stay forever (read-only).
 * - After `globalArLedgerCutoverAt`, every new cash event posts as Receipt/Allocation only.
 * - Phase 5 migration of the 1,286 legacy vouchers is discontinued; `--apply` stays refused.
 * - The only permitted financial-adjacent write in this module is a one-time stamp of
 *   cutover metadata onto `bankSyncMeta` (never mutates vouchers, logs, sales cash, receipts).
 */

import { createHash } from "node:crypto";
import { auditOrganicReceipts } from "./legacyReceiptMigrationAudit.mjs";
import { buildArParityReport, buildSaleArBalances, dedupeBankReferences } from "./unifiedArReadModel.mjs";

const CUTOVER_RECORDED_BY = "ar-ledger-cutover-stabilization";

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function asIso(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Canonical legacy dataset used for integrity hashing (order-independent). */
export function canonicalizeLegacyDataset(data = {}) {
  const vouchers = [...(data.paymentVouchers || [])]
    .map((row) => ({
      id: String(row?.id ?? ""),
      salesId: row?.salesId == null || row?.salesId === "" ? null : String(row.salesId),
      date: String(row?.date ?? ""),
      amount: money(row?.amount),
      finalAmount: money(row?.finalAmount ?? row?.amount),
      vatAmount: money(row?.vatAmount),
      bankTransactionId: row?.bankTransactionId ? String(row.bankTransactionId) : null,
      linkedPdfArchiveId: row?.linkedPdfArchiveId ? String(row.linkedPdfArchiveId) : null,
      depositChannel: row?.depositChannel ? String(row.depositChannel) : null,
      // client name intentionally omitted from the hash payload surface in reports;
      // include a length-only fingerprint so renames that keep the same rows still hash.
      clientNameLen: String(row?.client ?? "").length,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const logs = [...(data.paymentInputLogs || [])]
    .map((row) => ({
      id: String(row?.id ?? ""),
      paymentVoucherId: row?.paymentVoucherId == null ? null : String(row.paymentVoucherId),
      salesId: row?.salesId == null || row?.salesId === "" ? null : String(row.salesId),
      paymentDate: String(row?.paymentDate ?? ""),
      finalAmount: money(row?.finalAmount ?? row?.amount),
      createdAt: String(row?.createdAt ?? ""),
      clientNameLen: String(row?.client ?? "").length,
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.createdAt.localeCompare(b.createdAt));

  const basePaid = [...(data.sales || [])]
    .map((row) => ({
      saleId: String(row?.id ?? ""),
      basePaid: Object.prototype.hasOwnProperty.call(row || {}, "basePaid")
        ? money(row.basePaid)
        : null,
      paid: money(row?.paid),
      voucherPaid: money(row?.voucherPaid),
      manualPaidCleared: Boolean(row?.manualPaidCleared),
    }))
    .filter((row) => row.saleId)
    .sort((a, b) => a.saleId.localeCompare(b.saleId));

  return { vouchers, logs, basePaid };
}

export function computeLegacyDatasetHash(data = {}) {
  const canonical = canonicalizeLegacyDataset(data);
  return sha256Hex(stableStringify(canonical));
}

export function readBankReceiptCutoverAt(data = {}) {
  return asIso(data?.bankSyncMeta?.bankReceiptCutoverAt);
}

export function readGlobalArLedgerCutoverAt(data = {}) {
  return asIso(data?.bankSyncMeta?.globalArLedgerCutoverAt);
}

export function findFirstOrganicReceipt(data = {}) {
  const rows = [...(data.receipts || [])].filter((row) => String(row?.source || "") !== "migration");
  rows.sort((a, b) => {
    const aAt = String(a?.createdAt || a?.postedAt || a?.receiptDate || "");
    const bAt = String(b?.createdAt || b?.postedAt || b?.receiptDate || "");
    return aAt.localeCompare(bAt) || String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  const first = rows[0];
  if (!first) return null;
  return {
    receiptId: String(first.id || ""),
    receiptNo: String(first.receiptNo || ""),
    source: String(first.source || ""),
    channel: String(first.channel || ""),
    status: String(first.status || ""),
    receiptDate: String(first.receiptDate || ""),
    createdAt: asIso(first.createdAt || first.postedAt) || null,
  };
}

/**
 * Decide the permanent cutover instant from already-stored evidence only.
 * Prefer the existing `bankReceiptCutoverAt` (ops stamp). Never invent a new calendar day.
 */
export function decideGlobalArLedgerCutoverAt(data = {}) {
  const bankReceiptCutoverAt = readBankReceiptCutoverAt(data);
  const firstReceipt = findFirstOrganicReceipt(data);
  const firstReceiptCreatedAt = firstReceipt?.createdAt || null;

  if (!bankReceiptCutoverAt && !firstReceiptCreatedAt) {
    return {
      ok: false,
      globalArLedgerCutoverAt: null,
      reason: "no_bank_cutover_or_organic_receipt",
      evidence: { bankReceiptCutoverAt: null, firstReceipt: null },
    };
  }

  // Use the earlier of the two observed timestamps so every organic Receipt falls after cutover.
  let globalArLedgerCutoverAt = bankReceiptCutoverAt || firstReceiptCreatedAt;
  let basis = bankReceiptCutoverAt ? "bankReceiptCutoverAt" : "firstOrganicReceiptCreatedAt";
  if (bankReceiptCutoverAt && firstReceiptCreatedAt && firstReceiptCreatedAt < bankReceiptCutoverAt) {
    globalArLedgerCutoverAt = firstReceiptCreatedAt;
    basis = "firstOrganicReceiptCreatedAt";
  }

  return {
    ok: true,
    globalArLedgerCutoverAt,
    basis,
    evidence: {
      bankReceiptCutoverAt,
      firstReceipt,
      firstReceiptCreatedAt,
      decision:
        "CTO: preserve 1,286 legacy vouchers forever; Receipt ledger is authoritative for all new cash after the recorded cutover.",
    },
  };
}

/**
 * One-time metadata stamp. Returns stamped:false when already present.
 * Caller must persist `nextData` if stamped:true. Does not mutate vouchers/logs/sales/receipts.
 */
export function stampGlobalArLedgerCutoverMetadata(data = {}, options = {}) {
  const existing = readGlobalArLedgerCutoverAt(data);
  if (existing) {
    return {
      stamped: false,
      globalArLedgerCutoverAt: existing,
      data,
      meta: data.bankSyncMeta || {},
    };
  }

  const decision = decideGlobalArLedgerCutoverAt(data);
  if (!decision.ok) {
    return {
      stamped: false,
      globalArLedgerCutoverAt: null,
      data,
      error: decision.reason,
      evidence: decision.evidence,
    };
  }

  const recordedAt = asIso(options.recordedAt) || new Date().toISOString();
  const recordedBy = String(options.recordedBy || CUTOVER_RECORDED_BY);
  const legacyDatasetHash = computeLegacyDatasetHash(data);
  const prevMeta = data.bankSyncMeta && typeof data.bankSyncMeta === "object" ? data.bankSyncMeta : {};
  const nextMeta = {
    ...prevMeta,
    globalArLedgerCutoverAt: decision.globalArLedgerCutoverAt,
    globalArLedgerCutoverBasis: decision.basis,
    globalArLedgerCutoverRecordedAt: recordedAt,
    globalArLedgerCutoverRecordedBy: recordedBy,
    globalArLedgerCutoverEvidence: decision.evidence,
    legacyDatasetHashAtCutover: legacyDatasetHash,
    migrationPolicy: "DISCONTINUED_PRESERVE_LEGACY_READ_ONLY",
    legacyPaymentPolicy: "READ_ONLY_FOREVER",
  };

  return {
    stamped: true,
    globalArLedgerCutoverAt: decision.globalArLedgerCutoverAt,
    legacyDatasetHashAtCutover: legacyDatasetHash,
    data: { ...data, bankSyncMeta: nextMeta },
    meta: nextMeta,
  };
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows || []) {
    const key = keyFn(row) || "(unknown)";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/**
 * Read-only cutover health report for admin diagnostics.
 * Never mutates customer financial rows.
 */
export function buildArLedgerCutoverHealthReport(data = {}, options = {}) {
  const generatedAt = new Date().toISOString();
  const cutoverAt = readGlobalArLedgerCutoverAt(data);
  const decision = decideGlobalArLedgerCutoverAt(data);
  const legacyDatasetHash = computeLegacyDatasetHash(data);
  const hashAtCutover = String(data?.bankSyncMeta?.legacyDatasetHashAtCutover || "");
  const hashMatchesCutover = hashAtCutover ? hashAtCutover === legacyDatasetHash : null;

  const organic = auditOrganicReceipts(data, {
    asOfDate: options.asOfDate,
    archives: options.archives || [],
  });
  const balances = buildSaleArBalances(data, { asOfDate: options.asOfDate });
  const bankRefs = dedupeBankReferences(data, { asOfDate: options.asOfDate });
  const parity = options.includeParity
    ? buildArParityReport(data, { asOfDate: options.asOfDate, archives: options.archives || [] })
    : null;

  const receipts = data.receipts || [];
  const allocations = data.receiptAllocations || [];
  const vouchers = data.paymentVouchers || [];
  const logs = data.paymentInputLogs || [];

  const organicBlocked = Number(organic.counts?.blockedCount || 0);
  const cashIdentityViolationCount = Number(organic.counts?.cashIdentityBrokenCount || 0);
  const duplicateReceiptCount = (organic.receipts || []).filter((row) =>
    (row.blockers || []).some((b) => b.code === "BANK_DUPLICATE_RECEIPT"),
  ).length;
  const bankGrossMismatchCount = (organic.receipts || []).filter((row) =>
    (row.blockers || []).some((b) => b.code === "BANK_DEPOSIT_MISMATCH"),
  ).length;
  const missingSaleAllocationCount = (organic.receipts || []).filter((row) =>
    (row.blockers || []).some((b) => b.code === "ALLOCATION_SALE_MISSING"),
  ).length;
  const clientMismatchCount = (organic.receipts || []).filter((row) =>
    (row.blockers || []).some((b) => b.code === "ALLOCATION_CLIENT_MISMATCH"),
  ).length;

  const currentBankConflictCount = Number(bankRefs.conflicts?.length || 0);
  const crossScreenBalanceDiffCount = parity ? Number(parity.sales?.length || 0) : null;

  const migrationConflictIsolation = {
    note: "Phase 4 BLOCKED_CONFLICT / MANUAL_REVIEW counts describe migration risk only; they are not applied and must not drive end-user UI warnings.",
    migrationApply: false,
    migrationDiscontinued: true,
    // Counts are optional; callers may attach the last Phase 4 snapshot.
    blockedConflictCount: options.migrationBlockedConflictCount ?? null,
    manualReviewCount: options.migrationManualReviewCount ?? null,
    currentOpsBankConflictCount: currentBankConflictCount,
  };

  const blockers = [];
  if (!cutoverAt) blockers.push("CUTOVER_METADATA_MISSING");
  if (hashMatchesCutover === false) blockers.push("LEGACY_DATASET_HASH_MISMATCH");
  if (currentBankConflictCount > 0) blockers.push("CURRENT_BANK_CONFLICT");
  if (cashIdentityViolationCount > 0) blockers.push("CASH_IDENTITY_VIOLATION");
  if (duplicateReceiptCount > 0) blockers.push("DUPLICATE_BANK_RECEIPT");
  if (missingSaleAllocationCount > 0) blockers.push("MISSING_SALE_ALLOCATION");
  if (clientMismatchCount > 0) blockers.push("CLIENT_MISMATCH");
  if (crossScreenBalanceDiffCount != null && crossScreenBalanceDiffCount > 0) {
    blockers.push("CROSS_SCREEN_BALANCE_DIFF");
  }

  let status = "HEALTHY";
  if (blockers.length) status = blockers.includes("LEGACY_DATASET_HASH_MISMATCH") ? "BLOCKED" : "WARNING";
  if (
    blockers.includes("CURRENT_BANK_CONFLICT") ||
    blockers.includes("CASH_IDENTITY_VIOLATION") ||
    blockers.includes("DUPLICATE_BANK_RECEIPT") ||
    blockers.includes("LEGACY_DATASET_HASH_MISMATCH")
  ) {
    status = "BLOCKED";
  }
  if (!cutoverAt) status = "WARNING";

  return {
    ok: status === "HEALTHY",
    apply: false,
    mutations: 0,
    generatedAt,
    status,
    blockers,
    globalArLedgerCutoverAt: cutoverAt,
    cutoverDecision: decision,
    cutoverMeta: {
      basis: data?.bankSyncMeta?.globalArLedgerCutoverBasis || null,
      recordedAt: data?.bankSyncMeta?.globalArLedgerCutoverRecordedAt || null,
      recordedBy: data?.bankSyncMeta?.globalArLedgerCutoverRecordedBy || null,
      migrationPolicy: data?.bankSyncMeta?.migrationPolicy || "DISCONTINUED_PRESERVE_LEGACY_READ_ONLY",
      legacyPaymentPolicy: data?.bankSyncMeta?.legacyPaymentPolicy || "READ_ONLY_FOREVER",
    },
    legacy: {
      voucherCount: vouchers.length,
      paymentInputLogCount: logs.length,
      datasetHash: legacyDatasetHash,
      datasetHashAtCutover: hashAtCutover || null,
      hashMatchesCutover,
      newLegacyVoucherWriteCount: 0,
      newLegacyLogWriteCount: 0,
      legacyRowMutationDetected: hashMatchesCutover === false,
    },
    receipts: {
      receiptCount: receipts.length,
      allocationCount: allocations.length,
      bySource: countBy(receipts, (row) => String(row?.source || "")),
      byChannel: countBy(receipts, (row) => String(row?.channel || "")),
    },
    organicReceiptAudit: {
      gate: organic.gate,
      blockedCount: organicBlocked,
      cashIdentityViolationCount,
      duplicateReceiptCount,
      bankGrossMismatchCount,
      missingSaleAllocationCount,
      clientMismatchCount,
    },
    currentBankConflictCount,
    crossScreenBalanceDiffCount,
    balances: {
      saleCount: balances.totals?.saleCount ?? 0,
      billedAmount: balances.totals?.billedAmount ?? 0,
      totalAppliedAmount: balances.totals?.totalAppliedAmount ?? 0,
      outstandingAmount: balances.totals?.outstandingAmount ?? 0,
      receiptAllocatedAmount: balances.totals?.receiptAllocatedAmount ?? 0,
      legacyAppliedAmount: balances.totals?.legacyAppliedAmount ?? 0,
    },
    migrationConflictIsolation,
    lastHealthyAt: status === "HEALTHY" ? generatedAt : data?.bankSyncMeta?.lastArCutoverHealthyAt || null,
  };
}

export const AR_LEDGER_CUTOVER_RECORDED_BY = CUTOVER_RECORDED_BY;
