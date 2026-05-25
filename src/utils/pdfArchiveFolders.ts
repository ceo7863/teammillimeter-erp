import type { PdfArchiveCategory, PdfArchiveMeta } from "@/utils/pdfArchive";

export type PdfArchiveFolderType = "client" | "worker";

export type PdfArchiveFolder = {
  id: string;
  folderName: string;
  folderType: PdfArchiveFolderType;
  items: PdfArchiveMeta[];
  updatedAt: string;
};

export type PdfArchiveFolderSort = "updated" | "name" | "items";

export function makePdfArchiveFolderId(type: PdfArchiveFolderType, subjectName: string) {
  const safe = String(subjectName || "unknown").replace(/[\\/:*?"<>|]/g, "_");
  return `pdf-folder-${type}-${safe}`;
}

export function pdfArchiveCategoryToFolderType(category: PdfArchiveCategory): PdfArchiveFolderType {
  return category === "statement-client" ? "client" : "worker";
}

export function groupPdfArchivesBySubject(records: PdfArchiveMeta[], sort: PdfArchiveFolderSort = "updated") {
  const map = new Map<string, PdfArchiveFolder>();

  records.forEach((record) => {
    const folderType = pdfArchiveCategoryToFolderType(record.category);
    const folderId = makePdfArchiveFolderId(folderType, record.subjectName);
    const existing = map.get(folderId);
    if (!existing) {
      map.set(folderId, {
        id: folderId,
        folderName: record.subjectName || "???",
        folderType,
        items: [record],
        updatedAt: record.createdAt,
      });
      return;
    }

    existing.items.push(record);
    if (String(record.createdAt).localeCompare(String(existing.updatedAt)) > 0) {
      existing.updatedAt = record.createdAt;
    }
  });

  const folders = [...map.values()].map((folder) => ({
    ...folder,
    items: [...folder.items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  }));

  return sortPdfArchiveFolders(folders, sort);
}

export function sortPdfArchiveFolders(folders: PdfArchiveFolder[], sort: PdfArchiveFolderSort) {
  const rows = [...folders];
  rows.sort((a, b) => {
    if (sort === "name") return a.folderName.localeCompare(b.folderName, "ko");
    if (sort === "items") {
      return b.items.length - a.items.length || a.folderName.localeCompare(b.folderName, "ko");
    }
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return rows;
}

export function getPdfArchiveFolderStats(folders: PdfArchiveFolder[]) {
  return folders.reduce(
    (acc, folder) => {
      acc.folderCount += 1;
      acc.itemCount += folder.items.length;
      acc.totalBytes += folder.items.reduce((sum, item) => sum + item.fileSize, 0);
      return acc;
    },
    { folderCount: 0, itemCount: 0, totalBytes: 0 }
  );
}

export function filterPdfArchiveRecords(
  records: PdfArchiveMeta[],
  options: { query?: string; startDate?: string; endDate?: string } = {}
) {
  const keyword = String(options.query || "").trim().toLowerCase();
  const startDate = options.startDate || "";
  const endDate = options.endDate || "";

  return records.filter((record) => {
    const day = record.createdAt.slice(0, 10);
    if (startDate && day < startDate) return false;
    if (endDate && day > endDate) return false;
    if (!keyword) return true;
    const haystack = [record.fileName, record.subjectName, record.category].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}
