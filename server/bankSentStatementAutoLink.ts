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
import { resolveAutoLinkLinkedSubject } from "../src/utils/bankTransactions.ts";
import {
  DEFAULT_CLIENT_FOLDER_ID,
  DEFAULT_CARD_SALES_FOLDER_ID,
  isCardCompanyDeposit,
} from "../src/utils/bankTransactionFolders.ts";
import { config } from "./config.mjs";
import { planCreateAndPostReceipt, proposeFifoAllocations } from "./receipts.mjs";
import { buildEffectivePaymentVouchers } from "./receiptProjection.mjs";
import {
  bankReceiptCutoverYmd,
  buildBankReceiptLinkPatch,
  ensureBankReceiptCutoverAt,
  isBankTxReceiptAutoLinkEligible,
  makeBankReceiptOperationId,
  readBankReceiptCutoverAt,
} from "./bankReceipts.mjs";
import {
  decideBankDepositAction,
  removeResolvedFromQueue,
  upsertUnresolvedDepositQueue,
} from "./bankDepositDecision.mjs";

function toIdSet(onlyTransactionIds?: string[] | Set<string>) {
  if (!onlyTransactionIds) return undefined;
  if (onlyTransactionIds instanceof Set) return onlyTransactionIds;
  return new Set(onlyTransactionIds);
}

export type PendingPdfArchiveAutoLinkUpdate = {
  pdfArchiveId: string;
  paymentStatus: "confirmed" | "partial" | "pending";
  txId: string;
  /** Phase 2: receipt that settled the statement (no voucher id is written). */
  receiptId: string;
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
  options: {
    addedIds?: string[];
    lookbackDays?: number;
    asOfDate?: string | Date;
    /** Phase 2 cutover ISO — the retry window never reaches before this day. */
    cutoverAt?: string;
    receipts?: unknown[];
    paymentVouchers?: unknown[];
  } = {},
) {
  const added = Array.isArray(options.addedIds) ? options.addedIds.filter(Boolean) : [];
  // Persistent queue: all unmatched post-cutover deposits, not only last N days.
  const recent = selectRecentUnlinkedDepositIds(
    (Array.isArray(bankTransactions) ? bankTransactions : []) as never[],
    {
      lookbackDays: getAutoDepositRetryLookbackDays(options.lookbackDays),
      asOfDate: options.asOfDate,
      minDate: bankReceiptCutoverYmd(options.cutoverAt),
      receipts: (options.receipts || []) as never[],
      paymentVouchers: (options.paymentVouchers || []) as never[],
      persistent: true,
    },
  );
  return [...new Set([...added, ...recent])];
}

export function applyPendingPdfArchiveAutoLinkUpdates(
  updates: PendingPdfArchiveAutoLinkUpdate[] = [],
) {
  for (const linked of updates) {
    // Append-style: do not treat single linkedBankTransactionId as exclusive lock.
    // Keep latest pointer for UI convenience while remaining balance drives match.
    updatePdfArchiveMeta(linked.pdfArchiveId, {
      paymentStatus: linked.paymentStatus,
      linkedBankTransactionId: linked.txId,
      linkedReceiptId: linked.receiptId,
    });
  }
}

type ClientRow = { id?: string | number; name?: string };

function mapReasonToDiagnosticKey(
  reasonCode: string | null | undefined,
): keyof SentStatementAutoLinkDiagnostics | null {
  switch (reasonCode) {
    case "CLIENT_NOT_FOUND":
      return "clientNotFound";
    case "CLIENT_AMBIGUOUS":
    case "MULTIPLE_CANDIDATES":
      return "clientAmbiguous";
    case "CASH_TRANSFER":
      return "cashTransfer";
    case "CARD_SETTLEMENT":
      return "cardCompany";
    case "MANUAL_OVERRIDE_REQUIRED":
      return "manualOverride";
    case "DUPLICATE_BANK_RECEIPT":
      return "alreadyLinked";
    case "RECEIPT_POSTED_UNAPPLIED":
    case "NO_SENT_SALES":
      return "unapplied";
    case "RECEIPT_PARTIALLY_ALLOCATED":
      return "partiallyAllocated";
    case "PRE_CUTOVER":
      return null;
    default:
      return reasonCode ? "failed" : null;
  }
}

function bump(diagnostics: SentStatementAutoLinkDiagnostics, key: keyof SentStatementAutoLinkDiagnostics | null) {
  if (!key) return;
  diagnostics[key] += 1;
}

