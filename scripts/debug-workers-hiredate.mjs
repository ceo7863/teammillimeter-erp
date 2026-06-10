import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.argv[2] || path.join(root, "data", "erp.sqlite");
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT payload, updated_at, updated_by, version FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);
const workers = (data.workers || [])
  .filter((w) => w.grade === "E" || w.hireDate)
  .map((w) => ({
    name: w.name,
    grade: w.grade,
    hireDate: w.hireDate || "",
    eGradeEndedAt: w.eGradeEndedAt || "",
  }));
console.log(JSON.stringify({ version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by, workersWithHireOrE: workers }, null, 2));
const allWorkers = (data.workers || []).map((w) => ({ name: w.name, grade: w.grade, hireDate: w.hireDate || "" }));
console.log("ALL_WORKERS_SAMPLE", JSON.stringify({ total: allWorkers.length, sample: allWorkers.slice(0, 20) }, null, 2));
const audits = (data.auditLogs || [])
  .filter((a) => a.entityType === "worker" && (a.after?.hireDate || a.after?.grade === "E" || a.fields?.some((f) => f.key === "hireDate" || f.key === "grade")))
  .slice(0, 10)
  .map((a) => ({
    at: a.at,
    action: a.action,
    label: a.entityLabel,
    grade: a.after?.grade,
    hireDate: a.after?.hireDate,
  }));
console.log("RECENT_WORKER_HIRE_AUDITS", JSON.stringify(audits, null, 2));
const allWorkerAudits = (data.auditLogs || []).filter((a) => a.entityType === "worker");
console.log("AUDIT_TOTAL", (data.auditLogs || []).length);
console.log("AUDIT_ENTITY_TYPES", [...new Set((data.auditLogs || []).map((a) => a.entityType))].join(", "));
console.log("LAST_WORKER_AUDITS", JSON.stringify(allWorkerAudits.slice(0, 5).map((a) => ({ at: a.at, label: a.entityLabel, grade: a.after?.grade, hireDate: a.after?.hireDate })), null, 2));
