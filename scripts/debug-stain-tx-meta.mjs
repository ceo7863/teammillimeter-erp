import { getDb, getErpState } from "../server/db.mjs";
import { hasManualClientClassificationOverride } from "../src/utils/bankTransactions.ts";

process.env.DATABASE_PATH = process.argv[2] || "data/erp.sqlite";
getDb();
const { data } = getErpState();
const tx = (data.bankTransactions || []).find((t) => t.id === "ca3c6723-8e5e-453d-b54d-25bc8f6a4257");
console.log(JSON.stringify({
  linkedSubject: tx?.linkedSubject,
  classifiedAt: tx?.classifiedAt,
  matchConfirmedAt: tx?.matchConfirmedAt,
  folderId: tx?.folderId,
  classifiedBy: tx?.classifiedBy,
  hasManualOverride: tx ? hasManualClientClassificationOverride(tx) : null,
}, null, 2));
