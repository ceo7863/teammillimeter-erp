import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id=1").get().payload);
const clients = Array.isArray(d.clients) ? d.clients : [];
for (const x of clients.slice(0, 8)) {
  console.log(JSON.stringify({ id: x.id, idType: typeof x.id, name: x.name, ceoName: x.ceoName, phone: x.phone }));
}
const team = clients.find((x) => x.id === 35 || String(x.name || "").includes("\uBC00\uB9AC\uBBF8\uD130"));
if (team) console.log("team", JSON.stringify(team, null, 2));
