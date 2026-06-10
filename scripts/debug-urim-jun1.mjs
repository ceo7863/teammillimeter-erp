import { getDb, getErpState } from "../server/db.mjs";
import { DatabaseSync } from "node:sqlite";

const TX_ID = "30d5f454-0ea4-4a24-ab99-d81e44f39302";
const ARCHIVE_ID = "pdf-1780037547123-bf151613";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data: state } = getErpState();
const db = new DatabaseSync(process.env.DATABASE_PATH);

const tx = state.bankTransactions.find((row) => row.id === TX_ID);
const pdf = db.prepare("SELECT * FROM pdf_archives WHERE id = ?").get(ARCHIVE_ID);
console.log("tx", tx);
console.log("pdf", pdf);

const sales = (state.sales || []).filter(
  (s) => s.client === "\uC6B0\uB9BC" && s.date >= "2026-05-26" && s.date <= "2026-05-27",
);
console.log(
  "sales in period",
  sales.map((s) => ({ id: s.id, date: s.date, amount: s.amount, site: s.site, paid: s.paid })),
);

const client = state.clients.find((c) => c.name === "\uC6B0\uB9BC");
console.log("client", client ? { id: client.id, name: client.name, vat: client.vat, aliases: client.depositNameAliases } : null);
