/**
 * Read-only diagnosis of sent-statement payment_status vs sales voucher allocation coverage.
 * Never mutates customer data.
 *
 * Usage:
 *   npx tsx scripts/diagnose-statement-payment-consistency.mts [--client=쉐이드]
 *   npx tsx scripts/diagnose-statement-payment-consistency.mts [sqlite-path] [--client=...]
 */
import { getDb, getErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";
import {
  deriveSentStatementPaymentStatus,
  listInconsistentConfirmedSentStatements,
} from "../src/utils/bankSentStatementMatch.ts";

const DRY_RUN = true;
const clientArg = process.argv.find((arg) => arg.startsWith("--client="));
const clientFilter = clientArg ? clientArg.slice("--client=".length).trim() : "";
const sqliteArg = process.argv.find((arg) => arg.endsWith(".sqlite"));
process.env.DATABASE_PATH = sqliteArg || "data/erp.sqlite";

getDb();
const { data } = getErpState();
const archives = listSentStatementArchiveMetas().filter((row) => {
  if (!clientFilter) return true;
  return String(row.subjectName || "").includes(clientFilter);
});

const sales = Array.isArray(data.sales) ? data.sales : [];
const clients = Array.isArray(data.clients) ? data.clients : [];
const paymentVouchers = Array.isArray(data.paymentVouchers) ? data.paymentVouchers : [];

const inconsistent = listInconsistentConfirmedSentStatements({
  archives,
  sales,
  clients,
  paymentVouchers,
});

const summary = archives.map((archive) => {
  const linkedVouchers = paymentVouchers.filter(
    (voucher: { linkedPdfArchiveId?: string }) => String(voucher.linkedPdfArchiveId || "") === String(archive.id),
  );
  const effective = deriveSentStatementPaymentStatus({
    archive,
    sales,
    clients,
    paymentVouchers,
  });
  const allocatedSalesIds = [
    ...new Set(
      linkedVouchers
        .map((voucher: { salesId?: string | number }) => String(voucher.salesId || ""))
        .filter(Boolean),
    ),
  ];
  return {
    pdfArchiveId: archive.id,
    client: archive.subjectName,
    storedPaymentStatus: archive.paymentStatus,
    effectivePaymentStatus: effective,
    statementSalesCount: Array.isArray(archive.statementSalesIds) ? archive.statementSalesIds.length : 0,
    allocatedSalesCount: allocatedSalesIds.length,
    voucherCount: linkedVouchers.length,
    statementTotalAmount: archive.statementTotalAmount || 0,
    inconsistent: archive.paymentStatus === "confirmed" && effective !== "confirmed",
  };
});

console.log(
  JSON.stringify(
    {
      dryRun: DRY_RUN,
      customerDataMutation: 0,
      historicalRepairExecuted: 0,
      clientFilter: clientFilter || null,
      archiveCount: archives.length,
      inconsistentConfirmedCount: inconsistent.length,
      inconsistentConfirmed: inconsistent.map((row) => ({
        pdfArchiveId: row.pdfArchiveId,
        client: row.client,
        storedPaymentStatus: row.storedPaymentStatus,
        effectivePaymentStatus: row.effectivePaymentStatus,
        statementSalesCount: row.statementSalesCount,
        allocatedSalesCount: row.allocatedSalesCount,
        statementTotalAmount: row.statementTotalAmount,
      })),
      rows: summary,
    },
    null,
    2,
  ),
);
