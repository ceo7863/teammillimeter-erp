import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "./pdfArchive.mjs";
import {
  DEFAULT_AUTO_DEPOSIT_RETRY_LOOKBACK_DAYS,
  DEFAULT_SENT_STATEMENT_AMBIGUITY_MIN_SCORE_GAP,
  DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE,
  DEFAULT_SENT_STATEMENT_MAX_DATE_GAP_DAYS,
  createEmptySentStatementAutoLinkDiagnostics,
  evaluateHighConfidenceSentStatementAutoLinks,
  selectRecentUnlinkedDepositIds,
  type SentStatementAutoLinkDiagnostics,
  type SentStatementAutoLinkDraft,
  type SentStatementAutoLinkEvaluationItem,
} from "../src/utils/bankSentStatementMatch.ts";
import { createPaymentInputLogsFromVouchers } from "../src/utils/paymentInputLogs.ts";
import { resolveAutoLinkLinkedSubject } from "../src/utils/bankTransactions.ts";
import {
  DEFAULT_CLIENT_FOLDER_ID,
  DEFAULT_CARD_SALES_FOLDER_ID,
  isCardCompanyDeposit,
} from "../src/utils/bankTransactionFolders.ts";
import { config } from "./config.mjs";

function toIdSet(onlyTransactionIds?: string[] | Set<string>) {
  if (!onlyTransactionIds) return undefined;
  if (onlyTransactionIds instanceof Set) return onlyTransactionIds;
  return new Set(onlyTransactionIds);
}

export type PendingPdfArchiveAutoLinkUpdate = {
  pdfArchiveId: string;
  paymentStatus: "confirmed" | "partial" | "pending";
  txId: string;
  primaryVoucherId: string | number;
};

export function getAutoDepositRetryLookbackDays(override?: number) {
  if (override != null && Number.isFinite(override)) return Math.max(1, Number(override));
  return Math.max(
    1,
    Number(config.autoDeposit?.retryLookbackDays || DEFAULT_AUTO_DEPOSIT_RETRY_LOOKBACK_DAYS),
  );
}

export function getAutoDepositMaxDateGapDays(override?: number) {
  if (override != null && Number.isFinite(override)) return Math.max(1, Number(override));
  return Math.max(
    1,
    Number(config.autoDeposit?.maxDateGapDays || DEFAULT_SENT_STATEMENT_MAX_DATE_GAP_DAYS),
  );
}

export function getAutoDepositAmbiguityMinScoreGap(override?: number) {
  if (override != null && Number.isFinite(override)) return Math.max(0, Number(override));
  return Math.max(
    0,
    Number(config.autoDeposit?.ambiguityMinScoreGap || DEFAULT_SENT_STATEMENT_AMBIGUITY_MIN_SCORE_GAP),
  );
}

export function collectAutoLinkTransactionIds(
  bankTransactions: unknown[],
  options: { addedIds?: string[]; lookbackDays?: number; asOfDate?: string | Date } = {},
) {
  const added = Array.isArray(options.addedIds) ? options.addedIds.filter(Boolean) : [];
  const recent = selectRecentUnlinkedDepositIds(
    (Array.isArray(bankTransactions) ? bankTransactions : []) as never[],
    {
      lookbackDays: getAutoDepositRetryLookbackDays(options.lookbackDays),
      asOfDate: options.asOfDate,
    },
  );
  return [...new Set([...added, ...recent])];
}

export function applyPendingPdfArchiveAutoLinkUpdates(
  updates: PendingPdfArchiveAutoLinkUpdate[] = [],
) {
  for (const linked of updates) {
    updatePdfArchiveMeta(linked.pdfArchiveId, {
      paymentStatus: linked.paymentStatus,
      linkedBankTransactionId: linked.txId,
      linkedPaymentVoucherId: linked.primaryVoucherId,
    });
  }
}

/**
 * Mirror client IBK import auto-link: match high-confidence sent-statement deposits,
 * create vouchers/logs, update bank tx metadata.
 *
 * PDF archive meta updates are returned as pendingPdfUpdates so callers can persist ERP
 * state first and avoid half-applied links on VERSION_CONFLICT.
 */
