#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import { buildTaxInvoiceCancellationExcludedIds } from "../src/utils/taxInvoices.ts";

getDb();
const invoices = getErpState().data.taxInvoices || [];
const excluded = buildTaxInvoiceCancellationExcludedIds(invoices);

const contentDupes = new Map();
for (const row of invoices) {
  const key = [row.flowType, row.issueDate, row.client, row.totalAmount].join("|");
  if (!contentDupes.has(key)) contentDupes.set(key, []);
  contentDupes.get(key).push(row);
}

const groups = [...contentDupes.values()].filter((rows) => rows.length > 1);

console.log(
  JSON.stringify(
    {
      cancelledCount: invoices.filter((r) => r.status === "cancelled").length,
      excludedFromTotals: excluded.size,
      contentDuplicateGroups: groups.length,
      groups: groups.map((rows) =>
        rows.map((row) => ({
          id: row.id,
          status: row.status,
          invoiceNo: row.invoiceNo,
          client: row.client,
          issueDate: row.issueDate,
          totalAmount: row.totalAmount,
          excluded: excluded.has(row.id),
        })),
      ),
    },
    null,
    2,
  ),
);
