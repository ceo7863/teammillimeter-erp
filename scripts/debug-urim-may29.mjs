import { DatabaseSync } from "node:sqlite";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";

const db = new DatabaseSync("data/erp.sqlite");
const d = JSON.parse(db.prepare("SELECT payload FROM erp_state WHERE id = 1").get().payload);

for (const id of ["3589", "3590", "3591", "3596", "3597", "3598"]) {
  const s = (d.sales || []).find((row) => String(row.id) === id);
  if (s) console.log({ id: s.id, date: s.date, client: s.client, site: s.site, amount: s.amount, paid: s.paid });
}

const archives = listSentStatementArchiveMetas();
const pdf = archives.find((a) => a.id === "pdf-1780037547123-bf151613");
console.log("\nPDF:", pdf);

const tx = (d.bankTransactions || []).find((t) => t.id === "30d5f454-0ea4-4a24-ab99-d81e44f39302");
console.log("\nTX:", { deposit: tx?.deposit, matchAutoLinked: tx?.matchAutoLinked, matchConfirmedBy: tx?.matchConfirmedBy });
