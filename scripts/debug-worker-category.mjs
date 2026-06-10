#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(String(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload));
const workers = d.workers || [];
const OUT = "\uC678\uC8FC";
const TEAM = "\uD300\uC6D0";
const normCat = (c) => (String(c || "").trim() === OUT ? OUT : TEAM);
const normName = (v) => String(v || "").trim();
const stripA = (n) => (n.startsWith("A") && n.length > 1 ? n.slice(1) : n);
const matchKey = (n) => stripA(normName(n)).replace(/\s+/g, "");
function findMaster(workers, name) {
  const target = normName(name);
  const exact = workers.find((w) => normName(w.name) === target);
  if (exact) return exact;
  const key = matchKey(target);
  return workers.find((w) => matchKey(w.name) === key || normName(w.name) === `A${target}` || stripA(normName(w.name)) === stripA(target));
}
function listName(workers, name) {
  const m = findMaster(workers, name);
  return m ? normName(m.name) : normName(name);
}
function category(workers, name, master) {
  const s = master ?? findMaster(workers, name);
  return normCat(s?.category);
}
function isActive(w) { return w?.isActive !== false; }

function salesWorkers(sales) {
  const rows = [];
  for (const sale of sales || []) {
    const ws = sale.workers?.length ? sale.workers : sale.worker ? [{ name: sale.worker }] : [];
    for (const w of ws) {
      const name = normName(w.name || w.worker);
      if (name) rows.push({ worker: name });
    }
  }
  return rows;
}

function buildSummaries(obligations, workers) {
  const byWorker = new Map();
  for (const o of obligations) {
    const workerName = listName(workers, o.worker);
    if (!byWorker.has(workerName)) byWorker.set(workerName, []);
    byWorker.get(workerName).push(o);
  }
  const summaries = [];
  const seen = new Set();
  for (const worker of workers) {
    if (!isActive(worker)) continue;
    const workerName = normName(worker.name);
    if (!workerName || seen.has(workerName)) continue;
    seen.add(workerName);
    summaries.push({ worker: workerName, category: category(workers, workerName, worker) });
  }
  for (const workerName of byWorker.keys()) {
    if (seen.has(workerName)) continue;
    const master = findMaster(workers, workerName);
    if (master && !isActive(master)) continue;
    summaries.push({ worker: workerName, category: category(workers, workerName, master) });
    seen.add(workerName);
  }
  return summaries;
}

const active = workers.filter(isActive);
const summaries = buildSummaries(salesWorkers(d.sales), workers);
const count = (rows) => ({ total: rows.length, team: rows.filter((r) => r.category === TEAM).length, outsource: rows.filter((r) => r.category === OUT).length });
console.log("Workers page:", count(active.map((w) => ({ category: normCat(w.category) }))));
console.log("Monthly tab:", count(summaries));
const masterCat = new Map(active.map((w) => [normName(w.name), normCat(w.category)]));
console.log("Mismatches:", summaries.filter((s) => masterCat.has(s.worker) && masterCat.get(s.worker) !== s.category));
