import { runBarobillBankSync, getBarobillBankSyncStatus } from "../server/barobillBankSync.mjs";
import { checkBankAccountScrapService } from "../server/barobill/bankAccountScrap.mjs";
import { getBarobillBankConfigStatus } from "../server/barobill/bankAccountClient.mjs";

const cfg = getBarobillBankConfigStatus();
console.log("config", JSON.stringify(cfg, null, 2));
console.log("statusBefore", JSON.stringify(getBarobillBankSyncStatus(), null, 2));

if (cfg.configured) {
  try {
    const scrap = await checkBankAccountScrapService(cfg.bankAccountNumRaw);
    console.log("scrapStatus", JSON.stringify(scrap, null, 2));
  } catch (error) {
    console.log("scrapError", error instanceof Error ? error.message : String(error));
  }
}

const result = await runBarobillBankSync({ requestRefresh: true });
console.log("syncResult", JSON.stringify(result, null, 2));
console.log("statusAfter", JSON.stringify(getBarobillBankSyncStatus(), null, 2));
