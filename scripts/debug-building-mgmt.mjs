import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2] || process.cwd();
let data = null;

const sqlitePath = path.join(root, "data/erp.sqlite");
if (fs.existsSync(sqlitePath)) {
  const db = new DatabaseSync(sqlitePath);
  const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
  data = row?.payload ? JSON.parse(row.payload) : null;
  console.log("file:", sqlitePath);
}

if (!data) {
  const candidates = [path.join(root, "data/erp.json"), path.join(root, "data/state.json")];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      data = raw.data || raw;
      console.log("file:", file);
      break;
    }
  }
}

if (!data) {
  console.log("no data file found");
  process.exit(1);
}
const folders = data.bankTransactionFolders || [];
const rules = data.bankLedgerRules || [];
const fixed = data.fixedExpenses || [];
const txs = data.bankTransactions || [];

const matchText = (s) => String(s || "").includes("\uAC74\uBB3C") || String(s || "").includes("\uAD00\uB9AC\uBE44");

const buildingFolders = folders.filter((f) => matchText(f.folderName));
console.log("\n=== BUILDING FOLDERS ===");
for (const f of buildingFolders) {
  const count = txs.filter((t) => t.folderId === f.id).length;
  console.log({ id: f.id, name: f.folderName, parentId: f.parentId, txCount: count });
}

const buildingFixed = fixed.filter((f) => matchText(f.name) || matchText(f.category));
console.log("\n=== BUILDING FIXED EXPENSES ===");
console.log(JSON.stringify(buildingFixed, null, 2));

console.log("\n=== ALL FOLDER RULES ===", rules.filter((r) => r.kind === "folder").length);
for (const r of rules.filter((x) => x.kind === "folder")) {
  const folder = folders.find((x) => x.id === r.folderId);
  console.log({
    folder: folder?.folderName || r.folderId,
    counterparty: r.counterpartyName,
    tokenCount: (r.descriptionTokens || []).length,
    tokens: (r.descriptionTokens || []).slice(0, 8),
  });
}

const buildingRules = rules.filter((r) => {
  const folder = folders.find((x) => x.id === r.folderId);
  const fe = fixed.find((x) => x.id === r.fixedExpenseId);
  return matchText(r.category) || matchText(folder?.folderName) || matchText(fe?.name) || matchText(fe?.category);
});
console.log("\n=== BUILDING RULES ===", buildingRules.length);
for (const r of buildingRules.slice(0, 30)) {
  const folder = folders.find((x) => x.id === r.folderId);
  const fe = fixed.find((x) => x.id === r.fixedExpenseId);
  console.log({
    kind: r.kind,
    counterparty: r.counterpartyName,
    tokens: r.descriptionTokens,
    folder: folder?.folderName,
    fixed: fe?.name,
    category: r.category,
    amount: r.amount,
  });
}

const folderIdSet = new Set(buildingFolders.map((f) => f.id));
const childFolderIds = new Set();
for (const f of folders) {
  if (f.parentId && folderIdSet.has(f.parentId)) childFolderIds.add(f.id);
}
const allBuildingFolderIds = new Set([...folderIdSet, ...childFolderIds]);

let sampleMis = 0;
console.log("\n=== SAMPLE TX IN BUILDING FOLDERS (first 10) ===");
for (const t of txs) {
  if (!t.folderId || !allBuildingFolderIds.has(t.folderId)) continue;
  if (sampleMis >= 10) break;
  console.log({
    date: String(t.transactionAt).slice(0, 10),
    withdrawal: t.withdrawal,
    counterparty: t.counterpartyName,
    description: t.description,
    folder: folders.find((f) => f.id === t.folderId)?.folderName,
  });
  sampleMis += 1;
}

const mainBuildingFolder = buildingFolders.find((f) => String(f.folderName).includes("\uAD00\uB9AC\uBE44"));
if (mainBuildingFolder) {
  const buildingTxs = txs.filter((t) => t.folderId === mainBuildingFolder.id);
  console.log("\n=== ONLY", mainBuildingFolder.folderName, "folder ===", buildingTxs.length, "txs");
  const byDesc = {};
  for (const t of buildingTxs) {
    const k = String(t.description || t.counterpartyName || "-").slice(0, 50);
    byDesc[k] = (byDesc[k] || 0) + 1;
  }
  console.log("top descriptions:", Object.entries(byDesc).sort((a, b) => b[1] - a[1]).slice(0, 20));
  const wrong = buildingTxs.filter((t) => {
    const h = [t.description, t.counterpartyName, t.memo].filter(Boolean).join(" ");
    return !/\uAD00\uB9AC|140|141|932|\uACE0\uC591\uC0BC\uC1A1|\uAC74\uBB3C/i.test(h);
  });
  console.log("likely misclassified:", wrong.length);
  for (const t of wrong.slice(0, 20)) {
    console.log({
      date: String(t.transactionAt).slice(0, 10),
      withdrawal: t.withdrawal,
      description: t.description,
      counterparty: t.counterpartyName,
    });
  }

  const folderRule = buildingRules.find((r) => r.kind === "folder" && r.folderId === mainBuildingFolder.id);
  if (folderRule) {
    console.log("\nfolder learn rule:", {
      counterparty: folderRule.counterpartyName,
      tokens: folderRule.descriptionTokens,
    });
  }

  const allFolderRules = rules.filter((r) => r.kind === "folder" && r.folderId === mainBuildingFolder.id);
  console.log("\nall folder rules for building folder:", allFolderRules.length);
  for (const r of allFolderRules) {
    console.log({ counterparty: r.counterpartyName, tokens: r.descriptionTokens });
  }

  const withClassifiedAt = buildingTxs.filter((t) => t.classifiedAt).length;
  const withoutClassifiedAt = buildingTxs.length - withClassifiedAt;
  console.log("\nclassifiedAt present:", withClassifiedAt, "absent:", withoutClassifiedAt);
}
