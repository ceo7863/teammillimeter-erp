import { createPdfPreviewWindow, renderPdfInPreviewWindow } from "@/utils/statementPdf";
import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type PdfArchiveCategory = "statement-client" | "statement-worker";

export type PdfArchiveStatementView = "summary" | "detail";

export type PdfArchivePaymentStatus = "pending" | "confirmed" | "partial";

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
  sentViaLink?: boolean;
  statementTotalAmount?: number;
  paymentStatus?: PdfArchivePaymentStatus;
  linkedBankTransactionId?: string;
  linkedPaymentVoucherId?: string | number;
  shareLinkUrl?: string;
  statementSalesIds?: Array<string | number>;
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
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      const match = text.match(/<pre>([\s\S]*?)<\/pre>/i);
      if (match) return match[1].trim();
      return `\uC11C\uBC84 \uC624\uB958 (${response.status})`;
    }
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
  sentViaLink?: boolean;
  statementTotalAmount?: number;
  paymentStatus?: PdfArchivePaymentStatus;
  shareLinkUrl?: string;
  statementSalesIds?: Array<string | number>;
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
    sentViaLink: input.sentViaLink || false,
    statementTotalAmount: input.statementTotalAmount,
    paymentStatus: input.paymentStatus || (input.sentViaLink ? "pending" : undefined),
    shareLinkUrl: input.shareLinkUrl,
    statementSalesIds: input.statementSalesIds?.length ? [...input.statementSalesIds] : undefined,
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
  sentViaLink?: boolean;
  statementTotalAmount?: number;
  paymentStatus?: PdfArchivePaymentStatus;
  shareLinkUrl?: string;
  statementSalesIds?: Array<string | number>;
}): Promise<PdfArchiveMeta> {
  const meta = {
    fileName: input.fileName,
    category: input.category,
    subjectName: input.subjectName,
    periodStart: input.periodStart || "",
    periodEnd: input.periodEnd || "",
    statementView: input.statementView,
    pageCount: input.pageCount || 1,
    sentViaLink: input.sentViaLink || false,
    statementTotalAmount: input.statementTotalAmount,
    paymentStatus: input.paymentStatus || (input.sentViaLink ? "pending" : undefined),
    shareLinkUrl: input.shareLinkUrl,
    statementSalesIds: input.statementSalesIds?.length ? [...input.statementSalesIds] : undefined,
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
  sentViaLink?: boolean;
  statementTotalAmount?: number;
  paymentStatus?: PdfArchivePaymentStatus;
  shareLinkUrl?: string;
  statementSalesIds?: Array<string | number>;
}): Promise<PdfArchiveMeta> {
  if (isApiModeEnabled()) return savePdfArchiveApi(input);
  return savePdfArchiveLocal(input);
}

async function replacePdfArchiveLocal(
  id: string,
  input: { blob: Blob; fileName: string; pageCount: number },
): Promise<PdfArchiveMeta> {
  const db = await openPdfDatabase();
  const record = await new Promise<PdfArchiveRecord | null>((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const request = tx.objectStore(PDF_STORE).get(id);
    request.onsuccess = () => resolve((request.result as PdfArchiveRecord | undefined) || null);
    request.onerror = () => reject(request.error || new Error("PDF를 찾을 수 없습니다."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });

  if (!record) {
    throw new Error("PDF를 찾을 수 없습니다.");
  }

  const next: PdfArchiveRecord = {
    ...record,
    fileName: input.fileName,
    pageCount: input.pageCount || 1,
    fileSize: input.blob.size,
    blob: input.blob,
  };

  const dbWrite = await openPdfDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = dbWrite.transaction(PDF_STORE, "readwrite");
    tx.oncomplete = () => {
      dbWrite.close();
      resolve();
    };
    tx.onerror = () => {
      dbWrite.close();
      reject(tx.error || new Error("PDF 교체에 실패했습니다."));
    };
    tx.objectStore(PDF_STORE).put(next);
  });

  return toMeta(next);
}

