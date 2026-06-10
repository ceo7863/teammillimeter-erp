#!/usr/bin/env node
/**
 * Phase 2: Reset Feb�Apr variable expense links that conflict with high-confidence learn rules,
 * then re-apply auto learn rules for those transactions.
 *
 * Usage: node scripts/repair-reset-mismatched-variable-feb-apr.mjs [dbPath] [--dry-run]
 *        [--months=2026-02,2026-03,2026-04]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  assignBankTxToFixedExpensePayment,
  autoApplyBankLearnRules,
  buildCompanyExpensePrefillFromBankTransaction,
  buildFixedExpensePaymentMemoFromBankTx,
  formatLearnRuleConfidencePercent,
  hasManualLedgerCategoryMemoOverride,
  meetsLedgerRegistrationConfidenceThreshold,
  findBestBankLearnRuleWithScore,
  normalizeBankLearnRules,
  syncBankTransactionLedgerLinkFields,
} from "../src/utils/bankCompanyLedger.ts";
import { isNetGroupSuppressed } from "../src/utils/bankPreauthNetting.ts";
import {
  ensureDefaultBankTransactionFolders,
  syncLedgerLinkedBankTransactionFolders,
} from "../src/utils/bankTransactionFolders.ts";
import {
  normalizeExpenseCategoryName,
  resolveCompanyExpenseKind,
} from "../src/utils/companyLedger.ts";
import {
  CATEGORY_ACCOUNT_DEFAULTS,
  normalizeAccountCodes,
  normalizeLedgerCategories,
  resetBankTransactionLedger,
  resolveFixedExpenseAccountCode,
} from "../src/utils/ledgerSystem.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const monthArg = process.argv.find((arg) => arg.startsWith("--months="));
const TARGET_MONTHS = monthArg
  ? monthArg.slice("--months=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : ["2026-02", "2026-03", "2026-04"];

const dbPath =
  process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) ||
  path.join(rootDir, "data/erp.sqlite");
const dryRun = process.argv.includes("--dry-run");

const PROTECTED_ACCOUNT_CODES = new Set(["1053", "108", "201", "501"]);
const WORKER_FOLDER_ID = "bank-folder-worker-default";
const AUTO_MEMO_PREFIX = "\uC790\uB3D9 \uB4F1\uB85D \u00B7 ";

function txMonthKey(tx) {
  return String(tx.transactionAt || "").slice(0, 7);
}

function inTargetMonths(tx) {
  return TARGET_MONTHS.includes(txMonthKey(tx));
}

function backupDb(sourcePath) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const backupDir = path.join(rootDir, "data/backups/manual", `pre-reset-mismatch-feb-apr-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "erp.sqlite");
  fs.copyFileSync(sourcePath, backupPath);
  return backupPath;
}

function expenseForTx(tx, expenses) {
  if (tx.linkedCompanyExpenseId) {
    const linked = expenses.find((row) => row.id === tx.linkedCompanyExpenseId);
    if (linked) return linked;
  }
  return expenses.find((row) => row.bankTransactionId === tx.id);
}

function paymentForTx(tx, payments) {
  if (tx.linkedFixedExpensePaymentId) {
    const linked = payments.find((row) => row.id === tx.linkedFixedExpensePaymentId);
    if (linked) return linked;
  }
  return payments.find((row) => row.bankTransactionId === tx.id);
}

function isProtectedTx(tx, expense) {
  if (tx.folderId === WORKER_FOLDER_ID) return true;
  const account = String(tx.ledgerAccountCode || "").trim();
  if (PROTECTED_ACCOUNT_CODES.has(account)) return true;
  const cat = normalizeExpenseCategoryName(String(expense?.category || ""));
  if (cat === "\uC778\uAC74\uBE44") return true;
  return false;
}

function resolveExpectedFromRule(rule, fixedExpenses, ledgerCategories) {
  if (rule.kind === "fixed") {
    const fixedItem = fixedExpenses.find((row) => row.id === rule.fixedExpenseId);
    if (!fixedItem) return null;
    return {
      kind: "fixed",
      category: normalizeExpenseCategoryName(fixedItem.category || ""),
      fixedExpenseId: fixedItem.id,
      fixedName: fixedItem.name,
      accountCode: resolveFixedExpenseAccountCode(fixedItem, ledgerCategories),
    };
  }
  if (rule.kind === "manual") {
    const category = normalizeExpenseCategoryName(String(rule.category || ""));
    if (!category) return null;
    return {
      kind: "variable",
      category,
      accountCode: CATEGORY_ACCOUNT_DEFAULTS[category] || "",
    };
  }
  if (rule.kind === "custom") {
    const accountCode = String(rule.accountCode || "").trim();
    const category = normalizeExpenseCategoryName(String(rule.category || "").trim());
    return {
      kind: "variable",
      category,
      accountCode: accountCode || CATEGORY_ACCOUNT_DEFAULTS[category] || "",
    };
  }
  return null;
}

function detectMismatch(tx, expense, learnMatch, fixedExpenses, ledgerCategories, fixedIds, payments) {
  const reasons = [];
  const rule = learnMatch.rule;
  const expected = resolveExpectedFromRule(rule, fixedExpenses, ledgerCategories);
  if (!expected) return null;

  const currentCategory = normalizeExpenseCategoryName(String(expense?.category || ""));

  if (tx.ledgerFixedExpenseId && !fixedIds.has(tx.ledgerFixedExpenseId)) {
    reasons.push("orphan_ledger_fixed_expense_id");
  }

  if (expected.kind === "fixed") {
    if (expense && resolveCompanyExpenseKind(expense) === "variable") {
      reasons.push("should_be_fixed_expense");
    } else if (!paymentForTx(tx, payments)) {
      reasons.push("should_be_fixed_expense");
    }
  } else if (expected.category && currentCategory && currentCategory !== expected.category) {
    reasons.push("category_mismatch");
  }

  if (!reasons.length) return null;

  return {
    reasons,
    expected,
    current: {
      category: currentCategory,
      accountCode: String(tx.ledgerAccountCode || "").trim() || null,
      expenseId: expense?.id || null,
    },
    ruleKind: rule.kind,
    confidence: formatLearnRuleConfidencePercent(learnMatch.score),
    score: learnMatch.score,
  };
}

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const fixedExpenses = (data.fixedExpenses || []).filter((row) => row.isActive !== false);
const fixedIds = new Set(fixedExpenses.map((row) => row.id));
const rules = normalizeBankLearnRules(data.bankLedgerRules || []);
const ledgerCategories = normalizeLedgerCategories(data.ledgerCategories);
const accountCodes = normalizeAccountCodes(data.accountCodes);
const expenseCategories = data.expenseCategories || [];

let bankTransactions = [...(data.bankTransactions || [])];
let companyExpenses = [...(data.companyExpenses || [])];
let fixedExpensePayments = [...(data.fixedExpensePayments || [])];

const candidates = [];
const skipped = [];

for (const tx of bankTransactions) {
  if (!inTargetMonths(tx)) continue;
  if (!(Number(tx.withdrawal || 0) > 0)) continue;
  if (isNetGroupSuppressed(tx)) continue;

  const expense = expenseForTx(tx, companyExpenses);
  const fixedPayment = paymentForTx(tx, fixedExpensePayments);

  if (!expense && !tx.ledgerFixedExpenseId) continue;
  if (fixedPayment && !expense) continue;
  if (expense && resolveCompanyExpenseKind(expense) !== "variable") continue;
  if (isProtectedTx(tx, expense)) {
    skipped.push({ id: tx.id, date: String(tx.transactionAt || "").slice(0, 10), reason: "protected" });
    continue;
  }
  if (hasManualLedgerCategoryMemoOverride(tx, expenseCategories)) {
    skipped.push({ id: tx.id, date: String(tx.transactionAt || "").slice(0, 10), reason: "memo_override" });
    continue;
  }

  const learnMatch = findBestBankLearnRuleWithScore(tx, rules, fixedExpenses, ["fixed", "manual", "custom"]);
  if (!learnMatch) {
    skipped.push({ id: tx.id, date: String(tx.transactionAt || "").slice(0, 10), reason: "no_rule" });
    continue;
  }
  const confidence = formatLearnRuleConfidencePercent(learnMatch.score);
  if (!meetsLedgerRegistrationConfidenceThreshold(confidence)) {
    skipped.push({
      id: tx.id,
      date: String(tx.transactionAt || "").slice(0, 10),
      reason: "low_confidence",
      confidence,
    });
    continue;
  }

  const mismatch = detectMismatch(
    tx,
    expense,
    learnMatch,
    fixedExpenses,
    ledgerCategories,
    fixedIds,
    fixedExpensePayments,
  );
  if (!mismatch) continue;

  candidates.push({
    id: tx.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    withdrawal: tx.withdrawal,
    description: tx.description,
    counterparty: tx.counterpartyName,
    ...mismatch,
  });
}

const resetIds = new Set();
const orphanPatchIds = new Set();
const removedExpenseIds = new Set();

for (const candidate of candidates) {
  const isOrphanOnly =
    candidate.reasons.length === 1 && candidate.reasons[0] === "orphan_ledger_fixed_expense_id";
  const categoryMatches =
    candidate.current.category &&
    candidate.expected.category &&
    candidate.current.category === candidate.expected.category;

  if (isOrphanOnly && categoryMatches && candidate.expected.kind === "variable") {
    orphanPatchIds.add(candidate.id);
  } else {
    resetIds.add(candidate.id);
  }
}

bankTransactions = bankTransactions.map((tx) => {
  if (orphanPatchIds.has(tx.id)) {
    return { ...tx, ledgerFixedExpenseId: undefined };
  }

  if (!resetIds.has(tx.id)) return tx;

  const expense = expenseForTx(tx, companyExpenses);
  if (expense?.id) removedExpenseIds.add(expense.id);

  let next = resetBankTransactionLedger(tx);
  next = {
    ...next,
    linkedCompanyExpenseId: undefined,
    linkedFixedExpensePaymentId: undefined,
    folderId: undefined,
    classifiedAt: undefined,
  };
  const ledgerMemo = String(tx.ledgerMemo || "").trim();
  if (ledgerMemo.startsWith(AUTO_MEMO_PREFIX)) {
    next.ledgerMemo = undefined;
  }
  return next;
});

if (removedExpenseIds.size || resetIds.size) {
  companyExpenses = companyExpenses.filter((row) => {
    if (removedExpenseIds.has(row.id)) return false;
    if (resetIds.has(String(row.bankTransactionId || ""))) return false;
    return true;
  });
}

if (resetIds.size) {
  fixedExpensePayments = fixedExpensePayments.map((payment) =>
    resetIds.has(String(payment.bankTransactionId || ""))
      ? { ...payment, bankTransactionId: undefined }
      : payment,
  );
}

let reapply = { fixedCount: 0, manualCount: 0, folderCount: 0, newExpenses: [], newPayments: [] };
let fallback = { variable: 0, fixed: 0 };

if (resetIds.size) {
  const applyResult = autoApplyBankLearnRules(
    bankTransactions,
    fixedExpensePayments,
    companyExpenses,
    rules,
    fixedExpenses,
    {
      createdBy: "repair-reset-mismatch-feb-apr",
      onlyTransactionIds: resetIds,
      applyKinds: ["fixed", "manual", "custom"],
      accountCodes,
      ledgerCategories,
      bankTransactionFolders: data.bankTransactionFolders || [],
    },
  );

  if (applyResult.allPayments) fixedExpensePayments = applyResult.allPayments;
  else if (applyResult.newPayments?.length) {
    fixedExpensePayments = [...applyResult.newPayments, ...fixedExpensePayments];
  }
  if (applyResult.newExpenses?.length) {
    companyExpenses = [...applyResult.newExpenses, ...companyExpenses];
  }
  bankTransactions = applyResult.transactions;
  if (applyResult.bankTransactionFolders) {
    data.bankTransactionFolders = applyResult.bankTransactionFolders;
  }

  reapply = {
    fixedCount: applyResult.fixedCount || 0,
    manualCount: applyResult.manualCount || 0,
    folderCount: applyResult.folderCount || 0,
    newExpenseCount: applyResult.newExpenses?.length || 0,
    newPaymentCount: applyResult.newPayments?.length || 0,
  };
}

const candidateById = new Map(candidates.map((row) => [row.id, row]));
for (const id of resetIds) {
  const tx = bankTransactions.find((row) => row.id === id);
  const candidate = candidateById.get(id);
  if (!tx || !candidate) continue;
  if (expenseForTx(tx, companyExpenses) || paymentForTx(tx, fixedExpensePayments)) continue;

  if (candidate.expected.kind === "fixed" && candidate.expected.fixedExpenseId) {
    const fixedItem = fixedExpenses.find((row) => row.id === candidate.expected.fixedExpenseId);
    if (!fixedItem) continue;
    const assignment = assignBankTxToFixedExpensePayment({
      tx,
      resolvedFixedExpenseId: candidate.expected.fixedExpenseId,
      fixedItem,
      payments: fixedExpensePayments,
      fixedExpenses,
      ledgerCategories,
      resolvedCategory: fixedItem.category?.trim() || "",
      memo: buildFixedExpensePaymentMemoFromBankTx(tx, fixedItem),
      savedBy: "repair-reset-mismatch-feb-apr",
    });
    fixedExpensePayments = assignment.payments;
    bankTransactions = bankTransactions.map((row) =>
      row.id === tx.id
        ? {
            ...row,
            linkedFixedExpensePaymentId: assignment.paymentId,
            linkedCompanyExpenseId: undefined,
            folderId: row.folderId || "bank-folder-ledger-default",
          }
        : row,
    );
    fallback.fixed += 1;
    continue;
  }

  if (candidate.expected.kind === "variable" && candidate.expected.category) {
    const prefill = buildCompanyExpensePrefillFromBankTransaction(tx);
    const expense = {
      id: randomUUID(),
      date: prefill.date,
      category: candidate.expected.category,
      description: prefill.description,
      amount: Number(prefill.amount || tx.withdrawal || 0),
      memo: prefill.memo,
      kind: "variable",
      bankTransactionId: tx.id,
      createdBy: "repair-reset-mismatch-feb-apr",
      createdAt: new Date().toISOString(),
    };
    companyExpenses = [expense, ...companyExpenses];
    bankTransactions = bankTransactions.map((row) =>
      row.id === tx.id
        ? {
            ...row,
            linkedCompanyExpenseId: expense.id,
            linkedFixedExpensePaymentId: undefined,
            folderId: row.folderId || "bank-folder-ledger-default",
          }
        : row,
    );
    fallback.variable += 1;
  }
}

const folders = ensureDefaultBankTransactionFolders(data.bankTransactionFolders || []);
const synced = syncBankTransactionLedgerLinkFields(bankTransactions, companyExpenses, fixedExpensePayments);
const folderSync = syncLedgerLinkedBankTransactionFolders(synced, folders, {
  companyExpenses,
  fixedExpensePayments,
});
bankTransactions = folderSync.transactions;

const skipSummary = skipped.reduce((acc, row) => {
  acc[row.reason] = (acc[row.reason] || 0) + 1;
  return acc;
}, {});

const reasonSummary = candidates.reduce((acc, row) => {
  for (const reason of row.reasons) {
    acc[reason] = (acc[reason] || 0) + 1;
  }
  return acc;
}, {});

const stillUnlinkedAfter = [...resetIds].filter((id) => {
  const tx = bankTransactions.find((row) => row.id === id);
  if (!tx) return false;
  return !expenseForTx(tx, companyExpenses) && !paymentForTx(tx, fixedExpensePayments);
});

console.log(
  JSON.stringify(
    {
      dryRun,
      dbPath,
      version: state.version,
      targetMonths: TARGET_MONTHS,
      resetCount: resetIds.size,
      orphanPatchCount: orphanPatchIds.size,
      removedExpenseCount: removedExpenseIds.size,
      stillUnlinkedAfter: stillUnlinkedAfter.length,
      reasonSummary,
      skipSummary,
      reapply,
      fallback,
      candidates,
      skippedSample: skipped.slice(0, 20),
    },
    null,
    2,
  ),
);

if (dryRun || (!resetIds.size && !orphanPatchIds.size)) process.exit(0);

const backupPath = backupDb(dbPath);
console.log("backup:", backupPath);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({
    ...data,
    bankTransactions,
    companyExpenses,
    fixedExpensePayments,
    bankTransactionFolders: folderSync.folders,
  }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-reset-mismatch-feb-apr",
);
console.log("saved version", Number(state.version || 0) + 1);
