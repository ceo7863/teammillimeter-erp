import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";
import type { WorkPostAttachment } from "@/utils/workBoard";

const DB_NAME = "teammillimeter-erp";
const DB_VERSION = 2;
const ATTACHMENT_STORE = "boardAttachments";

type LocalAttachmentRecord = WorkPostAttachment & {
  postId: string;
  blob: Blob;
};

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

function openAttachmentDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("\uCCB4\uBD80\uD30C\uC77C DB\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pdfArchives")) {
        const pdfStore = db.createObjectStore("pdfArchives", { keyPath: "id" });
        pdfStore.createIndex("createdAt", "createdAt", { unique: false });
        pdfStore.createIndex("category", "category", { unique: false });
      }
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
        const store = db.createObjectStore(ATTACHMENT_STORE, { keyPath: "id" });
        store.createIndex("postId", "postId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

export function formatAttachmentSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMimeType(mimeType: string) {
  return String(mimeType || "").startsWith("image/");
}

function toAttachmentMeta(record: LocalAttachmentRecord): WorkPostAttachment {
  return {
    id: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    createdAt: record.createdAt,
  };
}

async function uploadBoardAttachmentLocal(file: File, postId: string): Promise<WorkPostAttachment> {
  const record: LocalAttachmentRecord = {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    postId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    createdAt: new Date().toISOString(),
    blob: file,
  };

  const db = await openAttachmentDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("\uCCB4\uBD80\uD30C\uC77C \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    };
    tx.objectStore(ATTACHMENT_STORE).put(record);
  });

  return toAttachmentMeta(record);
}

async function uploadBoardAttachmentApi(file: File, postId: string): Promise<WorkPostAttachment> {
  const meta = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    postId,
  };

  const response = await fetch(`${apiBase()}/board-attachments`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": file.type || "application/octet-stream",
      "X-Attachment-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: file,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const saved = (await response.json()) as WorkPostAttachment;
  return {
    id: saved.id,
    fileName: saved.fileName,
    mimeType: saved.mimeType,
    fileSize: saved.fileSize,
    createdAt: saved.createdAt,
  };
}

export async function uploadBoardAttachment(file: File, postId: string): Promise<WorkPostAttachment> {
  if (isApiModeEnabled()) return uploadBoardAttachmentApi(file, postId);
  return uploadBoardAttachmentLocal(file, postId);
}

async function fetchBoardAttachmentBlobLocal(id: string): Promise<Blob | null> {
  const db = await openAttachmentDatabase();
  const record = await new Promise<LocalAttachmentRecord | null>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE, "readonly");
    const request = tx.objectStore(ATTACHMENT_STORE).get(id);
    request.onsuccess = () => resolve((request.result as LocalAttachmentRecord) || null);
    request.onerror = () => reject(request.error || new Error("\uCCB4\uBD80\uD30C\uC77C\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
  return record?.blob || null;
}

async function fetchBoardAttachmentBlobApi(id: string): Promise<Blob | null> {
  const response = await fetch(`${apiBase()}/board-attachments/${encodeURIComponent(id)}/file`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.blob();
}

export async function fetchBoardAttachmentBlob(id: string): Promise<Blob | null> {
  if (isApiModeEnabled()) return fetchBoardAttachmentBlobApi(id);
  return fetchBoardAttachmentBlobLocal(id);
}

async function deleteBoardAttachmentLocal(id: string) {
  const db = await openAttachmentDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("\uCCB4\uBD80\uD30C\uC77C \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    };
    tx.objectStore(ATTACHMENT_STORE).delete(id);
  });
}

async function deleteBoardAttachmentApi(id: string) {
  const response = await fetch(`${apiBase()}/board-attachments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function deleteBoardAttachment(id: string) {
  if (isApiModeEnabled()) return deleteBoardAttachmentApi(id);
  return deleteBoardAttachmentLocal(id);
}

export async function deleteBoardAttachments(ids: string[]) {
  for (const id of ids) {
    await deleteBoardAttachment(id);
  }
}

export function downloadAttachmentBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
