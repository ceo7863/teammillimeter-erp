import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/erp.sqlite", { readOnly: true });
const row = db.prepare("SELECT payload FROM erp_domain_state WHERE domain=?").get("clients");
const data = JSON.parse(row.payload);
const clients = data.clients || data;
const client = clients.find((x) => String(x.name || "").includes("\uC778\uB514"));
if (!client) {
  console.log("NOT FOUND");
  process.exit(1);
}
console.log(JSON.stringify({ id: client.id, name: client.name, manager: client.manager, phone: client.phone, contacts: client.contacts }, null, 2));
