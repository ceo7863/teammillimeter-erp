import type { BankLearnRule } from "./bankCompanyLedger";
import { filterBankLearnDescriptionTokens } from "./bankLearnTokens";
import { makeLedgerId } from "./companyLedger";
import { makeBankTransactionId, type BankTransaction } from "./bankTransactions";

export type BankTransactionNetGroupRole = "preauth_withdrawal" | "preauth_refund" | "settlement";

export type PreauthNetGroup = {
  id: string;
  preauthWithdrawalTx: BankTransaction;
  refundTx: BankTransaction;
  settlementTx: BankTransaction;
  preauthAmount: number;
  settlementAmount: number;
  counterpartyName: string;
  date: string;
  accountNumber: string;
};

export const DEFAULT_PREAUTH_NET_KEYWORDS = ["\uC8FC\uC720\uC18C", "\uC8FC\uC720", "LPG", "\uCDA9\uC804\uC18C"];

const PREAUTH_NET_WINDOW_MS = 60 * 60 * 1000;

export function preauthNetGroupKey(group: PreauthNetGroup) {
  return [group.preauthWithdrawalTx.id, group.refundTx.id, group.settlementTx.id].join(":");
}

export function normalizePreauthCounterpartyName(tx: BankTransaction) {
  return String(tx.counterpartyName || tx.description || "")
    .trim()
    .replace(/\s+/g, " ");
}

function txDate(tx: BankTransaction) {
  return String(tx.transactionAt || "").slice(0, 10);
}

