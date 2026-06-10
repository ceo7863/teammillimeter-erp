import { getErpState, getDb } from "../server/db.mjs";

const data = getErpState().data || {};
const clients = Array.isArray(data.clients) ? data.clients : [];
const withContacts = clients.filter((c) => Array.isArray(c.contacts) && c.contacts.length > 0);
const withManager = clients.filter((c) => String(c.manager || "").trim());
const withBizRegMeta = clients.filter((c) => String(c.businessRegFileId || "").trim());

let sqliteBizRegFiles = 0;
try {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM client_business_reg_files").get();
  sqliteBizRegFiles = Number(row?.n) || 0;
} catch (error) {
  console.error("sqlite error", error?.message || error);
}

console.log(
  JSON.stringify(
    {
      clients: clients.length,
      withContacts: withContacts.length,
      withManager: withManager.length,
      withBizRegMeta: withBizRegMeta.length,
      sqliteBizRegFiles,
      sampleBizRegMeta: withBizRegMeta.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name,
        businessRegFileId: c.businessRegFileId,
        businessRegFileName: c.businessRegFileName,
      })),
      clientsMissingMetaButMaybeHaveSqlite:
        sqliteBizRegFiles > withBizRegMeta.length ? sqliteBizRegFiles - withBizRegMeta.length : 0,
    },
    null,
    2,
  ),
);
