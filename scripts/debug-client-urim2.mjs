import { getDb, getErpState } from "../server/db.mjs";

const URIM = "\uC6B0\uB9BC";
const UREUM = "\uC6B0\uB984";

getDb();
const { data: state } = getErpState();

const clientAudits = (state.auditLogs || []).filter((log) => {
  if (log.entityType !== "client") return false;
  const blob = JSON.stringify(log);
  return blob.includes(URIM) || blob.includes(UREUM) || blob.includes("\uC6B0");
});

console.log("client audit count", clientAudits.length);
console.log(
  clientAudits.slice(0, 30).map((l) => ({
    at: l.createdAt,
    action: l.action,
    entityId: l.entityId,
    actor: l.actorName || l.actor || l.createdBy,
    before: l.before,
    after: l.after,
    entityLabel: l.entityLabel,
    changes: l.changes,
  }))
);

const client79 = state.clients.find((c) => c.id === 79 || c.name === URIM || c.name === UREUM);
console.log("client 79 / urim record:", client79);

const bankUrim = (state.bankTransactions || []).filter((tx) => {
  const blob = `${tx.linkedSubject || ""} ${tx.counterpartyName || ""} ${tx.description || ""}`;
  return blob.includes(URIM) || blob.includes(UREUM);
});
console.log(
  "bank tx linked subjects sample:",
  bankUrim.slice(0, 10).map((tx) => ({
    id: tx.id.slice(0, 8),
    linkedSubject: tx.linkedSubject,
    counterpartyName: tx.counterpartyName,
  }))
);

const vouchersUreum = (state.paymentVouchers || []).filter((v) => v.client === UREUM);
const vouchersUrim = (state.paymentVouchers || []).filter((v) => v.client === URIM);
console.log("vouchers urim", vouchersUrim.length, "ureum", vouchersUreum.length);
