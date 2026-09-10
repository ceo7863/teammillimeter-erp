/**
 * Read-only Phase 2 diagnostics: how many bank deposits are receipt-linked,
 * legacy-linked or still unlinked, split by the receipt cutover instant.
 *
 * Never writes: safe to run against production state at any time.
 * Run: npx tsx scripts/bank-receipt-phase2-dry-run.mjs
 */

import { getErpState } from "../server/db.mjs";
import { buildBankReceiptPhase2Diagnostics } from "../server/bankReceipts.mjs";

export function diagnoseBankReceiptPhase2(data = {}) {
  return buildBankReceiptPhase2Diagnostics(data);
}

function main() {
  const state = getErpState();
  const report = diagnoseBankReceiptPhase2(state.data || {});
  console.log(JSON.stringify(report, null, 2));

  const bank = report.bankTransactions;
  console.log("\n[phase2 dry-run] apply=false - no customer data mutated");
  console.log(
    `[phase2 dry-run] cutover=${report.cutoverAt || "(unset)"} source=${report.cutoverSource}`,
  );
  console.log(
    `[phase2 dry-run] deposits=${bank.deposits} receipt=${bank.receiptLinked} legacy=${bank.legacyLinked} ` +
      `unlinked=${bank.unlinked} (preCutover=${bank.unlinkedPreCutover} postCutover=${bank.unlinkedPostCutover})`,
  );
  if (bank.fakeVoucherIdOnReceiptLink > 0) {
    console.log(
      `[phase2 dry-run] WARNING ${bank.fakeVoucherIdOnReceiptLink} receipt-linked rows still carry linkedPaymentVoucherId`,
    );
  }
  if (report.receipts.grossMismatchReceiptIds.length) {
    console.log(
      `[phase2 dry-run] WARNING gross!=deposit receipts: ${report.receipts.grossMismatchReceiptIds.join(", ")}`,
    );
  }
  if (report.receipts.orphanBankTransactionIds.length) {
    console.log(
      `[phase2 dry-run] WARNING receipts pointing at missing bank rows: ${report.receipts.orphanBankTransactionIds.join(", ")}`,
    );
  }
}

if (process.argv[1]?.endsWith("bank-receipt-phase2-dry-run.mjs")) {
  main();
}

export default diagnoseBankReceiptPhase2;
