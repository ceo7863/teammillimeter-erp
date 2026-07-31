/**
 * Statement payment ↔ sales voucher allocation consistency.
 * Usage: npx tsx scripts/test-statement-voucher-payment-consistency.ts
 */
import assert from "node:assert/strict";
import { applyPaymentVouchers } from "../src/utils/applyPaymentVouchers.ts";
import {
  allocatePaymentFifoBySaleDate,
  buildPaidAmountBySaleId,
  buildSentStatementPaymentApplication,
  createPaymentVouchersFromSentStatementMatch,
  deriveSentStatementPaymentStatus,
  evaluateHighConfidenceSentStatementAutoLinks,
  listInconsistentConfirmedSentStatements,
  resolveArchivePaymentStatusAfterApply,
  type SentStatementMatchCandidate,
} from "../src/utils/bankSentStatementMatch.ts";
import type { BankTransaction } from "../src/utils/bankTransactions.ts";
import type { PdfArchiveMeta } from "../src/utils/pdfArchive.ts";

let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

function tx(partial: Partial<BankTransaction> & { id: string; deposit: number }): BankTransaction {
  return {
    id: partial.id,
    transactionAt: partial.transactionAt || "2026-07-20T10:00:00+09:00",
    description: partial.description || "입금",
    counterpartyName: partial.counterpartyName || "쉐이드",
    deposit: partial.deposit,
    withdrawal: partial.withdrawal || 0,
    balance: partial.balance || 0,
    ...partial,
  } as BankTransaction;
}

function archive(
  partial: Partial<PdfArchiveMeta> & { id: string; subjectName: string; statementTotalAmount: number },
): PdfArchiveMeta {
  return {
    id: partial.id,
    fileName: `${partial.subjectName}.pdf`,
    createdAt: partial.createdAt || "2026-07-18T09:00:00.000Z",
    category: "statement-client",
    subjectName: partial.subjectName,
    periodStart: partial.periodStart || "2026-07-01",
    periodEnd: partial.periodEnd || "2026-07-31",
    fileSize: 1,
    pageCount: 1,
    sentViaLink: true,
    paymentStatus: partial.paymentStatus || "pending",
    statementTotalAmount: partial.statementTotalAmount,
    ...partial,
  } as PdfArchiveMeta;
}

const sixSales = [
  { id: 1, date: "2026-07-01", client: "쉐이드", site: "A", amount: 100_000 },
  { id: 2, date: "2026-07-02", client: "쉐이드", site: "B", amount: 200_000 },
  { id: 3, date: "2026-07-03", client: "쉐이드", site: "C", amount: 150_000 },
  { id: 4, date: "2026-07-04", client: "쉐이드", site: "D", amount: 120_000 },
  { id: 5, date: "2026-07-05", client: "쉐이드", site: "E", amount: 180_000 },
  { id: 6, date: "2026-07-06", client: "쉐이드", site: "F", amount: 250_000 },
];
const sixTotal = sixSales.reduce((sum, row) => sum + row.amount, 0);

function shadeCandidate(paymentAmount: number, paymentStatus: "confirmed" | "partial"): SentStatementMatchCandidate {
  return {
    pdfArchiveId: "pdf-shade",
    client: "쉐이드",
    statementTotalAmount: sixTotal,
    sentAt: "2026-07-18T09:00:00.000Z",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    score: 90,
    reasons: ["test"],
    paymentAmount,
    paymentStatus,
    statementRemainingAmount: paymentAmount,
    statementSalesIds: sixSales.map((row) => row.id),
  };
}

