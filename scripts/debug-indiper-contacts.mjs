import { DatabaseSync } from "node:sqlite";
import { resolveClientContacts } from "../server/clientContacts.mjs";

const db = new DatabaseSync("data/erp.sqlite", { readOnly: true });
const row = db.prepare("SELECT data FROM erp_domain_state WHERE key=?").get("main");
const data = JSON.parse(row.data);
const client = data.clients.find((x) => String(x.name || "").includes("??"));
if (!client) {
  console.log("NOT FOUND");
  process.exit(1);
}
console.log("=== client ===");
console.log(JSON.stringify(client, null, 2));
const schedule = { clientId: client.id, clientName: client.name };
const contacts = resolveClientContacts(data.clients, schedule);
console.log("\n=== resolveClientContacts ===");
console.log(JSON.stringify(contacts, null, 2));
