import { runBarobillBankSync } from "../server/barobillBankSync.mjs";
import { getErpState } from "../server/db.mjs";

const before = getErpState();
console.log("before", before.data.bankTransactions?.length, before.version);

const result = await runBarobillBankSync({
  requestRefresh: true,
  updatedBy: "debug-script",
});

const after = getErpState();
console.log("sync", JSON.stringify(result, null, 2));
console.log("after", after.data.bankTransactions?.length, after.version, after.data.bankSyncMeta);
