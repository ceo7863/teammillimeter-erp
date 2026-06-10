import { runBarobillBankSync, getBarobillBankSyncStatus } from "../server/barobillBankSync.mjs";
import { getBarobillBankConfigStatus } from "../server/barobill/bankAccountClient.mjs";
import { getDb, getErpState } from "../server/db.mjs";

getDb();
console.log("config", JSON.stringify(getBarobillBankConfigStatus(), null, 2));

const result = await runBarobillBankSync({
  startDate: process.argv[2] || "2026-06-01",
  endDate: process.argv[3] || "2026-06-09",
  requestRefresh: true,
  updatedBy: "repair-june-bank-sync",
});

const state = getErpState();
const txs = state.data.bankTransactions || [];
const june = txs.filter((t) => String(t.transactionAt || "").startsWith("2026-06"));

console.log(
  JSON.stringify(
    {
      result,
      status: getBarobillBankSyncStatus(),
      bankTotal: txs.length,
      juneCount: june.length,
      latest: txs.map((t) => String(t.transactionAt || "").slice(0, 10)).sort().pop(),
    },
    null,
    2,
  ),
);
