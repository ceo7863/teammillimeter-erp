/**
 * Read-only: list bank txs with linked sent-statement archives but incomplete individual vouchers.
 * Does NOT print account numbers, raw descriptions, or public statement URLs.
 *
 * Usage:
 *   npx tsx scripts/diagnose-incomplete-bank-sent-statement-allocations.mts [sqlite-path]
 */
import { getDb, getErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";
import { listIncompleteBankSentStatementAllocations } from "../src/utils/bankSentStatementAllocation.ts";

const sqliteArg = process.argv.find((arg) => arg.endsWith(".sqlite"));
process.env.DATABASE_PATH = sqliteArg || "data/erp.sqlite";
getDb();

const { data: state } = getErpState();
const archives = listSentStatementArchiveMetas();
const rows = listIncompleteBankSentStatementAllocations({
  bankTransactions: state.bankTransactions || [],
  paymentVouchers: state.paymentVouchers || [],
  archives,
});

console.log(
  JSON.stringify(
    {
      mode: "read-only",
      incompleteCount: rows.length,
      rows: rows.map((row) => ({
        bankTransactionId: row.bankTransactionId,
        client: row.client,
        transactionDate: row.transactionDate,
        depositAmount: row.depositAmount,
        kind: row.kind,
        statementTotalAmount: row.statementTotalAmount,
        allocatedAmount: row.allocatedAmount,
        unallocatedAmount: row.unallocatedAmount,
        voucherCount: row.voucherCount,
        allocatedSalesCount: row.allocatedSalesCount,
        statementSalesCount: row.statementSalesCount,
      })),
    },
    null,
    2,
  ),
);
