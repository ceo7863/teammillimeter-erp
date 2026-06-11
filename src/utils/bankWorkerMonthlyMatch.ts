import type { BankTransaction } from "./bankTransactions";
import type { BankTransactionFolder } from "./bankTransactionFolders";
import {
  collectBankTransactionWorkerMatchTexts,
  findWorkerForBankTransaction,
  type WorkerDepositMatchSource,
} from "./clientDepositAliases";
import {
  calculateWorkerPaymentVat,
  WORKER_PAYMENT_VAT_RATE,
} from "./workerMonthlyPayments";
import type { WorkerMasterLike } from "./workerPayments";
import {
  buildUnlinkedWorkerBankWithdrawals,
  resolveWorkerFromBankTx,
  type WorkerMonthlyActualVoucher,
  type WorkerMonthlyObligation,
} from "./workerMonthlyActualPayments";

export const WORKER_BANK_AMOUNT_TOLERANCE = 10;

export type WorkerBankAmountMatch = {
  score: number;
  reason: string;
  payWithVat: boolean;
  expectedFinalAmount: number;
  netAmount: number;
  vatAmount: number;
};

export type WorkerBankMatchCandidate = {
  obligation: WorkerMonthlyObligation;
  score: number;
  reasons: string[];
  amountMatch: WorkerBankAmountMatch;
  bankTransactionId: string;
  bankAmount: number;
  bankDate: string;
};

function amountsClose(left: number, right: number, tolerance = WORKER_BANK_AMOUNT_TOLERANCE) {
  return Math.abs(Math.round(left) - Math.round(right)) <= tolerance;
}

/** 출금 우선, 없으면 입금(환불) 금액 */
export function resolveWorkerBankPaymentAmount(tx: Pick<BankTransaction, "withdrawal" | "deposit">) {
  const withdrawal = Math.round(Number(tx.withdrawal) || 0);
  if (withdrawal > 0) return withdrawal;
  return Math.round(Number(tx.deposit) || 0);
}

export function resolveWorkerWithdrawalAmountMatch(
  bankAmount: number,
  obligation: Pick<WorkerMonthlyObligation, "expectedAmount" | "expectedFinalAmount" | "payWithVat" | "balance">,
  tolerance = WORKER_BANK_AMOUNT_TOLERANCE,
): WorkerBankAmountMatch | null {
  const amount = Math.round(Number(bankAmount) || 0);
  if (amount <= 0) return null;

  const netPay = Math.round(obligation.expectedAmount || 0);
  const withoutVat = calculateWorkerPaymentVat(netPay, false);
  const withVat = calculateWorkerPaymentVat(netPay, true);
  const balance = Math.round(obligation.balance || 0);

  if (netPay > 0 && amountsClose(amount, withVat.finalPayAmount, tolerance)) {
    return {
      score: 45,
      reason: "\uC2E4\uC9C0\uAE09+\uBD80\uAC00\uC138 \uAE08\uC561 \uC77C\uCE58",
      payWithVat: true,
      expectedFinalAmount: withVat.finalPayAmount,
      netAmount: netPay,
      vatAmount: withVat.vatAmount,
    };
  }

  if (amountsClose(amount, withoutVat.finalPayAmount, tolerance)) {
    return {
      score: 45,
      reason: "\uC2E4\uC9C0\uAE09 \uAE08\uC561 \uC77C\uCE58",
      payWithVat: false,
      expectedFinalAmount: withoutVat.finalPayAmount,
      netAmount: netPay,
      vatAmount: 0,
    };
  }

  if (obligation.payWithVat && balance > 0 && amountsClose(amount, balance, tolerance)) {
    const vatAmount = Math.max(amount - netPay, 0);
    return {
      score: 40,
      reason: "\uBBF8\uC9C0\uAE09 \uC794\uC561(\uBD80\uAC00\uC138 \uD3EC\uD568) \uC77C\uCE58",
      payWithVat: true,
      expectedFinalAmount: obligation.expectedFinalAmount,
      netAmount: netPay,
      vatAmount,
    };
  }

  if (balance > 0 && amount < balance && amount >= balance * 0.95) {
    return {
      score: 30,
      reason: "\uBBF8\uC9C0\uAE09 \uC794\uC561 \uBD80\uBD84 \uC77C\uCE58",
      payWithVat: Boolean(obligation.payWithVat),
      expectedFinalAmount: obligation.expectedFinalAmount,
      netAmount: Math.min(netPay, amount),
      vatAmount: 0,
    };
  }

  if (netPay > 0 && amount > withVat.finalPayAmount && amount <= withVat.finalPayAmount + Math.max(1000, Math.round(netPay * 0.02))) {
    return {
      score: 28,
      reason: "\uBD80\uAC00\uC138 \uD3EC\uD568 \uADFC\uC0AC \uAE08\uC561",
      payWithVat: true,
      expectedFinalAmount: withVat.finalPayAmount,
      netAmount: netPay,
      vatAmount: amount - netPay,
    };
  }

  if (netPay > 0) {
    const impliedNet = Math.round(amount / (1 + WORKER_PAYMENT_VAT_RATE));
    if (amountsClose(amount, calculateWorkerPaymentVat(impliedNet, true).finalPayAmount, tolerance)) {
      return {
        score: 25,
        reason: "\uBD80\uAC00\uC138 \uD3EC\uD568 \uADFC\uC0AC \uAE08\uC561",
        payWithVat: true,
        expectedFinalAmount: calculateWorkerPaymentVat(impliedNet, true).finalPayAmount,
        netAmount: impliedNet,
        vatAmount: amount - impliedNet,
      };
    }
  }

  return null;
}

