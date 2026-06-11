import { apiRequest, isApiModeEnabled } from "./erpApi";

export type TeamChatChannel = {
  id: string;
  type: "team" | "dm";
  title: string;
  peerUserId?: number | null;
  unreadCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string;
  lastMessageUserName?: string;
};

export type TeamChatMessage = {
  id: number;
  channelId: string;
  userId: number;
  userName: string;
  body: string;
  link?: { type: string; id: string; label: string } | null;
  createdAt: string;
};

export type TeamChatUser = {
  id: number;
  name: string;
  loginId?: string;
  role?: string;
};

export async function listTeamChatChannels() {
  if (!isApiModeEnabled()) return [];
  return apiRequest<TeamChatChannel[]>("/team-chat/channels");
}

export async function listTeamChatUsers() {
  if (!isApiModeEnabled()) return [];
  return apiRequest<TeamChatUser[]>("/team-chat/users");
}

export async function openTeamChatDm(otherUserId: number | string) {
  return apiRequest<TeamChatChannel>("/team-chat/dm", {
    method: "POST",
    body: JSON.stringify({ otherUserId }),
  });
}

export async function fetchTeamChatMessages(channelId: string, options: { afterId?: number; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (options.afterId != null && options.afterId > 0) params.set("after", String(options.afterId));
  if (options.limit != null) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiRequest<TeamChatMessage[]>(
    `/team-chat/channels/${encodeURIComponent(channelId)}/messages${query ? `?${query}` : ""}`,
  );
}

export async function loadTeamChatHistory(channelId: string, limit = 100) {
  const params = new URLSearchParams({ history: "1", limit: String(limit) });
  return apiRequest<TeamChatMessage[]>(
    `/team-chat/channels/${encodeURIComponent(channelId)}/messages?${params.toString()}`,
  );
}

export async function sendTeamChatMessage(
  channelId: string,
  body: string,
  link?: { type: string; id: string; label: string } | null,
) {
  return apiRequest<TeamChatMessage>(`/team-chat/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body, link }),
  });
}

export async function markTeamChatChannelRead(channelId: string, messageId?: number) {
  return apiRequest<{ ok: boolean; lastReadMessageId: number }>(
    `/team-chat/channels/${encodeURIComponent(channelId)}/read`,
    {
      method: "POST",
      body: JSON.stringify({ messageId: messageId ?? null }),
    },
  );
}

export async function fetchTeamChatUnreadCount() {
  if (!isApiModeEnabled()) return 0;
  const result = await apiRequest<{ count: number }>("/team-chat/unread-count");
  return Number(result?.count) || 0;
}

export function formatTeamChatTime(value: string) {
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
