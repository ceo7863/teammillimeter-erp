import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const data = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);
const workers = data.workers || [];
const ids = workers.map((w) => String(w.id));
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log(JSON.stringify({
  total: workers.length,
  noId: workers.filter((w) => w.id == null).length,
  duplicateIdCount: dup.length,
  duplicateIds: [...new Set(dup)].slice(0, 10),
  withMemo: workers.filter((w) => String(w.monthlyPaymentMemo || "").trim()).map((w) => ({ id: w.id, name: w.name, memo: w.monthlyPaymentMemo })),
}, null, 2));
