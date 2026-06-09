import type { BankTransaction } from "./bankTransactions";
import { isBankTxExpenseReversal } from "./bankTxExpenseReversal";
import { getMonthKey } from "./companyLedger";
import {
  resolveBankTxLedgerAmount,
  resolveBankTxLedgerFlow,
  resolveBankTxLedgerStatus,
  type LedgerFlow,
} from "./ledgerSystem";

export type LedgerInboxGroup = {
  key: string;
  label: string;
  transactions: BankTransaction[];
  totalAmount: number;
};

export type LedgerInboxFilter = {
  monthKey?: string;
  flow?: LedgerFlow | "all";
  search?: string;
  allMonths?: boolean;
};

function normalizeGroupLabel(tx: BankTransaction) {
  const counterparty = String(tx.counterpartyName || "").trim();
  if (counterparty) return counterparty;
  const description = String(tx.description || "").trim();
  if (description) return description.length > 24 ? `${description.slice(0, 24)}...` : description;
  return "\uAE30\uD0C0 \uAC70\uB798";
}

export function isLedgerInboxTransaction(tx: BankTransaction) {
  const status = resolveBankTxLedgerStatus(tx);
  if (status !== "none" && status !== "pending") return false;
  if (isBankTxExpenseReversal(tx)) {
    if (Number(tx.deposit || 0) <= 0) return false;
  } else if (resolveBankTxLedgerAmount(tx) <= 0) {
    return false;
  }
  if (tx.linkedSalesId || tx.linkedPaymentVoucherId || tx.linkedWorkerMonthlyPaymentVoucherId) return false;
  return true;
}

export function filterLedgerInboxTransactions(
  bankTransactions: BankTransaction[],
  filter: LedgerInboxFilter = {},
): BankTransaction[] {
  const q = String(filter.search || "")
    .trim()
    .toLowerCase();
  return bankTransactions
    .filter(isLedgerInboxTransaction)
    .filter((tx) => {
      if (!filter.allMonths && filter.monthKey) {
        return getMonthKey(String(tx.transactionAt || "").slice(0, 10)) === filter.monthKey;
      }
      return true;
    })
    .filter((tx) => {
      const flow = resolveBankTxLedgerFlow(tx);
      if (filter.flow && filter.flow !== "all" && flow !== filter.flow) return false;
      return true;
    })
    .filter((tx) => {
      if (!q) return true;
      return [tx.description, tx.counterpartyName, tx.memo]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => String(b.transactionAt).localeCompare(String(a.transactionAt)));
}

export function groupLedgerInboxTransactions(transactions: BankTransaction[]): LedgerInboxGroup[] {
  const groups = new Map<string, BankTransaction[]>();
  for (const tx of transactions) {
    const label = normalizeGroupLabel(tx);
    const key = label.toLowerCase();
    const bucket = groups.get(key) || [];
    bucket.push(tx);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      label: normalizeGroupLabel(rows[0]!),
      transactions: rows,
      totalAmount: rows.reduce((sum, row) => sum + resolveBankTxLedgerAmount(row), 0),
    }))
    .sort((a, b) => b.transactions.length - a.transactions.length || b.totalAmount - a.totalAmount);
}

export const LEDGER_LAST_CATEGORY_KEY = "teammillimeter-ledger-last-category";

export function readLastLedgerCategoryId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LEDGER_LAST_CATEGORY_KEY) || "";
}

export function storeLastLedgerCategoryId(categoryId: string) {
  if (typeof window === "undefined" || !categoryId) return;
  window.localStorage.setItem(LEDGER_LAST_CATEGORY_KEY, categoryId);
}
