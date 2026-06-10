#!/usr/bin/env node
/**
 * Backfill fixed-expense bank links using May 2026 registration patterns + learn rules.
 * Usage: npx tsx scripts/repair-backfill-fixed-from-rules.mjs [dbPath] [--dry-run]
 */
import { DatabaseSync } from "node:sqlite";
import {
  assignBankTxToFixedExpensePayment,
  buildFixedExpensePaymentMemoFromBankTx,
  buildBankLedgerMatchRuleFromRegistration,
  buildBankLedgerMatchHaystack,
  fixedLearnRuleAmountMatches,
  formatLearnRuleConfidencePercent,
  meetsLedgerRegistrationConfidenceThreshold,
  normalizeBankLearnRules,
  scoreBankLearnRule,
  syncBankTransactionLedgerLinkFields,
  upsertBankLearnRule,
} from "../src/utils/bankCompanyLedger.ts";
import {
  ensureDefaultBankTransactionFolders,
  syncLedgerLinkedBankTransactionFolders,
} from "../src/utils/bankTransactionFolders.ts";
import { isNetGroupSuppressed } from "../src/utils/bankPreauthNetting.ts";
import { isCheckCardBankTransaction } from "../src/utils/bankTransactions.ts";
import {
  getMonthKey,
  resolveCompanyExpenseKind,
  resolveFixedExpenseIdForBankTransaction,
} from "../src/utils/companyLedger.ts";

const REPAIR_MIN_CONFIDENCE = 72;
const monthArg = process.argv.find((arg) => arg.startsWith("--months="));
const TARGET_MONTHS = monthArg
  ? monthArg.slice("--months=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : ["2026-02", "2026-03", "2026-04"];

function txMonthKey(tx) {
  return String(tx.transactionAt || "").slice(0, 7);
}

function inTargetMonths(tx) {
  return TARGET_MONTHS.includes(txMonthKey(tx));
}

const dbPath = process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) || "data/erp.sqlite";
const dryRun = process.argv.includes("--dry-run");

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

let bankTransactions = [...(data.bankTransactions || [])];
let companyExpenses = [...(data.companyExpenses || [])];
let fixedExpensePayments = [...(data.fixedExpensePayments || [])];
const fixedExpenses = data.fixedExpenses || [];
let rules = normalizeBankLearnRules(data.bankLedgerRules || []).filter(
  (rule) => rule.kind === "fixed" && rule.fixedExpenseId,
);
const seededRules = [];
const prunedRules = [];

