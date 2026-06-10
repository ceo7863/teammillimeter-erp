#!/usr/bin/env node
/**
 * Audit Feb�Apr 2026 bank tx ledger state for reset/re-apply planning.
 * Usage: node scripts/debug-feb-apr-ledger-reset.mjs [dbPath] [--months=2026-02,2026-03,2026-04]
 */
import { DatabaseSync } from "node:sqlite";

const monthArg = process.argv.find((a) => a.startsWith("--months="));
const MONTHS = monthArg
  ? monthArg.slice("--months=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : ["2026-02", "2026-03", "2026-04"];

const dbPath =
  process.argv.find((a) => !a.startsWith("-") && a.endsWith(".sqlite")) || "data/erp.sqlite";

const db = new DatabaseSync(dbPath);
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const payments = d.fixedExpensePayments || [];
const expenses = d.companyExpenses || [];
const rules = d.bankLedgerRules || [];

function monthOf(tx) {
  return String(tx.transactionAt || "").slice(0, 7);
}

function inMonths(tx) {
  return MONTHS.includes(monthOf(tx));
}

function paymentForTx(tx) {
  if (tx.linkedFixedExpensePaymentId) {
    const p = payments.find((r) => r.id === tx.linkedFixedExpensePaymentId);
    if (p) return p;
  }
  return payments.find((r) => r.bankTransactionId === tx.id);
}

function expenseForTx(tx) {
  if (tx.linkedCompanyExpenseId) {
    const e = expenses.find((r) => r.id === tx.linkedCompanyExpenseId);
    if (e) return e;
  }
  return expenses.find((r) => r.bankTransactionId === tx.id);
}

const txs = (d.bankTransactions || []).filter(
  (tx) => inMonths(tx) && Number(tx.withdrawal || 0) > 0,
);

const stats = {
  months: MONTHS,
  withdrawalTxCount: txs.length,
  withAccountCode: 0,
  withFolderId: 0,
  withFixedLink: 0,
  withVariableLink: 0,
  withBothLinks: 0,
  withLedgerCategoryId: 0,
  withOrphanFixedId: 0,
  blockedByFolder: 0,
  blockedByAnyLedgerLink: 0,
  hasRuleButLinkedVariable: 0,
  accountCodeMismatch: 0,
  byMonth: {},
};

const fixedIds = new Set((d.fixedExpenses || []).map((r) => r.id));
const samples = {
  folderBlocked: [],
  variableWithAccount: [],
  fixedLinked: [],
  orphanFixed: [],
};

for (const m of MONTHS) {
  stats.byMonth[m] = {
    withdrawals: 0,
    accountCode: 0,
    folderId: 0,
    fixedLink: 0,
    variableLink: 0,
    unlinked: 0,
  };
}

for (const tx of txs) {
  const m = monthOf(tx);
  stats.byMonth[m].withdrawals += 1;

  const hasAccount = Boolean(String(tx.ledgerAccountCode || "").trim());
  const hasFolder = Boolean(tx.folderId);
  const pay = paymentForTx(tx);
  const exp = expenseForTx(tx);
  const hasFixed = Boolean(pay);
  const hasVar = Boolean(exp);
  const orphanFixed =
    tx.ledgerFixedExpenseId && !fixedIds.has(tx.ledgerFixedExpenseId);

  if (hasAccount) {
    stats.withAccountCode += 1;
    stats.byMonth[m].accountCode += 1;
  }
  if (hasFolder) {
    stats.withFolderId += 1;
    stats.blockedByFolder += 1;
    stats.byMonth[m].folderId += 1;
    if (samples.folderBlocked.length < 5) {
      samples.folderBlocked.push({
        date: String(tx.transactionAt || "").slice(0, 10),
        withdrawal: tx.withdrawal,
        description: tx.description,
        folderId: tx.folderId,
        accountCode: tx.ledgerAccountCode,
      });
    }
  }
  if (hasFixed) {
    stats.withFixedLink += 1;
    stats.byMonth[m].fixedLink += 1;
  }
  if (hasVar) {
    stats.withVariableLink += 1;
    stats.byMonth[m].variableLink += 1;
  }
  if (hasFixed && hasVar) stats.withBothLinks += 1;
  if (tx.ledgerCategoryId) stats.withLedgerCategoryId += 1;
  if (orphanFixed) {
    stats.withOrphanFixedId += 1;
    if (samples.orphanFixed.length < 5) {
      samples.orphanFixed.push({ id: tx.id, date: String(tx.transactionAt || "").slice(0, 10), ledgerFixedExpenseId: tx.ledgerFixedExpenseId });
    }
  }
  if (hasFixed || hasVar) stats.blockedByAnyLedgerLink += 1;
  else stats.byMonth[m].unlinked += 1;

  if (hasVar && hasAccount && samples.variableWithAccount.length < 8) {
    samples.variableWithAccount.push({
      date: String(tx.transactionAt || "").slice(0, 10),
      withdrawal: tx.withdrawal,
      description: tx.description,
      accountCode: tx.ledgerAccountCode,
      expenseCategory: exp?.category,
      expenseKind: exp?.kind,
    });
  }
}

console.log(JSON.stringify({ stats, samples, ruleCount: rules.length, fixedRuleCount: rules.filter((r) => r.kind === "fixed").length }, null, 2));
