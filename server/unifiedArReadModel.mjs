/**
 * Phase 3 Unified AR server read model.
 *
 * The accounting logic lives in `src/utils/unifiedArReadModel.ts` so the server and the
 * browser share one implementation. This module is the server-facing surface: it binds the
 * shared read model to ERP state slices and adds the read-only parity report.
 *
 * Nothing in this file writes. Every function is safe to call from a GET route.
 */

import {
  applyUnifiedArBalancesToSales,
  buildClientArSummary as buildClientArSummaryShared,
  buildPrepaidByClientName,
  buildSaleArBalances as buildSaleArBalancesShared,
  buildStatementPaymentStatus as buildStatementPaymentStatusShared,
  dedupeBankReferences as dedupeBankReferencesShared,
  dedupeStatementSaleIdsAcrossVersions,
  indexSaleArBalances,
  isAllocationEffectiveAsOf as isAllocationEffectiveAsOfShared,
  isReceiptEffectiveAsOf,
  normalizeYmd,
  statementPaymentStatusToArchiveCache,
  todaySeoulYmd,
  unifiedArMoney,
  UNIFIED_AR_DUE_DAYS,
} from "../src/utils/unifiedArReadModel.ts";
import { applyPaymentVouchers } from "../src/utils/applyPaymentVouchers.ts";
import { buildEffectivePaymentVouchers } from "./receiptProjection.mjs";
import { buildClientArSubledger } from "./receiptArSubledger.mjs";

export {
  applyUnifiedArBalancesToSales,
  buildPrepaidByClientName,
  dedupeStatementSaleIdsAcrossVersions,
  indexSaleArBalances,
  isReceiptEffectiveAsOf,
  statementPaymentStatusToArchiveCache,
  todaySeoulYmd,
  UNIFIED_AR_DUE_DAYS,
};

/** Shared as-of allocation rule; parity with server/receipts.mjs is asserted in tests. */
export const isUnifiedAllocationEffectiveAsOf = isAllocationEffectiveAsOfShared;

export function buildSaleArBalances(data = {}, options = {}) {
  return buildSaleArBalancesShared(data, options);
}

export function buildClientArSummary(data = {}, options = {}) {
  return buildClientArSummaryShared(data, options);
}

export function buildStatementPaymentStatus(archive = {}, data = {}, options = {}) {
  return buildStatementPaymentStatusShared(archive, data, options);
}

export function dedupeBankReferences(data = {}, options = {}) {
  return dedupeBankReferencesShared(data, options);
}

/**
 * Client ledger for the Phase 3 UI: unified header numbers plus the as-of Receipt
 * subledger rows, so the UI never has to invent a formula.
 */
export function buildUnifiedClientLedger(data = {}, { clientId, startDate, endDate } = {}) {
  const summary = buildClientArSummaryShared(data, { clientId, startDate, endDate });
  const subledger = buildClientArSubledger(data, {
    clientId,
    startDate: summary.startDate || undefined,
    endDate: summary.endDate,
  });
  const balances = buildSaleArBalancesShared(data, { asOfDate: summary.endDate });
  const byId = indexSaleArBalances(balances);

  const sales = subledger.sales.map((row) => {
    const unified = byId.get(String(row.saleId));
    return {
      ...row,
      legacyAppliedAmount: unified?.legacyAppliedAmount ?? 0,
      receiptAllocatedAmount: unified?.receiptAllocatedAmount ?? row.allocatedAmount ?? 0,
      totalAppliedAmount: unified?.totalAppliedAmount ?? row.allocatedAmount ?? 0,
      outstandingAmount: unified?.outstandingAmount ?? row.balance ?? 0,
      paymentStatus: unified?.paymentStatus ?? "unpaid",
      sourceLedger: unified?.sourceLedger ?? "none",
    };
  });

  return {
    ...summary,
    sales,
    receipts: subledger.receipts,
    policyNotes: {
      ...subledger.policyNotes,
      unifiedAr:
        "openingAr/closingAr = billed - (effective receipt allocations + non-duplicated legacy vouchers)",
      legacyVouchers: "legacy paymentVouchers count only when their bank transaction has no effective Receipt",
      overdueAr: `display-only aging: outstanding of sales dated on or before endDate - ${UNIFIED_AR_DUE_DAYS} days`,
      adjustments: "not implemented (always 0)",
      statementCache: "pdfArchive.paymentStatus is a display cache; derived status is authoritative",
    },
  };
}

/* ------------------------------------------------------------ parity report */

const DIFF_CLASSES = [
  "bank_dedupe",
  "legacy_unattributed_fifo",
  "asof_projection",
  "overpay_clamp",
  "unknown",
];

function classifySaleDiff({ row, legacyPaid, unifiedApplied, suppressedSaleIds, fifoSaleIds }) {
  if (suppressedSaleIds.has(row.saleId)) return "bank_dedupe";
  if (fifoSaleIds.has(row.saleId)) return "legacy_unattributed_fifo";
  if (unifiedApplied > row.billedAmount && legacyPaid === row.billedAmount) return "overpay_clamp";
  if (legacyPaid !== unifiedApplied) return "asof_projection";
  return "unknown";
}

/**
 * Read-only comparison of the legacy `applyPaymentVouchers` view against the Unified AR
 * read model, by sale / client / month / statement / bank. Performs zero mutations.
 */
