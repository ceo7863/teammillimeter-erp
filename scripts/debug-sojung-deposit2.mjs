import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2] || "data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

const clients = (d.clients || []).filter((c) => JSON.stringify(c).includes("\uC18C\uC911\uD55C"));
console.log("clients:", JSON.stringify(clients, null, 2));

const invId = "a76e7578-b22c-4461-9fcf-56806a893c75";
const inv = (d.taxInvoices || []).find((t) => t.id === invId);
console.log("tax invoice:", JSON.stringify(inv, null, 2));

const salesSample = (d.sales || []).slice(0, 3).map((s) => ({ id: s.id, client: s.client, site: s.site }));
console.log("sales sample:", salesSample);
