import { getErpState } from "../server/db.mjs";
import { getBankSyncStatus, runUnifiedBankSync } from "../server/bankSync.mjs";
import { getBarobillBankSyncStatus } from "../server/barobillBankSync.mjs";
import { getOpenBankingSyncStatus } from "../server/openBankingSync.mjs";

const s = getErpState();
const txs = Array.isArray(s.data.bankTransactions) ? s.data.bankTransactions : [];
const meta = s.data.bankSyncMeta || {};
const latest = [...txs].sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)))[0];

console.log("version", s.version);
console.log("txCount", txs.length);
console.log(
  "latestTx",
  latest?.transactionAt,
  latest?.counterpartyName,
  latest?.deposit || latest?.withdrawal,
);
console.log("bankSyncMeta", JSON.stringify(meta, null, 2));
console.log("liveSyncStatus", JSON.stringify(getBankSyncStatus(), null, 2));
console.log("barobillBankStatus", JSON.stringify(getBarobillBankSyncStatus(), null, 2));
console.log("openBankingStatus", JSON.stringify(getOpenBankingSyncStatus(), null, 2));

console.log("--- running sync now ---");
const result = await runUnifiedBankSync({ requestRefresh: true, forceMetaUpdate: true });
console.log("syncResult", JSON.stringify(result, null, 2));

const after = getErpState();
console.log("afterVersion", after.version);
console.log("afterTxCount", (after.data.bankTransactions || []).length);