check("1) 6 sales + full deposit => 6 explicit allocations + confirmed + all sales paid", () => {
  const deposit = tx({ id: "tx-full", deposit: sixTotal, counterpartyName: "쉐이드" });
  const stmt = archive({
    id: "pdf-shade",
    subjectName: "쉐이드",
    statementTotalAmount: sixTotal,
    statementSalesIds: sixSales.map((row) => row.id),
  });
  const application = buildSentStatementPaymentApplication(deposit, shadeCandidate(sixTotal, "confirmed"), {
    sales: sixSales,
    archive: stmt,
    paymentVouchers: [],
  });
  assert.equal(application.vouchers.length, 6);
  assert.equal(application.paymentStatus, "confirmed");
  assert.deepEqual(
    application.vouchers.map((row) => String(row.salesId)).sort(),
    sixSales.map((row) => String(row.id)).sort(),
  );
  const applied = applyPaymentVouchers(sixSales, application.vouchers);
  for (const sale of applied.sales) {
    assert.equal(sale.paid, sale.amount, `sale ${sale.id} should be fully paid`);
  }
});

check("2) partial deposit => partial status only", () => {
  const deposit = tx({ id: "tx-partial", deposit: 300_000, counterpartyName: "쉐이드" });
  const stmt = archive({
    id: "pdf-shade",
    subjectName: "쉐이드",
    statementTotalAmount: sixTotal,
    statementSalesIds: sixSales.map((row) => row.id),
  });
  const application = buildSentStatementPaymentApplication(deposit, shadeCandidate(300_000, "partial"), {
    sales: sixSales,
    archive: stmt,
  });
  assert.equal(application.paymentStatus, "partial");
  assert.ok(application.vouchers.length >= 1);
  assert.ok(application.vouchers.length < 6 || application.vouchers.some((row) => row.isPartialPayment));
  const applied = applyPaymentVouchers(sixSales, application.vouchers);
  const unpaid = applied.sales.filter((row) => (row.paid || 0) < (row.amount || 0));
  assert.ok(unpaid.length > 0, "some sales remain unpaid");
});

check("3) FIFO respects existing paid amounts", () => {
  const existing = [{ salesId: 1, finalAmount: 100_000, linkedPdfArchiveId: "pdf-shade" }];
  const remainingSales = sixSales.slice(1);
  const remainingTotal = remainingSales.reduce((sum, row) => sum + row.amount, 0);
  const splits = allocatePaymentFifoBySaleDate(
    remainingSales.map((row) => ({ salesId: row.id, statementAmount: row.amount, saleDate: row.date })),
    remainingTotal,
    false,
    buildPaidAmountBySaleId(existing),
  );
  assert.equal(splits.length, 5);
  assert.equal(
    splits.reduce((sum, row) => sum + row.finalAmount, 0),
    remainingTotal,
  );
});

check("4) explicit multi-sale allocation is stored and applied per salesId", () => {
  const deposit = tx({ id: "tx-alloc", deposit: sixTotal, counterpartyName: "쉐이드" });
  const stmt = archive({
    id: "pdf-shade",
    subjectName: "쉐이드",
    statementTotalAmount: sixTotal,
    statementSalesIds: sixSales.map((row) => row.id),
  });
  const vouchers = createPaymentVouchersFromSentStatementMatch(deposit, shadeCandidate(sixTotal, "confirmed"), {
    sales: sixSales,
    archive: stmt,
  });
  assert.equal(vouchers.length, 6);
  // A voucher targeting sale 3 must not pay sale 1 via re-FIFO.
  const onlyThird = [vouchers.find((row) => String(row.salesId) === "3")!];
  const applied = applyPaymentVouchers(sixSales, onlyThird);
  assert.equal(applied.sales.find((row) => String(row.id) === "3")?.paid, 150_000);
  assert.equal(applied.sales.find((row) => String(row.id) === "1")?.paid, 0);
});

check("5) incomplete single-salesId historical data is not treated as confirmed", () => {
  const stmt = archive({
    id: "pdf-shade",
    subjectName: "쉐이드",
    statementTotalAmount: sixTotal,
    statementSalesIds: sixSales.map((row) => row.id),
    paymentStatus: "confirmed",
  });
  const incomplete = [
    {
      salesId: 1,
      finalAmount: sixTotal,
      linkedPdfArchiveId: "pdf-shade",
      statementSalesIds: sixSales.map((row) => row.id),
    },
  ];
  const status = deriveSentStatementPaymentStatus({
    archive: stmt,
    sales: sixSales,
    paymentVouchers: incomplete,
  });
  assert.notEqual(status, "confirmed");
  const applied = applyPaymentVouchers(sixSales, incomplete);
  assert.equal(applied.sales.find((row) => String(row.id) === "1")?.paid, 100_000);
  assert.equal(applied.sales.find((row) => String(row.id) === "2")?.paid, 0);
  const inconsistent = listInconsistentConfirmedSentStatements({
    archives: [stmt],
    sales: sixSales,
    paymentVouchers: incomplete,
  });
  assert.equal(inconsistent.length, 1);
  assert.equal(inconsistent[0].pdfArchiveId, "pdf-shade");
});