function normalizeCp(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function buildMayPatternRegistry(transactions, payments) {
  const byCpAmount = new Map();
  const byAmountToken = new Map();

  for (const tx of transactions) {
    if (!String(tx.transactionAt || "").startsWith("2026-05")) continue;
    if (!tx.linkedFixedExpensePaymentId) continue;
    if (!(Number(tx.withdrawal) > 0)) continue;

    const payment = payments.find((row) => row.id === tx.linkedFixedExpensePaymentId);
    if (!payment?.fixedExpenseId) continue;

    const amount = Number(tx.withdrawal);
    const cp = normalizeCp(tx.counterpartyName);
    const fixed = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
    const entry = {
      fixedExpenseId: payment.fixedExpenseId,
      fixedName: fixed?.name,
      amount,
      haystack: buildBankLedgerMatchHaystack(tx),
      sourceDate: String(tx.transactionAt || "").slice(0, 10),
    };

    if (cp) {
      const key = `${cp}|${amount}`;
      if (!byCpAmount.has(key)) byCpAmount.set(key, entry);
    }
    const descCp = normalizeCp(tx.description);
    if (descCp.length >= 2 && descCp !== cp) {
      const descKey = `${descCp}|${amount}`;
      if (!byCpAmount.has(descKey)) byCpAmount.set(descKey, entry);
    }

    const tokenKey = `${amount}`;
    const bucket = byAmountToken.get(tokenKey) || [];
    bucket.push(entry);
    byAmountToken.set(tokenKey, bucket);
  }

  return { byCpAmount, byAmountToken };
}

function descriptionHaystack(tx) {
  return buildBankLedgerMatchHaystack(tx);
}

function mayEntryMatchesTx(tx, entry) {
  const haystack = descriptionHaystack(tx);
  if (!haystack || !entry.haystack) return false;

  const markers = [
    "\uc544\ub9c8\ub178",
    "\uc608\uc2a4\ud3fc",
    "google",
    "\uace0\uc591\uc0bc\uc1a1",
    "\ud604\ub300\ucea0\ud53c\ud0c8",
    "\ucf00\uc774\ud2f0",
    "\ud6a8\uc131",
    "\uc815\uc9c4\ud76c",
    "\uc2e0\ud76c\uc219",
    "\ub098\uc774\uc2a4",
    "\uad6d\ubbfc\uac74\uac15",
    "\ud55c\ud654\uc0dd\uba85",
  ];
  for (const marker of markers) {
    if (entry.haystack.includes(marker) && haystack.includes(marker)) return true;
  }

  const entryTokens = entry.haystack.split(/\s+/).filter((token) => token.length >= 4);
  const hits = entryTokens.filter((token) => haystack.includes(token)).length;
  return hits >= 2;
}

function resolveFromMayPattern(tx, mayPatterns) {
  const amount = Number(tx.withdrawal || 0);
  if (amount <= 0) return null;

  const cp = normalizeCp(tx.counterpartyName);
  const descCp = normalizeCp(tx.description);
  if (cp) {
    const direct = mayPatterns.byCpAmount.get(`${cp}|${amount}`);
    if (direct) return { ...direct, via: "cp_amount" };
  }
  if (!cp && descCp.length >= 2) {
    const direct = mayPatterns.byCpAmount.get(`${descCp}|${amount}`);
    if (direct) return { ...direct, via: "desc_cp_amount" };
  }

  const bucket = (mayPatterns.byAmountToken.get(String(amount)) || []).filter((entry) =>
    mayEntryMatchesTx(tx, entry),
  );
  if (bucket.length === 1) {
    return { ...bucket[0], via: "amount_desc" };
  }
  if (bucket.length > 1) {
    let best = null;
    let bestHits = 0;
    const haystack = descriptionHaystack(tx);
    for (const entry of bucket) {
      if (!entry.haystack) continue;
      const entryTokens = entry.haystack.split(/\s+/).filter((token) => token.length >= 4);
      const hits = entryTokens.filter((token) => haystack.includes(token)).length;
      if (hits > bestHits) {
        bestHits = hits;
        best = entry;
      }
    }
    if (best && bestHits >= 2) return { ...best, via: "amount_desc_tiebreak" };
  }

  return null;
}

function pruneConflictingFixedRules(rulesIn, mayPatterns, fixedItems) {
  const mayByCp = new Map();
  for (const [key, entry] of mayPatterns.byCpAmount.entries()) {
    const cp = key.split("|")[0];
    const list = mayByCp.get(cp) || [];
    list.push(entry);
    mayByCp.set(cp, list);
  }

  return rulesIn.filter((rule) => {
    const cp = normalizeCp(rule.counterpartyName);
    if (!cp) return true;
    const mayEntries = mayByCp.get(cp);
    if (!mayEntries?.length) return true;

    const ruleAmount = Number(rule.amount || 0);
    const fixedName = fixedItems.find((row) => row.id === rule.fixedExpenseId)?.name || "";

    for (const may of mayEntries) {
      if (may.fixedExpenseId === rule.fixedExpenseId) continue;
      if (ruleAmount > 0 && ruleAmount !== may.amount) continue;

      prunedRules.push({
        removed: fixedName,
        counterparty: rule.counterpartyName,
        amount: rule.amount,
        kept: may.fixedName,
        keptAmount: may.amount,
      });
      return false;
    }
    return true;
  });
}

function findBestFixedRuleForRepair(tx, rulesIn, fixedItems, mayPatterns) {
  const may = resolveFromMayPattern(tx, mayPatterns);
  if (may) {
    return {
      fixedExpenseId: may.fixedExpenseId,
      score: 99,
      confidence: 99,
      via: may.via,
      fixedName: may.fixedName,
    };
  }

  const scored = rulesIn
    .map((rule) => ({ rule, score: scoreBankLearnRule(tx, rule, fixedItems) }))
    .filter((row) => row.score > 0 && fixedLearnRuleAmountMatches(tx, row.rule, fixedItems))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const amount = Number(tx.withdrawal || 0);
  const exactAmount = scored.filter((row) => Number(row.rule.amount || 0) === amount);
  const pool = exactAmount.length ? exactAmount : scored;

  const best = pool[0];
  const confidence = formatLearnRuleConfidencePercent(best.score);
  const meetsRepair =
    meetsLedgerRegistrationConfidenceThreshold(confidence) || confidence >= REPAIR_MIN_CONFIDENCE;
  if (!meetsRepair) return null;

  let fixedExpenseId =
    resolveFixedExpenseIdForBankTransaction(tx, fixedItems, best.rule.fixedExpenseId) ||
    best.rule.fixedExpenseId;

  const mayOverride = mayPatterns.byCpAmount.get(`${normalizeCp(tx.counterpartyName)}|${amount}`);
  if (mayOverride) fixedExpenseId = mayOverride.fixedExpenseId;

  return {
    fixedExpenseId,
    score: best.score,
    confidence,
    via: "learn_rule",
    fixedName: fixedItems.find((row) => row.id === fixedExpenseId)?.name,
    runnerUp: pool[1]
      ? fixedItems.find((row) => row.id === pool[1].rule.fixedExpenseId)?.name
      : undefined,
  };
}

function monthHasLinkedPayment(fixedExpenseId, monthKey, excludeTxId = "") {
  return fixedExpensePayments.some((payment) => {
    if (payment.fixedExpenseId !== fixedExpenseId) return false;
    if (getMonthKey(payment.date) !== monthKey) return false;
    if (!payment.bankTransactionId) return false;
    if (payment.bankTransactionId === excludeTxId) return false;
    return true;
  });
}

const mayPatterns = buildMayPatternRegistry(bankTransactions, fixedExpensePayments);

for (const tx of bankTransactions) {
  if (!String(tx.transactionAt || "").startsWith("2026-05")) continue;
  if (!tx.linkedFixedExpensePaymentId) continue;
  if (!(Number(tx.withdrawal) > 0)) continue;

  const payment = fixedExpensePayments.find((row) => row.id === tx.linkedFixedExpensePaymentId);
  if (!payment?.fixedExpenseId) continue;

  const nextRule = buildBankLedgerMatchRuleFromRegistration(
    tx,
    payment.fixedExpenseId,
    "repair-seed-from-may",
    Number(tx.withdrawal || 0),
  );
  rules = upsertBankLearnRule(rules, nextRule);
  seededRules.push({
    date: String(tx.transactionAt || "").slice(0, 10),
    counterparty: tx.counterpartyName || tx.description,
    amount: tx.withdrawal,
    fixed: fixedExpenses.find((row) => row.id === payment.fixedExpenseId)?.name,
  });
}

rules = pruneConflictingFixedRules(rules, mayPatterns, fixedExpenses);

const actions = [];
const skipped = [];

for (const tx of bankTransactions) {
  if (tx.linkedFixedExpensePaymentId) continue;
  if (!(Number(tx.withdrawal) > 0)) continue;
  if (!inTargetMonths(tx)) continue;
  if (isNetGroupSuppressed(tx)) continue;

  const mayPreview = resolveFromMayPattern(tx, mayPatterns);
  if (isCheckCardBankTransaction(tx) && !mayPreview) continue;

  const match = findBestFixedRuleForRepair(tx, rules, fixedExpenses, mayPatterns);
  if (!match?.fixedExpenseId) {
    skipped.push({
      date: String(tx.transactionAt || "").slice(0, 10),
      counterparty: tx.counterpartyName || tx.description,
      amount: tx.withdrawal,
      reason: "no_match",
    });
    continue;
  }

  const fixedExpenseId = match.fixedExpenseId;
  const fixedItem = fixedExpenses.find((row) => row.id === fixedExpenseId);
  if (!fixedItem?.isActive) {
    skipped.push({ date: String(tx.transactionAt || "").slice(0, 10), reason: "inactive", fixed: fixedItem?.name });
    continue;
  }

  const monthKey = getMonthKey(String(tx.transactionAt || "").slice(0, 10));
  if (monthKey && monthHasLinkedPayment(fixedExpenseId, monthKey, tx.id)) {
    skipped.push({
      date: String(tx.transactionAt || "").slice(0, 10),
      counterparty: tx.counterpartyName || tx.description,
      amount: tx.withdrawal,
      fixed: fixedItem.name,
      reason: "month_dedup",
      runnerUp: match.runnerUp,
    });
    continue;
  }

  const linkedExpense = tx.linkedCompanyExpenseId
    ? companyExpenses.find((row) => row.id === tx.linkedCompanyExpenseId)
    : companyExpenses.find((row) => row.bankTransactionId === tx.id);

  if (linkedExpense && resolveCompanyExpenseKind(linkedExpense) === "fixed") {
    skipped.push({
      date: String(tx.transactionAt || "").slice(0, 10),
      reason: "already_fixed_expense",
      category: linkedExpense.category,
    });
    continue;
  }

  if (linkedExpense && resolveCompanyExpenseKind(linkedExpense) === "variable") {
    companyExpenses = companyExpenses.filter((row) => row.id !== linkedExpense.id);
  }

  const assignment = assignBankTxToFixedExpensePayment({
    tx,
    resolvedFixedExpenseId: fixedExpenseId,
    fixedItem,
    payments: fixedExpensePayments,
    fixedExpenses,
    resolvedCategory: fixedItem.category?.trim() || "",
    memo: buildFixedExpensePaymentMemoFromBankTx(tx, fixedItem),
    savedBy: "repair-backfill-fixed",
  });

  fixedExpensePayments = assignment.payments;
  bankTransactions = bankTransactions.map((row) =>
    row.id === tx.id
      ? {
          ...row,
          linkedFixedExpensePaymentId: assignment.paymentId,
          linkedCompanyExpenseId: undefined,
          folderId: row.folderId || "bank-folder-ledger-default",
          classifiedAt: row.classifiedAt || new Date().toISOString(),
        }
      : row,
  );

  actions.push({
    date: String(tx.transactionAt || "").slice(0, 10),
    counterparty: tx.counterpartyName || tx.description,
    amount: tx.withdrawal,
    fixed: fixedItem.name,
    score: match.score,
    confidence: match.confidence,
    via: match.via,
    removedVariable: linkedExpense?.category || null,
    createdPayment: assignment.created,
    reusedPayment: !assignment.created,
  });
}

const folders = ensureDefaultBankTransactionFolders(data.bankTransactionFolders || []);
const synced = syncBankTransactionLedgerLinkFields(bankTransactions, companyExpenses, fixedExpensePayments);
const folderSync = syncLedgerLinkedBankTransactionFolders(synced, folders, {
  companyExpenses,
  fixedExpensePayments,
});

const skipSummary = skipped.reduce((acc, row) => {
  acc[row.reason] = (acc[row.reason] || 0) + 1;
  return acc;
}, {});

console.log(
  JSON.stringify(
    {
      dryRun,
      targetMonths: TARGET_MONTHS,
      seededRuleCount: seededRules.length,
      prunedRuleCount: prunedRules.length,
      prunedRules,
      fixedRules: rules.length,
      linkedCount: actions.length,
      skipSummary,
      skippedSample: skipped.slice(0, 25),
      actions,
    },
    null,
    2,
  ),
);

if (dryRun || (!actions.length && !seededRules.length && !prunedRules.length)) process.exit(0);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({
    ...data,
    bankLedgerRules: [
      ...(data.bankLedgerRules || []).filter((row) => row.kind !== "fixed" || !row.fixedExpenseId),
      ...rules,
    ],
    bankTransactions: folderSync.transactions,
    bankTransactionFolders: folderSync.folders,
    companyExpenses,
    fixedExpensePayments,
  }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-backfill-fixed-from-rules",
);
console.log("saved version", Number(state.version || 0) + 1);
