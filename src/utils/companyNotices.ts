export type NoticeBoardKey = "notice" | "error" | "request";

export type CompanyNotice = {
  id: string;
  board: NoticeBoardKey;
  title: string;
  body: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;
  createdByLoginId?: string;
  updatedBy?: string;
};

export const NOTICE_BOARD_OPTIONS: Array<{ key: NoticeBoardKey; label: string; desc: string }> = [
  {
    key: "notice",
    label: "\uACF5\uC9C0",
    desc: "\uC804\uC0AC \uACF5\uC9C0\uC640 \uC548\uB0B4 \uC0AC\uD56D",
  },
  {
    key: "error",
    label: "\uC5D0\uB7EC\uC0AC\uD56D",
    desc: "\uC2DC\uC2A4\uD15C \uC624\uB958 \uBC0F \uC7A5\uC560 \uC774\uC2AC",
  },
  {
    key: "request",
    label: "\uC694\uCCAD\uC0AC\uD56D",
    desc: "\uAC1C\uC120 \uBC0F \uC9C0\uC6D0 \uC694\uCCAD",
  },
];

export const DEFAULT_NOTICE_BOARD: NoticeBoardKey = "notice";

export function normalizeNoticeBoard(value: unknown): NoticeBoardKey {
  if (value === "error" || value === "request" || value === "notice") return value;
  return DEFAULT_NOTICE_BOARD;
}

export function getNoticeBoardLabel(board: NoticeBoardKey) {
  return NOTICE_BOARD_OPTIONS.find((item) => item.key === board)?.label || NOTICE_BOARD_OPTIONS[0].label;
}

export function normalizeCompanyNotice(raw: Partial<CompanyNotice> & { id: string }): CompanyNotice {
  return {
    id: raw.id,
    board: normalizeNoticeBoard(raw.board),
    title: String(raw.title || ""),
    body: String(raw.body || ""),
    isPinned: Boolean(raw.isPinned),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    createdBy: String(raw.createdBy || ""),
    createdByLoginId: raw.createdByLoginId ? String(raw.createdByLoginId) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
  };
}

export function normalizeCompanyNotices(rows: unknown[]) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && "id" in row)
    .map((row) => normalizeCompanyNotice(row as Partial<CompanyNotice> & { id: string }));
}

export function makeNoticeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `notice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function validateNoticeInput(input: { title: string; body: string }) {
  if (!input.title.trim()) return "\uC81C\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!input.body.trim()) return "\uB0B4\uC6A9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  return null;
}

export function formatNoticeDateTime(iso: string) {
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

export function sortCompanyNotices(notices: CompanyNotice[]) {
  return [...notices].sort((a, b) => {
    const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
    if (pinDiff !== 0) return pinDiff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

export function filterCompanyNoticesByBoard(notices: CompanyNotice[], board: NoticeBoardKey) {
  return notices.filter((notice) => normalizeNoticeBoard(notice.board) === board);
}

export function filterCompanyNotices(notices: CompanyNotice[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return notices;
  return notices.filter((notice) => {
    const haystack = [notice.title, notice.body, notice.createdBy, notice.updatedBy || "", getNoticeBoardLabel(notice.board)]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function countNoticesThisMonth(notices: CompanyNotice[]) {
  const monthKey = new Date().toISOString().slice(0, 7);
  return notices.filter((notice) => String(notice.createdAt || "").startsWith(monthKey)).length;
}

export function canManageNotice(
  notice: CompanyNotice,
  user?: { name?: string; loginId?: string; role?: string } | null
) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.loginId && notice.createdByLoginId && user.loginId === notice.createdByLoginId) return true;
  if (user.name && notice.createdBy && user.name === notice.createdBy) return true;
  return false;
}
