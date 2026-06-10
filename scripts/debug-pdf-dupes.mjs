import { DatabaseSync } from "node:sqlite";
import { homedir } from "os";
import { join } from "path";

const dbPath = join(homedir(), "teammillimeter-erp/data/erp.sqlite");
const db = new DatabaseSync(dbPath);

const total = db.prepare("SELECT COUNT(*) AS c FROM pdf_archives").get().c;
const sent = db.prepare("SELECT COUNT(*) AS c FROM pdf_archives WHERE sent_via_link = 1").get().c;
console.log("total:", total, "sent:", sent);

const rows = db
  .prepare(
    "SELECT id, subject_name, category, period_start, period_end, statement_view, sent_via_link, statement_sales_ids, created_at, linked_bank_transaction_id, payment_status, statement_total_amount, file_name FROM pdf_archives ORDER BY created_at DESC",
  )
  .all();

for (const r of rows) {
  console.log(JSON.stringify(r));
}

// group by subject for dupes
const sentRows = rows.filter((r) => r.sent_via_link === 1);
const bySubject = new Map();
for (const r of sentRows) {
  const key = r.subject_name;
  const list = bySubject.get(key) || [];
  list.push(r);
  bySubject.set(key, list);
}
console.log("\n--- subjects with 2+ sent ---");
for (const [name, list] of bySubject) {
  if (list.length < 2) continue;
  console.log("\n" + name + " (" + list.length + ")");
  for (const r of list) {
    console.log(
      "  " +
        [r.period_start, r.period_end, r.statement_view || "summary", r.statement_sales_ids || "-", r.id.slice(0, 20)].join(" | "),
    );
  }
}
