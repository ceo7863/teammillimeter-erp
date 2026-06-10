import { DatabaseSync } from "node:sqlite";
import path from "path";

const db = new DatabaseSync(path.join(process.cwd(), "data/erp.sqlite"));
const data = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const rules = data.bankLedgerRules || [];
const folders = data.bankTransactionFolders || [];
const fixed = data.fixedExpenses || [];
const txs = data.bankTransactions || [];
const buildingFolderId = "bank-folder-403f6cfb-ad95-45e0-871b-99bdb2e35355";

function normalizeMatchText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

function scoreBankLearnRule(tx, rule) {
  if (rule.kind === "fixed") return 0;
  const haystack = normalizeMatchText(
    [tx.description, tx.counterpartyName, tx.memo, tx.transactionType].filter(Boolean).join(" "),
  );
  const counterpartyKey = normalizeMatchText(rule.counterpartyName || "");
  const txCounterpartyKey = normalizeMatchText(tx.counterpartyName || "");
  let score = 0;
  if (counterpartyKey) {
    if (txCounterpartyKey === counterpartyKey) score += 20;
    else if (txCounterpartyKey.includes(counterpartyKey) || counterpartyKey.includes(txCounterpartyKey)) score += 12;
    else if (haystack.includes(counterpartyKey)) score += 8;
    else return 0;
  }
  const tokens = (rule.descriptionTokens || []).map((t) => normalizeMatchText(t)).filter((t) => t.length >= 2);
  if (tokens.length) {
    const matched = tokens.filter((t) => haystack.includes(t));
    if (!matched.length && !counterpartyKey) return 0;
    score += matched.length * 4;
  } else if (!counterpartyKey) return 0;
  return score;
}

const buildingTxs = txs.filter((t) => t.folderId === buildingFolderId);
const sample = buildingTxs.find((t) => String(t.description || "").includes("\uB124\uC774\uBC84"));

console.log("sample tx:", {
  description: sample?.description,
  counterparty: sample?.counterpartyName,
  transactionType: sample?.transactionType,
  memo: sample?.memo,
});

const folderRules = rules.filter((r) => r.kind === "folder");
const hits = [];
for (const tx of buildingTxs.slice(0, 5)) {
  let best = null;
  for (const rule of folderRules) {
    const score = scoreBankLearnRule(tx, rule);
    if (score >= 5 && (!best || score > best.score)) best = { score, rule };
  }
  hits.push({
    desc: tx.description,
    bestFolder: folders.find((f) => f.id === best?.rule.folderId)?.folderName,
    score: best?.score,
    counterparty: best?.rule.counterpartyName,
  });
}
console.log("first 5 building txs best folder rule:", hits);

let ruleHitCounts = new Map();
for (const tx of buildingTxs) {
  let best = null;
  for (const rule of folderRules) {
    const score = scoreBankLearnRule(tx, rule);
    if (score >= 5 && (!best || score > best.score)) best = { score, rule };
  }
  const key = best ? `${best.rule.folderId}:${best.rule.counterpartyName || ""}:${best.score}` : "none";
  ruleHitCounts.set(key, (ruleHitCounts.get(key) || 0) + 1);
}
console.log("\nrule attribution for 324 building txs:");
for (const [key, count] of [...ruleHitCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  const [folderId] = key.split(":");
  const folder = folders.find((f) => f.id === folderId);
  console.log(count, folder?.folderName || key, key);
}

for (const rule of folderRules) {
  if (rule.folderId === buildingFolderId) {
    console.log("\nbuilding rule direct matches:");
    let n = 0;
    for (const tx of txs) {
      if (scoreBankLearnRule(tx, rule) >= 5) n += 1;
    }
    console.log("would match", n, "total txs");
  }
}
