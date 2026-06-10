import { getErpState } from "../server/db.mjs";

const state = getErpState();
const data = state.data || {};
const NEEDLE = "\uC97C\uD22C\uB514\uC790\uC778";
const dupes = (data.clients || []).filter((c) => String(c.name || "").includes(NEEDLE));
console.log("duplicate clients", dupes.map((c) => ({ id: c.id, name: c.name })));

const reqs = (data.clientSiteRequests || []).filter((r) => String(r.clientName || "").includes(NEEDLE));
console.log("all M2 requests statuses", reqs.map((r) => ({ id: r.id, clientId: r.clientId, status: r.status, inbox: r.status === "pending" || r.status === "cancel_pending" })));

const scDates = (data.scSchedules || [])
  .filter((s) => String(s.clientId) === "44")
  .map((s) => s.workDate)
  .sort();
console.log("sc dates", scDates);

process.exit(0);
