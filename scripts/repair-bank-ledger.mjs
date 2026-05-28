#!/usr/bin/env node
/**
 * Maintenance repair for bank folder misclassification and preauth ledger duplicates.
 * Usage: node scripts/repair-bank-ledger.mjs [projectRoot]
 */
import { DatabaseSync } from "node:sqlite";
import path from "path";

const root = process.argv[2] || process.cwd();
const dbPath = path.join(root, "data/erp.sqlite");
const db = new DatabaseSync(dbPath);
const state = db.prepare("SELECT payload, version FROM erp_state WHERE id = 1").get();
if (!state?.payload) {
  console.error("erp_state not found");
  process.exit(1);
}

const data = JSON.parse(state.payload);

const STOP = new Set(
  ["\uC778\uD130\uB137", "\uCCB4\uD06C", "\uD8FC\uC774\uCCB4", "\uD8FC\uB1A1\uD0B9", "\uC774\uCCB4", "\uC785\uAE08", "\uCD9C\uAE08"].map((t) =>
    t.toLowerCase().replace(/\s+/g, ""),
  ),
);

function norm(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

function filterTokens(tokens) {
  return [...new Set((tokens || []).map((t) => String(t || "").trim()).filter(Boolean))].filter((t) => {
    const n = norm(t);
    return n.length >= 2 && !STOP.has(n);
  });
}

const BUILDING_KEY = /\uAD00\uB9AC|140|141|932|\uACE0\uC591\uC0BC\uC1A1|\uAC74\uBB3C/i;
const PREAUTH_KW = ["\uC8FC\uC720\uC18C", "\uC8FC\uC720", "lpg", "\uCDA9\uC804\uC18C"];

function isBuildingTx(tx) {
  return BUILDING_KEY.test([tx.description, tx.counterpartyName, tx.memo].filter(Boolean).join(" "));
}

function txMs(tx) {
  const ms = new Date(tx.transactionAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function txDate(tx) {
  return String(tx.transactionAt || "").slice(0, 10);
}

function cpName(tx) {
  return String(tx.counterpartyName || tx.description || "").trim().replace(/\s+/g, " ");
}

function preauthHaystack(tx) {
  return [tx.counterpartyName, tx.description, tx.memo, tx.transactionType].filter(Boolean).join(" ").toLowerCase();
}

function matchesPreauth(tx, rules) {
  const hay = preauthHaystack(tx).replace(/\s+/g, "");
  const preauthRules = (rules || []).filter((r) => r.kind === "preauth_net");
  if (preauthRules.length) {
    return preauthRules.some((rule) => {
      const ck = norm(rule.counterpartyName || "");
      const txk = norm(cpName(tx));
      if (ck && txk.includes(ck)) return true;
      return (rule.descriptionTokens || []).some((token) => {
        const n = norm(token);
        return n.length >= 2 && hay.includes(n);
      });
    });
  }
  return PREAUTH_KW.some((kw) => hay.includes(kw.toLowerCase()));
}

function findWdw(sorted, used, windowMs) {
  for (let i = 0; i < sorted.length; i++) {
    const w1 = sorted[i];
    if (used.has(w1.id) || w1.netGroupId) continue;
    const pre = Number(w1.withdrawal || 0);
    if (!(pre > 0) || w1.deposit > 0) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const refund = sorted[j];
      if (used.has(refund.id) || refund.netGroupId) continue;
      if (refund.deposit !== pre || refund.withdrawal > 0) continue;
      if (txMs(refund) - txMs(w1) > windowMs) break;
      for (let k = j + 1; k < sorted.length; k++) {
        const settle = sorted[k];
        if (used.has(settle.id) || settle.netGroupId) continue;
        const sa = Number(settle.withdrawal || 0);
        if (!(sa > 0) || settle.deposit > 0) continue;
        if (txMs(settle) - txMs(w1) > windowMs) break;
        return { w1, refund, settle, pre, sa };
      }
    }
  }
  return null;
}

function findCancelRepayWdw(sorted, used, windowMs) {
  for (let i = 0; i < sorted.length; i++) {
    const w1 = sorted[i];
    if (used.has(w1.id) || w1.netGroupId) continue;
    const pre = Number(w1.withdrawal || 0);
    if (!(pre > 0) || w1.deposit > 0) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const refund = sorted[j];
      if (used.has(refund.id) || refund.netGroupId) continue;
      if (refund.deposit !== pre || refund.withdrawal > 0) continue;
      if (txMs(refund) - txMs(w1) > windowMs) break;
      for (let k = j + 1; k < sorted.length; k++) {
        const settle = sorted[k];
        if (used.has(settle.id) || settle.netGroupId) continue;
        const sa = Number(settle.withdrawal || 0);
        if (sa !== pre || settle.deposit > 0) continue;
        if (txMs(settle) - txMs(w1) > windowMs) break;
        return { w1, refund, settle, pre, sa };
      }
    }
  }
  return null;
}

function findWwd(sorted, used, windowMs) {
  for (let i = 0; i < sorted.length; i++) {
    const w1 = sorted[i];
    if (used.has(w1.id) || w1.netGroupId) continue;
    const pre = Number(w1.withdrawal || 0);
    if (!(pre > 0) || w1.deposit > 0) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const settle = sorted[j];
      if (used.has(settle.id) || settle.netGroupId) continue;
      const sa = Number(settle.withdrawal || 0);
      if (!(sa > 0) || sa >= pre || settle.deposit > 0) continue;
      if (txMs(settle) - txMs(w1) > windowMs) break;
      for (let k = j + 1; k < sorted.length; k++) {
        const refund = sorted[k];
        if (used.has(refund.id) || refund.netGroupId) continue;
        if (refund.deposit !== pre || refund.withdrawal > 0) continue;
        if (txMs(refund) - txMs(w1) > windowMs) break;
        return { w1, refund, settle, pre, sa };
      }
    }
  }
  return null;
}

