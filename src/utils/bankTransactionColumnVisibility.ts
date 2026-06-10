export type BankTransactionDisplayColumnKey =
  | "account"
  | "counterparty"
  | "balanceAfter"
  | "transactionType"
  | "memo"
  | "client"
  | "folder";

export type BankTransactionColumnVisibility = Record<BankTransactionDisplayColumnKey, boolean>;

export type BankTransactionColumnPreset = "account_only" | "default";

export const BANK_TRANSACTION_DISPLAY_COLUMN_ORDER: BankTransactionDisplayColumnKey[] = [
  "account",
  "counterparty",
  "transactionType",
  "memo",
  "client",
  "folder",
];

export const DEFAULT_BANK_TRANSACTION_COLUMN_VISIBILITY: BankTransactionColumnVisibility = {
  account: true,
  counterparty: true,
  balanceAfter: false,
  transactionType: false,
  memo: true,
  client: true,
  folder: false,
};

export const ACCOUNT_ONLY_BANK_TRANSACTION_COLUMN_VISIBILITY: BankTransactionColumnVisibility = {
  account: true,
  counterparty: false,
  balanceAfter: false,
  transactionType: false,
  memo: false,
  client: false,
  folder: false,
};

export function buildBankTransactionColumnVisibilityFromPreset(
  preset: BankTransactionColumnPreset,
): BankTransactionColumnVisibility {
  if (preset === "account_only") {
    return { ...ACCOUNT_ONLY_BANK_TRANSACTION_COLUMN_VISIBILITY };
  }
  return { ...DEFAULT_BANK_TRANSACTION_COLUMN_VISIBILITY };
}

const STORAGE_KEY = "erp.bankTransactionColumnVisibility.v1";

export function loadBankTransactionColumnVisibility(): BankTransactionColumnVisibility {
  if (typeof window === "undefined") return { ...DEFAULT_BANK_TRANSACTION_COLUMN_VISIBILITY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BANK_TRANSACTION_COLUMN_VISIBILITY };
    const parsed = JSON.parse(raw) as Partial<BankTransactionColumnVisibility>;
    return {
      ...DEFAULT_BANK_TRANSACTION_COLUMN_VISIBILITY,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_BANK_TRANSACTION_COLUMN_VISIBILITY };
  }
}

export function saveBankTransactionColumnVisibility(value: BankTransactionColumnVisibility) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function isBankTransactionColumnVisible(
  visibility: BankTransactionColumnVisibility,
  key: BankTransactionDisplayColumnKey,
) {
  return visibility[key] !== false;
}
