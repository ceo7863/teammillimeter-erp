import crypto from "crypto";
import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";

const MAX_REQUESTS = 5000;

function listClients(data = {}) {
  return Array.isArray(data.clients) ? data.clients : [];
}

function listRequests(data = {}) {
  return Array.isArray(data.clientSiteRequests) ? data.clientSiteRequests : [];
}

function clientIdsEqual(a, b) {
  return String(a ?? "") === String(b ?? "");
}

function findClientById(data, clientId) {
  return listClients(data).find((row) => clientIdsEqual(row.id, clientId)) || null;
}

function findClientByRequestToken(data, token) {
  const normalized = String(token || "").trim();
  if (!normalized) return null;
  return listClients(data).find((row) => String(row.siteRequestToken || "").trim() === normalized) || null;
}

function publicBaseUrl() {
  return String(config.alimtalk.erpBaseUrl || "").replace(/\/$/, "") || "https://erp.teammillimeter.com";
}

export function buildClientSiteRequestUrl(token) {
  return `${publicBaseUrl()}/request/${encodeURIComponent(token)}`;
}

function newToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function newRequestId() {
  return `csr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function newMessageId() {
  return `csrm-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((row) => row && typeof row === "object")
    .map((row) => ({
      id: String(row.id || newMessageId()),
      sender: row.sender === "staff" ? "staff" : "client",
      body: String(row.body || "").trim().slice(0, 2000),
      senderName: String(row.senderName || "").trim().slice(0, 80),
      createdAt: String(row.createdAt || new Date().toISOString()),
    }))
    .filter((row) => row.body)
    .slice(-200);
}

function sanitizePublicClientSiteRequest(row) {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    status: row.status,
    workDate: row.workDate,
    workDateEnd: row.workDateEnd,
    siteName: row.siteName,
    workerCount: row.workerCount,
    memo: row.memo,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    submittedAt: row.submittedAt,
    receiptCompletedAt: row.receiptCompletedAt || null,
    registerCompletedAt: row.registerCompletedAt || null,
    cancelRequestedAt: row.cancelRequestedAt || null,
    messages: normalizeMessages(row.messages),
    lastMessageAt: row.lastMessageAt,
    unreadByClient: Boolean(row.unreadByClient),
  };
}

function isPublicCalendarVisibleStatus(status) {
  return String(status || "") !== "cancelled";
}

