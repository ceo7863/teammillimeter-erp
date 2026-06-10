import { getBarobillBankSyncStatus } from "../server/barobillBankSync.mjs";
import { getBarobillBankConfigStatus } from "../server/barobill/bankAccountClient.mjs";

console.log(
  JSON.stringify(
    {
      config: getBarobillBankConfigStatus(),
      status: getBarobillBankSyncStatus(),
    },
    null,
    2,
  ),
);
