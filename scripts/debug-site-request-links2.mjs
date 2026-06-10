import { getErpState } from "../server/db.mjs";

const state = getErpState();
const data = state.data || {};
const clients = Array.isArray(data.clients) ? data.clients : [];
console.log("db clients", clients.length);
console.log("sample keys", clients[0] ? Object.keys(clients[0]).slice(0, 20) : []);
const withAny = clients.filter((row) =>
  Object.keys(row).some((key) => key.toLowerCase().includes("siterequest") || key.toLowerCase().includes("requesttoken")),
);
console.log("with site request fields", withAny.length);
for (const row of withAny.slice(0, 5)) {
  console.log(row.name, row.siteRequestToken, row.siteRequestLinkDisabled);
}
console.log("clientSiteRequests", Array.isArray(data.clientSiteRequests) ? data.clientSiteRequests.length : 0);
