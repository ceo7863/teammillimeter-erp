export type SaleComment = {
  id: string;
  saleId: string;
  body: string;
  authorName: string;
  authorEmail?: string;
  createdAt: string;
};

export type PendingSaleComment = {
  id: string;
  body: string;
  authorName: string;
  authorEmail?: string;
  createdAt: string;
};

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
    result.push({
      id,
      saleId,
      body,
      authorName,
      authorEmail: row.authorEmail ? String(row.authorEmail) : undefined,
      createdAt,
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
}): SaleComment {
  const body = String(input.body || "").trim();
  return {
    id: makeSaleCommentId(),
    saleId: String(input.saleId),
    body,
    authorName: String(input.user?.name || input.user?.email || "???").trim() || "???",
    authorEmail: input.user?.email ? String(input.user.email) : undefined,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function createPendingSaleComment(
  body: string,
  user?: { name?: string; email?: string } | null,
): PendingSaleComment {
  return {
    id: makeSaleCommentId(),
    body: String(body || "").trim(),
    authorName: String(user?.name || user?.email || "???").trim() || "???",
    authorEmail: user?.email ? String(user.email) : undefined,
    createdAt: new Date().toISOString(),
  };
}

export function appendSaleComment(comments: SaleComment[], comment: SaleComment) {
  return normalizeSaleComments([...comments, comment]);
}

export function appendSaleComments(comments: SaleComment[], next: SaleComment[]) {
  return normalizeSaleComments([...comments, ...next]);
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