function workerNameMatchScore(
  tx: BankTransaction,
  worker: string,
  workers: WorkerDepositMatchSource[],
) {
  const master = workers.find((row) => String(row.name || "").trim() === worker);
  const texts = collectBankTransactionWorkerMatchTexts(tx);
  if (!texts.length) return { score: 0, reason: "" };

  if (String(tx.linkedSubject || "").trim() === worker) {
    return { score: 25, reason: "\uD1B5\uC7A5 \uC2DC\uACF5\uC790 \uC5F0\uACB0" };
  }

  if (master && texts.some((text) => findWorkerForBankTransaction({ ...tx, counterpartyName: text }, [master]))) {
    return { score: 35, reason: "\uC608\uAE08\uC8FC/\uBA54\uBAA8 \uC774\uB984 \uC77C\uCE58" };
  }

  return { score: 0, reason: "" };
}

export function buildWorkerBankMatchCandidates(
  tx: BankTransaction,
  obligations: WorkerMonthlyObligation[],
  workers: WorkerDepositMatchSource[] = [],
  options: { worker?: string; tolerance?: number } = {},
): WorkerBankMatchCandidate[] {
  const bankAmount = resolveWorkerBankPaymentAmount(tx);
  if (bankAmount <= 0) return [];

  const bankDate = String(tx.transactionAt || "").slice(0, 10);
  const workerFilter = options.worker?.trim();
  const tolerance = options.tolerance ?? WORKER_BANK_AMOUNT_TOLERANCE;
  const candidates: WorkerBankMatchCandidate[] = [];

  for (const obligation of obligations) {
    if (workerFilter && obligation.worker !== workerFilter) continue;
    if (obligation.balance <= 0 && obligation.expectedFinalAmount <= 0) continue;

    const amountMatch = resolveWorkerWithdrawalAmountMatch(bankAmount, obligation, tolerance);
    if (!amountMatch) continue;

    const nameMatch = workerNameMatchScore(tx, obligation.worker, workers);
    let score = amountMatch.score + nameMatch.score;
    const reasons = [amountMatch.reason];
    if (nameMatch.reason) reasons.push(nameMatch.reason);

    if (bankDate && obligation.monthKey && bankDate.slice(0, 7) === obligation.monthKey) {
      score += 10;
      reasons.push("\uC9C0\uAE09\uC6D4 \uC77C\uCE58");
    } else if (bankDate && obligation.monthKey) {
      const monthDiff = Math.abs(
        new Date(`${bankDate.slice(0, 7)}-01T12:00:00`).getTime() -
          new Date(`${obligation.monthKey}-01T12:00:00`).getTime(),
      );
      const monthsApart = Math.round(monthDiff / (1000 * 60 * 60 * 24 * 30));
      if (monthsApart <= 1) {
        score += 5;
        reasons.push("\uC778\uC811 \uC6D4");
      }
    }

    candidates.push({
      obligation,
      score,
      reasons,
      amountMatch,
      bankTransactionId: tx.id,
      bankAmount,
      bankDate,
    });
  }

  return candidates.sort((a, b) => b.score - a.score || b.bankDate.localeCompare(a.bankDate));
}