export function buildArParityReport(data = {}, options = {}) {
  const asOfDate = normalizeYmd(options.asOfDate, todaySeoulYmd());
  const archives = Array.isArray(options.archives) ? options.archives : [];
  const sales = data.sales || [];

  const effectiveVouchers = buildEffectivePaymentVouchers(data);
  const legacyView = applyPaymentVouchers(sales, effectiveVouchers);
  const legacyPaidBySaleId = new Map(
    legacyView.sales.map((row) => [String(row.id), unifiedArMoney(row.paid)]),
  );

  const balances = buildSaleArBalancesShared(data, { asOfDate });
  const suppressedSaleIds = new Set(
    (data.paymentVouchers || [])
      .filter((row) => balances.suppressedLegacyByBankReceipt.voucherIds.includes(String(row?.id ?? "")))
      .map((row) => String(row?.salesId ?? ""))
      .filter(Boolean),
  );
  const fifoClientNames = new Set(balances.unattributedLegacy.map((row) => row.clientName));
  const fifoSaleIds = new Set(
    sales.filter((row) => fifoClientNames.has(String(row?.client ?? ""))).map((row) => String(row?.id ?? "")),
  );

  const saleDiffs = [];
  const byClient = new Map();
  const byMonth = new Map();

  for (const row of balances.sales) {
    const legacyPaid = legacyPaidBySaleId.get(row.saleId) ?? 0;
    const unifiedPaid = Math.min(row.totalAppliedAmount, row.billedAmount);
    const clientKey = row.clientName || row.clientId || "(unknown)";
    const monthKey = row.saleDate ? row.saleDate.slice(0, 7) : "(no-date)";

    const clientBucket = byClient.get(clientKey) || { clientName: clientKey, legacyPaid: 0, unifiedPaid: 0, billed: 0, diffCount: 0 };
    clientBucket.legacyPaid += legacyPaid;
    clientBucket.unifiedPaid += unifiedPaid;
    clientBucket.billed += row.billedAmount;

    const monthBucket = byMonth.get(monthKey) || { month: monthKey, legacyPaid: 0, unifiedPaid: 0, billed: 0, diffCount: 0 };
    monthBucket.legacyPaid += legacyPaid;
    monthBucket.unifiedPaid += unifiedPaid;
    monthBucket.billed += row.billedAmount;

    if (legacyPaid !== unifiedPaid) {
      clientBucket.diffCount += 1;
      monthBucket.diffCount += 1;
      saleDiffs.push({
        saleId: row.saleId,
        clientName: row.clientName,
        saleDate: row.saleDate,
        billedAmount: row.billedAmount,
        legacyPaid,
        unifiedPaid,
        delta: legacyPaid - unifiedPaid,
        sourceLedger: row.sourceLedger,
        diffClass: classifySaleDiff({
          row,
          legacyPaid,
          unifiedApplied: row.totalAppliedAmount,
          suppressedSaleIds,
          fifoSaleIds,
        }),
      });
    }

    byClient.set(clientKey, clientBucket);
    byMonth.set(monthKey, monthBucket);
  }

  const diffClassCounts = Object.fromEntries(DIFF_CLASSES.map((key) => [key, 0]));
  for (const diff of saleDiffs) diffClassCounts[diff.diffClass] += 1;

  const statementDiffs = [];
  for (const archive of archives) {
    if (archive?.category !== "statement-client") continue;
    const derived = buildStatementPaymentStatusShared(archive, data, { asOfDate, balances });
    const cache = statementPaymentStatusToArchiveCache(derived.status);
    const stored = archive.paymentStatus == null ? null : String(archive.paymentStatus);
    if (stored === cache && !derived.manualReview) continue;
    statementDiffs.push({
      archiveId: derived.archiveId,
      clientName: derived.clientName,
      storedPaymentStatus: stored,
      derivedStatus: derived.status,
      derivedCacheStatus: cache,
      manualReview: derived.manualReview,
      manualReviewReason: derived.manualReviewReason,
      billedAmount: derived.billedAmount,
      appliedAmount: derived.appliedAmount,
      statementTotalAmount: derived.statementTotalAmount,
    });
  }

  const statementSaleIdReuse = dedupeStatementSaleIdsAcrossVersions(archives).duplicates;

  return {
    ok: true,
    mutations: 0,
    generatedAt: new Date().toISOString(),
    asOfDate,
    totals: {
      saleCount: balances.totals.saleCount,
      billedAmount: balances.totals.billedAmount,
      legacyViewPaid: [...legacyPaidBySaleId.values()].reduce((sum, value) => sum + value, 0),
      unifiedApplied: balances.totals.totalAppliedAmount,
      unifiedOutstanding: balances.totals.outstandingAmount,
      legacyAppliedAmount: balances.totals.legacyAppliedAmount,
      receiptAllocatedAmount: balances.totals.receiptAllocatedAmount,
    },
    diffCounts: {
      sales: saleDiffs.length,
      clients: [...byClient.values()].filter((row) => row.legacyPaid !== row.unifiedPaid).length,
      months: [...byMonth.values()].filter((row) => row.legacyPaid !== row.unifiedPaid).length,
      statements: statementDiffs.length,
      bankConflicts: balances.bankReferences.conflicts.length,
    },
    diffClassCounts,
    sales: saleDiffs,
    clients: [...byClient.values()].sort((a, b) =>
      Math.abs(b.legacyPaid - b.unifiedPaid) - Math.abs(a.legacyPaid - a.unifiedPaid),
    ),
    months: [...byMonth.values()].sort((a, b) => String(a.month).localeCompare(String(b.month))),
    statements: statementDiffs,
    bank: {
      reconciliationStatus: balances.bankReferences.reconciliationStatus,
      conflicts: balances.bankReferences.conflicts,
      receiptLinkedBankTransactionCount: balances.bankReferences.receiptLinkedBankTransactionIds.length,
      suppressedLegacyByBankReceipt: balances.suppressedLegacyByBankReceipt,
    },
    statementSaleIdReuse,
    reconciliationStatus: balances.reconciliationStatus,
    errors: balances.errors,
    warnings: balances.warnings,
  };
}
