/**
 * Backfill sent-statement auto-links for existing unmatched bank deposits.
 * Usage: npx tsx scripts/repair-barobill-auto-deposit.mts [sqlite-path] [--dry-run]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import { applySentStatementAutoLinksToErpData } from "../server/bankSentStatementAutoLink.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const sqliteArg = process.argv.find((arg) => arg.endsWith(".sqlite"));
process.env.DATABASE_PATH = sqliteArg || "data/erp.sqlite";
getDb();

const { data: state, version } = getErpState();
const candidates = (state.bankTransactions || []).filter(
  (row) =>
    row.deposit > 0 &&
    !row.linkedPaymentVoucherId &&
    !row.linkedPdfArchiveId &&
    String(row.importBatchId || "").startsWith("barobill-bank-"),
);

console.log(`Unmatched barobill deposits: ${candidates.length}`);
if (!candidates.length) {
  process.exit(0);
}

const { data: next, autoLinkedCount } = await applySentStatementAutoLinksToErpData(state, {
  onlyTransactionIds: candidates.map((row) => row.id),
  updatedBy: "repair-barobill-auto-deposit",
});

console.log(`Auto-linked: ${autoLinkedCount}`);
if (autoLinkedCount) {
  for (const row of next.bankTransactions || []) {
    if (row.matchAutoLinked && candidates.some((c) => c.id === row.id)) {
      console.log({
        id: row.id,
        transactionAt: row.transactionAt,
        deposit: row.deposit,
        counterpartyName: row.counterpartyName,
        linkedPdfArchiveId: row.linkedPdfArchiveId,
        linkedPaymentVoucherId: row.linkedPaymentVoucherId,
      });
    }
  }
}

if (DRY_RUN) {
  console.log("Dry run — no save");
  process.exit(0);
}

if (autoLinkedCount > 0) {
  const saved = saveErpState(next, version, "repair-barobill-auto-deposit");
  console.log("Saved ERP version", saved.version);
}
