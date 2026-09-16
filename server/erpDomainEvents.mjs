/**
 * ERP domain change events — published ONLY after durable commit.
 * Payload is revision metadata only (no customer financial fields).
 */
import crypto from "crypto";

const subscribers = new Set();
const recentEvents = [];
const RECENT_LIMIT = 200;

function heartbeat(res) {
  try {
    res.write(": ping\n\n");
  } catch {
    // ignore
  }
}

function writeEvent(res, payload) {
  try {
    res.write(`id: ${payload.eventId}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    res.flush?.();
  } catch {
    // ignore
  }
}

function makeEventId() {
  return `ede_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function resolveSubscribeGlobalVersion(options = {}) {
  if (typeof options.getGlobalVersion === "function") {
    try {
      return Number(options.getGlobalVersion()) || 0;
    } catch {
      return 0;
    }
  }
  if (options.globalVersion != null && options.globalVersion !== "") {
    return Number(options.globalVersion) || 0;
  }
  return 0;
}

/**
 * @param {number|string} userId
 * @param {import("http").ServerResponse} res
 * @param {{ globalVersion?: number, getGlobalVersion?: () => number }} [options]
 */
export function subscribeErpDomainEvents(userId, res, options = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(": connected\n\n");

  const globalVersion = resolveSubscribeGlobalVersion(options);
  writeEvent(res, {
    type: "erp.hello",
    eventId: makeEventId(),
    globalVersion,
  });

  const entry = { userId: uid, res };
  subscribers.add(entry);

  const timer = setInterval(() => heartbeat(res), 15000);
  const onClose = () => {
    clearInterval(timer);
    res.off?.("close", onClose);
    subscribers.delete(entry);
  };
  res.on("close", onClose);
}

export function countErpDomainSubscribers() {
  return subscribers.size;
}

export function resetErpDomainSubscribersForTests() {
  subscribers.clear();
  recentEvents.length = 0;
}

export function listRecentErpDomainEventsForTests() {
  return [...recentEvents];
}

/**
 * Build a privacy-safe event from save result.
 * Never include client names, amounts, memos, or full entities.
 */
export function buildErpDomainChangeEvent({
  globalVersion,
  domains = [],
  changeType = "domain_save",
  entityIds = [],
  affectedDateFrom = null,
  affectedDateTo = null,
  actorUserId = null,
  source = "erp_save",
  correlationId = null,
  committedAt = null,
} = {}) {
  const gv = Number(globalVersion) || 0;
  return {
    type: "erp.domain_change",
    eventId: makeEventId(),
    globalVersion: gv,
    domainRevision: gv,
    domains: [...new Set((domains || []).map((d) => String(d)).filter(Boolean))],
    changeType: String(changeType || "domain_save"),
    entityIds: [...new Set((entityIds || []).map((id) => String(id)).filter(Boolean))].slice(0, 200),
    affectedDateFrom: affectedDateFrom ? String(affectedDateFrom).slice(0, 10) : null,
    affectedDateTo: affectedDateTo ? String(affectedDateTo).slice(0, 10) : null,
    actorUserId: actorUserId == null || actorUserId === "" ? null : String(actorUserId),
    committedAt: committedAt || new Date().toISOString(),
    source: String(source || "erp_save"),
    correlationId: correlationId ? String(correlationId) : null,
  };
}

/** Extract sale ids + date range without copying financial fields into the event. */
export function extractSalesChangeHints(sales = []) {
  const entityIds = [];
  let minDate = null;
  let maxDate = null;
  for (const row of sales || []) {
    if (row?.id == null) continue;
    entityIds.push(String(row.id));
    const d = String(row.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  }
  return { entityIds, affectedDateFrom: minDate, affectedDateTo: maxDate };
}

/**
 * Publish AFTER durable commit. Broadcast to all authenticated ERP stream subscribers.
 * Does not include sensitive payloads.
 */
export function publishErpDomainChange(eventInput) {
  const event =
    eventInput && eventInput.type === "erp.domain_change"
      ? eventInput
      : buildErpDomainChangeEvent(eventInput || {});
  if (!event.globalVersion || !event.domains?.length) return event;

  // Ensure alias is present even if callers pass a pre-built event.
  if (event.domainRevision == null) {
    event.domainRevision = Number(event.globalVersion) || 0;
  }

  recentEvents.push(event);
  if (recentEvents.length > RECENT_LIMIT) recentEvents.splice(0, recentEvents.length - RECENT_LIMIT);

  for (const entry of subscribers) {
    writeEvent(entry.res, event);
  }
  return event;
}

/**
 * Assert helper for tests: event must not contain sensitive keys.
 */
export function assertErpDomainEventPrivacy(event) {
  const raw = JSON.stringify(event || {});
  const forbidden = [
    "grossAmount",
    "amount",
    "paid",
    "clientName",
    "counterparty",
    "accountNumber",
    "memo",
    "workers",
    "receipts",
    "paymentVouchers",
  ];
  for (const key of forbidden) {
    if (raw.includes(`"${key}"`)) {
      const err = new Error(`ERP domain event contains forbidden key: ${key}`);
      err.code = "EVENT_PRIVACY_VIOLATION";
      throw err;
    }
  }
  return true;
}