/**
 * Auto-link bank deposits: Stage A resolve client → Stage B post full Receipt + FIFO allocate.
 *
 * Policy:
 * - Client certainty (not statement amount) gates Receipt creation.
 * - Amount mismatch still posts Receipt; leftover stays unallocated prepaid.
 * - Ambiguous/unknown client → persistent needs_review queue (never silent drop).
 * - linkedPdfArchiveId is never financial authority.
 */
export async function applySentStatementAutoLinksToErpData(
  data: Record<string, unknown>,
  options: {
    onlyTransactionIds?: string[] | Set<string>;
    addedIds?: string[];
    updatedBy?: string;
    minScore?: number;
    maxDateGapDays?: number;
    ambiguityMinScoreGap?: number;
    /** When true, skip writing PDF meta (caller must apply pendingPdfUpdates after save). */
    deferPdfMeta?: boolean;
    nowIso?: string;
    /** Prefer legacy statement-score drafts when true (tests). Default false = client-first. */
    useLegacyStatementScoreGate?: boolean;
  } = {},
): Promise<{
  data: Record<string, unknown>;
  autoLinkedCount: number;
  diagnostics: SentStatementAutoLinkDiagnostics;
  items: SentStatementAutoLinkEvaluationItem[];
  pendingPdfUpdates: PendingPdfArchiveAutoLinkUpdate[];
  drafts: SentStatementAutoLinkDraft[];
  receiptIds: string[];
  cutoverAt: string;
  cutoverCreated: boolean;
  skippedPreCutover: number;
  unresolvedQueue: unknown[];
}> {
  const { onlyTransactionIds, updatedBy } = options;
  const nowIso = options.nowIso || new Date().toISOString();

  const cutover = ensureBankReceiptCutoverAt(data, nowIso);
  const cutoverAt = cutover.cutoverAt;
  const workingData: Record<string, unknown> = cutover.created
    ? { ...data, bankSyncMeta: cutover.bankSyncMeta }
    : data;

  const bankTransactions = (Array.isArray(workingData.bankTransactions)
    ? workingData.bankTransactions
    : []) as any[];
  const clients = ((workingData.clients as ClientRow[]) || []) as ClientRow[];
  const addedIds = new Set((options.addedIds || []).map(String));

  const requestedIds = toIdSet(onlyTransactionIds);
  const scopedIds = new Set<string>();
  let skippedPreCutover = 0;
  for (const tx of bankTransactions) {
    const id = String(tx?.id ?? "");
    if (!id) continue;
    if (requestedIds && !requestedIds.has(id)) continue;
    if (Number(tx?.deposit || 0) <= 0) continue;
    if (isBankTxReceiptAutoLinkEligible(tx, { cutoverAt, addedIds })) {
      scopedIds.add(id);
    } else {
      skippedPreCutover += 1;
    }
  }

  const bankSyncMeta =
    workingData.bankSyncMeta && typeof workingData.bankSyncMeta === "object"
      ? { ...(workingData.bankSyncMeta as Record<string, unknown>) }
      : {};
  let unresolvedQueue = Array.isArray(bankSyncMeta.unresolvedDepositQueue)
    ? [...(bankSyncMeta.unresolvedDepositQueue as unknown[])]
    : [];

  const emptyResult = {
    data: workingData,
    autoLinkedCount: 0,
    diagnostics: createEmptySentStatementAutoLinkDiagnostics(),
    items: [] as SentStatementAutoLinkEvaluationItem[],
    pendingPdfUpdates: [] as PendingPdfArchiveAutoLinkUpdate[],
    drafts: [] as SentStatementAutoLinkDraft[],
    receiptIds: [] as string[],
    cutoverAt,
    cutoverCreated: cutover.created,
    skippedPreCutover,
    unresolvedQueue,
  };

  if (!scopedIds.size) return emptyResult;

  let archives = [];
  try {
    archives = listSentStatementArchiveMetas();
  } catch {
    archives = [];
  }
  const effectiveVouchers = buildEffectivePaymentVouchers(workingData as never);

  // Optional legacy path kept for regression scripts that assert statement-score drafts.
  if (options.useLegacyStatementScoreGate) {
    const evaluated = evaluateHighConfidenceSentStatementAutoLinks({
      bankTransactions: bankTransactions as never[],
      archives,
      clients: (workingData.clients as never[]) || [],
      sales: (workingData.sales as never[]) || [],
      paymentVouchers: effectiveVouchers as never[],
      receipts: (workingData.receipts as never[]) || [],
      onlyTransactionIds: scopedIds,
      minScore: options.minScore ?? DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE,
      maxDateGapDays: getAutoDepositMaxDateGapDays(options.maxDateGapDays),
      ambiguityMinScoreGap: getAutoDepositAmbiguityMinScoreGap(options.ambiguityMinScoreGap),
    });
    return {
      ...emptyResult,
      diagnostics: evaluated.diagnostics,
      items: evaluated.items,
      drafts: evaluated.drafts,
    };
  }

  const diagnostics = createEmptySentStatementAutoLinkDiagnostics();
  const items: SentStatementAutoLinkEvaluationItem[] = [];
  const savedBy = String(updatedBy || "bank-sync-auto-link");
  const txById = new Map(bankTransactions.map((row) => [String(row?.id ?? ""), row]));

  let workingReceipts = Array.isArray(workingData.receipts) ? [...(workingData.receipts as any[])] : [];
  let workingAllocations = Array.isArray(workingData.receiptAllocations)
    ? [...(workingData.receiptAllocations as any[])]
    : [];
  const bankPatchByTxId = new Map<string, Record<string, unknown>>();
  const pendingPdfUpdates: PendingPdfArchiveAutoLinkUpdate[] = [];
  const appliedDrafts: SentStatementAutoLinkDraft[] = [];
  const receiptIds: string[] = [];

  for (const txId of scopedIds) {
    const tx = txById.get(String(txId));
    if (!tx) continue;
    diagnostics.evaluated += 1;
    const transactionDate = String(tx.transactionAt || "").slice(0, 10);

    const decision = decideBankDepositAction(tx, {
      clients,
      sales: (workingData.sales as never[]) || [],
      receipts: workingReceipts,
      allocations: workingAllocations,
      paymentVouchers: effectiveVouchers as never[],
      cutoverAt,
      proposeFifoAllocations,
      archives,
    });

    if (decision.action === "skip") {
      const key = mapReasonToDiagnosticKey(decision.reasonCode);
      bump(diagnostics, key || "alreadyLinked");
      items.push({
        txId: String(txId),
        reason: (key === "cashTransfer"
          ? "CASH_TRANSFER"
          : key === "cardCompany"
            ? "cardCompany"
            : key === "alreadyLinked"
              ? "alreadyLinked"
              : "failed") as SentStatementAutoLinkEvaluationItem["reason"],
        reasonCode: decision.reasonCode || undefined,
        processingStatus: decision.status,
        transactionDate,
      });
      if (decision.reasonCode === "DUPLICATE_BANK_RECEIPT") {
        unresolvedQueue = removeResolvedFromQueue(unresolvedQueue, txId);
      }
      continue;
    }

    if (decision.action === "queue") {
      const key = mapReasonToDiagnosticKey(decision.reasonCode);
      bump(diagnostics, key || "failed");
      items.push({
        txId: String(txId),
        reason: (decision.reasonCode === "CLIENT_AMBIGUOUS"
          ? "CLIENT_AMBIGUOUS"
          : decision.reasonCode === "CLIENT_NOT_FOUND"
            ? "CLIENT_NOT_FOUND"
            : "failed") as SentStatementAutoLinkEvaluationItem["reason"],
        reasonCode: decision.reasonCode || undefined,
        processingStatus: decision.status,
        transactionDate,
      });
      unresolvedQueue = upsertUnresolvedDepositQueue(unresolvedQueue, {
        bankTransactionId: txId,
        status: decision.status,
        reasonCode: decision.reasonCode,
        subject: decision.subject,
        depositAmount: decision.depositAmount,
        transactionDate,
        lastCheckedAt: nowIso,
      });
      continue;
    }

    // post_receipt — client is certain; always create one Receipt for full deposit.
    try {
      const planned = planCreateAndPostReceipt(
        {
          receipts: workingReceipts,
          allocations: workingAllocations,
          sales: (workingData.sales as never[]) || [],
          clients: clients as never[],
        },
        {
          operationId: makeBankReceiptOperationId(String(tx.id), "bank_auto"),
          clientId: String(decision.clientId),
          receiptDate: transactionDate,
          grossAmount: Number(decision.depositAmount),
          channel: "bank",
          source: "bank_auto",
          bankTransactionId: String(tx.id),
          sentStatementId: null,
          allocations: decision.allocations || [],
          memo: decision.reasonCode
            ? `auto-deposit:${decision.reasonCode}`
            : "auto-deposit:allocated",
        },
        savedBy,
      );

      if (planned.shortCircuit) {
        bump(diagnostics, "alreadyLinked");
        items.push({
          txId: String(txId),
          reason: "alreadyLinked",
          reasonCode: "DUPLICATE_BANK_RECEIPT",
          transactionDate,
        });
        unresolvedQueue = removeResolvedFromQueue(unresolvedQueue, txId);
        continue;
      }

      workingReceipts = planned.receipts;
      workingAllocations = planned.allocations;
      const receipt = planned.value.receipt;
      receiptIds.push(String(receipt.id));

      const processingStatus = decision.processingStatus || "allocated";
      const reasonCode = decision.reasonCode || null;
      if (processingStatus === "unapplied") bump(diagnostics, "unapplied");
      else if (processingStatus === "partially_allocated") bump(diagnostics, "partiallyAllocated");
      bump(diagnostics, "linked");

      items.push({
        txId: String(txId),
        reason: "linked",
        reasonCode: reasonCode || undefined,
        processingStatus,
        client: String(decision.clientName || ""),
        transactionDate,
      });

      bankPatchByTxId.set(String(tx.id), {
        ...buildBankReceiptLinkPatch(tx, {
          receipt,
          allocations: planned.value.allocations || [],
          clientName: String(decision.clientName || ""),
          source: "bank_auto",
          actor: savedBy,
          linkedAt: nowIso,
        }),
        linkedSubject: resolveAutoLinkLinkedSubject(tx, String(decision.clientName || "")),
        depositProcessingStatus: processingStatus,
        depositReasonCode: reasonCode,
        folderId:
          tx.folderId ||
          (isCardCompanyDeposit(tx) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
      });

      unresolvedQueue = removeResolvedFromQueue(unresolvedQueue, txId);

      // Best-effort statement pointer for UI — not occupancy authority.
      const preferredArchive = archives.find(
        (row) =>
          String(row.subjectName || "").trim() === String(decision.clientName || "").trim() &&
          Array.isArray(row.statementSalesIds) &&
          row.statementSalesIds.length,
      );
      if (preferredArchive) {
        const paymentStatus =
          processingStatus === "allocated"
            ? "confirmed"
            : processingStatus === "partially_allocated"
              ? "partial"
              : "pending";
        pendingPdfUpdates.push({
          pdfArchiveId: String(preferredArchive.id),
          paymentStatus,
          txId: String(tx.id),
          receiptId: String(receipt.id),
        });
        appliedDrafts.push({
          txId: String(tx.id),
          client: String(decision.clientName || ""),
          pdfArchiveId: String(preferredArchive.id),
          paymentStatus,
          primaryVoucherId: String(receipt.id),
          vouchers: (decision.allocations || []).map((row, index) => ({
            id: `${receipt.id}-${index}`,
            salesId: row.saleId,
            amount: row.amount,
            finalAmount: row.amount,
          })),
        } as SentStatementAutoLinkDraft);
        bankPatchByTxId.set(String(tx.id), {
          ...bankPatchByTxId.get(String(tx.id)),
          linkedPdfArchiveId: String(preferredArchive.id),
        });
      }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code || "INTERNAL_ERROR")
          : "INTERNAL_ERROR";
      bump(diagnostics, "failed");
      items.push({
        txId: String(txId),
        reason: "failed",
        reasonCode: code,
        processingStatus: "failed",
        client: String(decision.clientName || ""),
        transactionDate,
      });
      unresolvedQueue = upsertUnresolvedDepositQueue(unresolvedQueue, {
        bankTransactionId: txId,
        status: "failed",
        reasonCode: code,
        clientId: decision.clientId,
        depositAmount: decision.depositAmount,
        transactionDate,
        lastCheckedAt: nowIso,
      });
    }
  }

  if (!receiptIds.length) {
    const nextMeta = { ...bankSyncMeta, unresolvedDepositQueue: unresolvedQueue };
    return {
      ...emptyResult,
      data: { ...workingData, bankSyncMeta: nextMeta },
      diagnostics,
      items,
      unresolvedQueue,
    };
  }

  const nextBankTransactions = bankTransactions.map((row) => {
    const patch = bankPatchByTxId.get(String(row?.id ?? ""));
    return patch ? { ...row, ...patch } : row;
  });

  if (!options.deferPdfMeta) {
    applyPendingPdfArchiveAutoLinkUpdates(pendingPdfUpdates);
  }

  const nextMeta = { ...bankSyncMeta, unresolvedDepositQueue: unresolvedQueue };

  return {
    data: {
      ...workingData,
      bankSyncMeta: nextMeta,
      bankTransactions: nextBankTransactions,
      receipts: workingReceipts,
      receiptAllocations: workingAllocations,
    },
    autoLinkedCount: receiptIds.length,
    diagnostics,
    items,
    pendingPdfUpdates: options.deferPdfMeta ? pendingPdfUpdates : [],
    drafts: appliedDrafts,
    receiptIds,
    cutoverAt,
    cutoverCreated: cutover.created,
    skippedPreCutover,
    unresolvedQueue,
  };
}

export { readBankReceiptCutoverAt };
