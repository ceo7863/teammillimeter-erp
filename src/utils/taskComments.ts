import { apiRequest, isApiModeEnabled } from "./erpApi";
import type { TaskCommentAttachment } from "./taskCommentAttachments";

export type TaskCommentReplyPreview = {
  id: number;
  userName: string;
  body: string;
  deleted?: boolean;
};

export type TaskCommentReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export const TASK_COMMENT_REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"] as const;

export type TaskCommentMessage = {
  id: number;
  taskId: string;
  userId: number;
  userName: string;
  body: string;
  isDeleted?: boolean;
  editedAt?: string | null;
  replyTo?: TaskCommentReplyPreview | null;
  attachments?: TaskCommentAttachment[];
  reactions?: TaskCommentReaction[];
  createdAt: string;
};

export async function fetchTaskComments(taskId: string, options: { afterId?: number; limit?: number } = {}) {
  if (!isApiModeEnabled()) return [];
  const params = new URLSearchParams();
  if (options.afterId != null && options.afterId > 0) params.set("after", String(options.afterId));
  if (options.limit != null) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiRequest<TaskCommentMessage[]>(
    `/work-tasks/${encodeURIComponent(taskId)}/comments${query ? `?${query}` : ""}`,
  );
}

export async function loadTaskCommentHistory(taskId: string, limit = 100) {
  if (!isApiModeEnabled()) return [];
  const params = new URLSearchParams({ history: "1", limit: String(limit) });
  return apiRequest<TaskCommentMessage[]>(
    `/work-tasks/${encodeURIComponent(taskId)}/comments?${params.toString()}`,
  );
}

export async function sendTaskComment(
  taskId: string,
  body: string,
  options?: {
    attachmentIds?: string[];
    replyToMessageId?: number | null;
  },
) {
  return apiRequest<TaskCommentMessage>(`/work-tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body,
      attachmentIds: options?.attachmentIds ?? [],
      replyToMessageId: options?.replyToMessageId ?? null,
    }),
  });
}

export async function editTaskCommentMessage(messageId: number, body: string) {
  return apiRequest<TaskCommentMessage>(`/work-tasks/comments/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export async function deleteTaskCommentMessage(messageId: number) {
  return apiRequest<TaskCommentMessage>(`/work-tasks/comments/${messageId}`, {
    method: "DELETE",
  });
}

export async function toggleTaskCommentReaction(messageId: number, emoji: string) {
  return apiRequest<TaskCommentMessage>(`/work-tasks/comments/${messageId}/reactions`, {
    method: "PUT",
    body: JSON.stringify({ emoji }),
  });
}

export async function fetchTaskCommentCounts(taskIds: string[]) {
  if (!isApiModeEnabled() || !taskIds.length) return {} as Record<string, number>;
  const params = new URLSearchParams({ taskIds: taskIds.join(",") });
  return apiRequest<Record<string, number>>(`/work-tasks/comments/counts?${params.toString()}`);
}

export function formatTaskCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
