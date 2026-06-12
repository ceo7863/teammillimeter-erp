import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type TeamChatProfilePhotoMeta = {
  id: string;
  userId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
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

function assertImageFile(file: File) {
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("\uC774\uBBF8\uC9C0 \uD30C\uC77C\uB9CC \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("\uC0AC\uC9C4 \uD06C\uAE30\uB294 5MB \uC774\uD558\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
  }
}

export function teamChatUserHasPhoto(user: { photoFileId?: string | null } | null | undefined) {
  return Boolean(String(user?.photoFileId || "").trim());
}

export async function fetchTeamChatProfilePhotoMeta(userId: number | string): Promise<TeamChatProfilePhotoMeta | null> {
  if (!isApiModeEnabled()) return null;
  const response = await fetch(
    `${apiBase()}/team-chat/users/${encodeURIComponent(String(userId))}/profile-photo/meta`,
    { headers: authHeaders() },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as TeamChatProfilePhotoMeta;
}

export async function fetchTeamChatProfilePhotoBlob(userId: number | string): Promise<Blob | null> {
  if (!isApiModeEnabled()) return null;
  const response = await fetch(
    `${apiBase()}/team-chat/users/${encodeURIComponent(String(userId))}/profile-photo/file`,
    { headers: authHeaders() },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.blob();
}

export async function uploadTeamChatProfilePhoto(file: File): Promise<TeamChatProfilePhotoMeta> {
  assertImageFile(file);
  if (!isApiModeEnabled()) {
    throw new Error("\uC628\uB77C\uC778 \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uD504\uB85C\uD544 \uC0AC\uC9C4\uC744 \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }
  const meta = {
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
  };
  const response = await fetch(`${apiBase()}/team-chat/me/profile-photo`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": file.type || "image/jpeg",
      "X-User-Profile-Photo-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: file,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return (await response.json()) as TeamChatProfilePhotoMeta;
}

export async function deleteTeamChatProfilePhoto(): Promise<void> {
  if (!isApiModeEnabled()) return;
  const response = await fetch(`${apiBase()}/team-chat/me/profile-photo`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(await parseApiError(response));
}
