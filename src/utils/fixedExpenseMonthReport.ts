import type { BankTransaction } from "./bankTransactions";
import {
  fixedMonthlyAmount,
  formatFixedExpensePaymentDay,
  getFixedExpensePaymentsForMonth,
  getMonthKey,
  isFixedActiveInMonth,
  isFixedExpensePaymentBankLinked,
  isFixedExpensePaymentSettled,
  type FixedExpense,
  type FixedExpensePayment,
} from "./companyLedger";

export function monthIndexFromKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || "").trim());
  if (!match) return null;
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

export function isFixedExpenseDueInMonth(expense: FixedExpense, monthKey: string) {
  if (!isFixedActiveInMonth(expense, monthKey)) return false;
  if (expense.cycle === "monthly") return true;

  const targetIndex = monthIndexFromKey(monthKey);
  if (targetIndex == null) return false;

  const startKey = getMonthKey(expense.startDate || "") || monthKey;
  const startIndex = monthIndexFromKey(startKey);
  if (startIndex == null) return false;

  const diff = targetIndex - startIndex;
  if (diff < 0) return false;
  if (expense.cycle === "quarterly") return diff % 3 === 0;
  if (expense.cycle === "yearly") return diff % 12 === 0;
  return true;
}

function isConfirmedFixedBankTx(tx: BankTransaction, fixedExpenseId: string, monthKey: string) {
  if (tx.ledgerFixedExpenseId !== fixedExpenseId) return false;
  if (getMonthKey(String(tx.transactionAt || "").slice(0, 10)) !== monthKey) return false;
  const status = tx.ledgerStatus;
  if (status === "confirmed") return true;
  if (status === "pending" || status === "exempt") return false;
  return Boolean(tx.linkedFixedExpensePaymentId || tx.ledgerCategoryId || tx.linkedCompanyExpenseId);
}

export type FixedExpenseMonthPaymentRow = {
  fixedExpenseId: string;
  name: string;
  category: string;
  expectedAmount: number;
  paymentDayLabel: string;
  paymentDate?: string;
  payment?: FixedExpensePayment;
  status: "paid" | "unpaid";
  bankLinked: boolean;
};

export type FixedExpenseMonthPaymentReport = {
  monthKey: string;
  expectedTotal: number;
  expectedCount: number;
  unpaidTotal: number;
  unpaidCount: number;
  paidTotal: number;
  paidCount: number;
  rows: FixedExpenseMonthPaymentRow[];
};

export function buildFixedExpenseMonthPaymentReport(input: {
  fixedExpenses: FixedExpense[];
  fixedExpensePayments: FixedExpensePayment[];
  bankTransactions: BankTransaction[];
  monthKey: string;
}): FixedExpenseMonthPaymentReport {
  const monthPayments = getFixedExpensePaymentsForMonth(input.fixedExpensePayments, input.monthKey);
  const dueItems = input.fixedExpenses
    .filter((expense) => isFixedExpenseDueInMonth(expense, input.monthKey))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));

  const rows: FixedExpenseMonthPaymentRow[] = dueItems.map((item) => {
    const payment = monthPayments.find((row) => row.fixedExpenseId === item.id);
    const bankLinkedByPayment = payment
      ? isFixedExpensePaymentBankLinked(payment, input.bankTransactions)
      : false;
    const bankLinkedByTx = input.bankTransactions.some((tx) =>
      isConfirmedFixedBankTx(tx, item.id, input.monthKey),
    );
    const bankLinked = bankLinkedByPayment || bankLinkedByTx;
    const settled = payment
      ? isFixedExpensePaymentSettled(
          payment,
          input.fixedExpensePayments,
          input.bankTransactions,
          input.fixedExpenses,
        )
      : bankLinkedByTx;

    return {
      fixedExpenseId: item.id,
      name: String(item.name || "").trim(),
      category: String(item.category || "").trim(),
      expectedAmount: fixedMonthlyAmount(item),
      paymentDayLabel: formatFixedExpensePaymentDay(item.paymentDayOfMonth),
      paymentDate: payment?.date,
      payment,
      status: settled ? "paid" : "unpaid",
      bankLinked,
    };
  });

  const paidRows = rows.filter((row) => row.status === "paid");
  const unpaidRows = rows.filter((row) => row.status === "unpaid");

  return {
    monthKey: input.monthKey,
    expectedTotal: rows.reduce((sum, row) => sum + row.expectedAmount, 0),
    expectedCount: rows.length,
    unpaidTotal: unpaidRows.reduce((sum, row) => sum + row.expectedAmount, 0),
    unpaidCount: unpaidRows.length,
    paidTotal: paidRows.reduce((sum, row) => sum + row.expectedAmount, 0),
    paidCount: paidRows.length,
    rows,
  };
}
