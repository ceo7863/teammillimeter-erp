import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type TeamChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
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

export function formatTeamChatAttachmentSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTeamChatImageMimeType(mimeType: string) {
  return String(mimeType || "").startsWith("image/");
}

export const TEAM_CHAT_ATTACHMENT_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt";

const TEAM_CHAT_ATTACHMENT_EXT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|txt)$/i;

export function isTeamChatAttachmentFile(file: File) {
  const type = String(file.type || "");
  if (type.startsWith("image/")) return true;
  return TEAM_CHAT_ATTACHMENT_EXT.test(String(file.name || ""));
}

export function filterTeamChatAttachmentFiles(fileList: FileList | File[] | null | undefined) {
  if (!fileList?.length) return [];
  return Array.from(fileList).filter(isTeamChatAttachmentFile);
}

export function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

export async function uploadTeamChatAttachment(file: File, channelId: string): Promise<TeamChatAttachment> {
  if (!isApiModeEnabled()) {
    throw new Error("\uC11C\uBC84 \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uCCA8\uBD80\uD30C\uC77C\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  }
  const meta = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    channelId,
  };
  const response = await fetch(`${apiBase()}/team-chat/attachments`, {
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
  return (await response.json()) as TeamChatAttachment;
}

export async function fetchTeamChatAttachmentBlob(id: string): Promise<Blob | null> {
  if (!isApiModeEnabled()) return null;
  const response = await fetch(`${apiBase()}/team-chat/attachments/${encodeURIComponent(id)}/file`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.blob();
}

export function downloadTeamChatAttachmentBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function teamChatAttachmentUrl(id: string) {
  const token = getAuthToken();
  const base = `${apiBase()}/team-chat/attachments/${encodeURIComponent(id)}/file`;
  if (!token) return base;
  return `${base}?token=${encodeURIComponent(token)}`;
}
