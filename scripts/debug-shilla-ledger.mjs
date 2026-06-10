import { DatabaseSync } from "node:sqlite";
import path from "path";

const KEY = "\uC2E0\uB77C";

const dbPath = process.argv[2] || path.join(process.cwd(), "data", "erp.sqlite");
const db = new DatabaseSync(dbPath);
const raw = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const txs = (raw.bankTransactions || []).filter((t) => {
  const hay = `${t.description || ""}${t.counterpartyName || ""}${t.memo || ""}`;
  return hay.includes(KEY) && Number(t.withdrawal) > 0;
});

const expenses = (raw.companyExpenses || []).filter((e) => {
  const hay = `${e.description || ""}${e.memo || ""}`;
  return hay.includes(KEY);
});

console.log("=== SHILLA WITHDRAWALS ===");
console.log(
  JSON.stringify(
    txs.map((t) => ({
      id: t.id,
      at: t.transactionAt,
      withdrawal: t.withdrawal,
      desc: t.description,
      counterparty: t.counterpartyName,
      memo: t.memo,
      folderId: t.folderId,
      linkedCompanyExpenseId: t.linkedCompanyExpenseId,
      linkedFixedExpensePaymentId: t.linkedFixedExpensePaymentId,
      netGroupRole: t.netGroupRole,
    })),
    null,
    2,
  ),
);

console.log("\n=== SHILLA EXPENSES ===");
console.log(JSON.stringify(expenses, null, 2));

const mealWords = ["\uC2DD", "\uC2DD\uB300", "\uC2DD\uBE44"];
const galbiWords = ["\uC2E0\uB77C", "\uAC08\uBE44"];
console.log("\n=== MEMO SOURCES ===");
for (const t of raw.bankTransactions || []) {
  if (!Number(t.withdrawal)) continue;
  const memo = String(t.memo || "").trim();
  const hay = `${t.description || ""}${t.counterpartyName || ""}`;
  if (mealWords.some((w) => memo.includes(w)) && galbiWords.some((w) => hay.includes(w))) {
    console.log({
      at: t.transactionAt,
      withdrawal: t.withdrawal,
      memo,
      desc: t.description,
      linked: t.linkedCompanyExpenseId,
    });
  }
}
