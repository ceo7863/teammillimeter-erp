import { getErpState } from "../server/db.mjs";
import { fetchBarobillBankTransactionsInRange, countMergeAgainstExisting } from "../server/barobill/bankAccountSync.mjs";
import { checkBankAccountScrapService } from "../server/barobill/bankAccountScrap.mjs";
import { getBarobillBankConfigStatus } from "../server/barobill/bankAccountClient.mjs";

const before = getErpState();
const existing = before.data.bankTransactions || [];
const cfg = getBarobillBankConfigStatus();
console.log("BEFORE", JSON.stringify({ version: before.version, count: existing.length, meta: before.data.bankSyncMeta }, null, 2));
console.log("CONFIG", JSON.stringify(cfg, null, 2));

const scrap = await checkBankAccountScrapService(cfg.bankAccountNum);
console.log("SCRAP", JSON.stringify(scrap, null, 2));

const fetched = await fetchBarobillBankTransactionsInRange({
  startDate: "2026-05-30",
  endDate: "2026-06-06",
  requestRefresh: false,
});
const mergePreview = countMergeAgainstExisting(existing, fetched.preview);
console.log(
  "FETCH_NO_REFRESH",
  JSON.stringify(
    {
      collecting: fetched.collecting,
      rowCount: fetched.preview.rows.length,
      latest: fetched.preview.latestTransactionAt,
      wouldAdd: mergePreview.added,
      wouldSkip: mergePreview.skipped,
      errors: fetched.errors,
    },
    null,
    2,
  ),
);

const fetched2 = await fetchBarobillBankTransactionsInRange({
  startDate: "2026-05-30",
  endDate: "2026-06-06",
  requestRefresh: true,
});
const mergePreview2 = countMergeAgainstExisting(existing, fetched2.preview);
console.log(
  "FETCH_WITH_REFRESH",
  JSON.stringify(
    {
      collecting: fetched2.collecting,
      scrapCode: fetched2.scrapStatus?.code,
      scrapMessage: fetched2.scrapStatus?.message,
      rowCount: fetched2.preview.rows.length,
      latest: fetched2.preview.latestTransactionAt,
      wouldAdd: mergePreview2.added,
      wouldSkip: mergePreview2.skipped,
      errors: fetched2.errors,
      notices: fetched2.notices,
    },
    null,
    2,
  ),
);
