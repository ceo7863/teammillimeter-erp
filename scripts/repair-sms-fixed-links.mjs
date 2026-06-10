#!/usr/bin/env node
/**
 * Repair SMS/????? bank tx fixed-expense links:
 * - Clear orphan ledgerFixedExpenseId (missing fixed expense item)
 * - Set linkedFixedExpensePaymentId when payment exists by bankTransactionId
 * - Clear stale linkedFixedExpensePaymentId pointing to missing payment
 * - Optionally add SMS fixed learn rule when missing
 *
 * Usage: node scripts/repair-sms-fixed-links.mjs [dbPath] [--dry-run] [--skip-rule]
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const dbPath =
  process.argv.find((arg) => !arg.startsWith("-") && arg.endsWith(".sqlite")) ||
  path.join(rootDir, "data/erp.sqlite");
const dryRun = process.argv.includes("--dry-run");
const skipRule = process.argv.includes("--skip-rule");
const AUTO_MEMO_PREFIX = "\uC790\uB3D9 \uB4F1\uB85D \u00B7 ";
const SMS_AMOUNT = 900;

function isSmsBankTx(tx) {
  const hay = `${tx.description || ""}${tx.memo || ""}${tx.counterpartyName || ""}`;
  return hay.includes("SMS") || hay.includes("\uD86D\uC9C0\uC218\uB8CC");
}

function backupDb(sourcePath) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const backupDir = path.join(rootDir, "data/backups/manual", `pre-repair-sms-fixed-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "erp.sqlite");
  fs.copyFileSync(sourcePath, backupPath);
  return backupPath;
}

const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(String(state.payload));

const fixedExpenses = (data.fixedExpenses || []).filter((row) => row.isActive !== false);
const fixedIds = new Set(fixedExpenses.map((row) => row.id));
const paymentById = new Map((data.fixedExpensePayments || []).map((row) => [row.id, row]));
const paymentByBankTxId = new Map(
  (data.fixedExpensePayments || [])
    .filter((row) => row.bankTransactionId)
    .map((row) => [String(row.bankTransactionId), row]),
);

const smsFixedItems = fixedExpenses.filter((row) => {
  const name = String(row.name || "");
  return name.includes("SMS") || name.includes("\uD86D\uC9C0\uC218\uB8CC");
});
const smsFixedItem =
  smsFixedItems.find((row) => Number(row.amount || 0) === SMS_AMOUNT) || smsFixedItems[0] || null;

const fixes = [];
let ruleAdded = false;

let bankTransactions = (data.bankTransactions || []).map((tx) => {
  if (!isSmsBankTx(tx)) return tx;

  let next = tx;
  const changes = {};

  const ledgerFixedId = String(tx.ledgerFixedExpenseId || "").trim();
  if (ledgerFixedId && !fixedIds.has(ledgerFixedId)) {
    next = { ...next, ledgerFixedExpenseId: undefined };
    changes.clearedOrphanLedgerFixedExpenseId = ledgerFixedId;
    const ledgerMemo = String(tx.ledgerMemo || "").trim();
    if (ledgerMemo.startsWith(AUTO_MEMO_PREFIX)) {
      next.ledgerMemo = undefined;
      changes.clearedAutoLedgerMemo = ledgerMemo;
    }
  }

  const linkedPaymentId = String(next.linkedFixedExpensePaymentId || "").trim();
  if (linkedPaymentId && !paymentById.has(linkedPaymentId)) {
    next = { ...next, linkedFixedExpensePaymentId: undefined };
    changes.clearedStaleLinkedFixedExpensePaymentId = linkedPaymentId;
  }

  const paymentByTx = paymentByBankTxId.get(tx.id);
  if (paymentByTx && String(next.linkedFixedExpensePaymentId || "") !== paymentByTx.id) {
    next = { ...next, linkedFixedExpensePaymentId: paymentByTx.id };
    changes.setLinkedFixedExpensePaymentId = paymentByTx.id;
  }

  if (Object.keys(changes).length) {
    fixes.push({
      id: tx.id,
      date: String(tx.transactionAt || "").slice(0, 10),
      withdrawal: tx.withdrawal,
      description: tx.description,
      memo: tx.memo,
      before: {
        ledgerFixedExpenseId: tx.ledgerFixedExpenseId || null,
        linkedFixedExpensePaymentId: tx.linkedFixedExpensePaymentId || null,
        ledgerMemo: tx.ledgerMemo || null,
      },
      after: {
        ledgerFixedExpenseId: next.ledgerFixedExpenseId || null,
        linkedFixedExpensePaymentId: next.linkedFixedExpensePaymentId || null,
        ledgerMemo: next.ledgerMemo || null,
      },
      changes,
      paymentByBankTx: paymentByTx
        ? {
            id: paymentByTx.id,
            fixedExpenseId: paymentByTx.fixedExpenseId,
            date: paymentByTx.date,
            amount: paymentByTx.amount,
          }
        : null,
    });
  }

  return next;
});

let bankLedgerRules = [...(data.bankLedgerRules || [])];
if (!skipRule && smsFixedItem) {
  const hasSmsRule = bankLedgerRules.some(
    (rule) =>
      rule.kind === "fixed" &&
      rule.fixedExpenseId === smsFixedItem.id &&
      (rule.descriptionTokens || []).some(
        (token) => String(token).includes("SMS") || String(token).includes("\uD86D\uC9C0\uC218\uB8CC"),
      ),
  );
  if (!hasSmsRule) {
    bankLedgerRules = [
      ...bankLedgerRules,
      {
        id: randomUUID(),
        kind: "fixed",
        fixedExpenseId: smsFixedItem.id,
        descriptionTokens: ["SMS", "SMS\uD86D\uC9C0\uC218\uB8CC", "\uD86D\uC9C0\uC218\uB8CC"],
        amount: SMS_AMOUNT,
        createdAt: new Date().toISOString(),
        createdBy: "repair-sms-fixed-links",
      },
    ];
    ruleAdded = true;
  }
}

const summary = {
  dryRun,
  dbPath,
  version: state.version,
  smsFixedItem: smsFixedItem
    ? { id: smsFixedItem.id, name: smsFixedItem.name, amount: smsFixedItem.amount }
    : null,
  smsTxCount: (data.bankTransactions || []).filter(isSmsBankTx).length,
  fixCount: fixes.length,
  ruleAdded,
  fixes,
};

console.log(JSON.stringify(summary, null, 2));

if (dryRun || (!fixes.length && !ruleAdded)) process.exit(0);

const backupPath = backupDb(dbPath);
console.log("backup:", backupPath);

db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify({
    ...data,
    bankTransactions,
    bankLedgerRules,
  }),
  Number(state.version || 0) + 1,
  new Date().toISOString(),
  "repair-sms-fixed-links",
);
console.log("saved version", Number(state.version || 0) + 1);
