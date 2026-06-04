import type { BankTransaction } from "./bankTransactions";
import { isNetGroupSuppressed } from "./bankPreauthNetting";
import { findWorkerForBankTransaction, type WorkerDepositMatchSource } from "./clientDepositAliases";
import {
  compareWorkerFolderRows,
  findWorkerMasterByListName,
  isWorkerActive,
  resolveWorkerCategoryFromList,
  resolveWorkerListName,
  WORKER_CATEGORY_TEAM,
  normalizeWorkerName,
  type WorkerCategory,
  type WorkerMasterLike,
} from "./workerPayments";
import {
  isWorkerBankTransactionFolder,
  type BankTransactionFolder,
} from "./bankTransactionFolders";

export type WorkerPayoutMethod = "cash" | "corporate" | "personal";

export const WORKER_PAYOUT_METHOD_LABELS: Record<WorkerPayoutMethod, string> = {
  cash: "\uD604\uAE08",
  corporate: "\uBC95\uC778",
  personal: "\uAC1C\uC778",
};

export type WorkerPayoutVoucher = {
  id: string;
  workerName: string;
  date: string;
  amount: number;
  method: WorkerPayoutMethod;
  memo?: string;
  createdAt: string;
  createdBy?: string;
};

export type WorkerPayoutLedgerEntry =
  | { kind: "bank"; id: string; date: string; amount: number; bankTransaction: BankTransaction }
  | { kind: "voucher"; id: string; date: string; amount: number; voucher: WorkerPayoutVoucher };

export type WorkerPayoutFolder = {
  workerName: string;
  entries: WorkerPayoutLedgerEntry[];
  bankTotal: number;
  voucherTotal: number;
  total: number;
  category?: WorkerCategory;
  isActive?: boolean;
};

