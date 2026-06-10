import { DatabaseSync } from "node:sqlite";
import { resolveClientContacts, normalizeClientContacts, normalizeNotifyPhone } from "../server/clientContacts.mjs";

const INDIEFFER = "\uC778\uB514\uD37C";
const dbPath = process.argv[2] || "tmp-prod-erp.sqlite";
const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const data = JSON.parse(row.payload);
db.close();

const client = data.clients.find((c) => String(c.name || "").trim() === INDIEFFER)
  || data.clients.find((c) => String(c.id) === "9");
if (!client) {
  console.log("client not found");
  process.exit(1);
}

console.log("=== client record ===");
console.log(JSON.stringify({
  id: client.id,
  name: client.name,
  manager: client.manager,
  phone: client.phone,
  contacts: client.contacts,
}, null, 2));

console.log("\n=== normalizeClientContacts ===");
const normalized = normalizeClientContacts(client);
console.log(JSON.stringify(normalized, null, 2));

const schedules = (data.scSchedules || []).filter(
  (s) => String(s.clientId) === String(client.id) || String(s.clientName || "").trim() === INDIEFFER,
);
console.log(`\n=== SC schedules: ${schedules.length} ===`);
if (schedules[0]) {
  const sample = schedules[0];
  console.log("sample schedule:", { id: sample.id, clientId: sample.clientId, clientName: sample.clientName, siteManagerName: sample.siteManagerName });
  console.log("\n=== resolveClientContacts (excludeSiteManager:true) ===");
  const contacts = resolveClientContacts(data.clients, sample, { excludeSiteManager: true });
  console.log(JSON.stringify(contacts, null, 2));

  const rows = [];
  const seenKeys = new Set();
  function pushRow(name, phone, contactId) {
    const participantName = String(name || "").trim();
    if (!participantName) return { skipped: "empty name", name, phone };
    const normalizedPhone = normalizeNotifyPhone(phone);
    const dedupeKey = String(contactId || "").trim() || normalizedPhone || `name:${participantName}`;
    if (seenKeys.has(dedupeKey)) {
      return { skipped: "dedupe", dedupeKey, name: participantName, phone: normalizedPhone };
    }
    seenKeys.add(dedupeKey);
    rows.push({ participantName, phone: normalizedPhone || null, contactId: contactId || null });
    return { added: true, participantName, phone: normalizedPhone, contactId };
  }

  console.log("\n=== buildWeeklyBriefingRecipientRows simulation (contactId dedupe) ===");
  for (const contact of contacts) {
    const result = pushRow(contact.name || contact.clientName, contact.phone, contact.contactId);
    console.log(JSON.stringify({ input: contact, result }));
  }
  console.log("\nfinal recipientRows:", JSON.stringify(rows, null, 2));
  console.log(`with phone: ${rows.filter((r) => r.phone).length}, without phone: ${rows.filter((r) => !r.phone).length}`);
}