function findRequestForToken(data, token, requestId) {
  const client = findClientByRequestToken(data, token);
  if (!client) return { ok: false, status: 404, error: "\uC720\uD9A8\uD558\uC9C0 \uC54A\uC740 \uC811\uC218 \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  if (client.siteRequestLinkDisabled) {
    return { ok: false, status: 403, error: "\uD604\uC7AC \uC811\uC218\uAC00 \uC911\uB2E8\uB41C \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  const request = listRequests(data).find(
    (row) => row.id === requestId && clientIdsEqual(row.clientId, client.id),
  );
  if (!request) {
    return { ok: false, status: 404, error: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  return { ok: true, client, request };
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}

function normalizeWorkerCount(value) {
  const num = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(num) || num < 1 || num > 999) return 0;
  return num;
}

const MAX_WORK_PERIOD_DAYS = 62;

function countInclusiveDays(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const diff = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

function normalizeWorkDateRange(startValue, endValue) {
  const workDate = normalizeDate(startValue);
  if (!workDate) {
    return { ok: false, status: 400, error: "\uC791\uC5C5 \uC2DC\uC791\uC77C\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694." };
  }
  const normalizedEnd = normalizeDate(endValue);
  const workDateEnd = normalizedEnd || workDate;
  if (workDateEnd < workDate) {
    return { ok: false, status: 400, error: "\uC885\uB8CC\uC77C\uC740 \uC2DC\uC791\uC77C\uBCF4\uB2E4 \uBE60\uB984 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const dayCount = countInclusiveDays(workDate, workDateEnd);
  if (dayCount > MAX_WORK_PERIOD_DAYS) {
    return {
      ok: false,
      status: 400,
      error: `\uC791\uC5C5 \uAE30\uAC04\uC740 \uCD5C\uB300 ${MAX_WORK_PERIOD_DAYS}\uC77C\uAE4C\uC9C0 \uC811\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
    };
  }
  return {
    ok: true,
    workDate,
    workDateEnd: workDateEnd === workDate ? "" : workDateEnd,
  };
}

function saveClientsAndRequests(clients, requests, updatedBy = "client-site-request") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  data.clients = clients;
  data.clientSiteRequests = requests.slice(0, MAX_REQUESTS);
  saveErpState(data, state.version, String(updatedBy || "client-site-request"));
}

export function getPublicClientSiteRequestInfo(token) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const client = findClientByRequestToken(data, token);
  if (!client) {
    return { ok: false, status: 404, error: "\uC720\uD9A8\uD558\uC9C0 \uC54A\uC740 \uC811\uC218 \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  if (client.siteRequestLinkDisabled) {
    return { ok: false, status: 403, error: "\uD604\uC7AC \uC811\uC218\uAC00 \uC911\uB2E8\uB41C \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  return {
    ok: true,
    info: {
      clientName: String(client.name || "").trim() || "\uAC70\uB798\uCC98",
      companyName: "\uD300\uBC00\uB9AC\uBBF8\uD130",
    },
  };
}

export function submitClientSiteRequest(token, body = {}) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const client = findClientByRequestToken(data, token);
  if (!client) {
    return { ok: false, status: 404, error: "\uC720\uD9A8\uD558\uC9C0 \uC54A\uC740 \uC811\uC218 \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  if (client.siteRequestLinkDisabled) {
    return { ok: false, status: 403, error: "\uD604\uC7AC \uC811\uC218\uAC00 \uC911\uB2E8\uB41C \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }

  const workDateRange = normalizeWorkDateRange(body.workDate, body.workDateEnd);
  if (!workDateRange.ok) {
    return { ok: false, status: workDateRange.status || 400, error: workDateRange.error };
  }
  const { workDate, workDateEnd } = workDateRange;
  const siteName = String(body.siteName || "").trim();
  const workerCount = normalizeWorkerCount(body.workerCount);
  const memo = String(body.memo || "").trim().slice(0, 2000);
  const contactName = String(body.contactName || "").trim().slice(0, 80);
  const contactPhone = String(body.contactPhone || "").trim().slice(0, 40);

  if (!siteName) {
    return { ok: false, status: 400, error: "\uD604\uC7A5\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }
  if (!workerCount) {
    return { ok: false, status: 400, error: "\uD544\uC694 \uC778\uC6D0\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }

  const changeFromRequestId = String(body.changeFromRequestId || "").trim();
  const changeSourceSummary = String(body.changeSourceSummary || "").trim().slice(0, 500);
  let linkedChangeFromRequestId = "";
  let finalMemo = memo;
  if (changeFromRequestId) {
    const sourceRequest = listRequests(data).find(
      (row) => row.id === changeFromRequestId && clientIdsEqual(row.clientId, client.id),
    );
    if (sourceRequest) {
      linkedChangeFromRequestId = sourceRequest.id;
      const oldPeriod =
        sourceRequest.workDateEnd && sourceRequest.workDateEnd !== sourceRequest.workDate
          ? `${sourceRequest.workDate} ~ ${sourceRequest.workDateEnd}`
          : String(sourceRequest.workDate || "");
      const prefix = `[\uC77C\uC815 \uBCC0\uACBD \uC694\uCCAD] \uAE30\uC874 ${oldPeriod} \u00B7 ${String(sourceRequest.siteName || "").trim()}`;
      finalMemo = [prefix, changeSourceSummary, memo].filter(Boolean).join("\n").trim();
    }
  } else if (changeSourceSummary) {
    finalMemo = [`[\uC77C\uC815 \uBCC0\uACBD \uC694\uCCAD] ${changeSourceSummary}`, memo].filter(Boolean).join("\n").trim();
  }

  const now = new Date().toISOString();
  const request = {
    id: newRequestId(),
    clientId: client.id,
    clientName: String(client.name || "").trim(),
    token: String(token).trim(),
    status: "pending",
    workDate,
    ...(workDateEnd ? { workDateEnd } : {}),
    siteName,
    workerCount,
    memo: finalMemo.slice(0, 2000),
    contactName,
    contactPhone,
    submittedAt: now,
    processedAt: null,
    processedBy: null,
    processNote: "",
    receiptCompletedAt: null,
    receiptCompletedBy: null,
    registerCompletedAt: null,
    registerCompletedBy: null,
    messages: [],
    ...(linkedChangeFromRequestId ? { changeFromRequestId: linkedChangeFromRequestId } : {}),
  };

  const requests = [request, ...listRequests(data)];
  saveClientsAndRequests(listClients(data), requests, "client-site-request:submit");

  return { ok: true, request: sanitizePublicClientSiteRequest(request) };
}

export function listClientSiteRequests(filters = {}) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  let rows = listRequests(data);
  const status = String(filters.status || "").trim();
  const clientId = filters.clientId;
  if (status && status !== "all") {
    rows = rows.filter((row) => row.status === status);
  }
  if (clientId != null && String(clientId).trim() !== "") {
    rows = rows.filter((row) => clientIdsEqual(row.clientId, clientId));
  }
  return rows
    .map((row) => ({
      ...row,
      messages: normalizeMessages(row.messages),
    }))
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

export function listPublicClientSiteRequests(token) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const client = findClientByRequestToken(data, token);
  if (!client) {
    return { ok: false, status: 404, error: "\uC720\uD9A8\uD558\uC9C0 \uC54A\uC740 \uC811\uC218 \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  if (client.siteRequestLinkDisabled) {
    return { ok: false, status: 403, error: "\uD604\uC7AC \uC811\uC218\uAC00 \uC911\uB2E8\uB41C \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  }
  const rows = listRequests(data)
    .filter((row) => clientIdsEqual(row.clientId, client.id))
    .map((row) => sanitizePublicClientSiteRequest(row))
    .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))
    .slice(0, 50);
  return { ok: true, requests: rows };
}

function appendRequestMessage(data, requestId, message, updatedBy = "client-site-request:message") {
  const requests = listRequests(data);
  const index = requests.findIndex((row) => row.id === requestId);
  if (index < 0) {
    return { ok: false, status: 404, error: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const current = requests[index];
  const messages = [...normalizeMessages(current.messages), message].slice(-200);
  const next = {
    ...current,
    messages,
    lastMessageAt: message.createdAt,
    unreadByStaff: message.sender === "client",
    unreadByClient: message.sender === "staff",
  };
  requests[index] = next;
  saveClientsAndRequests(listClients(data), requests, updatedBy);
  return { ok: true, request: next, message };
}

export function postPublicClientSiteRequestMessage(token, requestId, body = {}) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const resolved = findRequestForToken(data, token, requestId);
  if (!resolved.ok) return resolved;

  const text = String(body.body || body.message || "").trim().slice(0, 2000);
  if (!text) {
    return { ok: false, status: 400, error: "\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }

  const message = {
    id: newMessageId(),
    sender: "client",
    body: text,
    senderName: String(body.senderName || resolved.request.contactName || resolved.client.name || "").trim().slice(0, 80),
    createdAt: new Date().toISOString(),
  };
  const result = appendRequestMessage(data, requestId, message, "client-site-request:public-message");
  if (!result.ok) return result;
  return { ok: true, request: sanitizePublicClientSiteRequest(result.request), message: result.message };
}

export function requestClientSiteRequestCancel(token, requestId) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const resolved = findRequestForToken(data, token, requestId);
  if (!resolved.ok) return resolved;

  const { request } = resolved;
  if (request.status === "cancel_pending") {
    return { ok: true, request: sanitizePublicClientSiteRequest(request) };
  }
  const status = String(request.status || "");
  if (status !== "pending" && status !== "confirmed") {
    return {
      ok: false,
      status: 400,
      error: "\uCDE8\uC18C \uC694\uCCAD\uC744 \uD560 \uC218 \uC788\uB294 \uC811\uC218\uB9CC \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
    };
  }

  const now = new Date().toISOString();
  const requests = listRequests(data);
  const index = requests.findIndex((row) => row.id === requestId);
  const next = {
    ...requests[index],
    status: "cancel_pending",
    cancelRestoreStatus: status,
    cancelRequestedAt: now,
    cancelRequestedBy: "client",
    unreadByStaff: true,
  };
  requests[index] = next;
  saveClientsAndRequests(listClients(data), requests, "client-site-request:cancel-request");

  return { ok: true, request: sanitizePublicClientSiteRequest(next) };
}

export function postStaffClientSiteRequestMessage(requestId, body = {}, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};

  const text = String(body.body || body.message || "").trim().slice(0, 2000);
  if (!text) {
    return { ok: false, status: 400, error: "\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }

  const message = {
    id: newMessageId(),
    sender: "staff",
    body: text,
    senderName: String(actor || "").trim().slice(0, 80),
    createdAt: new Date().toISOString(),
  };
  return appendRequestMessage(
    data,
    requestId,
    message,
    actor ? `client-site-request:staff-message:${actor}` : "client-site-request:staff-message",
  );
}

export function markClientSiteRequestRead(id, side = "staff") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const requests = listRequests(data);
  const index = requests.findIndex((row) => row.id === id);
  if (index < 0) {
    return { ok: false, status: 404, error: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  const current = requests[index];
  requests[index] = {
    ...current,
    unreadByStaff: side === "staff" ? false : current.unreadByStaff,
    unreadByClient: side === "client" ? false : current.unreadByClient,
  };
  saveClientsAndRequests(listClients(data), requests, "client-site-request:read");
  return { ok: true, request: requests[index] };
}

export function updateClientSiteRequestStatus(id, input = {}, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const requests = listRequests(data);
  const index = requests.findIndex((row) => row.id === id);
  if (index < 0) {
    return { ok: false, status: 404, error: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  const current = requests[index];
  const actorName = String(actor || "").trim();
  const processNote = String(input.processNote ?? current.processNote ?? "").trim().slice(0, 1000);
  const status = String(input.status || "").trim();
  const completionStep = String(input.completionStep || "").trim();

  if (completionStep === "receipt" || completionStep === "register") {
    if (current.status !== "pending") {
      return { ok: false, status: 400, error: "\uB300\uAE30 \uC911\uC778 \uC811\uC218\uB9CC \uC644\uB8CC \uCC98\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." };
    }

    const receiptCompletedAt = current.receiptCompletedAt || (completionStep === "receipt" ? now : null);
    const receiptCompletedBy =
      current.receiptCompletedBy || (completionStep === "receipt" ? actorName || current.receiptCompletedBy : null);
    const registerCompletedAt = current.registerCompletedAt || (completionStep === "register" ? now : null);
    const registerCompletedBy =
      current.registerCompletedBy || (completionStep === "register" ? actorName || current.registerCompletedBy : null);
    const bothDone = Boolean(receiptCompletedAt && registerCompletedAt);

    const next = {
      ...current,
      status: bothDone ? "confirmed" : "pending",
      processNote,
      receiptCompletedAt,
      receiptCompletedBy,
      registerCompletedAt,
      registerCompletedBy,
      processedAt: bothDone ? now : null,
      processedBy: bothDone ? actorName || current.processedBy : null,
    };
    requests[index] = next;
    saveClientsAndRequests(
      listClients(data),
      requests,
      actorName ? `client-site-request:step:${actorName}` : "client-site-request:step",
    );
    return { ok: true, request: next };
  }

  if (status !== "confirmed" && status !== "rejected" && status !== "pending" && status !== "cancelled") {
    return { ok: false, status: 400, error: "\uCC98\uB9AC \uC0C1\uD0DC\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }

  if (status === "confirmed") {
    return {
      ok: false,
      status: 400,
      error: "\uC811\uC218 \uC644\uB8CC\uC640 \uB4F1\uB85D \uC644\uB8CC\uB97C \uBAA8\uB450 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
    };
  }

  if (status === "cancelled") {
    if (current.status !== "cancel_pending") {
      return { ok: false, status: 400, error: "\uCDE8\uC18C \uC694\uCCAD \uC911\uC778 \uC811\uC218\uB9CC \uCDE8\uC18C \uD655\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." };
    }
    const next = {
      ...current,
      status: "cancelled",
      processNote,
      processedAt: now,
      processedBy: actorName || current.processedBy,
      cancelledAt: now,
      cancelledBy: actorName || current.cancelledBy,
      cancelRestoreStatus: null,
      unreadByStaff: false,
    };
    requests[index] = next;
    saveClientsAndRequests(
      listClients(data),
      requests,
      actorName ? `client-site-request:cancelled:${actorName}` : "client-site-request:cancelled",
    );
    return { ok: true, request: next };
  }

  if (current.status === "cancel_pending" && status === "pending") {
    const restoreStatus = String(current.cancelRestoreStatus || "pending");
    const next = {
      ...current,
      status: restoreStatus,
      processNote,
      cancelRequestedAt: null,
      cancelRequestedBy: null,
      cancelRestoreStatus: null,
      unreadByStaff: false,
    };
    requests[index] = next;
    saveClientsAndRequests(
      listClients(data),
      requests,
      actorName ? `client-site-request:cancel-denied:${actorName}` : "client-site-request:cancel-denied",
    );
    return { ok: true, request: next };
  }

  const next = {
    ...current,
    status,
    processNote,
    processedAt: status === "pending" ? null : now,
    processedBy: status === "pending" ? null : actorName || current.processedBy,
    receiptCompletedAt: status === "pending" ? null : current.receiptCompletedAt || null,
    receiptCompletedBy: status === "pending" ? null : current.receiptCompletedBy || null,
    registerCompletedAt: status === "pending" ? null : current.registerCompletedAt || null,
    registerCompletedBy: status === "pending" ? null : current.registerCompletedBy || null,
    cancelRequestedAt: status === "pending" ? null : current.cancelRequestedAt || null,
    cancelRequestedBy: status === "pending" ? null : current.cancelRequestedBy || null,
    cancelRestoreStatus: status === "pending" ? null : current.cancelRestoreStatus || null,
    cancelledAt: null,
    cancelledBy: null,
  };
  requests[index] = next;
  saveClientsAndRequests(
    listClients(data),
    requests,
    actorName ? `client-site-request:status:${actorName}` : "client-site-request:status",
  );
  return { ok: true, request: next };
}

export function ensureClientSiteRequestLink(clientId, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const clients = listClients(data);
  const index = clients.findIndex((row) => clientIdsEqual(row.id, clientId));
  if (index < 0) {
    return { ok: false, status: 404, error: "\uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  const client = clients[index];
  const token = String(client.siteRequestToken || "").trim() || newToken();
  const nextClient = {
    ...client,
    siteRequestToken: token,
    siteRequestLinkCreatedAt: client.siteRequestLinkCreatedAt || now,
    siteRequestLinkDisabled: false,
    siteRequestLinkUpdatedAt: now,
    siteRequestLinkUpdatedBy: String(actor || "").trim() || client.siteRequestLinkUpdatedBy,
  };
  clients[index] = nextClient;
  saveClientsAndRequests(
    clients,
    listRequests(data),
    actor ? `client-site-request:link:${actor}` : "client-site-request:link",
  );

  return {
    ok: true,
    clientId: nextClient.id,
    clientName: String(nextClient.name || "").trim(),
    token,
    url: buildClientSiteRequestUrl(token),
    disabled: false,
  };
}

export function rotateClientSiteRequestLink(clientId, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const clients = listClients(data);
  const index = clients.findIndex((row) => clientIdsEqual(row.id, clientId));
  if (index < 0) {
    return { ok: false, status: 404, error: "\uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  const token = newToken();
  const client = clients[index];
  clients[index] = {
    ...client,
    siteRequestToken: token,
    siteRequestLinkCreatedAt: now,
    siteRequestLinkDisabled: false,
    siteRequestLinkUpdatedAt: now,
    siteRequestLinkUpdatedBy: String(actor || "").trim(),
  };
  saveClientsAndRequests(
    clients,
    listRequests(data),
    actor ? `client-site-request:rotate:${actor}` : "client-site-request:rotate",
  );

  return {
    ok: true,
    clientId,
    clientName: String(client.name || "").trim(),
    token,
    url: buildClientSiteRequestUrl(token),
    disabled: false,
  };
}

export function setClientSiteRequestLinkDisabled(clientId, disabled, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const clients = listClients(data);
  const index = clients.findIndex((row) => clientIdsEqual(row.id, clientId));
  if (index < 0) {
    return { ok: false, status: 404, error: "\uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const client = clients[index];
  if (!String(client.siteRequestToken || "").trim()) {
    return { ok: false, status: 400, error: "\uBC1C\uAE09\uB41C \uB9C1\uD06C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  clients[index] = {
    ...client,
    siteRequestLinkDisabled: Boolean(disabled),
    siteRequestLinkUpdatedAt: now,
    siteRequestLinkUpdatedBy: String(actor || "").trim(),
  };
  saveClientsAndRequests(
    clients,
    listRequests(data),
    actor ? `client-site-request:disable:${actor}` : "client-site-request:disable",
  );

  return {
    ok: true,
    clientId,
    clientName: String(client.name || "").trim(),
    token: client.siteRequestToken,
    url: buildClientSiteRequestUrl(client.siteRequestToken),
    disabled: Boolean(disabled),
  };
}

export function listClientSiteRequestLinks() {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const pendingByClient = new Map();
  for (const row of listRequests(data)) {
    if (row.status !== "pending" && row.status !== "cancel_pending") continue;
    const key = String(row.clientId ?? "");
    pendingByClient.set(key, (pendingByClient.get(key) || 0) + 1);
  }

  return listClients(data)
    .filter((client) => String(client.siteRequestToken || "").trim())
    .map((client) => ({
      clientId: client.id,
      clientName: String(client.name || "").trim(),
      token: client.siteRequestToken,
      url: buildClientSiteRequestUrl(client.siteRequestToken),
      disabled: Boolean(client.siteRequestLinkDisabled),
      createdAt: client.siteRequestLinkCreatedAt || null,
      updatedAt: client.siteRequestLinkUpdatedAt || null,
      pendingCount: pendingByClient.get(String(client.id ?? "")) || 0,
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName, "ko"));
}