export function makeWorkerPayoutVoucherId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `worker-payout-${crypto.randomUUID()}`;
  return `worker-payout-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeWorkerPayoutMethod(value: unknown): WorkerPayoutMethod {
  if (value === "corporate" || value === "personal") return value;
  return "cash";
}

export function normalizeWorkerPayoutVoucher(raw: unknown): WorkerPayoutVoucher | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<WorkerPayoutVoucher>;
  const workerName = String(row.workerName || "").trim();
  const date = String(row.date || "").slice(0, 10);
  const amount = Math.round(Number(row.amount) || 0);
  if (!workerName || !date || amount <= 0) return null;
  return {
    id: String(row.id || makeWorkerPayoutVoucherId()),
    workerName,
    date,
    amount,
    method: normalizeWorkerPayoutMethod(row.method),
    memo: row.memo ? String(row.memo) : undefined,
    createdAt: String(row.createdAt || new Date().toISOString()),
    createdBy: row.createdBy ? String(row.createdBy) : undefined,
  };
}

export function normalizeWorkerPayoutVouchers(rows: unknown): WorkerPayoutVoucher[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeWorkerPayoutVoucher).filter((row): row is WorkerPayoutVoucher => Boolean(row));
}

function isInPayoutDateRange(dateIso: string, startDate?: string, endDate?: string) {
  const date = String(dateIso || "").slice(0, 10);
  if (!date) return false;
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

export function resolveWorkerNameFromBankTransaction(
  tx: BankTransaction,
  folders: BankTransactionFolder[],
  workers: WorkerDepositMatchSource[],
): string | null {
  const amount = Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
  if (amount <= 0 || isNetGroupSuppressed(tx)) return null;

  const matched = findWorkerForBankTransaction(tx, workers);
  const inWorkerFolder = Boolean(tx.folderId && isWorkerBankTransactionFolder(folders, tx.folderId));
  const linkedSubject = String(tx.linkedSubject || "").trim();

  if (linkedSubject && (inWorkerFolder || matched)) return linkedSubject;

  if (inWorkerFolder) {
    if (matched?.name) return String(matched.name).trim();
    const folder = folders.find((row) => row.id === tx.folderId);
    if (folder && !folder.isDefault) return String(folder.folderName).trim();
  }

  if (matched?.name) return String(matched.name).trim();
  return null;
}

function buildWorkerPayoutFolder(
  workerName: string,
  entries: WorkerPayoutLedgerEntry[],
  workersMaster: WorkerMasterLike[],
  master?: WorkerMasterLike,
): WorkerPayoutFolder {
  const sorted = [...entries].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.id.localeCompare(a.id);
  });
  const bankTotal = sorted.filter((row) => row.kind === "bank").reduce((sum, row) => sum + row.amount, 0);
  const voucherTotal = sorted.filter((row) => row.kind === "voucher").reduce((sum, row) => sum + row.amount, 0);
  return {
    workerName,
    entries: sorted,
    bankTotal,
    voucherTotal,
    total: bankTotal + voucherTotal,
    category: resolveWorkerCategoryFromList(workersMaster, workerName, master),
    isActive: master?.isActive !== false,
  };
}

export function buildWorkerPayoutFolders(
  bankTransactions: BankTransaction[],
  bankTransactionFolders: BankTransactionFolder[],
  workers: WorkerDepositMatchSource[],
  vouchers: WorkerPayoutVoucher[],
  dateFilter: { startDate?: string; endDate?: string } = {},
  workersMaster: WorkerMasterLike[] = [],
): WorkerPayoutFolder[] {
  const map = new Map<string, WorkerPayoutLedgerEntry[]>();

  const pushEntry = (workerName: string, entry: WorkerPayoutLedgerEntry) => {
    const key = resolveWorkerListName(workersMaster, workerName);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  };

  for (const tx of bankTransactions) {
    const workerName = resolveWorkerNameFromBankTransaction(tx, bankTransactionFolders, workers);
    if (!workerName) continue;
    const date = String(tx.transactionAt || "").slice(0, 10);
    if (!isInPayoutDateRange(date, dateFilter.startDate, dateFilter.endDate)) continue;
    pushEntry(workerName, {
      kind: "bank",
      id: tx.id,
      date,
      amount: Math.round(Number(tx.withdrawal) || 0),
      bankTransaction: tx,
    });
  }

  for (const voucher of vouchers) {
    if (!isInPayoutDateRange(voucher.date, dateFilter.startDate, dateFilter.endDate)) continue;
    pushEntry(voucher.workerName, {
      kind: "voucher",
      id: voucher.id,
      date: voucher.date,
      amount: voucher.amount,
      voucher,
    });
  }

  const folders: WorkerPayoutFolder[] = [];
  const seen = new Set<string>();

  for (const worker of workersMaster) {
    if (!isWorkerActive(worker)) continue;
    const workerName = normalizeWorkerName(worker.name);
    if (!workerName || seen.has(workerName)) continue;
    seen.add(workerName);
    folders.push(buildWorkerPayoutFolder(workerName, map.get(workerName) || [], workersMaster, worker));
  }

  for (const [workerName, entries] of map) {
    if (seen.has(workerName)) continue;
    const master = findWorkerMasterByListName(workersMaster, workerName);
    if (master && !isWorkerActive(master)) continue;
    folders.push(buildWorkerPayoutFolder(workerName, entries, workersMaster, master));
    seen.add(workerName);
  }

  folders.sort((a, b) =>
    compareWorkerFolderRows(
      {
        category: a.category || WORKER_CATEGORY_TEAM,
        isActive: a.isActive,
        workerName: a.workerName,
      },
      {
        category: b.category || WORKER_CATEGORY_TEAM,
        isActive: b.isActive,
        workerName: b.workerName,
      },
    ),
  );
  return folders;
}

export function summarizeWorkerPayoutFolders(folders: WorkerPayoutFolder[]) {
  let bankCount = 0;
  let voucherCount = 0;
  let paidWorkerCount = 0;
  for (const folder of folders) {
    if (folder.total > 0) paidWorkerCount += 1;
    for (const entry of folder.entries) {
      if (entry.kind === "bank") bankCount += 1;
      else voucherCount += 1;
    }
  }
  return {
    workerCount: folders.length,
    paidWorkerCount,
    bankCount,
    voucherCount,
    total: folders.reduce((sum, folder) => sum + folder.total, 0),
  };
}
