import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type WorkerPhotoFileMeta = {
  id: string;
  workerId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = "teammillimeter-erp-worker-photo";
const DB_VERSION = 1;
const STORE = "files";

type LocalRecord = WorkerPhotoFileMeta & {
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
        const store = db.createObjectStore(STORE, { keyPath: "workerId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

function toMeta(record: LocalRecord): WorkerPhotoFileMeta {
  return {
    id: record.id,
    workerId: record.workerId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function workerHasPhoto(worker: { photoFileId?: string } | null | undefined) {
  return Boolean(String(worker?.photoFileId || "").trim());
}

export function applyWorkerPhotoMetaToWorker<T extends Record<string, unknown>>(
  worker: T,
  meta: WorkerPhotoFileMeta | null | undefined,
): T {
  if (!meta) {
    return {
      ...worker,
      photoFileId: "",
      photoFileName: "",
      photoUploadedAt: "",
    };
  }
  return {
    ...worker,
    photoFileId: meta.id,
    photoFileName: meta.fileName,
    photoUploadedAt: meta.updatedAt,
  };
}

function assertImageFile(file: File) {
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("\uC774\uBBF8\uC9C0 \uD30C\uC77C\uB9CC \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("\uC0AC\uC9C4 \uD06C\uAE30\uB294 5MB \uC774\uD558\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
  }
}

async function uploadLocal(workerId: string | number, file: File): Promise<WorkerPhotoFileMeta> {
  assertImageFile(file);
  const db = await openDatabase();
  const now = new Date().toISOString();
  const id = `local-wphoto-${Date.now()}`;
  const record: LocalRecord = {
    id,
    workerId: String(workerId),
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
    fileSize: file.size,
    createdAt: now,
    updatedAt: now,
    blob: file,
  };
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

async function uploadApi(workerId: string | number, file: File): Promise<WorkerPhotoFileMeta> {
  assertImageFile(file);
  const meta = {
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
  };
  const response = await fetch(`${apiBase()}/workers/${encodeURIComponent(String(workerId))}/photo`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": file.type || "image/jpeg",
      "X-Worker-Photo-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: file,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as WorkerPhotoFileMeta;
}

export async function uploadWorkerPhoto(workerId: string | number, file: File) {
  if (isApiModeEnabled()) return uploadApi(workerId, file);
  return uploadLocal(workerId, file);
}

async function fetchMetaLocal(workerId: string | number): Promise<WorkerPhotoFileMeta | null> {
  const db = await openDatabase();
  const record = await new Promise<LocalRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(String(workerId));
    request.onsuccess = () => resolve((request.result as LocalRecord) || null);
    request.onerror = () => reject(request.error || new Error("\uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
  return record ? toMeta(record) : null;
}

async function fetchMetaApi(workerId: string | number): Promise<WorkerPhotoFileMeta | null> {
  const response = await fetch(`${apiBase()}/workers/${encodeURIComponent(String(workerId))}/photo/meta`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as WorkerPhotoFileMeta;
}

export async function fetchWorkerPhotoMeta(workerId: string | number) {
  if (isApiModeEnabled()) return fetchMetaApi(workerId);
  return fetchMetaLocal(workerId);
}

async function fetchBlobLocal(workerId: string | number): Promise<Blob | null> {
  const db = await openDatabase();
  const record = await new Promise<LocalRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(String(workerId));
    request.onsuccess = () => resolve((request.result as LocalRecord) || null);
    request.onerror = () => reject(request.error || new Error("\uBD88\uB7EC\uC624\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
  return record?.blob || null;
}

async function fetchBlobApi(workerId: string | number): Promise<Blob | null> {
  const response = await fetch(`${apiBase()}/workers/${encodeURIComponent(String(workerId))}/photo/file`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.blob();
}

export async function fetchWorkerPhotoBlob(workerId: string | number) {
  if (isApiModeEnabled()) return fetchBlobApi(workerId);
  return fetchBlobLocal(workerId);
}

async function deleteLocal(workerId: string | number) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("\uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
    };
    tx.objectStore(STORE).delete(String(workerId));
  });
}

async function deleteApi(workerId: string | number) {
  const response = await fetch(`${apiBase()}/workers/${encodeURIComponent(String(workerId))}/photo`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(await parseApiError(response));
}

export async function deleteWorkerPhoto(workerId: string | number) {
  if (isApiModeEnabled()) return deleteApi(workerId);
  return deleteLocal(workerId);
}

export function createWorkerPhotoPreviewUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}
