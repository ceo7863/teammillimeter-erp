import { canUserAccessPage } from "@/utils/pageAccess";
import type { ErpUser } from "@/utils/erpApi";
import { getSaleWorkerLines } from "@/utils/saleBilling";

export type SaleReviewStatus = "pending" | "confirmed" | "needs_review" | "on_hold";
export type SaleCommentKind = "note" | "confirm" | "question" | "hold" | "reply";
export type SaleReviewTargetRole = "registrar" | "settler";

export type SaleComment = {
  id: string;
  saleId: string;
  body: string;
  authorName: string;
  authorEmail?: string;
  createdAt: string;
  kind?: SaleCommentKind;
  reviewStatus?: SaleReviewStatus;
  targetRole?: SaleReviewTargetRole;
};

export type PendingSaleComment = {
  id: string;
  body: string;
  authorName: string;
  authorEmail?: string;
  createdAt: string;
  kind?: SaleCommentKind;
};

export const SALE_REVIEW_STATUS_LABELS: Record<SaleReviewStatus, string> = {
  pending: "결제확인대기",
  confirmed: "확인완료",
  needs_review: "확인필요",
  on_hold: "보류",
};

export const SALE_COMMENT_KIND_LABELS: Record<SaleCommentKind, string> = {
  note: "등록",
  confirm: "확인완료",
  question: "확인필요",
  hold: "보류",
  reply: "추가",
};

export const SALE_COMMENT_TEMPLATES = [
  "야근 있음",
  "식대 별도",
  "청구단가 조정",
  "SC 인원 불일치",
] as const;

const REVIEW_STATUS_SET = new Set<string>(["pending", "confirmed", "needs_review", "on_hold"]);
const COMMENT_KIND_SET = new Set<string>(["note", "confirm", "question", "hold", "reply"]);
const TARGET_ROLE_SET = new Set<string>(["registrar", "settler"]);

export function normalizeSaleReviewStatus(value: unknown): SaleReviewStatus | undefined {
  const raw = String(value || "").trim();
  return REVIEW_STATUS_SET.has(raw) ? (raw as SaleReviewStatus) : undefined;
}

export function normalizeSaleCommentKind(value: unknown): SaleCommentKind | undefined {
  const raw = String(value || "").trim();
  return COMMENT_KIND_SET.has(raw) ? (raw as SaleCommentKind) : undefined;
}

export function normalizeSaleReviewTargetRole(value: unknown): SaleReviewTargetRole | undefined {
  const raw = String(value || "").trim();
  return TARGET_ROLE_SET.has(raw) ? (raw as SaleReviewTargetRole) : undefined;
}

