import { loadEnv } from "../server/loadEnv.mjs";
import { getErpState } from "../server/db.mjs";

loadEnv();
const data = getErpState().data || {};
const rows = Array.isArray(data.clientContracts) ? data.clientContracts : [];
for (const row of rows.slice(0, 10)) {
  console.log(
    JSON.stringify({
      id: row.id,
      clientName: row.clientName,
      title: row.title,
      status: row.status,
      contactPhone: row.contactPhone,
    }),
  );
}
