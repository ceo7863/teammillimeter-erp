import type { PdfArchiveMeta } from "@/utils/pdfArchive";
import type { StatementGenerationLog, StatementGenerationType } from "@/utils/statementGenerationLogs";

export type StatementFolderItem = {
  id: string;
  generationLogId: string;
  pdfArchiveId?: string;
  statementType: StatementGenerationType;
  subjectName: string;
  startDate: string;
  endDate: string;
  clientStatementView?: "summary" | "detail";
  rowCount: number;
  logCreatedAt: string;
  filedAt: string;
  filedBy: string;
};

export type StatementFolder = {
  id: string;
  folderName: string;
  folderType: StatementGenerationType;
  items: StatementFolderItem[];
  updatedAt: string;
};

export function makeStatementFolderId(type: StatementGenerationType, subjectName: string) {
  const safe = String(subjectName || "unknown").replace(/[\\/:*?"<>|]/g, "_");
  return `folder-${type}-${safe}`;
}

function normalizeFolderItem(raw: unknown): StatementFolderItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<StatementFolderItem>;
  if (!row.id || !row.generationLogId || !row.subjectName) return null;
  const statementType = row.statementType === "worker" ? "worker" : "client";
  return {
    id: String(row.id),
    generationLogId: String(row.generationLogId),
    pdfArchiveId: row.pdfArchiveId ? String(row.pdfArchiveId) : undefined,
    statementType,
    subjectName: String(row.subjectName),
    startDate: String(row.startDate || ""),
    endDate: String(row.endDate || ""),
    clientStatementView: row.clientStatementView === "detail" ? "detail" : statementType === "client" ? "summary" : undefined,
    rowCount: Number(row.rowCount) || 0,
    logCreatedAt: String(row.logCreatedAt || ""),
    filedAt: String(row.filedAt || new Date().toISOString()),
    filedBy: String(row.filedBy || ""),
  };
}

function normalizeFolder(raw: unknown): StatementFolder | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<StatementFolder>;
  if (!row.id || !row.folderName) return null;
  const folderType = row.folderType === "worker" ? "worker" : "client";
  const items = Array.isArray(row.items)
    ? row.items.map(normalizeFolderItem).filter((item): item is StatementFolderItem => Boolean(item))
    : [];
  return {
    id: String(row.id),
    folderName: String(row.folderName),
    folderType,
    items,
    updatedAt: String(row.updatedAt || new Date().toISOString()),
  };
}

export function normalizeStatementFolders(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeFolder)
    .filter((row): row is StatementFolder => Boolean(row))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function formatStatementFolderTypeLabel(type: StatementGenerationType) {
  return type === "client" ? "\uAC70\uB798\uCC98" : "\uC2DC\uACF5\uC790";
}

export function findMatchingPdfArchive(records: PdfArchiveMeta[], log: StatementGenerationLog) {
  const category = log.statementType === "client" ? "statement-client" : "statement-worker";
  const view = log.clientStatementView || "summary";
  const matches = records.filter(
    (record) =>
      record.category === category &&
      record.subjectName === log.subjectName &&
      record.periodStart === log.startDate &&
      record.periodEnd === log.endDate &&
      (log.statementType !== "client" || (record.statementView || "summary") === view)
  );
  if (!matches.length) return null;
  matches.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return matches[0];
}

export function findFolderItemByLogId(folders: StatementFolder[], logId: string) {
  for (const folder of folders) {
    const item = folder.items.find((row) => row.generationLogId === logId);
    if (item) return { folder, item };
  }
  return null;
}

export function isGenerationLogFiled(folders: StatementFolder[], logId: string) {
  return folders.some((folder) => folder.items.some((item) => item.generationLogId === logId));
}

function buildFolderItemFromLog(log: StatementGenerationLog, pdfArchiveId: string | undefined, filedBy: string): StatementFolderItem {
  return {
    id: log.id,
    generationLogId: log.id,
    pdfArchiveId,
    statementType: log.statementType,
    subjectName: log.subjectName,
    startDate: log.startDate,
    endDate: log.endDate,
    clientStatementView: log.clientStatementView,
    rowCount: log.rowCount,
    logCreatedAt: log.createdAt,
    filedAt: new Date().toISOString(),
    filedBy,
  };
}