export function makeSaleCommentId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `sale-comment-${crypto.randomUUID()}`;
  return `sale-comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeSaleComments(rows: unknown): SaleComment[] {
  if (!Array.isArray(rows)) return [];
  const result: SaleComment[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<SaleComment>;
    const id = String(row.id || "").trim();
    const saleId = String(row.saleId || "").trim();
    const body = String(row.body || "").trim();
    const authorName = String(row.authorName || "").trim();
    const createdAt = String(row.createdAt || "").trim();
    if (!id || !saleId || !body || !authorName || !createdAt || seen.has(id)) continue;
    seen.add(id);
    const kind = normalizeSaleCommentKind(row.kind);
    const reviewStatus = normalizeSaleReviewStatus(row.reviewStatus);
    const targetRole = normalizeSaleReviewTargetRole(row.targetRole);
    result.push({
      id,
      saleId,
      body,
      authorName,
      authorEmail: row.authorEmail ? String(row.authorEmail) : undefined,
      createdAt,
      ...(kind ? { kind } : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
      ...(targetRole ? { targetRole } : {}),
    });
  }
  return result.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function listSaleComments(comments: SaleComment[], saleId: string | number | null | undefined) {
  if (saleId == null || saleId === "") return [];
  const key = String(saleId);
  return comments.filter((row) => row.saleId === key);
}

export function createSaleComment(input: {
  saleId: string | number;
  body: string;
  user?: { name?: string; email?: string } | null;
  createdAt?: string;
  kind?: SaleCommentKind;
  reviewStatus?: SaleReviewStatus;
  targetRole?: SaleReviewTargetRole;
}): SaleComment {
  const body = String(input.body || "").trim();
  const kind = input.kind || "reply";
  return {
    id: makeSaleCommentId(),
    saleId: String(input.saleId),
    body,
    authorName: String(input.user?.name || input.user?.email || "???").trim() || "???",
    authorEmail: input.user?.email ? String(input.user.email) : undefined,
    createdAt: input.createdAt || new Date().toISOString(),
    kind,
    ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
    ...(input.targetRole ? { targetRole: input.targetRole } : {}),
  };
}

export function createReviewComment(input: {
  saleId: string | number;
  kind: SaleCommentKind;
  body?: string;
  reviewStatus?: SaleReviewStatus;
  targetRole?: SaleReviewTargetRole;
  user?: { name?: string; email?: string } | null;
  createdAt?: string;
}): SaleComment {
  const defaultBodies: Record<SaleCommentKind, string> = {
    note: "",
    confirm: "결제 확인 완료",
    question: "확인이 필요합니다",
    hold: "보류 처리",
    reply: "",
  };
  const body = String(input.body ?? defaultBodies[input.kind]).trim() || defaultBodies[input.kind];
  return createSaleComment({
    saleId: input.saleId,
    body,
    user: input.user,
    createdAt: input.createdAt,
    kind: input.kind,
    reviewStatus: input.reviewStatus,
    targetRole: input.targetRole,
  });
}

export function createPendingSaleComment(
  body: string,
  user?: { name?: string; email?: string } | null,
  kind: SaleCommentKind = "note",
): PendingSaleComment {
  return {
    id: makeSaleCommentId(),
    body: String(body || "").trim(),
    authorName: String(user?.name || user?.email || "???").trim() || "???",
    authorEmail: user?.email ? String(user.email) : undefined,
    createdAt: new Date().toISOString(),
    kind,
  };
}

export function deriveReviewStatusFromComments(comments: SaleComment[]): SaleReviewStatus | null {
  const sorted = [...comments].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  for (const row of sorted) {
    if (row.reviewStatus) return row.reviewStatus;
    if (row.kind === "confirm") return "confirmed";
    if (row.kind === "question") return "needs_review";
    if (row.kind === "hold") return "on_hold";
    if (row.kind === "note") return "pending";
  }
  return null;
}

export function resolveSaleReviewStatus(
  sale: { reviewStatus?: SaleReviewStatus | string; id?: string | number } | null | undefined,
  comments: SaleComment[] = [],
): SaleReviewStatus | null {
  if (!sale) return null;
  const fromSale = normalizeSaleReviewStatus(sale.reviewStatus);
  if (fromSale) return fromSale;
  const saleComments = listSaleComments(comments, sale.id);
  if (!saleComments.length) return null;
  return deriveReviewStatusFromComments(saleComments) ?? "pending";
}

export function normalizeSaleRecordReview<T extends { reviewStatus?: unknown; reviewUpdatedAt?: unknown; id?: string | number }>(
  sale: T,
  comments: SaleComment[] = [],
): T {
  const existing = normalizeSaleReviewStatus(sale.reviewStatus);
  const reviewUpdatedAt = sale.reviewUpdatedAt ? String(sale.reviewUpdatedAt) : undefined;
  if (existing) {
    return {
      ...sale,
      reviewStatus: existing,
      ...(reviewUpdatedAt ? { reviewUpdatedAt } : {}),
    };
  }
  const saleComments = listSaleComments(comments, sale.id);
  if (!saleComments.length) return sale;
  const derived = deriveReviewStatusFromComments(saleComments);
  if (!derived) return sale;
  return { ...sale, reviewStatus: derived };
}

export type SaleReviewAction = "confirm" | "question" | "hold" | "reply" | "note";

export function applyReviewAction(input: {
  action: SaleReviewAction;
  sale: Record<string, unknown> & { id: string | number; reviewStatus?: SaleReviewStatus | string };
  body?: string;
  user?: { name?: string; email?: string } | null;
}): { sale: Record<string, unknown> & { id: string | number; reviewStatus?: SaleReviewStatus; reviewUpdatedAt?: string }; comment: SaleComment } {
  const now = new Date().toISOString();
  const currentStatus = normalizeSaleReviewStatus(input.sale.reviewStatus);

  if (input.action === "confirm") {
    const comment = createReviewComment({
      saleId: input.sale.id,
      kind: "confirm",
      body: input.body,
      reviewStatus: "confirmed",
      targetRole: "registrar",
      user: input.user,
    });
    return {
      sale: { ...input.sale, reviewStatus: "confirmed", reviewUpdatedAt: now },
      comment,
    };
  }

  if (input.action === "question") {
    const comment = createReviewComment({
      saleId: input.sale.id,
      kind: "question",
      body: input.body,
      reviewStatus: "needs_review",
      targetRole: "registrar",
      user: input.user,
    });
    return {
      sale: { ...input.sale, reviewStatus: "needs_review", reviewUpdatedAt: now },
      comment,
    };
  }

  if (input.action === "hold") {
    const comment = createReviewComment({
      saleId: input.sale.id,
      kind: "hold",
      body: input.body,
      reviewStatus: "on_hold",
      targetRole: "registrar",
      user: input.user,
    });
    return {
      sale: { ...input.sale, reviewStatus: "on_hold", reviewUpdatedAt: now },
      comment,
    };
  }

  const isReply = input.action === "reply";
  const nextStatus: SaleReviewStatus =
    isReply && currentStatus === "needs_review" ? "pending" : currentStatus || "pending";
  const comment = createReviewComment({
    saleId: input.sale.id,
    kind: isReply ? "reply" : "note",
    body: input.body,
    reviewStatus: nextStatus,
    targetRole: "settler",
    user: input.user,
  });
  return {
    sale: { ...input.sale, reviewStatus: nextStatus, reviewUpdatedAt: now },
    comment,
  };
}

export function resolveSaleReviewUserRole(
  user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined,
): "settler" | "registrar" | "both" | null {
  if (!user) return null;
  if (user.role === "admin") return "both";
  const isSettler = canUserAccessPage(user, "workerPayments");
  const isRegistrar = canUserAccessPage(user, "salesInput");
  if (isSettler && isRegistrar) return "both";
  if (isSettler) return "settler";
  if (isRegistrar) return "registrar";
  return null;
}

export function canUserActAsSettler(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined) {
  const role = resolveSaleReviewUserRole(user);
  return role === "settler" || role === "both";
}

export function canUserActAsRegistrar(user: Pick<ErpUser, "role" | "allowedPages"> | null | undefined) {
  const role = resolveSaleReviewUserRole(user);
  return role === "registrar" || role === "both";
}

export function countSalesNeedingReviewForRole(
  sales: Array<{ id?: string | number; reviewStatus?: SaleReviewStatus | string }>,
  comments: SaleComment[],
  role: "settler" | "registrar",
): number {
  let count = 0;
  for (const sale of sales) {
    const status = resolveSaleReviewStatus(sale, comments);
    if (!status) continue;
    if (role === "settler" && (status === "pending" || status === "on_hold")) count += 1;
    if (role === "registrar" && status === "needs_review") count += 1;
  }
  return count;
}

export function saleMatchesReviewFilter(
  sale: { id?: string | number; reviewStatus?: SaleReviewStatus | string },
  comments: SaleComment[],
  filter: SaleReviewStatus | "unconfirmed" | "all",
): boolean {
  if (filter === "all") return true;
  const status = resolveSaleReviewStatus(sale, comments);
  if (!status) return filter === "all";
  if (filter === "unconfirmed") return status === "pending" || status === "needs_review";
  return status === filter;
}

type SaleLikeForWorkerGuard = {
  id?: string | number;
  date?: string;
  client?: string;
  site?: string;
  reviewStatus?: SaleReviewStatus | string;
  worker?: string;
  workers?: Array<{ worker?: string }>;
};

export function findUnconfirmedSalesForWorkerMonth(
  sales: SaleLikeForWorkerGuard[],
  worker: string,
  monthKey: string,
  comments: SaleComment[] = [],
): Array<{ id: string | number; client: string; site: string; date: string; reviewStatus: SaleReviewStatus }> {
  const workerKey = String(worker || "").trim();
  const month = String(monthKey || "").trim();
  if (!workerKey || !/^\d{4}-\d{2}$/.test(month)) return [];

  const hits: Array<{ id: string | number; client: string; site: string; date: string; reviewStatus: SaleReviewStatus }> = [];
  for (const sale of sales) {
    const date = String(sale.date || "");
    if (!date.startsWith(month)) continue;
    const lines = getSaleWorkerLines(sale);
    const hasWorker = lines.some((line) => String(line.worker || "").trim() === workerKey)
      || String(sale.worker || "").split(",").map((name) => name.trim()).includes(workerKey);
    if (!hasWorker) continue;
    const status = resolveSaleReviewStatus(sale, comments);
    if (!status || status === "confirmed") continue;
    hits.push({
      id: sale.id ?? "",
      client: String(sale.client || "").trim() || "-",
      site: String(sale.site || "").trim() || "-",
      date,
      reviewStatus: status,
    });
  }
  return hits;
}

export function formatUnconfirmedSalesWarning(
  rows: Array<{ client: string; site: string; date: string; reviewStatus: SaleReviewStatus }>,
) {
  if (!rows.length) return "";
  const preview = rows.slice(0, 5).map((row) => {
    const label = SALE_REVIEW_STATUS_LABELS[row.reviewStatus];
    return `${row.date} ${row.client} · ${row.site} (${label})`;
  });
  const suffix = rows.length > 5 ? `\n외 ${rows.length - 5}건` : "";
  return `결제 확인이 완료되지 않은 매출전표가 ${rows.length}건 포함되어 있습니다.\n\n${preview.join("\n")}${suffix}\n\n그래도 지급 처리를 계속할까요?`;
}

export function confirmUnconfirmedWorkerPaymentProceed(
  sales: SaleLikeForWorkerGuard[],
  worker: string,
  monthKey: string,
  comments: SaleComment[] = [],
) {
  const rows = findUnconfirmedSalesForWorkerMonth(sales, worker, monthKey, comments);
  if (!rows.length) return true;
  if (typeof window === "undefined") return true;
  return window.confirm(formatUnconfirmedSalesWarning(rows));
}

export function appendSaleComment(comments: SaleComment[], comment: SaleComment) {
  return normalizeSaleComments([...comments, comment]);
}

export function appendSaleComments(comments: SaleComment[], next: SaleComment[]) {
  return normalizeSaleComments([...comments, ...next]);
}

export function mergeSaleComments(server: SaleComment[], local: SaleComment[]) {
  const merged = new Map<string, SaleComment>();
  for (const row of normalizeSaleComments(server)) {
    merged.set(row.id, row);
  }
  for (const row of normalizeSaleComments(local)) {
    merged.set(row.id, row);
  }
  return normalizeSaleComments([...merged.values()]);
}

export function pendingCommentsToSaleComments(
  pending: PendingSaleComment[],
  saleId: string | number,
): SaleComment[] {
  const key = String(saleId);
  return pending.map((row) => ({
    id: row.id,
    saleId: key,
    body: row.body,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    createdAt: row.createdAt,
    kind: row.kind || "note",
    reviewStatus: "pending" as SaleReviewStatus,
    targetRole: "settler" as SaleReviewTargetRole,
  }));
}

export function formatSaleCommentTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildSaleCommentCountBySaleId(comments: SaleComment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of comments) {
    const key = String(row.saleId);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export function getSaleCommentCount(
  saleCommentCounts: Map<string, number>,
  saleId?: string | number | null,
): number {
  if (saleId == null || saleId === "") return 0;
  return saleCommentCounts.get(String(saleId)) || 0;
}

const SALE_COMMENTS_SEEN_STORAGE_PREFIX = "erp-sale-comments-seen-at";

export function getSaleCommentsSeenAt(userId?: string | number | null): string | null {
  if (userId == null || userId === "") return null;
  try {
    return window.localStorage.getItem(`${SALE_COMMENTS_SEEN_STORAGE_PREFIX}:${userId}`);
  } catch {
    return null;
  }
}

export function setSaleCommentsSeenAt(userId: string | number, seenAt = new Date().toISOString()) {
  try {
    window.localStorage.setItem(`${SALE_COMMENTS_SEEN_STORAGE_PREFIX}:${userId}`, seenAt);
  } catch {
    // ignore storage errors
  }
}

function isSaleCommentByCurrentUser(
  comment: SaleComment,
  currentUser?: { name?: string; email?: string; loginId?: string } | null,
) {
  if (!currentUser) return false;
  const authorName = comment.authorName.trim();
  const authorEmail = comment.authorEmail?.trim() || "";
  const names = [currentUser.name, currentUser.loginId, currentUser.email]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (authorName && names.includes(authorName)) return true;
  if (authorEmail && names.includes(authorEmail)) return true;
  return false;
}

export function isUnreadSaleComment(
  comment: SaleComment,
  seenAt: string | null | undefined,
  currentUser?: { name?: string; email?: string; loginId?: string } | null,
) {
  if (!seenAt) return false;
  if (isSaleCommentByCurrentUser(comment, currentUser)) return false;
  return String(comment.createdAt).localeCompare(String(seenAt)) > 0;
}

export function countUnreadSaleComments(
  comments: SaleComment[],
  seenAt: string | null | undefined,
  currentUser?: { name?: string; email?: string; loginId?: string } | null,
) {
  return comments.filter((row) => isUnreadSaleComment(row, seenAt, currentUser)).length;
}

export function buildUnreadSaleCommentCountBySaleId(
  comments: SaleComment[],
  seenAt: string | null | undefined,
  currentUser?: { name?: string; email?: string; loginId?: string } | null,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of comments) {
    if (!isUnreadSaleComment(row, seenAt, currentUser)) continue;
    const key = String(row.saleId);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export function getUnreadSaleCommentCount(
  unreadCounts: Map<string, number>,
  saleId?: string | number | null,
): number {
  if (saleId == null || saleId === "") return 0;
  return unreadCounts.get(String(saleId)) || 0;
}
