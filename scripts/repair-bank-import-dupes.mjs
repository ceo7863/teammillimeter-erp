import { getErpState, saveErpState } from "../server/db.mjs";
import { buildImportFingerprint, dedupeBankTransactionsByFingerprint } from "../server/ibkBankImport.mjs";

const dryRun = process.argv.includes("--dry-run");

function rewireBankTransactionId(payload, fromId, toId) {
  let changed = 0;

  for (const row of payload.companyExpenses || []) {
    if (row.bankTransactionId === fromId) {
      row.bankTransactionId = toId;
      changed += 1;
    }
  }
  for (const row of payload.fixedExpensePayments || []) {
    if (row.bankTransactionId === fromId) {
      row.bankTransactionId = toId;
      changed += 1;
    }
  }
  for (const row of payload.paymentVouchers || []) {
    if (row.bankTransactionId === fromId) {
      row.bankTransactionId = toId;
      changed += 1;
    }
  }
  for (const voucher of payload.workerMonthlyActualVouchers || []) {
    for (const entry of voucher.entries || []) {
      if (entry?.kind === "bank" && entry.bankTransactionId === fromId) {
        entry.bankTransactionId = toId;
        changed += 1;
      }
    }
  }

  return changed;
}

const state = getErpState();
const data = state.data || {};
const before = Array.isArray(data.bankTransactions) ? data.bankTransactions : [];
const result = dedupeBankTransactionsByFingerprint(before);

console.log(
  JSON.stringify(
    {
      dryRun,
      before: before.length,
      after: result.transactions.length,
      removed: result.removed.length,
      removedSamples: result.removed.slice(0, 20).map((row) => ({
        id: row.id,
        removedId: row.removedId,
        keptId: row.keptId,
        fingerprint: row.fingerprint,
        description: row.description,
        transactionAt: row.transactionAt,
      })),
    },
    null,
    2,
  ),
);

if (dryRun || !result.removed.length) {
  process.exit(0);
}

const nextData = { ...data, bankTransactions: result.transactions };
let rewireCount = 0;
for (const row of result.removed) {
  rewireCount += rewireBankTransactionId(nextData, row.removedId, row.keptId);
}

saveErpState(nextData, state.version, "repair-bank-import-dupes");
console.log(JSON.stringify({ saved: true, rewireCount, version: getErpState().version }, null, 2));
