import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const txIdPrefix = "03defe60";
const tx = (d.bankTransactions || []).find((t) => t.id.startsWith(txIdPrefix));
console.log("=== 04-01 hyundai tx ===");
console.log(JSON.stringify(tx, null, 2));

if (tx?.linkedCompanyExpenseId) {
  const exp = (d.companyExpenses || []).find((e) => e.id === tx.linkedCompanyExpenseId);
  console.log("\n=== linked expense ===");
  console.log(JSON.stringify(exp, null, 2));
}

const payments = (d.fixedExpensePayments || []).filter((p) => p.fixedExpenseId === "236796bc-02fd-41da-be1c-f09e0072103a");
console.log("\n=== payments for \uCC28\uB7C9\uB9AC\uC2A4\uB8CC(\uB808\uC774) ===");
for (const p of payments) {
  console.log(JSON.stringify({ date: p.date, amount: p.amount, bankTx: p.bankTransactionId, memo: p.memo }));
}

const hyundaiApr = (d.bankTransactions || []).filter((t) =>
  String(t.transactionAt || "").startsWith("2026-04-01") &&
  String(t.counterpartyName || t.description || "").includes("\uD604\uB300\uCE90\uD518"),
);
console.log("\n=== score rules against 04-01 hyundai ===");
for (const t of hyundaiApr) {
  console.log("tx amount", t.withdrawal, "memo", t.memo);
  for (const r of d.bankLedgerRules || []) {
    if (r.counterpartyName?.includes("\uD604\uB300") || JSON.stringify(r).includes("\uB808\uC774")) {
      const amountMatch = Number(r.amount) === Number(t.withdrawal);
      console.log({ ruleKind: r.kind, category: r.category, ruleAmount: r.amount, amountMatch, fixedId: r.fixedExpenseId });
    }
  }
}
