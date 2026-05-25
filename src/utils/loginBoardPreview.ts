import {
  filterCompanyNoticesByBoard,
  normalizeCompanyNotices,
  sortCompanyNotices,
  type CompanyNotice,
} from "@/utils/companyNotices";
import { isApiModeEnabled } from "@/utils/erpApi";
import { normalizeWorkPosts, sortWorkPosts, type WorkPost } from "@/utils/workBoard";

const STORAGE_KEY = "teammillimeter-erp-stable-v1";
const PREVIEW_LIMIT = 5;

export type LoginBoardNoticePreview = {
  id: string;
  title: string;
  body: string;
  isPinned?: boolean;
  createdAt: string;
};

export type LoginBoardWorkPostPreview = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  attachmentCount: number;
};

export type LoginBoardPreview = {
  notices: LoginBoardNoticePreview[];
  workPosts: LoginBoardWorkPostPreview[];
};

function toNoticePreview(notice: CompanyNotice): LoginBoardNoticePreview {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    isPinned: notice.isPinned,
    createdAt: notice.createdAt,
  };
}

function toWorkPostPreview(post: WorkPost): LoginBoardWorkPostPreview {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    attachmentCount: post.attachments?.length ?? 0,
  };
}

export function buildLoginBoardPreview(notices: CompanyNotice[], workPosts: WorkPost[]): LoginBoardPreview {
  return {
    notices: sortCompanyNotices(filterCompanyNoticesByBoard(notices, "notice"))
      .slice(0, PREVIEW_LIMIT)
      .map(toNoticePreview),
    workPosts: sortWorkPosts(workPosts).slice(0, PREVIEW_LIMIT).map(toWorkPostPreview),
  };
}

function loadFromLocalStorage(): LoginBoardPreview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { companyNotices?: unknown[]; workPosts?: unknown[] };
    return buildLoginBoardPreview(
      normalizeCompanyNotices(parsed.companyNotices),
      normalizeWorkPosts(parsed.workPosts),
    );
  } catch {
    return null;
  }
}

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

async function loadFromApi(): Promise<LoginBoardPreview | null> {
  try {
    const response = await fetch(`${apiBase()}/public/board-preview`);
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<LoginBoardPreview>;
    return {
      notices: Array.isArray(data.notices) ? data.notices : [],
      workPosts: Array.isArray(data.workPosts) ? data.workPosts : [],
    };
  } catch {
    return null;
  }
}

export async function loadLoginBoardPreview(): Promise<LoginBoardPreview> {
  if (isApiModeEnabled()) {
    const fromApi = await loadFromApi();
    if (fromApi) return fromApi;
  }
  return loadFromLocalStorage() || { notices: [], workPosts: [] };
}
