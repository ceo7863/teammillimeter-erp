import { getErpState } from "../server/db.mjs";

const s = getErpState();
const txs = Array.isArray(s.data.bankTransactions) ? s.data.bankTransactions : [];
const sorted = [...txs].sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
console.log(
  JSON.stringify(
    {
      version: s.version,
      txCount: txs.length,
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
      meta: s.data.bankSyncMeta || null,
      latest5: sorted.slice(0, 5).map((row) => ({
        at: row.transactionAt,
        name: row.counterpartyName,
        deposit: row.deposit,
        withdrawal: row.withdrawal,
      })),
    },
    null,
    2,
  ),
);
