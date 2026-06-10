import { DatabaseSync } from "node:sqlite";
import { mergeWorkersForSave } from "../server/erpSaveMerge.mjs";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const row = db.prepare("SELECT payload, version, updated_at FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);
const name = process.argv[3] || "???";

const workers = data.workers || [];
const matches = workers.filter((w) => String(w.name || "").includes(name.replace(/[^?-?a-zA-Z0-9]/g, "")) || String(w.name || "").trim() === name.trim());

console.log(JSON.stringify({
  version: row.version,
  updatedAt: row.updated_at,
  searchName: name,
  matchCount: matches.length,
  matches: matches.map((w) => ({
    id: w.id,
    idType: typeof w.id,
    name: w.name,
    monthlyPaymentMemo: w.monthlyPaymentMemo ?? null,
    depositNameAliases: w.depositNameAliases ?? null,
    isActive: w.isActive,
  })),
}, null, 2));

if (matches[0]) {
  const target = matches[0];
  const testMemo = `TEST_MEMO_${Date.now()}`;
  const incoming = workers.map((w) =>
    String(w.id) === String(target.id) ? { ...w, monthlyPaymentMemo: testMemo } : w,
  );
  const merged = mergeWorkersForSave(workers, incoming);
  const after = merged.find((w) => String(w.id) === String(target.id));
  console.log("\nmergeWorkersForSave simulation:", {
    testMemo,
    afterMemo: after?.monthlyPaymentMemo ?? null,
    ok: after?.monthlyPaymentMemo === testMemo,
  });
}
