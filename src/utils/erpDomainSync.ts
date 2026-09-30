import type { ErpDomainChangeEvent } from "@/utils/erpDomainEventHub";

/** Fallback poll interval when the domain SSE stream is down (≤15s). */
export const ERP_STREAM_FALLBACK_POLL_MS = 10000;

/** Light version poll is fine while the stream is healthy. */
export const ERP_VERSION_POLL_HEALTHY_MS = 30000;

const DATE_SCOPED_DOMAINS = new Set(["sales", "settings"]);

function monthBounds(monthKey: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = `${monthKey}-01`;
  const end = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function rangesOverlap(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

/**
 * Decide whether a domain-change event requires refetching the current calendar viewport.
 * - `sales` / `settings`: refetch when affected range is unknown/null OR overlaps viewingMonthKey.
 * - Viewing another month with no overlap → false (bump revision only).
 * - Other domains always require refetch.
 */
export function shouldRefetchForViewport(opts: {
  domains: string[];
  affectedDateFrom?: string | null;
  affectedDateTo?: string | null;
  viewingMonthKey?: string | null; // YYYY-MM
}): boolean {
  const domains = (opts.domains || []).map(String).filter(Boolean);
  if (domains.length === 0) return false;

  const hasOther = domains.some((d) => !DATE_SCOPED_DOMAINS.has(d));
  if (hasOther) return true;

  const from = opts.affectedDateFrom ? String(opts.affectedDateFrom).slice(0, 10) : null;
  const to = opts.affectedDateTo ? String(opts.affectedDateTo).slice(0, 10) : null;
  if (!from && !to) return true;

  const monthKey = opts.viewingMonthKey ? String(opts.viewingMonthKey).slice(0, 7) : null;
  if (!monthKey) return true;

  const bounds = monthBounds(monthKey);
  if (!bounds) return true;

  const rangeFrom = from || to!;
  const rangeTo = to || from!;
  return rangesOverlap(bounds.start, bounds.end, rangeFrom, rangeTo);
}

function minDate(a: string | null, b: string | null): string | null {
  if (a == null || b == null) return null;
  return a <= b ? a : b;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (a == null || b == null) return null;
  return a >= b ? a : b;
}

/** Merge a burst of domain-change events into one apply plan. */
export function coalesceDomainEvents(events: ErpDomainChangeEvent[]): {
  globalVersion: number;
  domains: string[];
  entityIds: string[];
  affectedDateFrom: string | null;
  affectedDateTo: string | null;
  eventIds: string[];
} {
  const domainSet = new Set<string>();
  const entitySet = new Set<string>();
  const eventIds: string[] = [];
  let globalVersion = 0;
  let affectedDateFrom: string | null = null;
  let affectedDateTo: string | null = null;
  let rangeInitialized = false;

  for (const event of events || []) {
    if (!event || event.type !== "erp.domain_change") continue;
    const version = Number(event.globalVersion) || 0;
    if (version > globalVersion) globalVersion = version;
    if (event.eventId) eventIds.push(String(event.eventId));
    for (const d of event.domains || []) {
      if (d) domainSet.add(String(d));
    }
    for (const id of event.entityIds || []) {
      if (id != null && id !== "") entitySet.add(String(id));
    }

    const from = event.affectedDateFrom ? String(event.affectedDateFrom).slice(0, 10) : null;
    const to = event.affectedDateTo ? String(event.affectedDateTo).slice(0, 10) : null;
    if (!rangeInitialized) {
      affectedDateFrom = from;
      affectedDateTo = to;
      rangeInitialized = true;
    } else {
      affectedDateFrom = minDate(affectedDateFrom, from);
      affectedDateTo = maxDate(affectedDateTo, to);
    }
  }

  return {
    globalVersion,
    domains: [...domainSet],
    entityIds: [...entitySet],
    affectedDateFrom,
    affectedDateTo,
    eventIds,
  };
}

/**
 * Receipt / AR-adjustment ledgers are written only by dedicated server APIs (generic
 * autosave seals them), so a refetch can never clobber a local draft and runs immediately.
 */
export const FINANCE_LEDGER_DOMAINS = ["receipts", "arAdjustments"] as const;

/** Everything the calendar / 입금·미수 / 보고서 balance depends on. */
export const FULL_FINANCE_REVALIDATION_DOMAINS = [
  "sales",
  "receipts",
  "arAdjustments",
  "bankTransactions",
] as const;

export function planFinanceRefetch(domains: string[]): { ledgers: boolean; bank: boolean } {
  const set = new Set((domains || []).map(String));
  return {
    ledgers: FINANCE_LEDGER_DOMAINS.some((domain) => set.has(domain)),
    bank: set.has("bankTransactions"),
  };
}

/**
 * The stream `erp.hello` carries the server version at (re)connect. Anything ahead of the
 * client means events were missed while disconnected, so every finance domain is revalidated.
 */
export function needsFullFinanceRevalidation(opts: {
  helloVersion: number | null | undefined;
  knownVersion: number;
}): boolean {
  const hello = Number(opts.helloVersion) || 0;
  return hello > 0 && hello > (Number(opts.knownVersion) || 0);
}

/** True when a payload is older than the client's known revision and must not be applied. */
export function isStaleDomainResponse(opts: {
  responseVersion: number;
  knownVersion: number;
}): boolean {
  return Number(opts.responseVersion) < Number(opts.knownVersion);
}

export type SaleEditConflictState = {
  saleId: string;
  localDraftUpdatedAt?: string;
  serverUpdatedAt?: string;
  message: string;
};

/**
 * Detect if the sale currently being edited was updated by another client/session.
 */
export function detectSaleEditConflict(opts: {
  editingSaleId: string | number | null;
  editingSnapshotUpdatedAt?: string | null;
  incomingSales: Array<{ id?: string | number; updatedAt?: string }>;
}): SaleEditConflictState | null {
  if (opts.editingSaleId == null || opts.editingSaleId === "") return null;
  const saleId = String(opts.editingSaleId);
  const incoming = (opts.incomingSales || []).find((row) => String(row?.id) === saleId);
  if (!incoming) return null;

  const serverUpdatedAt = incoming.updatedAt ? String(incoming.updatedAt) : undefined;
  const localDraftUpdatedAt = opts.editingSnapshotUpdatedAt
    ? String(opts.editingSnapshotUpdatedAt)
    : undefined;

  if (!serverUpdatedAt) return null;
  if (!localDraftUpdatedAt) {
    return {
      saleId,
      localDraftUpdatedAt,
      serverUpdatedAt,
      message: "편집 중인 매출이 다른 사용자에 의해 변경되었습니다.",
    };
  }
  if (serverUpdatedAt <= localDraftUpdatedAt) return null;

  return {
    saleId,
    localDraftUpdatedAt,
    serverUpdatedAt,
    message: "편집 중인 매출이 다른 사용자에 의해 변경되었습니다.",
  };
}
