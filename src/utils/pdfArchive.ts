import { createPdfPreviewWindow, renderPdfInPreviewWindow } from "@/utils/statementPdf";
import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type PdfArchiveCategory = "statement-client" | "statement-worker";

export type PdfArchiveStatementView = "summary" | "detail";

export type PdfArchiveRecord = {
  id: string;
  fileName: string;
  createdAt: string;
  category: PdfArchiveCategory;
  subjectName: string;
  periodStart: string;
  periodEnd: string;
  statementView?: PdfArchiveStatementView;
  fileSize: number;
  pageCount: number;
  blob: Blob;
};

export type PdfArchiveMeta = Omit<PdfArchiveRecord, "blob">;

const DB_NAME = "teammillimeter-erp";
const DB_VERSION = 1;
const PDF_STORE = "pdfArchives";

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra || {});
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function parseApiError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return String(data.error || `API ${response.status}`);
  } catch {
    return text || `API ${response.status}`;
  }
}

function openPdfDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB를 사용할 수 없습니다."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("PDF 보관함 DB를 열 수 없습니다."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        const store = db.createObjectStore(PDF_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("category", "category", { unique: false });
      }
    };
  });
}

function toMeta(record: PdfArchiveRecord): PdfArchiveMeta {
  const { blob: _blob, ...meta } = record;
  return meta;
}

export function formatPdfArchiveSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getPdfArchiveCategoryLabel(category: PdfArchiveCategory) {
  if (category === "statement-client") return "거래처 내역서";
  return "시공자 내역서";
}

async function savePdfArchiveLocal(input: {
  blob: Blob;
  fileName: string;
  category: PdfArchiveCategory;
  subjectName: string;
  periodStart?: string;
  periodEnd?: string;
  statementView?: PdfArchiveStatementView;
  pageCount?: number;
}): Promise<PdfArchiveMeta> {
  const record: PdfArchiveRecord = {
    id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: input.fileName,
    createdAt: new Date().toISOString(),
    category: input.category,
    subjectName: input.subjectName,
    periodStart: input.periodStart || "",
    periodEnd: input.periodEnd || "",
    statementView: input.statementView,
    fileSize: input.blob.size,
    pageCount: input.pageCount || 1,
    blob: input.blob,
  };

  const db = await openPdfDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("PDF 저장에 실패했습니다."));
    };
    tx.objectStore(PDF_STORE).put(record);
  });

  return toMeta(record);
}

async function savePdfArchiveApi(input: {
  blob: Blob;
  fileName: string;
  category: PdfArchiveCategory;
  subjectName: string;
  periodStart?: string;
  periodEnd?: string;
  statementView?: PdfArchiveStatementView;
  pageCount?: number;
}): Promise<PdfArchiveMeta> {
  const meta = {
    fileName: input.fileName,
    category: input.category,
    subjectName: input.subjectName,
    periodStart: input.periodStart || "",
    periodEnd: input.periodEnd || "",
    statementView: input.statementView,
    pageCount: input.pageCount || 1,
  };

  const response = await fetch(`${apiBase()}/pdf-archives`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/pdf",
      // HTTP headers must be ASCII; Korean file/subject names break raw JSON.
      "X-Pdf-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: input.blob,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<PdfArchiveMeta>;
}

export async function savePdfArchive(input: {
  blob: Blob;
  fileName: string;
  category: PdfArchiveCategory;
  subjectName: string;
  periodStart?: string;
  periodEnd?: string;
  statementView?: PdfArchiveStatementView;
  pageCount?: number;
}): Promise<PdfArchiveMeta> {
  if (isApiModeEnabled()) return savePdfArchiveApi(input);
  return savePdfArchiveLocal(input);
}

async function listPdfArchivesLocal(): Promise<PdfArchiveMeta[]> {
  const db = await openPdfDatabase();
  const records = await new Promise<PdfArchiveRecord[]>((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const request = tx.objectStore(PDF_STORE).getAll();
    request.onsuccess = () => resolve((request.result as PdfArchiveRecord[]) || []);
    request.onerror = () => reject(request.error || new Error("PDF 목록을 불러올 수 없습니다."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });

  return records
    .map(toMeta)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function listPdfArchivesApi(): Promise<PdfArchiveMeta[]> {
  const response = await fetch(`${apiBase()}/pdf-archives`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  const data = (await response.json()) as { records?: PdfArchiveMeta[] };
  return data.records || [];
}

export async function listPdfArchives(): Promise<PdfArchiveMeta[]> {
  if (isApiModeEnabled()) return listPdfArchivesApi();
  return listPdfArchivesLocal();
}

async function fetchPdfArchiveBlob(id: string): Promise<Blob> {
  const response = await fetch(`${apiBase()}/pdf-archives/${encodeURIComponent(id)}/file`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.blob();
}

async function getPdfArchiveRecordLocal(id: string): Promise<PdfArchiveRecord | null> {
  const db = await openPdfDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const request = tx.objectStore(PDF_STORE).get(id);
    request.onsuccess = () => resolve((request.result as PdfArchiveRecord) || null);
    request.onerror = () => reject(request.error || new Error("PDF를 불러올 수 없습니다."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function getPdfArchiveRecordApi(id: string): Promise<PdfArchiveRecord | null> {
  const metaResponse = await fetch(`${apiBase()}/pdf-archives/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  if (metaResponse.status === 404) return null;
  if (!metaResponse.ok) {
    throw new Error(await parseApiError(metaResponse));
  }
  const meta = (await metaResponse.json()) as PdfArchiveMeta;
  const blob = await fetchPdfArchiveBlob(id);
  return { ...meta, blob };
}

export async function getPdfArchiveRecord(id: string): Promise<PdfArchiveRecord | null> {
  if (isApiModeEnabled()) return getPdfArchiveRecordApi(id);
  return getPdfArchiveRecordLocal(id);
}

async function deletePdfArchiveLocal(id: string) {
  const db = await openPdfDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("PDF 삭제에 실패했습니다."));
    };
    tx.objectStore(PDF_STORE).delete(id);
  });
}

async function deletePdfArchiveApi(id: string) {
  const response = await fetch(`${apiBase()}/pdf-archives/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function deletePdfArchive(id: string) {
  if (isApiModeEnabled()) return deletePdfArchiveApi(id);
  return deletePdfArchiveLocal(id);
}

export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openPdfBlobInNewTab(blob: Blob, fileName = "document.pdf"): boolean {
  const url = URL.createObjectURL(blob);
  const previewWindow = createPdfPreviewWindow();
  if (previewWindow && renderPdfInPreviewWindow(previewWindow, url, fileName)) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return false;
}

export async function archiveGeneratedPdf(
  result: { blob: Blob; fileName: string; pageCount: number },
  meta: {
    category: PdfArchiveCategory;
    subjectName: string;
    periodStart?: string;
    periodEnd?: string;
    statementView?: PdfArchiveStatementView;
  }
) {
  return savePdfArchive({
    blob: result.blob,
    fileName: result.fileName,
    pageCount: result.pageCount,
    ...meta,
  });
}
