import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const raw = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));

const keywords = [
  "\uAD6D\uB3C4\uAC74\uAC15",
  "\uD55C\uD654\uC0DD\uBA85",
  "\uC774\uCE74",
  "4\uB300\uBCF4\uD5D8",
  "\uAD6D\uB3C4\uC5F0\uAE08",
  "\uAC74\uAC952604",
];
const txs = (raw.bankTransactions || []).filter((t) => {
  const hay = [t.description, t.counterpartyName, t.memo, t.transactionType].join(" ");
  return keywords.some((k) => hay.includes(k));
});

console.log("=== BANK TX ===");
for (const t of txs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(
    JSON.stringify({
      id: t.id,
      at: t.transactionAt,
      w: t.withdrawal,
      desc: t.description,
      memo: t.memo,
      linkedFixed: t.linkedFixedExpensePaymentId,
    }),
  );
}

const paymentIds = ["8436b199", "f758f695", "f5ce045e", "0d9b73b2", "8f10a29e", "037e80d2"];
console.log("\n=== PAYMENTS ===");
for (const partial of paymentIds) {
  const p = (raw.fixedExpensePayments || []).find((x) => x.id.startsWith(partial));
  if (!p) continue;
  const fe = (raw.fixedExpenses || []).find((x) => x.id === p.fixedExpenseId);
  console.log(JSON.stringify({ name: fe?.name, payment: p }));
}

console.log("\n=== FIXED EXPENSES ===");
for (const fe of raw.fixedExpenses || []) {
  const name = String(fe.name || "");
  if (/(\uBCF4\uD5D8|\uC5F0\uAE08|\uC774\uCE74|\uC0AC\uB300|\uAC74\uAC15|\uD55C\uD654|\uD604\uB300)/.test(name)) {
    console.log(JSON.stringify({ id: fe.id, name: fe.name, amount: fe.amount }));
  }
}

console.log("\n=== LEARN RULES (fixed) ===");
for (const rule of raw.bankLedgerRules || []) {
  if (rule.kind !== "fixed") continue;
  const fe = (raw.fixedExpenses || []).find((x) => x.id === rule.fixedExpenseId);
  const hay = [fe?.name, ...(rule.descriptionTokens || [])].join(" ");
  if (/(\uBCF4\uD5D8|\uC774\uCE74|\uAC74\uAC15|\uD55C\uD654)/.test(hay)) {
    console.log(JSON.stringify({ fixedName: fe?.name, tokens: rule.descriptionTokens, counterparty: rule.counterpartyName }));
  }
}