export function fileStatementLogToFolder(
  folders: StatementFolder[],
  log: StatementGenerationLog,
  options: { pdfArchiveId?: string; filedBy?: string } = {}
) {
  const folderId = makeStatementFolderId(log.statementType, log.subjectName);
  const filedBy = options.filedBy || "";
  const nextItem = buildFolderItemFromLog(log, options.pdfArchiveId, filedBy);
  const now = new Date().toISOString();
  const existingFolder = folders.find((folder) => folder.id === folderId);

  if (existingFolder) {
    const existingItem = existingFolder.items.find((item) => item.generationLogId === log.id);
    if (existingItem) {
      return folders.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              updatedAt: now,
              items: folder.items.map((item) =>
                item.generationLogId === log.id
                  ? {
                      ...item,
                      pdfArchiveId: options.pdfArchiveId || item.pdfArchiveId,
                      filedAt: now,
                      filedBy: filedBy || item.filedBy,
                    }
                  : item
              ),
            }
          : folder
      );
    }

    return folders.map((folder) =>
      folder.id === folderId
        ? {
            ...folder,
            updatedAt: now,
            items: [nextItem, ...folder.items],
          }
        : folder
    );
  }

  return [
    {
      id: folderId,
      folderName: log.subjectName,
      folderType: log.statementType,
      items: [nextItem],
      updatedAt: now,
    },
    ...folders,
  ];
}

export function isGenerationLogFullyFiled(folders: StatementFolder[], logId: string) {
  const filed = findFolderItemByLogId(folders, logId);
  return Boolean(filed?.item.pdfArchiveId);
}

export function fileStatementLogsToFolders(
  folders: StatementFolder[],
  logs: StatementGenerationLog[],
  pdfRecords: PdfArchiveMeta[],
  filedBy = ""
) {
  let next = folders;
  let filed = 0;
  let skipped = 0;
  let pdfLinked = 0;
  const folderIds: string[] = [];

  logs.forEach((log) => {
    if (isGenerationLogFullyFiled(next, log.id)) {
      skipped += 1;
      return;
    }

    const matchedPdf = findMatchingPdfArchive(pdfRecords, log);
    next = fileStatementLogToFolder(next, log, { pdfArchiveId: matchedPdf?.id, filedBy });
    folderIds.push(makeStatementFolderId(log.statementType, log.subjectName));
    filed += 1;
    if (matchedPdf) pdfLinked += 1;
  });

  return { folders: next, filed, skipped, pdfLinked, folderIds };
}

export function linkPdfArchiveToFolders(
  folders: StatementFolder[],
  meta: Pick<PdfArchiveMeta, "id" | "category" | "subjectName" | "periodStart" | "periodEnd" | "statementView">
) {
  const statementType: StatementGenerationType = meta.category === "statement-worker" ? "worker" : "client";
  const view = meta.statementView || "summary";
  let changed = false;

  const next = folders.map((folder) => {
    const updatedItems = folder.items.map((item) => {
      if (item.pdfArchiveId) return item;
      if (item.statementType !== statementType) return item;
      if (item.subjectName !== meta.subjectName) return item;
      if (item.startDate !== meta.periodStart || item.endDate !== meta.periodEnd) return item;
      if (statementType === "client" && (item.clientStatementView || "summary") !== view) return item;
      changed = true;
      return { ...item, pdfArchiveId: meta.id };
    });
    if (updatedItems === folder.items) return folder;
    return { ...folder, items: updatedItems, updatedAt: new Date().toISOString() };
  });

  return changed ? next : folders;
}

export type StatementFolderSort = "updated" | "name" | "items";

export function getStatementFolderStats(folders: StatementFolder[]) {
  return folders.reduce(
    (acc, folder) => {
      acc.folderCount += 1;
      acc.itemCount += folder.items.length;
      if (folder.folderType === "client") acc.clientFolders += 1;
      else acc.workerFolders += 1;
      return acc;
    },
    { folderCount: 0, itemCount: 0, clientFolders: 0, workerFolders: 0 }
  );
}

export function filterAndSortStatementFolders(
  folders: StatementFolder[],
  options: { query?: string; type?: "all" | StatementGenerationType; sort?: StatementFolderSort } = {}
) {
  const query = String(options.query || "").trim().toLowerCase();
  const type = options.type || "all";
  const sort = options.sort || "updated";

  let rows = folders.filter((folder) => {
    if (type !== "all" && folder.folderType !== type) return false;
    if (!query) return true;
    const haystack = [
      folder.folderName,
      formatStatementFolderTypeLabel(folder.folderType),
      ...folder.items.map((item) =>
        [item.startDate, item.endDate, item.filedBy, item.clientStatementView || ""].join(" ")
      ),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  rows = [...rows].sort((a, b) => {
    if (sort === "name") return a.folderName.localeCompare(b.folderName, "ko");
    if (sort === "items") {
      return b.items.length - a.items.length || a.folderName.localeCompare(b.folderName, "ko");
    }
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });

  return rows;
}

export function removeStatementFolderItem(folders: StatementFolder[], folderId: string, itemId: string) {
  return folders
    .map((folder) => {
      if (folder.id !== folderId) return folder;
      const items = folder.items.filter((item) => item.id !== itemId);
      if (!items.length) return null;
      return { ...folder, items, updatedAt: new Date().toISOString() };
    })
    .filter((folder): folder is StatementFolder => Boolean(folder));
}
