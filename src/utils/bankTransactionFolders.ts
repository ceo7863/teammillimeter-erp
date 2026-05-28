import type { BankTransaction } from "./bankTransactions";
import { isBankTransactionLinkedToCompanyLedger } from "./bankCompanyLedger";
import type { CompanyExpense, FixedExpensePayment } from "./companyLedger";
import {
  canClassifyBankTransactionAsWorkerFolder,
  findClientByDepositSubject,
  findWorkerByDepositSubject,
  findWorkerByMasterName,
  resolveBankDepositMatchSubject,
  resolveBankWorkerFolderMatchSubject,
  type ClientDepositMatchSource,
  type WorkerDepositMatchSource,
} from "./clientDepositAliases";

export type BankTransactionFolderType = "client" | "worker" | "card" | "custom";

export type BankTransactionFolder = {
  id: string;
  folderName: string;
  folderType: BankTransactionFolderType;
  parentId?: string;
  isGroup?: boolean;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BankTransactionFolderTreeNode = {
  folder: BankTransactionFolder;
  depth: number;
  children: BankTransactionFolderTreeNode[];
};

export const DEFAULT_CLIENT_FOLDER_ID = "bank-folder-client-default";
export const DEFAULT_WORKER_FOLDER_ID = "bank-folder-worker-default";
export const DEFAULT_CARD_SALES_FOLDER_ID = "bank-folder-card-default";
export const DEFAULT_LEDGER_CATEGORY_FOLDER_ID = "bank-folder-ledger-default";
export const DEFAULT_BANK_TRANSACTION_FOLDER_IDS = new Set([
  DEFAULT_CLIENT_FOLDER_ID,
  DEFAULT_WORKER_FOLDER_ID,
  DEFAULT_CARD_SALES_FOLDER_ID,
  DEFAULT_LEDGER_CATEGORY_FOLDER_ID,
]);
export const UNFILED_FOLDER_KEY = "__unfiled__";

export function isDefaultBankTransactionFolderId(folderId?: string) {
  return Boolean(folderId && DEFAULT_BANK_TRANSACTION_FOLDER_IDS.has(folderId));
}

/** 기본 분류 폴더를 상위로 지정한 경우 최상위(동일 루트)로 취급 */
export function sanitizeBankTransactionFolderParentId(parentId?: string) {
  const trimmed = String(parentId || "").trim();
  if (!trimmed || isDefaultBankTransactionFolderId(trimmed)) return undefined;
  return trimmed;
}

export function makeBankTransactionFolderId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `bank-folder-${crypto.randomUUID()}`;
  return `bank-folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeBankTransactionFolder(raw: unknown): BankTransactionFolder | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<BankTransactionFolder>;
  if (!row.id || !row.folderName) return null;
  const folderType: BankTransactionFolderType =
    row.folderType === "worker"
      ? "worker"
      : row.folderType === "card"
        ? "card"
        : row.folderType === "custom"
          ? "custom"
          : "client";
  return {
    id: String(row.id),
    folderName: String(row.folderName),
    folderType,
    parentId: row.parentId ? String(row.parentId) : undefined,
    isGroup: Boolean(row.isGroup),
    isDefault: Boolean(row.isDefault),
    createdAt: String(row.createdAt || new Date().toISOString()),
    updatedAt: String(row.updatedAt || new Date().toISOString()),
  };
}

export function normalizeBankTransactionFolders(rows: unknown): BankTransactionFolder[] {
  const parsed = Array.isArray(rows)
    ? rows.map(normalizeBankTransactionFolder).filter((row): row is BankTransactionFolder => Boolean(row))
    : [];
  return finalizeBankTransactionFolders(parsed);
}

/** 기본 분류 폴더(거래처 입금 등) 직속 자식 → 해당 구분 최상위(동일 루트)로 올림 */
export function normalizeFolderHierarchy(folders: BankTransactionFolder[]) {
  return folders.map((folder) => {
    if (folder.isDefault || !folder.parentId || !isDefaultBankTransactionFolderId(folder.parentId)) {
      return folder;
    }
    return { ...folder, parentId: undefined };
  });
}

function finalizeBankTransactionFolders(folders: BankTransactionFolder[]) {
  return normalizeFolderHierarchy(ensureDefaultBankTransactionFolders(folders));
}

export function ensureDefaultBankTransactionFolders(folders: BankTransactionFolder[]) {
  const now = new Date().toISOString();
  const next = [...folders];
  const hasClient = next.some((folder) => folder.id === DEFAULT_CLIENT_FOLDER_ID);
  const hasWorker = next.some((folder) => folder.id === DEFAULT_WORKER_FOLDER_ID);
  const hasCard = next.some((folder) => folder.id === DEFAULT_CARD_SALES_FOLDER_ID);
  const hasLedger = next.some((folder) => folder.id === DEFAULT_LEDGER_CATEGORY_FOLDER_ID);

  if (!hasClient) {
    next.unshift({
      id: DEFAULT_CLIENT_FOLDER_ID,
      folderName: "\uAC70\uB798\uCC98 \uC785\uAE08",
      folderType: "client",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!hasCard) {
    next.unshift({
      id: DEFAULT_CARD_SALES_FOLDER_ID,
      folderName: "\uCE74\uB4DC\uB9E4\uCD9C",
      folderType: "card",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!hasWorker) {
    next.unshift({
      id: DEFAULT_WORKER_FOLDER_ID,
      folderName: "\uC2DC\uACF5\uC790 \uC9C0\uCD9C",
      folderType: "worker",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!hasLedger) {
    next.unshift({
      id: DEFAULT_LEDGER_CATEGORY_FOLDER_ID,
      folderName: "\uAC00\uACC4\uBD80",
      folderType: "custom",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  return next.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    const typeOrder = { client: 0, card: 1, worker: 2, custom: 3 } as const;
    if (a.folderType !== b.folderType) return typeOrder[a.folderType] - typeOrder[b.folderType];
    return a.folderName.localeCompare(b.folderName, "ko");
  });
}

export function getBankTransactionFolderLabel(type: BankTransactionFolderType) {
  if (type === "client") return "\uAC70\uB798\uCC98 \uC785\uAE08";
  if (type === "card") return "\uCE74\uB4DC\uB9E4\uCD9C";
  if (type === "custom") return "\uC0AC\uC6A9\uC790 \uAD6C\uBD84";
  return "\uC2DC\uACF5\uC790 \uC9C0\uCD9C";
}

export function getBankTransactionFolderTone(type: BankTransactionFolderType) {
  if (type === "client") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (type === "card") return "border-violet-200 bg-violet-50 text-violet-800";
  if (type === "custom") return "border-slate-200 bg-slate-50 text-slate-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function listCustomCategoryRoots(folders: BankTransactionFolder[]) {
  return folders
    .filter((folder) => folder.folderType === "custom" && !folder.parentId)
    .sort((left, right) => {
      if (left.isDefault && !right.isDefault) return -1;
      if (!left.isDefault && right.isDefault) return 1;
      return left.folderName.localeCompare(right.folderName, "ko");
    });
}

export function flattenCustomCategoryFolderTree(folders: BankTransactionFolder[], rootId: string) {
  const root = folders.find((folder) => folder.id === rootId);
  if (!root) return [] as Array<{ folder: BankTransactionFolder; depth: number }>;

  const rows: Array<{ folder: BankTransactionFolder; depth: number }> = [{ folder: root, depth: 0 }];
  const walk = (parentId: string, depth: number) => {
    const children = folders
      .filter((folder) => folder.parentId === parentId && folder.folderType === "custom")
      .sort(sortFolderSiblings);
    for (const child of children) {
      rows.push({ folder: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(rootId, 1);
  return rows;
}

export function collectCustomCategoryFolderIds(folders: BankTransactionFolder[], rootId: string) {
  return collectDescendantFolderIds(folders, rootId);
}

const CARD_DEPOSIT_KEYWORDS = [
  "\uCE74\uB4DC",
  "\uAC00\uB9F9",
  "\uCE74\uB4DC\uB9E4\uCD9C",
  "\uCE74\uB4DC\uAC00\uB9F9",
  "\uB86F\uB370\uCE74\uB4DC",
  "\uC0BC\uC131\uCE74\uB4DC",
  "\uC2E0\uD55C\uCE74\uB4DC",
  "\uD604\uB300\uCE74\uB4DC",
  "BC\uCE74\uB4DC",
  "KB\uCE74\uB4DC",
  "NH",
  "SHC",
  "BC",
  "KB",
  "\uB86F\uB370",
  "\uC0BC\uC131",
  "\uC2E0\uD55C",
  "\uD604\uB300",
  "\uC6B0\uB9AC\uCE74\uB4DC",
  "\uD558\uEB098\uCE74\uB4DC",
  "SC\uCE74\uB4DC",
  "\uCE74\uB4DC\uBC14\uB514",
  "VISA",
  "MASTER",
];

export function isCardCompanyDeposit(tx: BankTransaction) {
  if (tx.deposit <= 0) return false;
  const subject = [tx.counterpartyName, tx.description, tx.memo].filter(Boolean).join(" ");
  return looksLikeCardDeposit(subject);
}

function looksLikeCardDeposit(subject: string) {
  const text = String(subject || "");
  if (CARD_DEPOSIT_KEYWORDS.some((keyword) => text.includes(keyword))) return true;
  if (/\uCE74\uB4DC[\uFF08(]?[\uC8FC\uC810\d]/u.test(text)) return true;
  if (/NH\d{4,}/i.test(text)) return true;
  if (/SHC\d+/i.test(text)) return true;
  return false;
}

export function suggestBankTransactionClassification(
  tx: BankTransaction,
  clients: ClientDepositMatchSource[],
  workers: WorkerDepositMatchSource[]
): { folderType: BankTransactionFolderType; linkedSubject?: string } | null {
  const subject = resolveBankDepositMatchSubject(tx);
  if (!subject) return null;

  if (tx.deposit > 0) {
    if (looksLikeCardDeposit(subject)) {
      return { folderType: "card", linkedSubject: subject || undefined };
    }
    const client = findClientByDepositSubject(clients, subject);
    if (client?.name) return { folderType: "client", linkedSubject: String(client.name).trim() };
  }

  if (tx.withdrawal > 0) {
    const workerSubject = resolveBankWorkerFolderMatchSubject(tx);
    const worker =
      findWorkerByMasterName(workers, workerSubject) ||
      findWorkerByDepositSubject(workers, workerSubject) ||
      (String(tx.memo || "").trim() ? findWorkerByDepositSubject(workers, String(tx.memo || "").trim()) : undefined);
    if (worker?.name) return { folderType: "worker", linkedSubject: String(worker.name).trim() };
  }

  return null;
}

export function buildFolderClassificationSuggestionMap(
  transactions: BankTransaction[],
  clients: ClientDepositMatchSource[],
  workers: WorkerDepositMatchSource[],
) {
  const map = new Map<string, { folderType: BankTransactionFolderType; linkedSubject?: string }>();
  for (const tx of transactions) {
    if (tx.folderId) continue;
    const suggestion = suggestBankTransactionClassification(tx, clients, workers);
    if (suggestion) map.set(tx.id, suggestion);
  }
  return map;
}

export function isWorkerBankTransactionFolder(folders: BankTransactionFolder[], folderId: string) {
  const folder = folders.find((row) => row.id === folderId);
  return folder?.folderType === "worker";
}

export function canAssignBankTransactionToFolder(
  tx: BankTransaction,
  folderId: string,
  folders: BankTransactionFolder[],
  workers: WorkerDepositMatchSource[] = [],
) {
  if (!folderId) return true;
  if (!isWorkerBankTransactionFolder(folders, folderId)) return true;
  return canClassifyBankTransactionAsWorkerFolder(tx, workers);
}

export function sanitizeWorkerFolderAssignments(
  transactions: BankTransaction[],
  folders: BankTransactionFolder[],
  workers: WorkerDepositMatchSource[],
) {
  const workerFolderIds = new Set(folders.filter((folder) => folder.folderType === "worker").map((folder) => folder.id));
  let updated = 0;
  const next = transactions.map((row) => {
    if (!row.folderId || !workerFolderIds.has(row.folderId)) return row;
    if (canClassifyBankTransactionAsWorkerFolder(row, workers)) return row;
    updated += 1;
    return { ...row, folderId: undefined, linkedSubject: undefined, classifiedAt: undefined };
  });
  return { next, updated };
}

export function resolveDefaultFolderId(type: BankTransactionFolderType) {
  if (type === "worker") return DEFAULT_WORKER_FOLDER_ID;
  if (type === "card") return DEFAULT_CARD_SALES_FOLDER_ID;
  return DEFAULT_CLIENT_FOLDER_ID;
}

export type BankTransactionFolderStats = {
  count: number;
  deposits: number;
  withdrawals: number;
};

export function collectDescendantFolderIds(folders: BankTransactionFolder[], folderId: string) {
  const ids = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return Array.from(ids);
}

export function getBankTransactionFolderPath(folders: BankTransactionFolder[], folderId: string) {
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = folders.find((folder) => folder.id === folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.folderName);
    current = current.parentId ? folders.find((folder) => folder.id === current?.parentId) : undefined;
  }
  return parts.join(" / ");
}

function sortFolderSiblings(left: BankTransactionFolder, right: BankTransactionFolder) {
  if (left.isDefault && !right.isDefault) return -1;
  if (!left.isDefault && right.isDefault) return 1;
  if (left.isGroup && !right.isGroup) return -1;
  if (!left.isGroup && right.isGroup) return 1;
  return left.folderName.localeCompare(right.folderName, "ko");
}

export function buildBankTransactionFolderTree(
  folders: BankTransactionFolder[],
  folderType: BankTransactionFolderType,
): BankTransactionFolderTreeNode[] {
  const typed = folders.filter((folder) => folder.folderType === folderType);
  const byParent = new Map<string | undefined, BankTransactionFolder[]>();

  for (const folder of typed) {
    const key = folder.parentId || undefined;
    const bucket = byParent.get(key) || [];
    bucket.push(folder);
    byParent.set(key, bucket);
  }

  for (const bucket of byParent.values()) {
    bucket.sort(sortFolderSiblings);
  }

  const buildNodes = (parentId: string | undefined, depth: number): BankTransactionFolderTreeNode[] =>
    (byParent.get(parentId) || []).map((folder) => ({
      folder,
      depth,
      children: buildNodes(folder.id, depth + 1),
    }));

  return buildNodes(undefined, 0);
}

export function flattenBankTransactionFolderTree(nodes: BankTransactionFolderTreeNode[]) {
  const rows: Array<{ folder: BankTransactionFolder; depth: number }> = [];
  const walk = (items: BankTransactionFolderTreeNode[]) => {
    for (const node of items) {
      rows.push({ folder: node.folder, depth: node.depth });
      walk(node.children);
    }
  };
  walk(nodes);
  return rows;
}

export function listAssignableFolders(folders: BankTransactionFolder[], folderType?: BankTransactionFolderType) {
  return folders.filter((folder) => !folderType || folder.folderType === folderType);
}

export function listFolderParentOptions(folders: BankTransactionFolder[], folderType: BankTransactionFolderType) {
  return folders.filter((folder) => folder.folderType === folderType && !folder.isDefault);
}

function validateFolderParent(
  folders: BankTransactionFolder[],
  folderType: BankTransactionFolderType,
  parentId?: string,
  folderId?: string,
) {
  if (!parentId) return "";
  const parent = folders.find((folder) => folder.id === parentId);
  if (!parent) return "\uC0C1\uC704 \uD3F4\uB354\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
  if (parent.folderType !== folderType) return "\uC0C1\uC704 \uD3F4\uB354\uB294 \uAC19\uC740 \uAD6C\uBD84\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.";
  if (folderId) {
    const descendants = new Set(collectDescendantFolderIds(folders, folderId));
    if (descendants.includes(parentId)) return "\uD558\uC704 \uD3F4\uB354\uB97C \uC0C1\uC704 \uD3F4\uB354\uB85C \uC124\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
  }
  return "";
}

export function buildBankTransactionFolderStats(
  transactions: BankTransaction[],
  folderId: string,
  folders: BankTransactionFolder[] = [],
): BankTransactionFolderStats {
  const folderIds =
    folderId !== UNFILED_FOLDER_KEY && folders.length > 0
      ? collectDescendantFolderIds(folders, folderId)
      : [folderId];
  const idSet = new Set(folderIds);
  const rows =
    folderId === UNFILED_FOLDER_KEY
      ? transactions.filter((row) => !row.folderId)
      : transactions.filter((row) => row.folderId && idSet.has(row.folderId));

  return rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.deposits += row.deposit;
      acc.withdrawals += row.withdrawal;
      return acc;
    },
    { count: 0, deposits: 0, withdrawals: 0 }
  );
}

export function filterBankTransactionsByFolder(
  transactions: BankTransaction[],
  folderId: string,
  folders: BankTransactionFolder[] = [],
) {
  if (!folderId) return transactions;
  if (folderId === UNFILED_FOLDER_KEY) return transactions.filter((row) => !row.folderId);
  const folderIds = folders.length > 0 ? collectDescendantFolderIds(folders, folderId) : [folderId];
  const idSet = new Set(folderIds);
  return transactions.filter((row) => row.folderId && idSet.has(row.folderId));
}

export function filterBankTransactionsByFolderType(
  transactions: BankTransaction[],
  folders: BankTransactionFolder[],
  folderType: BankTransactionFolderType | "all"
) {
  if (folderType === "all") return transactions;
  const folderIds = new Set(folders.filter((folder) => folder.folderType === folderType).map((folder) => folder.id));
  return transactions.filter((row) => row.folderId && folderIds.has(row.folderId));
}

export function listFoldersByType(folders: BankTransactionFolder[], folderType: BankTransactionFolderType) {
  return folders.filter((folder) => folder.folderType === folderType);
}

export function createBankTransactionFolder(
  folders: BankTransactionFolder[],
  input: {
    folderName: string;
    folderType: BankTransactionFolderType;
    parentId?: string;
    isGroup?: boolean;
  },
) {
  const folderName = String(input.folderName || "").trim();
  if (!folderName) return { next: folders, error: "\uD3F4\uB354 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694." };

  const parentId = sanitizeBankTransactionFolderParentId(input.parentId);
  const parentError = validateFolderParent(folders, input.folderType, parentId);
  if (parentError) return { next: folders, error: parentError };

  const duplicate = folders.some((folder) => {
    if (folder.folderName.trim() !== folderName) return false;
    if (input.folderType === "custom" && !parentId) {
      return folder.folderType === "custom" && !folder.parentId;
    }
    return folder.folderType === input.folderType && (folder.parentId || "") === (parentId || "");
  });
  if (duplicate) return { next: folders, error: "\uAC19\uC740 \uC704\uCE58\uC5D0 \uC774\uBBF8 \uC788\uB294 \uD3F4\uB354 \uC774\uB984\uC785\uB2C8\uB2E4." };

  const now = new Date().toISOString();
  const folder: BankTransactionFolder = {
    id: makeBankTransactionFolderId(),
    folderName,
    folderType: input.folderType,
    parentId,
    isGroup: Boolean(input.isGroup),
    createdAt: now,
    updatedAt: now,
  };
  const next = finalizeBankTransactionFolders([...folders, folder]);
  return { next, folder: next.find((row) => row.id === folder.id) || folder, error: "" };
}

export function removeBankTransactionFolder(folders: BankTransactionFolder[], folderId: string) {
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) return { next: folders, error: "\uD3F4\uB354\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", removedFolderIds: [] as string[] };
  if (target.isDefault) {
    return { next: folders, error: "\uAE30\uBCF8 \uD3F4\uB354\uB294 \uC0AD\uC81C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", removedFolderIds: [] as string[] };
  }

  const removedFolderIds =
    target.folderType === "custom" && !target.parentId
      ? collectDescendantFolderIds(folders, folderId)
      : [folderId];
  const removedSet = new Set(removedFolderIds);

  if (removedFolderIds.length > 1) {
    const next = finalizeBankTransactionFolders(folders.filter((folder) => !removedSet.has(folder.id)));
    return { next, error: "", removedFolderIds };
  }

  const now = new Date().toISOString();
  const next = finalizeBankTransactionFolders(
    folders
      .filter((folder) => folder.id !== folderId)
      .map((folder) =>
        folder.parentId === folderId
          ? { ...folder, parentId: sanitizeBankTransactionFolderParentId(target.parentId), updatedAt: now }
          : folder,
      ),
  );
  return { next, error: "", removedFolderIds };
}

export function clearBankTransactionFolderReferences(transactions: BankTransaction[], folderIds: string | string[]) {
  const ids = new Set(Array.isArray(folderIds) ? folderIds : [folderIds]);
  return transactions.map((row) =>
    row.folderId && ids.has(row.folderId)
      ? { ...row, folderId: undefined, linkedSubject: undefined, classifiedAt: undefined }
      : row,
  );
}

export function autoClassifyBankTransactions(
  transactions: BankTransaction[],
  clients: ClientDepositMatchSource[],
  workers: WorkerDepositMatchSource[],
  folders: BankTransactionFolder[]
) {
  const sanitized = sanitizeWorkerFolderAssignments(transactions, folders, workers);
  let updated = sanitized.updated;
  const next = sanitized.next.map((row) => {
    if (isCardCompanyDeposit(row)) {
      if (row.folderId === DEFAULT_CARD_SALES_FOLDER_ID) return row;
      updated += 1;
      return {
        ...row,
        folderId: DEFAULT_CARD_SALES_FOLDER_ID,
        linkedSubject: String(row.counterpartyName || row.description || row.linkedSubject || "").trim() || undefined,
        classifiedAt: new Date().toISOString(),
      };
    }
    if (row.folderId) return row;
    const suggestion = suggestBankTransactionClassification(row, clients, workers);
    if (!suggestion) return row;
    updated += 1;
    return {
      ...row,
      folderId: resolveDefaultFolderId(suggestion.folderType),
      linkedSubject: suggestion.linkedSubject,
      classifiedAt: new Date().toISOString(),
    };
  });
  return { next, updated, folders: ensureDefaultBankTransactionFolders(folders) };
}

/** Move ledger-linked bank rows into the default 가계부 classification folder. */
export function syncLedgerLinkedBankTransactionFolders(
  transactions: BankTransaction[],
  folders: BankTransactionFolder[],
  context: {
    companyExpenses?: CompanyExpense[];
    fixedExpensePayments?: FixedExpensePayment[];
  },
) {
  const nextFolders = ensureDefaultBankTransactionFolders(folders);
  const ledgerFolderId = DEFAULT_LEDGER_CATEGORY_FOLDER_ID;
  let updated = 0;

  const next = transactions.map((tx) => {
    const linked = isBankTransactionLinkedToCompanyLedger(tx, context);
    if (linked) {
      if (tx.folderId === ledgerFolderId) return tx;
      if (tx.folderId) return tx;
      updated += 1;
      return {
        ...tx,
        folderId: ledgerFolderId,
        classifiedAt: new Date().toISOString(),
      };
    }
    if (tx.folderId === ledgerFolderId) {
      updated += 1;
      return { ...tx, folderId: undefined, linkedSubject: undefined, classifiedAt: undefined };
    }
    return tx;
  });

  return { transactions: next, folders: nextFolders, updated };
}
