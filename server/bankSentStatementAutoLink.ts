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
import { planCreateAndPostReceipt } from "./receipts.mjs";
import { buildEffectivePaymentVouchers } from "./receiptProjection.mjs";
import {
  bankReceiptCutoverYmd,
  buildBankReceiptLinkPatch,
  ensureBankReceiptCutoverAt,
  isBankTxReceiptAutoLinkEligible,
  makeBankReceiptOperationId,
  readBankReceiptCutoverAt,
} from "./bankReceipts.mjs";

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
  const recent = selectRecentUnlinkedDepositIds(
    (Array.isArray(bankTransactions) ? bankTransactions : []) as never[],
    {
      lookbackDays: getAutoDepositRetryLookbackDays(options.lookbackDays),
      asOfDate: options.asOfDate,
      minDate: bankReceiptCutoverYmd(options.cutoverAt),
      receipts: (options.receipts || []) as never[],
      paymentVouchers: (options.paymentVouchers || []) as never[],
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
      linkedReceiptId: linked.receiptId,
    });
  }
}

type ClientRow = { id?: string | number; name?: string };

/**
 * A statement match only names a client; auto-posting needs an unambiguous id.
 * Same-name clients are a manual-review case, never a guess.
 */
function resolveUniqueClientByName(clients: ClientRow[], name: string) {
  const wanted = String(name || "").trim();
  if (!wanted) return { status: "notFound" as const };
  const matches = clients.filter((row) => String(row?.name || "").trim() === wanted);
  if (!matches.length) return { status: "notFound" as const };
  if (matches.length > 1) return { status: "ambiguous" as const, candidates: matches };
  return { status: "ok" as const, client: matches[0] };
}

/**
 * Statement FIFO voucher drafts are used purely as an amount calculator; only
 * (saleId, amount) pairs survive into the receipt allocations.
 */
function draftToAllocations(draft: SentStatementAutoLinkDraft) {
  return draft.vouchers
    .map((voucher) => ({
      saleId: String(voucher.salesId ?? ""),
      amount: Math.round(Number(voucher.finalAmount ?? voucher.amount ?? 0)),
    }))
    .filter((row) => row.saleId && row.amount > 0);
}

/**
 * Auto-link high-confidence sent-statement deposits by posting Receipts.
 *
 * Phase 2 rules enforced here:
 * - no paymentVoucher / paymentInputLog / linkedPaymentVoucherId writes
 * - pre-cutover deposits are diagnostics-only (zero mutations)
 * - ambiguous client names are skipped for manual review
 *
 * PDF archive meta updates are returned as pendingPdfUpdates so callers can
 * persist ERP state first and avoid half-applied links on VERSION_CONFLICT.
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
}> {
  const { onlyTransactionIds, updatedBy } = options;
  const nowIso = options.nowIso || new Date().toISOString();

  // Stamp the cutover before anything else so the very first Phase 2 run has a
  // boundary to compare against (and pre-existing deposits stay untouched).
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
  };

  if (!scopedIds.size) return emptyResult;

  const archives = listSentStatementArchiveMetas();
  // Effective vouchers = legacy rows + receipt allocations projected as-of today,
  // so FIFO "already paid" math sees Phase 2 receipts too.
  const effectiveVouchers = buildEffectivePaymentVouchers(workingData as never);
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

  const diagnostics = evaluated.diagnostics;
  const items = evaluated.items;
  if (!evaluated.drafts.length) {
    return { ...emptyResult, diagnostics, items };
  }

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

  /** The evaluator already counted this tx as linked; the receipt step disagreed. */
  const demote = (txId: string, reason: "failed" | "ambiguous" | "alreadyLinked") => {
    diagnostics.linked = Math.max(0, diagnostics.linked - 1);
    diagnostics[reason] += 1;
    const item = items.find((row) => row.txId === txId && row.reason === "linked");
    if (item) item.reason = reason;
  };

  for (const draft of evaluated.drafts) {
    const tx = txById.get(String(draft.txId));
    if (!tx) {
      demote(draft.txId, "failed");
      continue;
    }

    const clientMatch = resolveUniqueClientByName(clients, draft.client);
    if (clientMatch.status !== "ok") {
      demote(draft.txId, clientMatch.status === "ambiguous" ? "ambiguous" : "failed");
      continue;
    }

    const allocations = draftToAllocations(draft);
    if (!allocations.length) {
      demote(draft.txId, "failed");
      continue;
    }

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
          clientId: String(clientMatch.client.id),
          receiptDate: String(tx.transactionAt || "").slice(0, 10),
          grossAmount: Math.round(Number(tx.deposit || 0)),
          channel: "bank",
          source: "bank_auto",
          bankTransactionId: String(tx.id),
          sentStatementId: draft.pdfArchiveId,
          allocations,
        },
        savedBy,
      );

      if (planned.shortCircuit) {
        // A receipt for this deposit already exists — never post a second one.
        demote(draft.txId, "alreadyLinked");
        continue;
      }

      workingReceipts = planned.receipts;
      workingAllocations = planned.allocations;
      const receipt = planned.value.receipt;
      receiptIds.push(String(receipt.id));
      appliedDrafts.push(draft);

      bankPatchByTxId.set(String(tx.id), {
        ...buildBankReceiptLinkPatch(tx, {
          receipt,
          allocations: planned.value.allocations || [],
          clientName: String(clientMatch.client.name || draft.client),
          source: "bank_auto",
          actor: savedBy,
          linkedAt: nowIso,
        }),
        linkedPdfArchiveId: draft.pdfArchiveId,
        linkedSubject: resolveAutoLinkLinkedSubject(tx, draft.client),
        folderId:
          tx.folderId ||
          (isCardCompanyDeposit(tx) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
      });

      pendingPdfUpdates.push({
        pdfArchiveId: draft.pdfArchiveId,
        paymentStatus: draft.paymentStatus,
        txId: String(tx.id),
        receiptId: String(receipt.id),
      });
    } catch {
      demote(draft.txId, "failed");
    }
  }

  if (!appliedDrafts.length) {
    return { ...emptyResult, diagnostics, items };
  }

  const nextBankTransactions = bankTransactions.map((row) => {
    const patch = bankPatchByTxId.get(String(row?.id ?? ""));
    return patch ? { ...row, ...patch } : row;
  });

  if (!options.deferPdfMeta) {
    applyPendingPdfArchiveAutoLinkUpdates(pendingPdfUpdates);
  }

  return {
    data: {
      ...workingData,
      bankTransactions: nextBankTransactions,
      receipts: workingReceipts,
      receiptAllocations: workingAllocations,
    },
    autoLinkedCount: appliedDrafts.length,
    diagnostics,
    items,
    pendingPdfUpdates: options.deferPdfMeta ? pendingPdfUpdates : [],
    drafts: appliedDrafts,
    receiptIds,
    cutoverAt,
    cutoverCreated: cutover.created,
    skippedPreCutover,
  };
}

export { readBankReceiptCutoverAt };
