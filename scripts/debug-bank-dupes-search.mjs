import { getErpState } from "../server/db.mjs";

const needles = ["\uc608\uc2a4\ud3fc", "yesform", "\uc9c4\uc544\ub124", "\uce7c\uad6d\uc218"];

function matches(tx) {
  const hay = JSON.stringify(tx).toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

function fp(tx) {
  return [
    String(tx.accountNumber || "").trim(),
    String(tx.transactionAt || "").trim(),
    String(tx.withdrawal || 0),
    String(tx.deposit || 0),
    String(tx.balanceAfter || 0),
    String(tx.description || "").trim(),
  ].join("|");
}

function softFp(tx) {
  return [
    String(tx.transactionAt || "").slice(0, 16),
    String(tx.withdrawal || 0),
    String(tx.deposit || 0),
    String(tx.description || "").trim().replace(/\s+/g, ""),
    String(tx.counterpartyName || "").trim().replace(/\s+/g, ""),
  ].join("|");
}

const txs = (getErpState().data?.bankTransactions || []).filter(matches);
console.log("matched", txs.length);

const byFp = new Map();
for (const tx of txs) {
  const key = fp(tx);
  if (!byFp.has(key)) byFp.set(key, []);
  byFp.get(key).push(tx);
}

console.log("\n=== exact fingerprint dupes ===");
for (const [key, group] of byFp) {
  if (group.length <= 1) continue;
  console.log("FP", key);
  for (const tx of group) {
    console.log(
      " ",
      tx.id,
      tx.transactionAt,
      tx.withdrawal,
      tx.deposit,
      tx.balanceAfter,
      tx.description,
      tx.counterpartyName,
      tx.importBatchId,
    );
  }
}

console.log("\n=== soft dupes (same time/amount/desc, diff balance/account) ===");
const bySoft = new Map();
for (const tx of txs) {
  const key = softFp(tx);
  if (!bySoft.has(key)) bySoft.set(key, []);
  bySoft.get(key).push(tx);
}
for (const [key, group] of bySoft) {
  if (group.length <= 1) continue;
  console.log("SOFT", key);
  for (const tx of group) {
    console.log(
      " ",
      tx.id,
      tx.accountNumber,
      tx.transactionAt,
      tx.withdrawal,
      tx.deposit,
      tx.balanceAfter,
      tx.description,
      tx.counterpartyName,
      tx.importBatchId,
      tx.linkedFixedExpensePaymentId || "",
      tx.ledgerCategoryId || "",
    );
  }
}

console.log("\n=== all matched txs ===");
for (const tx of txs.sort((a, b) => String(a.transactionAt).localeCompare(String(b.transactionAt)))) {
  console.log(
    [
      tx.id?.slice(0, 8),
      tx.transactionAt?.slice(0, 16),
      tx.withdrawal,
      tx.deposit,
      tx.balanceAfter,
      (tx.description || "").slice(0, 40),
      (tx.counterpartyName || "").slice(0, 20),
      String(tx.accountNumber || "").slice(-4),
      (tx.importBatchId || "").slice(0, 24),
    ].join(" | "),
  );
}
