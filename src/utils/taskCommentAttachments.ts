import { getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type TaskCommentAttachment = {
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

export function formatTaskCommentAttachmentSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isTaskCommentImageMimeType(mimeType: string) {
  return String(mimeType || "").startsWith("image/");
}

export const TASK_COMMENT_ATTACHMENT_ACCEPT =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt";

const TASK_COMMENT_ATTACHMENT_EXT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|txt)$/i;

export function isTaskCommentAttachmentFile(file: File) {
  const type = String(file.type || "");
  if (type.startsWith("image/")) return true;
  return TASK_COMMENT_ATTACHMENT_EXT.test(String(file.name || ""));
}

export function filterTaskCommentAttachmentFiles(fileList: FileList | File[] | null | undefined) {
  if (!fileList?.length) return [];
  return Array.from(fileList).filter(isTaskCommentAttachmentFile);
}

export function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

export async function uploadTaskCommentAttachment(file: File, taskId: string): Promise<TaskCommentAttachment> {
  if (!isApiModeEnabled()) {
    throw new Error("서버 모드에서만 첨부파일을 사용할 수 있습니다.");
  }
  const meta = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    taskId,
  };
  const response = await fetch(`${apiBase()}/work-tasks/comments/attachments`, {
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
  return (await response.json()) as TaskCommentAttachment;
}

export async function fetchTaskCommentAttachmentBlob(id: string): Promise<Blob | null> {
  if (!isApiModeEnabled()) return null;
  const response = await fetch(`${apiBase()}/work-tasks/comments/attachments/${encodeURIComponent(id)}/file`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.blob();
}

export function downloadTaskCommentAttachmentBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function taskCommentAttachmentUrl(id: string) {
  const token = getAuthToken();
  const base = `${apiBase()}/work-tasks/comments/attachments/${encodeURIComponent(id)}/file`;
  if (!token) return base;
  return `${base}?token=${encodeURIComponent(token)}`;
}
