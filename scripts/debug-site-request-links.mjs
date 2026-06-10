import { getErpState } from "../server/db.mjs";
import { buildClientSiteRequestUrl } from "../server/clientSiteRequests.mjs";

const data = getErpState().data || {};
const clients = Array.isArray(data.clients) ? data.clients : [];
const withToken = clients.filter((row) => String(row.siteRequestToken || "").trim());
console.log("count", withToken.length);
for (const client of withToken.slice(0, 3)) {
  const token = String(client.siteRequestToken || "").trim();
  console.log(JSON.stringify({
    name: client.name,
    token,
    url: buildClientSiteRequestUrl(token),
    disabled: Boolean(client.siteRequestLinkDisabled),
  }));
}
