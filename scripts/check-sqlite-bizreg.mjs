import { DatabaseSync } from "node:sqlite";
import path from "path";

const dbPaths = [
  path.join(process.cwd(), "data", "erp.sqlite"),
  path.join(process.cwd(), "data", "erp.sqlite.bak-pre-restore-"),
];

for (const dbPath of dbPaths) {
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const hasTable = tables.some((row) => row.name === "client_business_reg_files");
    let count = 0;
    let sample = [];
    if (hasTable) {
      count = db.prepare("SELECT COUNT(*) AS n FROM client_business_reg_files").get()?.n || 0;
      sample = db.prepare("SELECT client_id, id, file_name FROM client_business_reg_files LIMIT 5").all();
    }
    const domainClients = db
      .prepare("SELECT payload FROM erp_domain_state WHERE domain = 'clients'")
      .get();
    let withBizRegMeta = 0;
    if (domainClients?.payload) {
      const parsed = JSON.parse(domainClients.payload);
      const clients = Array.isArray(parsed.clients) ? parsed.clients : [];
      withBizRegMeta = clients.filter((c) => String(c.businessRegFileId || "").trim()).length;
    }
    console.log(
      JSON.stringify({ dbPath, hasTable, sqliteRows: count, sample, clientsWithBizRegMeta: withBizRegMeta }),
    );
    db.close();
  } catch (error) {
    console.log(JSON.stringify({ dbPath, error: error?.message || String(error) }));
  }
}
