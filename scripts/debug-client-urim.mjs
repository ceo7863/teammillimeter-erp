import { getDb, getErpState } from "../server/db.mjs";

const URIM = "\uC6B0\uB9BC";
const UREUM = "\uC6B0\uB984";

getDb();
const { data: state } = getErpState();

console.log("URIM", URIM, "UREUM", UREUM);
console.log("urim hex", [...URIM].map((c) => c.codePointAt(0).toString(16)).join(" "));
console.log("ureum hex", [...UREUM].map((c) => c.codePointAt(0).toString(16)).join(" "));

const clients = state.clients.filter((c) => {
  const name = String(c.name || "");
  return name === URIM || name === UREUM || name.includes("\uC6B0");
});
console.log(
  "clients:",
  clients.map((c) => ({ id: c.id, name: c.name, manager: c.manager }))
);

const salesNames = [
  ...new Set(
    state.sales
      .map((s) => s.client)
      .filter((n) => {
        const name = String(n || "");
        return name === URIM || name === UREUM || name.includes("\uC6B0");
      })
  ),
];
console.log("sales client names:", salesNames);
console.log("sales urim:", state.sales.filter((s) => s.client === URIM).length);
console.log("sales ureum:", state.sales.filter((s) => s.client === UREUM).length);

const db = getDb();
const pdfRows = db
  .prepare("SELECT id, subject_name FROM pdf_archives WHERE subject_name LIKE ?")
  .all("%\uC6B0%");
console.log(
  "pdf archives:",
  pdfRows.map((r) => ({ id: r.id, subject: r.subject_name }))
);

const audits = (state.auditLogs || [])
  .filter((log) => {
    const blob = JSON.stringify(log);
    return blob.includes(URIM) || blob.includes(UREUM);
  })
  .slice(0, 20);
console.log(
  "audit hits:",
  audits.map((l) => ({
    at: l.createdAt,
    action: l.action,
    entity: l.entityType,
    entityId: l.entityId,
    by: l.actorName || l.actor,
    before: l.before,
    after: l.after,
    entityLabel: l.entityLabel,
  }))
);
