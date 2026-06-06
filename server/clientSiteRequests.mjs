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

function saveClientsAndRequests(clients, requests) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  data.clients = clients;
  data.clientSiteRequests = requests.slice(0, MAX_REQUESTS);
  saveErpState({ ...state, data });
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

  const workDate = normalizeDate(body.workDate);
  const siteName = String(body.siteName || "").trim();
  const workerCount = normalizeWorkerCount(body.workerCount);
  const memo = String(body.memo || "").trim().slice(0, 2000);
  const contactName = String(body.contactName || "").trim().slice(0, 80);
  const contactPhone = String(body.contactPhone || "").trim().slice(0, 40);

  if (!workDate) {
    return { ok: false, status: 400, error: "\uC791\uC5C5 \uC77C\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694." };
  }
  if (!siteName) {
    return { ok: false, status: 400, error: "\uD604\uC7A5\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }
  if (!workerCount) {
    return { ok: false, status: 400, error: "\uD544\uC694 \uC778\uC6D0\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }

  const now = new Date().toISOString();
  const request = {
    id: newRequestId(),
    clientId: client.id,
    clientName: String(client.name || "").trim(),
    token: String(token).trim(),
    status: "pending",
    workDate,
    siteName,
    workerCount,
    memo,
    contactName,
    contactPhone,
    submittedAt: now,
    processedAt: null,
    processedBy: null,
    processNote: "",
  };

  const requests = [request, ...listRequests(data)];
  saveClientsAndRequests(listClients(data), requests);

  return { ok: true, request };
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
  return rows.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

export function updateClientSiteRequestStatus(id, input = {}, actor = "") {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? { ...state.data } : {};
  const requests = listRequests(data);
  const index = requests.findIndex((row) => row.id === id);
  if (index < 0) {
    return { ok: false, status: 404, error: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const status = String(input.status || "").trim();
  if (status !== "confirmed" && status !== "rejected" && status !== "pending") {
    return { ok: false, status: 400, error: "\uCC98\uB9AC \uC0C1\uD0DC\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  const current = requests[index];
  const next = {
    ...current,
    status,
    processNote: String(input.processNote || current.processNote || "").trim().slice(0, 1000),
    processedAt: status === "pending" ? null : now,
    processedBy: status === "pending" ? null : String(actor || "").trim() || current.processedBy,
  };
  requests[index] = next;
  saveClientsAndRequests(listClients(data), requests);
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
  saveClientsAndRequests(clients, listRequests(data));

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
  saveClientsAndRequests(clients, listRequests(data));

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
  saveClientsAndRequests(clients, listRequests(data));

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
    if (row.status !== "pending") continue;
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