function txTimeMs(tx: BankTransaction) {
  const ms = new Date(tx.transactionAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildPreauthHaystack(tx: BankTransaction) {
  return [tx.counterpartyName, tx.description, tx.memo, tx.transactionType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function isEligibleForPreauthNetDetection(tx: BankTransaction) {
  return !tx.netGroupId;
}

export function isEligibleForPreauthNetting(tx: BankTransaction) {
  if (!isEligibleForPreauthNetDetection(tx)) return false;
  if (tx.folderId) return false;
  if (tx.linkedCompanyExpenseId) return false;
  if (tx.linkedFixedExpensePaymentId) return false;
  return true;
}

export function matchesPreauthNetRule(tx: BankTransaction, rules: BankLearnRule[] = []) {
  const haystack = buildPreauthHaystack(tx);
  const counterpartyKey = normalizePreauthCounterpartyName(tx).toLowerCase().replace(/\s+/g, "");

  const preauthRules = rules.filter((rule) => rule.kind === "preauth_net");
  if (preauthRules.length) {
    return preauthRules.some((rule) => {
      const ruleCounterparty = String(rule.counterpartyName || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
      if (ruleCounterparty && counterpartyKey.includes(ruleCounterparty)) return true;
      return rule.descriptionTokens.some((token) => {
        const normalized = String(token || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
        return normalized.length >= 2 && haystack.includes(normalized);
      });
    });
  }

  return DEFAULT_PREAUTH_NET_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function findNextPreauthTripletWwd(
  txs: BankTransaction[],
  used: Set<string>,
  windowMs: number,
): Omit<PreauthNetGroup, "id"> | null {
  for (let i = 0; i < txs.length; i += 1) {
    const w1 = txs[i];
    if (used.has(w1.id) || !isEligibleForPreauthNetDetection(w1)) continue;
    const preauthAmount = Number(w1.withdrawal || 0);
    if (!(preauthAmount > 0) || w1.deposit > 0) continue;

    for (let j = i + 1; j < txs.length; j += 1) {
      const settlement = txs[j];
      if (used.has(settlement.id) || !isEligibleForPreauthNetDetection(settlement)) continue;
      const settlementAmount = Number(settlement.withdrawal || 0);
      if (!(settlementAmount > 0) || settlement.deposit > 0) continue;
      if (settlementAmount >= preauthAmount) continue;
      if (txTimeMs(settlement) - txTimeMs(w1) > windowMs) break;

      for (let k = j + 1; k < txs.length; k += 1) {
        const refund = txs[k];
        if (used.has(refund.id) || !isEligibleForPreauthNetDetection(refund)) continue;
        if (refund.deposit !== preauthAmount || refund.withdrawal > 0) continue;
        if (txTimeMs(refund) - txTimeMs(w1) > windowMs) break;

        return {
          preauthWithdrawalTx: w1,
          refundTx: refund,
          settlementTx: settlement,
          preauthAmount,
          settlementAmount,
          counterpartyName: normalizePreauthCounterpartyName(w1),
          date: txDate(w1),
          accountNumber: String(w1.accountNumber || "").trim(),
        };
      }
    }
  }
  return null;
}

function findNextPreauthTriplet(
  txs: BankTransaction[],
  used: Set<string>,
  windowMs: number,
): Omit<PreauthNetGroup, "id"> | null {
  for (let i = 0; i < txs.length; i += 1) {
    const w1 = txs[i];
    if (used.has(w1.id) || !isEligibleForPreauthNetDetection(w1)) continue;
    const preauthAmount = Number(w1.withdrawal || 0);
    if (!(preauthAmount > 0) || w1.deposit > 0) continue;

    for (let j = i + 1; j < txs.length; j += 1) {
      const refund = txs[j];
      if (used.has(refund.id) || !isEligibleForPreauthNetDetection(refund)) continue;
      if (refund.deposit !== preauthAmount || refund.withdrawal > 0) continue;
      if (txTimeMs(refund) - txTimeMs(w1) > windowMs) break;

      for (let k = j + 1; k < txs.length; k += 1) {
        const settlement = txs[k];
        if (used.has(settlement.id) || !isEligibleForPreauthNetDetection(settlement)) continue;
        const settlementAmount = Number(settlement.withdrawal || 0);
        if (!(settlementAmount > 0) || settlement.deposit > 0) continue;
        if (txTimeMs(settlement) - txTimeMs(w1) > windowMs) break;

        return {
          preauthWithdrawalTx: w1,
          refundTx: refund,
          settlementTx: settlement,
          preauthAmount,
          settlementAmount,
          counterpartyName: normalizePreauthCounterpartyName(w1),
          date: txDate(w1),
          accountNumber: String(w1.accountNumber || "").trim(),
        };
      }
    }
  }
  return null;
}

export function detectPreauthNetGroups(
  transactions: BankTransaction[],
  rules: BankLearnRule[] = [],
  options: { windowMinutes?: number } = {},
): PreauthNetGroup[] {
  const windowMs = Math.max(1, options.windowMinutes ?? 60) * 60 * 1000;
  const buckets = new Map<string, BankTransaction[]>();

  for (const tx of transactions) {
    if (!isEligibleForPreauthNetDetection(tx)) continue;
    if (!matchesPreauthNetRule(tx, rules)) continue;
    const accountNumber = String(tx.accountNumber || "").trim();
    const date = txDate(tx);
    const counterparty = normalizePreauthCounterpartyName(tx);
    if (!accountNumber || !date || !counterparty) continue;
    const key = `${accountNumber}|${date}|${counterparty.toLowerCase()}`;
    const bucket = buckets.get(key) || [];
    bucket.push(tx);
    buckets.set(key, bucket);
  }

  const groups: PreauthNetGroup[] = [];

  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort((a, b) => {
      const timeDiff = txTimeMs(a) - txTimeMs(b);
      if (timeDiff !== 0) return timeDiff;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
    const used = new Set<string>();
    let triplet = findNextPreauthTriplet(sorted, used, windowMs);
    if (!triplet) triplet = findNextPreauthTripletWwd(sorted, used, windowMs);
    while (triplet) {
      groups.push({ id: makeBankTransactionId(), ...triplet });
      used.add(triplet.preauthWithdrawalTx.id);
      used.add(triplet.refundTx.id);
      used.add(triplet.settlementTx.id);
      triplet = findNextPreauthTriplet(sorted, used, windowMs);
    }
  }

  return groups.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function applyPreauthNetGroups(transactions: BankTransaction[], groups: PreauthNetGroup[]) {
  if (!groups.length) return transactions;
  const patch = new Map<string, { netGroupId: string; netGroupRole: BankTransactionNetGroupRole }>();
  for (const group of groups) {
    patch.set(group.preauthWithdrawalTx.id, { netGroupId: group.id, netGroupRole: "preauth_withdrawal" });
    patch.set(group.refundTx.id, { netGroupId: group.id, netGroupRole: "preauth_refund" });
    patch.set(group.settlementTx.id, { netGroupId: group.id, netGroupRole: "settlement" });
  }
  return transactions.map((tx) => {
    const next = patch.get(tx.id);
    return next ? { ...tx, ...next } : tx;
  });
}

export function buildPreauthNetLearnRule(settlementTx: BankTransaction, createdBy?: string): BankLearnRule {
  const counterpartyName = normalizePreauthCounterpartyName(settlementTx);
  const descriptionTokens = filterBankLearnDescriptionTokens(
    [
      settlementTx.description,
      settlementTx.memo,
      settlementTx.transactionType,
      counterpartyName,
    ]
      .filter(Boolean)
      .flatMap((part) =>
        String(part)
          .split(/[\s/.,\-_]+/)
          .map((token) => token.trim().toLowerCase())
          .filter((token) => token.length >= 2),
      ),
  );

  return {
    id: makeLedgerId(),
    kind: "preauth_net",
    counterpartyName: counterpartyName || undefined,
    descriptionTokens,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || undefined,
    sourceBankTransactionId: settlementTx.id,
  };
}

export function isNetGroupSuppressed(tx: BankTransaction) {
  return tx.netGroupRole === "preauth_withdrawal" || tx.netGroupRole === "preauth_refund";
}

export function getEffectiveWithdrawal(tx: BankTransaction) {
  if (isNetGroupSuppressed(tx)) return 0;
  if (tx.netGroupRole === "settlement" || tx.withdrawal > 0) return tx.withdrawal;
  return 0;
}

export function hasPreauthNetLearnRule(rules: BankLearnRule[] = []) {
  return rules.some((rule) => rule.kind === "preauth_net");
}

export function filterPreauthNetGroupsForAutoApply(
  groups: PreauthNetGroup[],
  _rules: BankLearnRule[],
  addedTransactionIds: Set<string>,
) {
  if (!addedTransactionIds.size) return [];
  return groups.filter((group) => {
    return (
      addedTransactionIds.has(group.preauthWithdrawalTx.id) ||
      addedTransactionIds.has(group.refundTx.id) ||
      addedTransactionIds.has(group.settlementTx.id)
    );
  });
}
