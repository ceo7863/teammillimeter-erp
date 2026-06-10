import { listRegisteredBankAccounts } from "../server/barobill/bankAccountScrap.mjs";
import { getBarobillBankConfigStatus } from "../server/barobill/bankAccountClient.mjs";

const rows = await listRegisteredBankAccounts();
console.log(
  JSON.stringify(
    {
      test: getBarobillBankConfigStatus().test,
      target: getBarobillBankConfigStatus().bankAccountNumRaw,
      registered: rows,
    },
    null,
    2,
  ),
);
