import type { BankTransaction } from "./bankTransactions";
import { isCardCompanyDeposit } from "./bankTransactionFolders";
import type { ClientDepositMatchSource } from "./clientDepositAliases";
import { includesDepositName, resolveDepositSubjectClientMatch } from "./clientDepositAliases";
import type { PdfArchiveMeta } from "./pdfArchive";
import type { BankPaymentVoucherDraft } from "./bankReceivableMatch";

export type SentStatementMatchCandidate = {
  pdfArchiveId: string;
  client: string;
  statementTotalAmount: number;
  sentAt: string;
  periodStart: string;
  periodEnd: string;
  score: number;
  reasons: string[];
  paymentAmount: number;
  paymentStatus: "confirmed" | "partial";
  shareLinkUrl?: string;
};

function resolveStatementClientMatch(
  subject: string,
  clientName: string,
  tx: BankTransaction,
  clients?: ClientDepositMatchSource[]
) {
  const clientRecord = clients?.find((client) => String(client.name || "").trim() === String(clientName || "").trim());
  return resolveDepositSubjectClientMatch(subject, clientName, clientRecord, {
    linkedSubject: tx.linkedSubject,
    scores: { name: 40, linked: 28, alias: 36, manager: 34 },
  });
}

function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate.slice(0, 10)}T12:00:00`).getTime();
  const to = new Date(`${toDate.slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 999;
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function resolveStatementPaymentAmount(deposit: number, total: number) {
  if (total <= 0) return null;

  if (deposit === total) {
    return {
      score: 50,
      reason: "\uB0B4\uC5ED\uC11C \uCD1D\uD569\uACC4 \uC815\uD655 \uC77C\uCE58",
      paymentAmount: total,
      paymentStatus: "confirmed" as const,
    };
  }
  if (deposit < total && deposit >= total * 0.95) {
    return {
      score: 36,
      reason: "\uB0B4\uC5ED\uC11C \uAE08\uC561 \uBD80\uBD84 \uC77C\uCE58",
      paymentAmount: deposit,
      paymentStatus: "partial" as const,
    };
  }
  if (deposit > total && deposit <= total + Math.max(1000, Math.round(total * 0.02))) {
    return {
      score: 42,
      reason: "\uB0B4\uC5ED\uC11C \uCD1D\uD569\uACC4 \uADFC\uC0AC \uAE08\uC561",
      paymentAmount: total,
      paymentStatus: "confirmed" as const,
    };
  }
  return null;
}

export function listMatchableSentStatements(archives: PdfArchiveMeta[]) {
  return archives.filter(
    (row) =>
      row.sentViaLink &&
      row.category === "statement-client" &&
      row.paymentStatus !== "confirmed" &&
      row.paymentStatus !== "partial" &&
      (row.statementTotalAmount || 0) > 0
  );
}

export function buildSentStatementMatchCandidates(
  tx: BankTransaction,
  archives: PdfArchiveMeta[],
  options: {
    linkedPdfArchiveIds?: Set<string>;
    minScore?: number;
    limit?: number;
    clients?: ClientDepositMatchSource[];
  } = {}
) {
  if (tx.deposit <= 0 || tx.linkedPaymentVoucherId || tx.linkedPdfArchiveId || isCardCompanyDeposit(tx)) {
    return [];
  }

  const deposit = tx.deposit;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const subject = `${tx.counterpartyName || ""} ${tx.description || ""}`.trim();
  const linkedPdfArchiveIds = options.linkedPdfArchiveIds || new Set<string>();
  const clients = options.clients;
  const minScore = options.minScore ?? 35;
  const limit = options.limit ?? 5;

  const candidates: SentStatementMatchCandidate[] = [];

  for (const archive of listMatchableSentStatements(archives)) {
    if (linkedPdfArchiveIds.has(archive.id)) continue;
    if (archive.linkedBankTransactionId && archive.linkedBankTransactionId !== tx.id) continue;

    const sentDate = String(archive.createdAt || "").slice(0, 10);
    if (txDate && sentDate && txDate < sentDate) continue;

    const amountMatch = resolveStatementPaymentAmount(deposit, archive.statementTotalAmount || 0);
    if (!amountMatch) continue;

    let score = amountMatch.score;
    const reasons = [amountMatch.reason];

    const nameMatch = resolveStatementClientMatch(subject, archive.subjectName, tx, clients);
    if (!nameMatch.matched) continue;

    score += nameMatch.scoreBonus;
    reasons.push(nameMatch.reason);

    const dayGap = daysBetween(sentDate, txDate);
    if (dayGap >= 0 && dayGap <= 30) {
      score += 10;
      reasons.push("\uB9C1\uD06C \uBC1C\uC1A1 \uD6C4 \uC785\uAE08");
    } else if (dayGap <= 60) {
      score += 5;
    }

    candidates.push({
      pdfArchiveId: archive.id,
      client: archive.subjectName,
      statementTotalAmount: archive.statementTotalAmount || 0,
      sentAt: archive.createdAt,
      periodStart: archive.periodStart,
      periodEnd: archive.periodEnd,
      score,
      reasons,
      paymentAmount: amountMatch.paymentAmount,
      paymentStatus: amountMatch.paymentStatus,
      shareLinkUrl: archive.shareLinkUrl,
    });
  }

  return candidates
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || b.statementTotalAmount - a.statementTotalAmount)
    .slice(0, limit);
}

export function buildAllSentStatementDepositSuggestions(
  transactions: BankTransaction[],
  archives: PdfArchiveMeta[],
  clients?: ClientDepositMatchSource[]
) {
  const linkedPdfArchiveIds = new Set(
    transactions.filter((row) => row.linkedPdfArchiveId).map((row) => String(row.linkedPdfArchiveId))
  );

  return transactions
    .filter((row) => row.deposit > 0 && !row.linkedPaymentVoucherId)
    .map((tx) => ({
      tx,
      candidates: buildSentStatementMatchCandidates(tx, archives, { linkedPdfArchiveIds, clients }),
    }))
    .filter((row) => row.candidates.length > 0)
    .sort((a, b) => (b.candidates[0]?.score || 0) - (a.candidates[0]?.score || 0));
}

export function createPaymentVoucherFromSentStatementMatch(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate
): BankPaymentVoucherDraft {
  const total = candidate.statementTotalAmount;
  const supplyTotal = Math.round(total / 1.1);
  const ratio = total > 0 ? candidate.paymentAmount / total : 1;
  const supplyAmount = Math.max(1, Math.round(supplyTotal * ratio));
  const vatAmount = Math.max(0, candidate.paymentAmount - supplyAmount);

  return {
    id: Date.now() + Number(String(candidate.pdfArchiveId).replace(/\D/g, "").slice(-6) || 0),
    salesId: "",
    date: String(tx.transactionAt || "").slice(0, 10),
    client: candidate.client,
    site: "",
    workerCount: 0,
    totalSalesAmount: total,
    amount: supplyAmount,
    vatType: "included",
    supplyAmount,
    vatAmount,
    finalAmount: candidate.paymentAmount,
    memo: `\uD1B5\uC7A5\uC785\uAE08(\uBCF4\uB0B4\uB0B4\uC5ED\uC11C) ${tx.description || tx.counterpartyName || ""}`.trim(),
    bankTransactionId: tx.id,
  };
}

export function getSentStatementPaymentStatusLabel(status?: PdfArchiveMeta["paymentStatus"]) {
  if (status === "confirmed") return "\uC785\uAE08\uD655\uC778";
  if (status === "partial") return "\uBD80\uBD84\uC785\uAE08";
  return "\uC785\uAE08\uB300\uAE30";
}
