import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type OfficeStaffPhotoFileMeta = {
  id: string;
  staffId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

const DB_NAME = "teammillimeter-erp-office-staff-photo";
const DB_VERSION = 1;
const STORE = "files";

type LocalRecord = OfficeStaffPhotoFileMeta & {
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
      reject(new Error("IndexedDB를 사용할 수 없습니다."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("저장소를 열 수 없습니다."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "staffId" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

function toMeta(record: LocalRecord): OfficeStaffPhotoFileMeta {
  return {
    id: record.id,
    staffId: record.staffId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function officeStaffHasPhoto(staff: { photoFileId?: string } | null | undefined) {
  return Boolean(String(staff?.photoFileId || "").trim());
}

export function applyOfficeStaffPhotoMetaToStaff<T extends Record<string, unknown>>(
  staff: T,
  meta: OfficeStaffPhotoFileMeta | null | undefined,
): T {
  if (!meta) {
    return {
      ...staff,
      photoFileId: "",
      photoFileName: "",
      photoUploadedAt: "",
    };
  }
  return {
    ...staff,
    photoFileId: meta.id,
    photoFileName: meta.fileName,
    photoUploadedAt: meta.updatedAt,
  };
}

function assertImageFile(file: File) {
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("사진 크기는 5MB 이하여야 합니다.");
  }
}

async function uploadLocal(staffId: string | number, file: File): Promise<OfficeStaffPhotoFileMeta> {
  assertImageFile(file);
  const db = await openDatabase();
  const now = new Date().toISOString();
  const id = `local-osphoto-${Date.now()}`;
  const record: LocalRecord = {
    id,
    staffId: String(staffId),
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
      reject(tx.error || new Error("저장에 실패했습니다."));
    };
    tx.objectStore(STORE).put(record);
  });
  return toMeta(record);
}

async function uploadApi(staffId: string | number, file: File): Promise<OfficeStaffPhotoFileMeta> {
  assertImageFile(file);
  const meta = {
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
  };
  const response = await fetch(`${apiBase()}/office-staff/${encodeURIComponent(String(staffId))}/photo`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": file.type || "image/jpeg",
      "X-Office-Staff-Photo-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: file,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as OfficeStaffPhotoFileMeta;
}

export async function uploadOfficeStaffPhoto(staffId: string | number, file: File) {
  if (isApiModeEnabled()) return uploadApi(staffId, file);
  return uploadLocal(staffId, file);
}

async function fetchBlobLocal(staffId: string | number): Promise<Blob | null> {
  const db = await openDatabase();
  const record = await new Promise<LocalRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(String(staffId));
    request.onsuccess = () => resolve((request.result as LocalRecord) || null);
    request.onerror = () => reject(request.error || new Error("불러오기에 실패했습니다."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
  return record?.blob || null;
}

async function fetchBlobApi(staffId: string | number): Promise<Blob | null> {
  const response = await fetch(`${apiBase()}/office-staff/${encodeURIComponent(String(staffId))}/photo/file`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.blob();
}

export async function fetchOfficeStaffPhotoBlob(staffId: string | number) {
  if (isApiModeEnabled()) return fetchBlobApi(staffId);
  return fetchBlobLocal(staffId);
}

async function deleteLocal(staffId: string | number) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("삭제에 실패했습니다."));
    };
    tx.objectStore(STORE).delete(String(staffId));
  });
}

async function deleteApi(staffId: string | number) {
  const response = await fetch(`${apiBase()}/office-staff/${encodeURIComponent(String(staffId))}/photo`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(await parseApiError(response));
}

export async function deleteOfficeStaffPhoto(staffId: string | number) {
  if (isApiModeEnabled()) return deleteApi(staffId);
  return deleteLocal(staffId);
}