async function replacePdfArchiveApi(
  id: string,
  input: { blob: Blob; fileName: string; pageCount: number },
): Promise<PdfArchiveMeta> {
  const meta = {
    fileName: input.fileName,
    pageCount: input.pageCount || 1,
  };

  const response = await fetch(`${apiBase()}/pdf-archives/${encodeURIComponent(id)}/file`, {
    method: "PUT",
    headers: authHeaders({
      "Content-Type": "application/pdf",
      "X-Pdf-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: input.blob,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<PdfArchiveMeta>;
}

async function replacePdfArchive(
  id: string,
  input: { blob: Blob; fileName: string; pageCount: number },
): Promise<PdfArchiveMeta> {
  if (isApiModeEnabled()) return replacePdfArchiveApi(id, input);
  return replacePdfArchiveLocal(id, input);
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

export async function clearAllPdfArchives() {
  const records = await listPdfArchives();
  for (const record of records) {
    await deletePdfArchive(record.id);
  }
  return records.length;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function downloadPdfArchives(records: PdfArchiveMeta[]) {
  let downloaded = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const saved = await getPdfArchiveRecord(record.id);
      if (!saved) {
        failed += 1;
        continue;
      }
      downloadPdfBlob(saved.blob, saved.fileName);
      downloaded += 1;
      await wait(350);
    } catch {
      failed += 1;
    }
  }

  return { downloaded, failed };
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

export type SharePdfResult = {
  ok: boolean;
  method: "share" | "download";
  message: string;
};

export async function sharePdfBlob(blob: Blob, fileName: string): Promise<SharePdfResult> {
  const safeName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const file = new File([blob], safeName, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const payload: ShareData = { files: [file], title: safeName };
    const canShareFiles = typeof navigator.canShare !== "function" || navigator.canShare(payload);

    if (canShareFiles) {
      try {
        await navigator.share(payload);
        return {
          ok: true,
          method: "share",
          message: "공유 메뉴에서 카카오톡을 선택해 보내주세요.",
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return { ok: false, method: "share", message: "공유가 취소되었습니다." };
        }
      }
    }
  }

  downloadPdfBlob(blob, safeName);
  return {
    ok: true,
    method: "download",
    message:
      "이 기기에서는 카카오톡으로 바로 보낼 수 없어 PDF를 저장했습니다. 카카오톡에서 파일을 첨부해 보내주세요. (모바일에서는 「카톡」 버튼으로 바로 공유할 수 있습니다.)",
  };
}

export function openPdfBlobInNewTab(
  blob: Blob,
  fileName = "document.pdf",
  previewWindow?: Window | null,
): boolean {
  const url = URL.createObjectURL(blob);
  const windowRef = previewWindow ?? createPdfPreviewWindow();
  if (windowRef && !windowRef.closed && renderPdfInPreviewWindow(windowRef, url, fileName)) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }

  windowRef?.close();

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
    sentViaLink?: boolean;
    statementTotalAmount?: number;
    paymentStatus?: PdfArchivePaymentStatus;
    shareLinkUrl?: string;
    statementSalesIds?: Array<string | number>;
  }
) {
  if (meta.sentViaLink) {
    const existingRecords = await listPdfArchives();
    const duplicate = findDuplicateSentStatementArchive(existingRecords, { ...meta, sentViaLink: true });
    if (duplicate) {
      const key = buildPdfArchiveStatementKey(duplicate);
      let updated = await replacePdfArchive(duplicate.id, {
        blob: result.blob,
        fileName: result.fileName,
        pageCount: result.pageCount,
      });
      const patch: PdfArchiveMetaPatch = {};
      if (meta.statementTotalAmount != null) patch.statementTotalAmount = meta.statementTotalAmount;
      if (meta.statementSalesIds?.length) patch.statementSalesIds = meta.statementSalesIds;
      if (meta.shareLinkUrl) patch.shareLinkUrl = meta.shareLinkUrl;
      if (Object.keys(patch).length > 0) {
        updated = await updatePdfArchiveMeta(updated.id, patch);
      }

      const duplicatesToRemove = existingRecords.filter(
        (record) =>
          record.sentViaLink &&
          record.id !== updated.id &&
          buildPdfArchiveStatementKey(record) === key,
      );
      const finalUpdated = await migrateShareLinksFromDuplicates(updated, duplicatesToRemove);

      for (const row of duplicatesToRemove) {
        await deletePdfArchive(row.id);
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("pdf-archive-updated", { detail: finalUpdated }));
      }
      return finalUpdated;
    }
  }

  const saved = await savePdfArchive({
    blob: result.blob,
    fileName: result.fileName,
    pageCount: result.pageCount,
    ...meta,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pdf-archive-updated", { detail: saved }));
  }

  return saved;
}

export async function archivePdfAndCreateShareLink(
  result: { blob: Blob; fileName: string; pageCount: number },
  meta: Omit<Parameters<typeof archiveGeneratedPdf>[1], "sentViaLink">
): Promise<{ archived: PdfArchiveMeta; shareLink: PdfShareLinkResult | null }> {
  const archived = await archiveGeneratedPdf(result, { ...meta, sentViaLink: true });

  if (!isApiModeEnabled()) {
    return { archived, shareLink: null };
  }

  if (archived.shareLinkUrl) {
    return {
      archived,
      shareLink: {
        token: "",
        url: archived.shareLinkUrl,
        fileName: archived.fileName,
      },
    };
  }

  const shareLink = await createPdfShareLink(archived.id);
  return { archived, shareLink };
}

export type PdfShareLinkResult = {
  token: string;
  url: string;
  fileName: string;
};

export async function createPdfShareLink(archiveId: string): Promise<PdfShareLinkResult> {
  if (!isApiModeEnabled()) {
    throw new Error("\uB9C1\uD06C \uBCF4\uB0B4\uAE30\uB294 \uC11C\uBC84 \uC5F0\uB3D9 \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }

  const response = await fetch(`${apiBase()}/pdf-archives/${encodeURIComponent(archiveId)}/share-link`, {
    method: "POST",
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<PdfShareLinkResult>;
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export type PdfArchiveMetaPatch = Partial<
  Pick<
    PdfArchiveMeta,
    | "sentViaLink"
    | "statementTotalAmount"
    | "paymentStatus"
    | "linkedBankTransactionId"
    | "linkedPaymentVoucherId"
    | "shareLinkUrl"
    | "statementSalesIds"
  >
>;

async function updatePdfArchiveMetaLocal(id: string, patch: PdfArchiveMetaPatch): Promise<PdfArchiveMeta> {
  const record = await getPdfArchiveRecordLocal(id);
  if (!record) {
    throw new Error("PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const updated: PdfArchiveRecord = {
    ...record,
    ...patch,
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
      reject(tx.error || new Error("PDF \uBA54\uD0C0 \uC5C5\uB370\uC774\uD2B8\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    };
    tx.objectStore(PDF_STORE).put(updated);
  });

  const meta = toMeta(updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pdf-archive-updated", { detail: meta }));
  }
  return meta;
}

async function updatePdfArchiveMetaApi(id: string, patch: PdfArchiveMetaPatch): Promise<PdfArchiveMeta> {
  const response = await fetch(`${apiBase()}/pdf-archives/${encodeURIComponent(id)}/meta`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const meta = (await response.json()) as PdfArchiveMeta;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pdf-archive-updated", { detail: meta }));
  }
  return meta;
}

export async function updatePdfArchiveMeta(id: string, patch: PdfArchiveMetaPatch): Promise<PdfArchiveMeta> {
  if (isApiModeEnabled()) return updatePdfArchiveMetaApi(id, patch);
  return updatePdfArchiveMetaLocal(id, patch);
}

function normalizeStatementSalesIds(ids?: Array<string | number>) {
  if (!ids?.length) return [];
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort();
}

/** 보낸내역서 중복 판정: 거래처·기간·보기 방식 (매출 ID는 제외 — 링크 재발송 시 비어 있는 경우가 많음) */
export function buildPdfArchiveStatementKey(
  record: Pick<PdfArchiveMeta, "category" | "subjectName" | "periodStart" | "periodEnd" | "statementView">,
) {
  const view = record.category === "statement-client" ? record.statementView || "summary" : "";
  return [
    record.category,
    String(record.subjectName || "").trim(),
    String(record.periodStart || "").trim(),
    String(record.periodEnd || "").trim(),
    view,
  ].join("|");
}

function sentStatementArchiveRank(record: PdfArchiveMeta) {
  let score = 0;
  if (record.linkedBankTransactionId) score += 100;
  if (record.linkedPaymentVoucherId) score += 80;
  if (record.statementSalesIds?.length) score += 15;
  if (record.paymentStatus === "confirmed") score += 40;
  else if (record.paymentStatus === "partial") score += 20;
  if (record.shareLinkUrl) score += 10;
  return score;
}

export function pickPreferredSentStatementArchive(group: PdfArchiveMeta[]) {
  return [...group].sort((a, b) => {
    const rankDiff = sentStatementArchiveRank(b) - sentStatementArchiveRank(a);
    if (rankDiff !== 0) return rankDiff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  })[0];
}

function buildMergedSentStatementArchivePatch(keeper: PdfArchiveMeta, duplicates: PdfArchiveMeta[]): PdfArchiveMetaPatch | null {
  const patch: PdfArchiveMetaPatch = {};
  const salesIds = new Set(normalizeStatementSalesIds(keeper.statementSalesIds));
  for (const row of duplicates) {
    for (const id of normalizeStatementSalesIds(row.statementSalesIds)) salesIds.add(id);
  }
  if (salesIds.size > normalizeStatementSalesIds(keeper.statementSalesIds).length) {
    patch.statementSalesIds = [...salesIds];
  }

  if (!keeper.linkedBankTransactionId) {
    const linked = duplicates.find((row) => row.linkedBankTransactionId);
    if (linked?.linkedBankTransactionId) patch.linkedBankTransactionId = linked.linkedBankTransactionId;
  }
  if (!keeper.linkedPaymentVoucherId) {
    const linked = duplicates.find((row) => row.linkedPaymentVoucherId);
    if (linked?.linkedPaymentVoucherId) patch.linkedPaymentVoucherId = linked.linkedPaymentVoucherId;
  }
  if (!keeper.paymentStatus || keeper.paymentStatus === "pending") {
    const ranked = duplicates
      .map((row) => row.paymentStatus)
      .filter((status): status is NonNullable<PdfArchiveMeta["paymentStatus"]> => Boolean(status));
    const best = ranked.find((status) => status === "confirmed") || ranked.find((status) => status === "partial");
    if (best) patch.paymentStatus = best;
  }
  if (keeper.statementTotalAmount == null) {
    const amount = duplicates.find((row) => row.statementTotalAmount != null)?.statementTotalAmount;
    if (amount != null) patch.statementTotalAmount = amount;
  }
  if (!keeper.shareLinkUrl?.trim()) {
    const linked = duplicates.find((row) => row.shareLinkUrl?.trim());
    if (linked?.shareLinkUrl) patch.shareLinkUrl = linked.shareLinkUrl;
  }

  return Object.keys(patch).length ? patch : null;
}

async function migratePdfArchiveShareLinkApi(keeperId: string, duplicateId: string): Promise<PdfArchiveMeta | null> {
  const response = await fetch(`${apiBase()}/pdf-archives/migrate-share-link`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ keeperId, duplicateId }),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<PdfArchiveMeta>;
}

export async function migrateShareLinksFromDuplicates(
  keeper: PdfArchiveMeta,
  duplicates: PdfArchiveMeta[],
): Promise<PdfArchiveMeta> {
  if (!duplicates.length) return keeper;

  let current = keeper;
  const patch = buildMergedSentStatementArchivePatch(current, duplicates);
  if (patch) {
    current = await updatePdfArchiveMeta(current.id, patch);
  }

  if (isApiModeEnabled()) {
    for (const duplicate of duplicates) {
      const migrated = await migratePdfArchiveShareLinkApi(current.id, duplicate.id);
      if (migrated) current = migrated;
    }
  }

  return current;
}

export function partitionDuplicateSentStatementArchives(records: PdfArchiveMeta[]) {
  const sent = records.filter((record) => record.sentViaLink);
  const nonSent = records.filter((record) => !record.sentViaLink);
  const byKey = new Map<string, PdfArchiveMeta[]>();

  for (const record of sent) {
    const key = buildPdfArchiveStatementKey(record);
    const list = byKey.get(key) || [];
    list.push(record);
    byKey.set(key, list);
  }

  const keptSent: PdfArchiveMeta[] = [];
  const removedIds: string[] = [];

  for (const group of byKey.values()) {
    const keeper = pickPreferredSentStatementArchive(group);
    keptSent.push(keeper);
    for (const record of group) {
      if (record.id !== keeper.id) removedIds.push(record.id);
    }
  }

  keptSent.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { records: [...nonSent, ...keptSent], removedIds };
}

export function findDuplicateSentStatementArchive(
  records: PdfArchiveMeta[],
  meta: Pick<
    PdfArchiveMeta,
    "category" | "subjectName" | "periodStart" | "periodEnd" | "statementView" | "sentViaLink"
  >,
) {
  if (!meta.sentViaLink) return null;
  const key = buildPdfArchiveStatementKey(meta);
  const matches = records.filter((record) => record.sentViaLink && buildPdfArchiveStatementKey(record) === key);
  if (!matches.length) return null;
  return pickPreferredSentStatementArchive(matches);
}

export async function cleanupDuplicateSentStatementArchives() {
  const records = await listPdfArchives();
  const { records: partitioned, removedIds } = partitionDuplicateSentStatementArchives(records);

  const sent = records.filter((record) => record.sentViaLink);
  const byKey = new Map<string, PdfArchiveMeta[]>();
  for (const record of sent) {
    const key = buildPdfArchiveStatementKey(record);
    const list = byKey.get(key) || [];
    list.push(record);
    byKey.set(key, list);
  }

  let kept = partitioned;
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const keeper = pickPreferredSentStatementArchive(group);
    const duplicates = group.filter((row) => row.id !== keeper.id);
    const updated = await migrateShareLinksFromDuplicates(keeper, duplicates);
    kept = kept.map((row) => (row.id === keeper.id ? updated : row));
  }

  for (const id of removedIds) {
    await deletePdfArchive(id);
  }
  return { records: kept, removedCount: removedIds.length };
}

export async function listSentStatementArchives(): Promise<PdfArchiveMeta[]> {
  const records = await listPdfArchives();
  const { records: deduped } = partitionDuplicateSentStatementArchives(records);
  return deduped
    .filter((record) => record.sentViaLink)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
