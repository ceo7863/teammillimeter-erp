import { DatabaseSync } from "node:sqlite";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "erp.sqlite.bak-pre-restore-");
const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
const payload = JSON.parse(row.payload);
const data = payload.data || payload;
const clients = Array.isArray(data.clients) ? data.clients : [];
const withBizReg = clients.filter((c) => String(c.businessRegFileId || "").trim());
console.log(
  JSON.stringify(
    {
      clients: clients.length,
      withBizRegMeta: withBizReg.length,
      sample: withBizReg.slice(0, 10).map((c) => ({
        id: c.id,
        name: c.name,
        businessRegFileId: c.businessRegFileId,
        businessRegFileName: c.businessRegFileName,
      })),
    },
    null,
    2,
  ),
);
db.close();
