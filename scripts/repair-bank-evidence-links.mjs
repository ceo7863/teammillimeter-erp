#!/usr/bin/env node
/** Re-run tax-invoice evidence auto-link and persist through saveErpState (domain rows + blob). */
import { getErpState, saveErpState } from "../server/db.mjs";
import { runTaxInvoiceEvidenceAutoLink } from "../src/utils/taxInvoiceEvidenceAutoLink.ts";

const dryRun = process.argv.includes("--dry-run");

function countTaxInvoiceLinks(transactions = []) {
  let count = 0;
  for (const row of transactions) {
    const ids = Array.isArray(row?.linkedTaxInvoiceIds)
      ? row.linkedTaxInvoiceIds.filter(Boolean)
      : row?.linkedTaxInvoiceId
        ? [String(row.linkedTaxInvoiceId)]
        : [];
    if (ids.length) count += 1;
  }
  return count;
}

const state = getErpState();
const data = state.data || {};

const result = runTaxInvoiceEvidenceAutoLink({
  bankTransactions: data.bankTransactions || [],
  taxInvoices: data.taxInvoices || [],
  clients: data.clients || [],
  workers: data.workers || [],
});

const beforeCount = countTaxInvoiceLinks(data.bankTransactions);
const afterCount = countTaxInvoiceLinks(result.transactions);

console.log(
  JSON.stringify(
    {
      dryRun,
      linkedCount: result.linkedCount,
      beforeLinks: beforeCount,
      afterLinks: afterCount,
      totalBankTx: (data.bankTransactions || []).length,
      totalTaxInvoices: (data.taxInvoices || []).length,
      version: state.version,
    },
    null,
    2,
  ),
);

if (!dryRun && result.linkedCount > 0) {
  const saved = saveErpState(
    {
      ...data,
      bankTransactions: result.transactions,
      clients: result.clients ?? data.clients,
    },
    state.version,
    "repair-bank-evidence-links",
  );

  const verify = getErpState();
  console.log(
    JSON.stringify(
      {
        savedVersion: saved.version,
        verifyLinks: countTaxInvoiceLinks(verify.data?.bankTransactions),
      },
      null,
      2,
    ),
  );
}
