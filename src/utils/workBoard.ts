export type WorkPostAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

export type WorkPost = {
  id: string;
  title: string;
  body: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;
  createdByLoginId?: string;
  updatedBy?: string;
  attachments?: WorkPostAttachment[];
};

function normalizeAttachment(raw: Partial<WorkPostAttachment> & { id: string }): WorkPostAttachment {
  return {
    id: raw.id,
    fileName: String(raw.fileName || ""),
    mimeType: String(raw.mimeType || "application/octet-stream"),
    fileSize: Number(raw.fileSize) || 0,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

export function normalizeWorkPost(raw: Partial<WorkPost> & { id: string }): WorkPost {
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .filter((item) => item && typeof item === "object" && "id" in item)
        .map((item) => normalizeAttachment(item as Partial<WorkPostAttachment> & { id: string }))
    : [];

  return {
    id: raw.id,
    title: String(raw.title || ""),
    body: String(raw.body || ""),
    isPinned: Boolean(raw.isPinned),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    createdBy: String(raw.createdBy || ""),
    createdByLoginId: raw.createdByLoginId ? String(raw.createdByLoginId) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
    attachments,
  };
}

export function normalizeWorkPosts(rows: unknown[]) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && "id" in row)
    .map((row) => normalizeWorkPost(row as Partial<WorkPost> & { id: string }));
}

export function makeWorkPostId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `work-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function validateWorkPostInput(input: { title: string; body: string }) {
  if (!input.title.trim()) return "\uC81C\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!input.body.trim()) return "\uB0B4\uC6A9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  return null;
}

export function formatWorkPostDateTime(iso: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace("T", " ");
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sortWorkPosts(posts: WorkPost[]) {
  return [...posts].sort((a, b) => {
    const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
    if (pinDiff !== 0) return pinDiff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

export function filterWorkPosts(posts: WorkPost[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return posts;
  return posts.filter((post) => {
    const haystack = [post.title, post.body, post.createdBy, post.updatedBy || ""].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export function countWorkPostsThisMonth(posts: WorkPost[]) {
  const monthKey = new Date().toISOString().slice(0, 7);
  return posts.filter((post) => String(post.createdAt || "").startsWith(monthKey)).length;
}

export function canManageWorkPost(
  post: WorkPost,
  user?: { name?: string; loginId?: string; role?: string } | null
) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.loginId && post.createdByLoginId && user.loginId === post.createdByLoginId) return true;
  if (user.name && post.createdBy && user.name === post.createdBy) return true;
  return false;
}
