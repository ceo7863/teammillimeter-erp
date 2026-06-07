import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type ClientBusinessRegFileMeta = {
  id: string;
  clientId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = "teammillimeter-erp-client-biz-reg";
const DB_VERSION = 1;
const STORE = "files";

type LocalRecord = ClientBusinessRegFileMeta & {
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

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("\uC800\uC7A5\uC18C\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "clientId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

function toMeta(record: LocalRecord): ClientBusinessRegFileMeta {
  return {
    id: record.id,
    clientId: record.clientId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function clientHasBusinessRegFile(client: { businessRegFileId?: string } | null | undefined) {
  return Boolean(String(client?.businessRegFileId || "").trim());
}

export function applyBusinessRegMetaToClient<T extends Record<string, unknown>>(
  client: T,
  meta: ClientBusinessRegFileMeta | null | undefined,
): T {
  if (!meta) {
    return {
      ...client,
      businessRegFileId: "",
      businessRegFileName: "",
      businessRegUploadedAt: "",
    };
  }
  return {
    ...client,
    businessRegFileId: meta.id,
    businessRegFileName: meta.fileName,
    businessRegUploadedAt: meta.updatedAt,
  };
}

async function uploadLocal(clientId: string | number, file: File): Promise<ClientBusinessRegFileMeta> {
  const now = new Date().toISOString();
  const record: LocalRecord = {
    id: `bizreg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clientId: String(clientId),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    createdAt: now,
    updatedAt: now,
    blob: file,
  };
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("\uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    };
    tx.objectStore(STORE).put(record);
  });
  return toMeta(record);
}

async function uploadApi(clientId: string | number, file: File): Promise<ClientBusinessRegFileMeta> {
  const meta = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
  };
  const response = await fetch(`${apiBase()}/clients/${encodeURIComponent(String(clientId))}/business-reg`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": file.type || "application/octet-stream",
      "X-Business-Reg-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: file,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as ClientBusinessRegFileMeta;
}

export async function uploadClientBusinessReg(clientId: string | number, file: File) {
  if (isApiModeEnabled()) return uploadApi(clientId, file);
  return uploadLocal(clientId, file);
}

async function fetchMetaLocal(clientId: string | number): Promise<ClientBusinessRegFileMeta | null> {
  const db = await openDatabase();
  const record = await new Promise<LocalRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(String(clientId));
    request.onsuccess = () => resolve((request.result as LocalRecord) || null);
    request.onerror = () => reject(request.error || new Error("\uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
  return record ? toMeta(record) : null;
}

async function fetchMetaApi(clientId: string | number): Promise<ClientBusinessRegFileMeta | null> {
  const response = await fetch(`${apiBase()}/clients/${encodeURIComponent(String(clientId))}/business-reg/meta`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as ClientBusinessRegFileMeta;
}

export async function fetchClientBusinessRegMeta(clientId: string | number) {
  if (isApiModeEnabled()) return fetchMetaApi(clientId);
  return fetchMetaLocal(clientId);
}

async function fetchBlobLocal(clientId: string | number): Promise<Blob | null> {
  const db = await openDatabase();
  const record = await new Promise<LocalRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(String(clientId));
    request.onsuccess = () => resolve((request.result as LocalRecord) || null);
    request.onerror = () => reject(request.error || new Error("\uBD88\uB7EC\uC624\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
  return record?.blob || null;
}

async function fetchBlobApi(clientId: string | number): Promise<Blob | null> {
  const response = await fetch(`${apiBase()}/clients/${encodeURIComponent(String(clientId))}/business-reg/file`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.blob();
}

export async function fetchClientBusinessRegBlob(clientId: string | number) {
  if (isApiModeEnabled()) return fetchBlobApi(clientId);
  return fetchBlobLocal(clientId);
}

export function isPdfMimeType(mimeType: string) {
  return String(mimeType || "").includes("pdf");
}

export function isImageMimeType(mimeType: string) {
  return String(mimeType || "").startsWith("image/");
}

export function printClientBusinessRegBlob(blob: Blob, mimeType: string, title: string) {
  const url = URL.createObjectURL(blob);
  const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error("\uD31D\uC5C5 \uCC28\uB2E8\uC774 \uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
  const safeTitle = title.replace(/[<>&"]/g, "");
  if (isPdfMimeType(mimeType)) {
    popup.document.write(`<!doctype html><html lang="ko"><head><title>${safeTitle}</title></head><body style="margin:0"><iframe src="${url}" style="border:0;width:100vw;height:100vh"></iframe></body></html>`);
  } else {
    popup.document.write(`<!doctype html><html lang="ko"><head><title>${safeTitle}</title><style>body{margin:0;display:flex;justify-content:center;background:#f8fafc}img{max-width:100%;height:auto}</style></head><body><img src="${url}" alt="${safeTitle}" /></body></html>`);
  }
  popup.document.close();
  popup.onload = () => {
    window.setTimeout(() => {
      popup.focus();
      popup.print();
    }, 500);
  };
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