export function findBestWorkerBankMatchForObligation(
  obligation: WorkerMonthlyObligation,
  bankTransactions: BankTransaction[],
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerMasterLike[],
  workerMonthlyActualVouchers: WorkerMonthlyActualVoucher[] = [],
  options: { tolerance?: number } = {},
) {
  if (obligation.balance <= 0) return null;

  let best: WorkerBankMatchCandidate | null = null;
  for (const tx of buildUnlinkedWorkerBankWithdrawals(
    bankTransactions,
    bankTransactionFolders,
    workers,
    workerMonthlyActualVouchers,
  )) {
    const workerName = resolveWorkerFromBankTx(tx, bankTransactionFolders, workers);
    if (workerName !== obligation.worker) continue;

    const [candidate] = buildWorkerBankMatchCandidates(tx, [obligation], workers, {
      worker: obligation.worker,
      tolerance: options.tolerance,
    });
    if (!candidate) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

export function resolveBankTxWorkerName(
  tx: BankTransaction,
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerDepositMatchSource[] = [],
) {
  const fromBank = resolveWorkerFromBankTx(tx, bankTransactionFolders, workers);
  if (fromBank) return fromBank;
  const label = String(tx.ledgerClientName || tx.linkedSubject || "").trim();
  if (label && workers.some((row) => String(row.name || "").trim() === label)) return label;
  return "";
}

/** 통장 ERP 찾기: 시공자·금액·월 기준으로 월실지급 후보를 나열합니다. */
export function buildWorkerBankManualLinkCandidates(
  tx: BankTransaction,
  obligations: WorkerMonthlyObligation[],
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerDepositMatchSource[] = [],
  options: { minScore?: number; limit?: number; worker?: string } = {},
) {
  if (String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim()) return [];

  const bankAmount = resolveWorkerBankPaymentAmount(tx);
  if (bankAmount <= 0) return [];

  const workerName =
    String(options.worker || "").trim() ||
    resolveBankTxWorkerName(tx, bankTransactionFolders, workers);
  if (!workerName) return [];

  const workerObligations = obligations.filter((row) => row.worker === workerName);
  const minScore = options.minScore ?? 0;
  const limit = options.limit ?? 30;
  const txDate = String(tx.transactionAt || "").slice(0, 10);

  const amountMatches = buildWorkerBankMatchCandidates(tx, workerObligations, workers, {
    worker: workerName,
  });
  const seenMonths = new Set(amountMatches.map((row) => row.obligation.monthKey));
  const manualRows: WorkerBankMatchCandidate[] = [];

  for (const obligation of workerObligations) {
    if (seenMonths.has(obligation.monthKey)) continue;
    if (obligation.balance <= 0 && obligation.expectedFinalAmount <= 0) continue;

    let score = 20;
    const reasons = ["\uC2DC\uACF5\uC790 \uC77C\uCE58"];
    const nameMatch = workerNameMatchScore(tx, obligation.worker, workers);
    score += nameMatch.score;
    if (nameMatch.reason) reasons.push(nameMatch.reason);

    if (txDate && obligation.monthKey && txDate.slice(0, 7) === obligation.monthKey) {
      score += 10;
      reasons.push("\uC9C0\uAE09\uC6D4 \uC77C\uCE58");
    }

    const amountMatch = resolveWorkerWithdrawalAmountMatch(bankAmount, obligation);
    if (amountMatch) {
      score += amountMatch.score;
      reasons.push(amountMatch.reason);
    }

    if (score < minScore) continue;

    manualRows.push({
      obligation,
      score,
      reasons,
      amountMatch:
        amountMatch ||
        ({
          score: 0,
          reason: "\uAE08\uC561 \uC218\uB3D9 \uD655\uC778",
          payWithVat: Boolean(obligation.payWithVat),
          expectedFinalAmount: obligation.expectedFinalAmount,
          netAmount: obligation.expectedAmount,
          vatAmount: 0,
        } satisfies WorkerBankAmountMatch),
      bankTransactionId: tx.id,
      bankAmount,
      bankDate: txDate,
    });
  }

  return [...amountMatches, ...manualRows]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.obligation.monthKey.localeCompare(a.obligation.monthKey),
    )
    .slice(0, limit);
}

export type WorkerBankLinkMonthOption = {
  obligation: WorkerMonthlyObligation;
  candidate: WorkerBankMatchCandidate | null;
};

/** 시공자 지급 화면과 동일: 금액 일치 월 우선, 나머지는 월 내림차순 */
export function buildWorkerBankLinkMonthOptions(
  tx: BankTransaction,
  obligations: WorkerMonthlyObligation[],
  workers: WorkerDepositMatchSource[] = [],
  options: { worker: string; remainingAmount?: number },
): WorkerBankLinkMonthOption[] {
  const workerName = String(options.worker || "").trim();
  const remaining = Math.round(Number(options.remainingAmount ?? resolveWorkerBankPaymentAmount(tx)) || 0);
  if (!workerName || remaining <= 0) return [];

  const workerObligations = obligations
    .filter((row) => row.worker === workerName)
    .filter((row) => row.balance > 0 || row.expectedFinalAmount > 0);

  const scoredCandidates = buildWorkerBankMatchCandidates(tx, workerObligations, workers, {
    worker: workerName,
  });
  const candidateByMonth = new Map(scoredCandidates.map((row) => [row.obligation.monthKey, row]));
  const scored = scoredCandidates.map((candidate) => ({
    obligation: candidate.obligation,
    candidate,
  }));
  const rest = workerObligations
    .filter((row) => !candidateByMonth.has(row.monthKey))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .map((obligation) => ({ obligation, candidate: null as WorkerBankMatchCandidate | null }));

  return [...scored, ...rest];
}

export function buildWorkerBankLinkCandidateForObligation(
  tx: BankTransaction,
  obligation: WorkerMonthlyObligation,
  workers: WorkerDepositMatchSource[] = [],
): WorkerBankMatchCandidate {
  const bankAmount = resolveWorkerBankPaymentAmount(tx);
  const bankDate = String(tx.transactionAt || "").slice(0, 10);
  const amountMatch =
    resolveWorkerWithdrawalAmountMatch(bankAmount, obligation) ||
    ({
      score: 0,
      reason: "\uAE08\uC561 \uC218\uB3D9 \uD655\uC778",
      payWithVat: Boolean(obligation.payWithVat),
      expectedFinalAmount: obligation.expectedFinalAmount,
      netAmount: obligation.expectedAmount,
      vatAmount: 0,
    } satisfies WorkerBankAmountMatch);

  const nameMatch = workerNameMatchScore(tx, obligation.worker, workers);
  const reasons = [nameMatch.reason, amountMatch.reason].filter(Boolean);

  return {
    obligation,
    score: amountMatch.score + nameMatch.score,
    reasons,
    amountMatch,
    bankTransactionId: tx.id,
    bankAmount,
    bankDate,
  };
}

export function listUnlinkedWorkerBankMatchesForWorker(
  worker: string,
  bankTransactions: BankTransaction[],
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerMasterLike[],
  obligations: WorkerMonthlyObligation[],
  workerMonthlyActualVouchers: WorkerMonthlyActualVoucher[] = [],
  options: { tolerance?: number } = {},
) {
  const rows: WorkerBankMatchCandidate[] = [];
  for (const tx of buildUnlinkedWorkerBankWithdrawals(
    bankTransactions,
    bankTransactionFolders,
    workers,
    workerMonthlyActualVouchers,
  )) {
    const workerName = resolveWorkerFromBankTx(tx, bankTransactionFolders, workers);
    if (workerName !== worker) continue;
    rows.push(...buildWorkerBankMatchCandidates(tx, obligations, workers, { worker, tolerance: options.tolerance }));
  }
  return rows.sort((a, b) => b.score - a.score || b.bankDate.localeCompare(a.bankDate));
}

export function autoMatchWorkerBankPayments(input: {
  bankTransactions: BankTransaction[];
  bankTransactionFolders: BankTransactionFolder[];
  workers: WorkerMasterLike[];
  obligations: WorkerMonthlyObligation[];
  workerMonthlyActualVouchers?: WorkerMonthlyActualVoucher[];
  tolerance?: number;
}) {
  const usedTxIds = new Set<string>();
  const matches: WorkerBankMatchCandidate[] = [];

  const openObligations = input.obligations
    .filter((row) => row.balance > 0)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey) || b.balance - a.balance);

  for (const obligation of openObligations) {
    let best: WorkerBankMatchCandidate | null = null;
    for (const tx of buildUnlinkedWorkerBankWithdrawals(
      input.bankTransactions,
      input.bankTransactionFolders,
      input.workers,
      input.workerMonthlyActualVouchers || [],
    )) {
      if (usedTxIds.has(tx.id)) continue;
      const workerName = resolveWorkerFromBankTx(tx, input.bankTransactionFolders, input.workers);
      if (workerName !== obligation.worker) continue;

      const [candidate] = buildWorkerBankMatchCandidates(tx, [obligation], input.workers, {
        worker: obligation.worker,
        tolerance: input.tolerance,
      });
      if (!candidate || candidate.score < 40) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }

    if (best) {
      usedTxIds.add(best.bankTransactionId);
      matches.push(best);
    }
  }

  return matches;
}