export async function applySentStatementAutoLinksToErpData(
  data: Record<string, unknown>,
  options: {
    onlyTransactionIds?: string[] | Set<string>;
    updatedBy?: string;
    minScore?: number;
    maxDateGapDays?: number;
    ambiguityMinScoreGap?: number;
    /** When true, skip writing PDF meta (caller must apply pendingPdfUpdates after save). */
    deferPdfMeta?: boolean;
  } = {},
): Promise<{
  data: Record<string, unknown>;
  autoLinkedCount: number;
  diagnostics: SentStatementAutoLinkDiagnostics;
  items: SentStatementAutoLinkEvaluationItem[];
  pendingPdfUpdates: PendingPdfArchiveAutoLinkUpdate[];
  drafts: SentStatementAutoLinkDraft[];
}> {
  const { onlyTransactionIds, updatedBy } = options;
  const emptyDiagnostics = createEmptySentStatementAutoLinkDiagnostics();

  const archives = listSentStatementArchiveMetas();
  const evaluated = evaluateHighConfidenceSentStatementAutoLinks({
    bankTransactions: Array.isArray(data.bankTransactions) ? (data.bankTransactions as never[]) : [],
    archives,
    clients: (data.clients as never[]) || [],
    sales: (data.sales as never[]) || [],
    paymentVouchers: (data.paymentVouchers as never[]) || [],
    onlyTransactionIds: toIdSet(onlyTransactionIds),
    minScore: options.minScore ?? DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE,
    maxDateGapDays: getAutoDepositMaxDateGapDays(options.maxDateGapDays),
    ambiguityMinScoreGap: getAutoDepositAmbiguityMinScoreGap(options.ambiguityMinScoreGap),
  });

  const autoLinks = evaluated.drafts;
  if (!autoLinks.length) {
    return {
      data,
      autoLinkedCount: 0,
      diagnostics: evaluated.diagnostics,
      items: evaluated.items,
      pendingPdfUpdates: [],
      drafts: [],
    };
  }

  const savedBy = String(updatedBy || "bank-sync-auto-link");
  const autoVouchers = autoLinks.flatMap((row) => row.vouchers);
  const autoLogs = createPaymentInputLogsFromVouchers(autoVouchers, savedBy);
  const linkByTxId = new Map(autoLinks.map((item) => [item.txId, item]));
  const confirmedAt = new Date().toISOString();

  const bankTransactions = ((data.bankTransactions as never[]) || []).map((row: any) => {
    const linked = linkByTxId.get(row.id);
    if (!linked) return row;
    return {
      ...row,
      linkedPaymentVoucherId: linked.primaryVoucherId,
      linkedPdfArchiveId: linked.pdfArchiveId,
      linkedSubject: resolveAutoLinkLinkedSubject(row, linked.client),
      linkedSalesId: linked.primarySalesId,
      matchConfirmedAt: confirmedAt,
      matchConfirmedBy: savedBy,
      matchAutoLinked: true,
      folderId:
        row.folderId ||
        (isCardCompanyDeposit(row) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
    };
  });

  const pendingPdfUpdates: PendingPdfArchiveAutoLinkUpdate[] = autoLinks.map((linked) => ({
    pdfArchiveId: linked.pdfArchiveId,
    paymentStatus: linked.paymentStatus,
    txId: linked.txId,
    primaryVoucherId: linked.primaryVoucherId,
  }));

  if (!options.deferPdfMeta) {
    applyPendingPdfArchiveAutoLinkUpdates(pendingPdfUpdates);
  }

  return {
    data: {
      ...data,
      bankTransactions,
      paymentVouchers: [...autoVouchers, ...(((data.paymentVouchers as never[]) || []))],
      paymentInputLogs: [...autoLogs, ...(((data.paymentInputLogs as never[]) || []))],
    },
    autoLinkedCount: autoLinks.length,
    diagnostics: evaluated.diagnostics || emptyDiagnostics,
    items: evaluated.items,
    pendingPdfUpdates: options.deferPdfMeta ? pendingPdfUpdates : [],
    drafts: autoLinks,
  };
}
