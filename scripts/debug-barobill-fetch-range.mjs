import { fetchBarobillBankTransactionsInRange } from "../server/barobill/bankAccountSync.mjs";
import { getBarobillBankConfigStatus } from "../server/barobill/bankAccountClient.mjs";

const startDate = process.argv[2] || "2026-06-01";
const endDate = process.argv[3] || "2026-06-09";

const result = await fetchBarobillBankTransactionsInRange({
  startDate,
  endDate,
  requestRefresh: true,
});

console.log(
  JSON.stringify(
    {
      test: getBarobillBankConfigStatus().test,
      startDate,
      endDate,
      collecting: result.collecting,
      errors: result.errors,
      notices: result.notices,
      rowCount: result.preview?.rows?.length ?? 0,
      latest: result.preview?.latestTransactionAt ?? null,
      sample: (result.preview?.rows || []).slice(0, 5).map((row) => ({
        transactionAt: row.transactionAt,
        description: row.description,
        deposit: row.deposit,
        withdrawal: row.withdrawal,
      })),
    },
    null,
    2,
  ),
);
