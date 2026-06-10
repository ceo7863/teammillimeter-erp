import { fetchBarobillBankTransactionsInRange } from "../server/barobill/bankAccountSync.mjs";

const r = await fetchBarobillBankTransactionsInRange({
  startDate: "2026-05-30",
  endDate: "2026-06-06",
  requestRefresh: true,
});

console.log(
  JSON.stringify(
    {
      collecting: r.collecting,
      errors: r.errors,
      rowCount: r.preview?.rows?.length ?? 0,
      latest: r.preview?.latestTransactionAt ?? null,
      notices: r.notices,
    },
    null,
    2,
  ),
);
