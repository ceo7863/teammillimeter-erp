#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const TARGET_ID = "a78c1f5c-bc56-4080-866c-a08f9a1bf229";
const dataDir = process.argv[2] || "data";
const files = readdirSync(dataDir)
  .filter(
    (f) =>
      f.includes("erp") &&
      (f.endsWith(".sqlite") || f.includes(".sqlite.")) &&
      !f.includes("-shm") &&
      !f.includes("-wal") &&
      !f.includes("vacuum"),
  )
  .map((f) => join(dataDir, f));

for (const dbPath of files) {
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare("SELECT version FROM erp_state WHERE id = 1").get();
    if (!row) {
      console.log(`=== ${dbPath} === no erp_state`);
      continue;
    }
    const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
    const fe = (d.fixedExpenses || []).find((x) => x.id === TARGET_ID);
    const rules = (d.bankLedgerRules || []).filter(
      (r) =>
        r.fixedExpenseId === TARGET_ID ||
        String(r.counterpartyName || "").includes("??") ||
        String(r.counterpartyName || "").includes("???") ||
        (r.descriptionTokens || []).some((t) => String(t).includes("????")),
    );
    const txs = (d.bankTransactions || []).filter((tx) => tx.ledgerFixedExpenseId === TARGET_ID);
    console.log(`\n=== ${dbPath} v${row.version} ===`);
    console.log(
      "fixed:",
      fe
        ? { id: fe.id, name: fe.name, category: fe.category, amount: fe.amount, deletedAt: fe.deletedAt }
        : "MISSING",
    );
    console.log("rules:", rules.length);
    for (const r of rules) {
      console.log(
        "  ",
        JSON.stringify({
          id: r.id,
          kind: r.kind,
          counterpartyName: r.counterpartyName,
          fixedExpenseId: r.fixedExpenseId,
          category: r.category,
          tokens: r.descriptionTokens,
        }),
      );
    }
    console.log("txs with ledgerFixedExpenseId:", txs.length);
    for (const tx of txs) {
      console.log(
        "  ",
        JSON.stringify({
          id: tx.id,
          date: tx.transactionAt,
          counterparty: tx.counterpartyName,
          memo: tx.memo,
          ledgerMemo: tx.ledgerMemo,
        }),
      );
    }
  } catch (error) {
    console.log(`=== ${dbPath} === ERROR ${error.message}`);
  }
}