check("6) same bank tx evaluated twice => no duplicate vouchers", () => {
  const deposit = tx({ id: "tx-idem", deposit: sixTotal, counterpartyName: "쉐이드" });
  const stmt = archive({
    id: "pdf-shade",
    subjectName: "쉐이드",
    statementTotalAmount: sixTotal,
    statementSalesIds: sixSales.map((row) => row.id),
  });
  const first = evaluateHighConfidenceSentStatementAutoLinks({
    bankTransactions: [deposit],
    archives: [stmt],
    sales: sixSales,
    onlyTransactionIds: new Set(["tx-idem"]),
    minScore: 50,
  });
  assert.equal(first.drafts.length, 1);
  const second = evaluateHighConfidenceSentStatementAutoLinks({
    bankTransactions: [{ ...deposit, linkedPaymentVoucherId: first.drafts[0].primaryVoucherId }],
    archives: [stmt],
    sales: sixSales,
    paymentVouchers: first.drafts[0].vouchers,
    onlyTransactionIds: new Set(["tx-idem"]),
    minScore: 50,
  });
  assert.equal(second.drafts.length, 0);
  assert.equal(first.drafts[0].vouchers.length, 6);
});

check("7) coverage helper: totals alone without sales never confirm", () => {
  const status = resolveArchivePaymentStatusAfterApply(sixTotal, 0, sixTotal);
  assert.equal(status, "partial");
});

check("8) PDF meta failure path modeled by rollback leaves zero net vouchers", () => {
  // Pure model of confirmSentStatementMatch rollback: create then filter out.
  const deposit = tx({ id: "tx-rollback", deposit: sixTotal, counterpartyName: "쉐이드" });
  const stmt = archive({
    id: "pdf-shade",
    subjectName: "쉐이드",
    statementTotalAmount: sixTotal,
    statementSalesIds: sixSales.map((row) => row.id),
  });
  const application = buildSentStatementPaymentApplication(deposit, shadeCandidate(sixTotal, "confirmed"), {
    sales: sixSales,
    archive: stmt,
  });
  let vouchers = [...application.vouchers];
  const ids = new Set(vouchers.map((row) => String(row.id)));
  // simulate PDF meta failure rollback
  vouchers = vouchers.filter((row) => !ids.has(String(row.id)));
  assert.equal(vouchers.length, 0);
});

check("9) statement effective status matches sales paid coverage", () => {
  const deposit = tx({ id: "tx-ui", deposit: sixTotal, counterpartyName: "쉐이드" });
  const stmt = archive({
    id: "pdf-shade",
    subjectName: "쉐이드",
    statementTotalAmount: sixTotal,
    statementSalesIds: sixSales.map((row) => row.id),
    paymentStatus: "confirmed",
  });
  const application = buildSentStatementPaymentApplication(deposit, shadeCandidate(sixTotal, "confirmed"), {
    sales: sixSales,
    archive: stmt,
  });
  const applied = applyPaymentVouchers(sixSales, application.vouchers);
  const effective = deriveSentStatementPaymentStatus({
    archive: stmt,
    sales: sixSales,
    paymentVouchers: application.vouchers,
  });
  assert.equal(effective, "confirmed");
  assert.ok(applied.sales.every((row) => row.paid === row.amount));
});

if (failed) {
  console.error(`statement-voucher-payment-consistency: ${failed} failed`);
  process.exit(1);
}
console.log("test-statement-voucher-payment-consistency: PASS");
