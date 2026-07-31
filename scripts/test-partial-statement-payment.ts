import {
  allocatePaymentFifoBySaleDate,
  buildPaidAmountBySaleId,
  resolveArchivePaymentStatusAfterApply,
  resolveStatementPaymentAmount,
} from "../src/utils/bankSentStatementMatch.ts";

const sales = [
  { salesId: 1, statementAmount: 1_000_000, saleDate: "2026-05-10" },
  { salesId: 2, statementAmount: 1_500_000, saleDate: "2026-05-20" },
  { salesId: 3, statementAmount: 900_000, saleDate: "2026-05-25" },
];

const deposit = 3_118_500;
const statementTotal = 3_850_000;
const hasVat = false;

const amountMatch = resolveStatementPaymentAmount(deposit, statementTotal, 0);
console.assert(amountMatch?.paymentStatus === "partial", "partial deposit should match");
console.assert(amountMatch?.paymentAmount === deposit, "payment amount should equal deposit");

const splits = allocatePaymentFifoBySaleDate(sales, deposit, hasVat, buildPaidAmountBySaleId([]));
console.log("FIFO splits", splits);
console.assert(splits.length === 3, "should create three vouchers");
console.assert(splits[0].finalAmount === 1_000_000 && !splits[0].isPartialPayment, "first sale fully paid");
console.assert(splits[1].finalAmount === 1_500_000 && !splits[1].isPartialPayment, "second sale fully paid");
console.assert(splits[2].finalAmount === 618_500 && splits[2].isPartialPayment, "third sale partially paid");
console.assert(
  splits.reduce((sum, row) => sum + row.finalAmount, 0) === deposit,
  "allocated total should equal deposit",
);

const status = resolveArchivePaymentStatusAfterApply(statementTotal, 0, deposit, {
  statementSales: sales,
  hasVat,
  paidBySaleIdBefore: buildPaidAmountBySaleId([]),
  newVouchers: splits.map((row) => ({ salesId: row.salesId, finalAmount: row.finalAmount })),
});
console.assert(status === "partial", "archive should stay partial");

console.log("partial statement payment tests passed");
