#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";

function normalizeCp(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, "");
}

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const keys = new Set();
for (const t of d.bankTransactions || []) {
  if (!String(t.transactionAt || "").startsWith("2026-05") || !t.linkedFixedExpensePaymentId) continue;
  if (Number(t.withdrawal) !== 9900) continue;
  const cp = normalizeCp(t.counterpartyName);
  const descCp = normalizeCp(t.description);
  if (cp) keys.add(`${cp}|9900`);
  if (descCp.length >= 2) keys.add(`${descCp}|9900`);
  console.log("may", { cp, descCp, keys: [...keys] });
}

for (const t of d.bankTransactions || []) {
  if (t.linkedFixedExpensePaymentId || Number(t.withdrawal) !== 9900) continue;
  const descCp = normalizeCp(t.description);
  if (descCp !== "\uc608\uc2a4\ud3fc") continue;
  console.log("unlinked", {
    date: t.transactionAt?.slice(0, 10),
    descCp,
    hit: keys.has(`${descCp}|9900`),
  });
}
