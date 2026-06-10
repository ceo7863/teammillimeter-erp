import { getErpState, saveErpState } from "../server/db.mjs";
import { normalizeClientContacts, syncClientLegacyContactFields } from "../server/clientContacts.mjs";

const state = getErpState();
const data = state.data || {};
const clients = Array.isArray(data.clients) ? data.clients : [];

let updated = 0;
const nextClients = clients.map((client) => {
  const existingContacts = Array.isArray(client.contacts)
    ? client.contacts.filter((row) => row && (row.name || row.phone))
    : [];
  if (existingContacts.length) return client;

  const derived = normalizeClientContacts(client);
  if (!derived.length) return client;

  const synced = syncClientLegacyContactFields(derived);
  updated += 1;
  return {
    ...client,
    contacts: synced.contacts,
    manager: synced.manager || client.manager,
    phone: synced.phone || client.phone,
  };
});

if (!updated) {
  console.log(JSON.stringify({ ok: true, updated: 0, message: "all clients already have contacts or no legacy manager/phone" }));
  process.exit(0);
}

saveErpState({ ...data, clients: nextClients }, state.version, "migrate-client-contacts");
console.log(JSON.stringify({ ok: true, updated, total: clients.length, version: getErpState().version }));