function bucketByCounterparty(transactions, include) {
  const buckets = new Map();
  for (const tx of transactions) {
    if (tx.netGroupId) continue;
    if (!include(tx)) continue;
    const account = String(tx.accountNumber || "").trim();
    const date = txDate(tx);
    const cp = cpName(tx);
    if (!account || !date || !cp) continue;
    const key = `${account}|${date}|${cp.toLowerCase()}`;
    const list = buckets.get(key) || [];
    list.push(tx);
    buckets.set(key, list);
  }
  return buckets;
}

function collectFromBucket(sorted, used, windowMs, groups, findNext) {
  let hit = findNext(sorted, used, windowMs);
  while (hit) {
    const id = `preauth-${groups.length + 1}-${Date.now()}`;
    groups.push({ id, ...hit });
    used.add(hit.w1.id);
    used.add(hit.refund.id);
    used.add(hit.settle.id);
    hit = findNext(sorted, used, windowMs);
  }
}

function detectPreauth(transactions, rules) {
  const windowMs = 60 * 60 * 1000;
  const groups = [];
  const used = new Set();

  const preauthBuckets = bucketByCounterparty(transactions, (tx) => matchesPreauth(tx, rules));
  for (const bucket of preauthBuckets.values()) {
    const sorted = [...bucket].sort((a, b) => txMs(a) - txMs(b));
    collectFromBucket(sorted, used, windowMs, groups, (s, u, w) => findWdw(s, u, w) || findWwd(s, u, w));
  }

  const allBuckets = bucketByCounterparty(transactions, () => true);
  for (const bucket of allBuckets.values()) {
    const sorted = [...bucket].sort((a, b) => txMs(a) - txMs(b));
    collectFromBucket(sorted, used, windowMs, groups, findCancelRepayWdw);
  }

  return groups;
}

function applyGroups(transactions, groups) {
  const patch = new Map();
  for (const g of groups) {
    patch.set(g.w1.id, { netGroupId: g.id, netGroupRole: "preauth_withdrawal" });
    patch.set(g.refund.id, { netGroupId: g.id, netGroupRole: "preauth_refund" });
    patch.set(g.settle.id, { netGroupId: g.id, netGroupRole: "settlement" });
  }
  return transactions.map((tx) => {
    const cleared = { ...tx, netGroupId: undefined, netGroupRole: undefined };
    const next = patch.get(tx.id);
    return next ? { ...cleared, ...next } : cleared;
  });
}

let bankLedgerRules = (data.bankLedgerRules || []).map((rule) => ({
  ...rule,
  descriptionTokens: filterTokens(rule.descriptionTokens),
}));

let bankTransactions = (data.bankTransactions || []).map((tx) => ({
  ...tx,
  netGroupId: undefined,
  netGroupRole: undefined,
}));

const folders = data.bankTransactionFolders || [];
const buildingIds = new Set(
  folders.filter((f) => String(f.folderName || "").includes("\uAC74\uBB3C")).map((f) => f.id),
);

let clearedFolders = 0;
bankTransactions = bankTransactions.map((tx) => {
  if (!tx.folderId || !buildingIds.has(tx.folderId) || isBuildingTx(tx)) return tx;
  clearedFolders += 1;
  return { ...tx, folderId: undefined, linkedSubject: undefined, classifiedAt: undefined };
});

