import { getErpState } from "../server/db.mjs";

const data = getErpState().data || {};
const logs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
const clientLogs = logs
  .filter((e) => e.entityType === "client" && (e.field === "manager" || e.field === "phone"))
  .slice(-20);
console.log(JSON.stringify(clientLogs, null, 2));
