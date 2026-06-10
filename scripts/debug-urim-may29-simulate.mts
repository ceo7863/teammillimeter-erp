/**
 * Simulate FIFO vouchers for ?? 5/29 deposit (no DB write).
 * Usage: npx tsx scripts/debug-urim-may29-simulate.mts
 */
import {
  allocatePaymentFifoBySaleDate,
  buildPaidAmountBySaleId,
  createPaymentVouchersFromSentStatementMatch,
  resolveStatementSalesForArchive,
} from "../src/utils/bankSentStatementMatch.ts";
import type { BankTransaction } from "../src/utils/bankTransactions.ts";

const tx = {
  id: "30d5f454-0ea4-4a24-ab99-d81e44f39302",
  deposit: 1_140_040,
  transactionAt: "2026-05-29",
  description: "??",
  counterpartyName: "??",
} satisfies BankTransaction;

const archive = {
  subjectName: "??",
  periodStart: "2026-05-26",
  periodEnd: "2026-05-27",
  statementTotalAmount: 1_140_040,
  statementSalesIds: [3590, 3597],
};

const sales = [
  { id: 3590, date: "2026-05-26", client: "\uC6B0\uB9BC", site: "\uC7A0\uC2E4\uB9AC\uC13C\uCE20", amount: 516_400 },
  { id: 3597, date: "2026-05-27", client: "\uC6B0\uB9BC", site: "\uC11C\uCD08 e\uD3B8\uD55C\uC138\uC0C1", amount: 520_000 },
];

const clients = [{ name: "\uC6B0\uB9BC", vat: "Y" }];

const statementSales = resolveStatementSalesForArchive(archive, sales, clients);
console.log("statementSales", statementSales);

const splits = allocatePaymentFifoBySaleDate(
  statementSales,
  1_140_040,
  true,
  buildPaidAmountBySaleId([]),
);
console.log("FIFO splits", splits);

const candidate = {
  pdfArchiveId: "pdf-1780037547123-bf151613",
  client: "??",
  statementTotalAmount: 1_140_040,
  sentAt: "",
  periodStart: "2026-05-26",
  periodEnd: "2026-05-27",
  score: 100,
  reasons: ["simulate"],
  paymentAmount: 1_140_040,
  paymentStatus: "confirmed" as const,
  statementRemainingAmount: 0,
  statementSalesIds: [3590, 3597],
};

const vouchers = createPaymentVouchersFromSentStatementMatch(tx, candidate, {
  sales,
  clients,
  archive,
  paymentVouchers: [],
});
console.log(
  "vouchers",
  vouchers.map((v) => ({ salesId: v.salesId, site: v.site, finalAmount: v.finalAmount })),
);