const groups = detectPreauth(bankTransactions, bankLedgerRules);
bankTransactions = applyGroups(bankTransactions, groups);

const suppressed = new Set(
  bankTransactions
    .filter((tx) => tx.netGroupRole === "preauth_withdrawal" || tx.netGroupRole === "preauth_refund")
    .map((tx) => tx.id),
);

let companyExpenses = data.companyExpenses || [];
let fixedExpensePayments = data.fixedExpensePayments || [];
const beforeExp = companyExpenses.length;
const beforePay = fixedExpensePayments.length;

companyExpenses = companyExpenses.filter((row) => !row.bankTransactionId || !suppressed.has(row.bankTransactionId));
fixedExpensePayments = fixedExpensePayments.filter((row) => !row.bankTransactionId || !suppressed.has(row.bankTransactionId));

bankTransactions = bankTransactions.map((tx) => {
  if (!suppressed.has(tx.id)) return tx;
  return { ...tx, linkedCompanyExpenseId: undefined, linkedFixedExpensePaymentId: undefined };
});

const fixedExpenses = data.fixedExpenses || [];
const insuranceFixedIds = new Set(
  fixedExpenses
    .filter((row) => String(row.category || "").trim() === "\uBCF4\uD5D8")
    .map((row) => row.id),
);

function ledgerHaystack(tx) {
  return [tx.description, tx.counterpartyName, tx.memo].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, "");
}

function matchesInsuranceFixed(tx, fixed) {
  const nameKey = String(fixed.name || "").toLowerCase().replace(/\s+/g, "");
  if (nameKey.length < 2) return false;
  const hay = ledgerHaystack(tx);
  const cp = String(tx.counterpartyName || "").toLowerCase().replace(/\s+/g, "");
  if (cp && (cp === nameKey || cp.includes(nameKey) || nameKey.includes(cp))) return true;
  return hay.includes(nameKey);
}

let unlinkedInsurancePayments = 0;
for (const payment of fixedExpensePayments) {
  if (!payment.bankTransactionId || !insuranceFixedIds.has(payment.fixedExpenseId)) continue;
  const tx = bankTransactions.find((row) => row.id === payment.bankTransactionId);
  const fixed = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
  if (!tx || !fixed || matchesInsuranceFixed(tx, fixed)) continue;
  unlinkedInsurancePayments += 1;
  fixedExpensePayments = fixedExpensePayments.map((row) =>
    row.id === payment.id ? { ...row, bankTransactionId: undefined } : row,
  );
  bankTransactions = bankTransactions.map((row) =>
    row.id === tx.id ? { ...row, linkedFixedExpensePaymentId: undefined } : row,
  );
}

let removedInsuranceExpenses = 0;
companyExpenses = companyExpenses.filter((row) => {
  if (String(row.category || "").trim() !== "\uBCF4\uD5D8" || !row.bankTransactionId) return true;
  const tx = bankTransactions.find((item) => item.id === row.bankTransactionId);
  if (!tx) return true;
  const hay = ledgerHaystack(tx);
  const looksInsurance =
    /\uBCF4\uD5D8|\uC758\uB8CC|\uC0BC\uC131|\uD604\uB300|\uBDB0\uD30C|\uC528\uC0DD|\uC885\uC218|\uD558\uB298|\uC560\uC704/.test(hay);
  if (looksInsurance) return true;
  removedInsuranceExpenses += 1;
  bankTransactions = bankTransactions.map((item) =>
    item.id === tx.id ? { ...item, linkedCompanyExpenseId: undefined } : item,
  );
  return false;
});

const nextPayload = {
  ...data,
  bankLedgerRules,
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
};

const nextVersion = Number(state.version || 0) + 1;
const updatedAt = new Date().toISOString();
db.prepare("UPDATE erp_state SET payload = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1").run(
  JSON.stringify(nextPayload),
  nextVersion,
  updatedAt,
  "repair-bank-ledger",
);

console.log(
  JSON.stringify(
    {
      version: nextVersion,
      clearedBuildingFolders: clearedFolders,
      preauthGroups: groups.length,
      removedExpenses: beforeExp - companyExpenses.length,
      removedPayments: beforePay - fixedExpensePayments.length,
      unlinkedInsurancePayments,
      removedInsuranceExpenses,
      skySample: bankTransactions
        .filter((tx) => String(tx.description || "").includes("\uD558\uB298"))
        .map((tx) => ({
          at: tx.transactionAt,
          w: tx.withdrawal,
          d: tx.deposit,
          role: tx.netGroupRole,
          linked: Boolean(tx.linkedCompanyExpenseId),
        })),
    },
    null,
    2,
  ),
);
