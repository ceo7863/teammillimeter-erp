import { apiRequest, isApiModeEnabled } from "@/utils/erpApi";

export type ClientSiteRequestStatus = "pending" | "confirmed" | "rejected";

export type ClientSiteRequestMessage = {
  id: string;
  sender: "client" | "staff";
  body: string;
  senderName?: string;
  createdAt: string;
};

export type ClientSiteRequest = {
  id: string;
  clientId: number | string;
  clientName: string;
  token: string;
  status: ClientSiteRequestStatus;
  workDate: string;
  siteName: string;
  workerCount: number;
  memo?: string;
  contactName?: string;
  contactPhone?: string;
  submittedAt: string;
  processedAt?: string | null;
  processedBy?: string | null;
  processNote?: string;
  messages?: ClientSiteRequestMessage[];
  lastMessageAt?: string;
  unreadByStaff?: boolean;
  unreadByClient?: boolean;
};

export type ClientSiteRequestLink = {
  clientId: number | string;
  clientName: string;
  token: string;
  url: string;
  disabled: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  pendingCount: number;
};

export type PublicClientSiteRequestInfo = {
  clientName: string;
  companyName: string;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

async function parseApiError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return String(data.error || `API ${response.status}`);
  } catch {
    return text || `API ${response.status}`;
  }
}

export function clientSiteRequestStatusLabel(status: ClientSiteRequestStatus) {
  if (status === "pending") return "\uC811\uC218 \uB300\uAE30";
  if (status === "confirmed") return "\uCC98\uB9AC \uC644\uB8CC";
  return "\uBC18\uB824";
}

export function buildClientSiteRequestPublicUrl(token: string) {
  const normalized = String(token || "").trim();
  if (!normalized) return "";
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin.replace(/\/$/, "")
      : "https://erp.teammillimeter.com";
  return `${origin}/request/${encodeURIComponent(normalized)}`;
}

export function resolveClientSiteRequestLinkUrl(link: { url?: string | null; token?: string | null }) {
  const url = String(link.url || "").trim();
  if (url) return url;
  return buildClientSiteRequestPublicUrl(String(link.token || "").trim());
}

export function openClientSiteRequestLink(url: string) {
  const normalized = String(url || "").trim();
  if (!normalized) return false;
  const opened = window.open(normalized, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(normalized);
  }
  return true;
}

export async function fetchPublicClientSiteRequestInfo(token: string): Promise<PublicClientSiteRequestInfo> {
  const response = await fetch(`${apiBase()}/public/client-site-request/${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
}

export async function submitPublicClientSiteRequest(
  token: string,
  input: {
    workDate: string;
    siteName: string;
    workerCount: number;
    memo?: string;
    contactName?: string;
    contactPhone?: string;
  },
): Promise<ClientSiteRequest> {
  const response = await fetch(`${apiBase()}/public/client-site-request/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const data = await response.json();
  return data.request as ClientSiteRequest;
}

export async function listPublicClientSiteRequests(token: string): Promise<ClientSiteRequest[]> {
  const response = await fetch(`${apiBase()}/public/client-site-request/${encodeURIComponent(token)}/requests`);
  if (!response.ok) throw new Error(await parseApiError(response));
  const data = await response.json();
  return Array.isArray(data.requests) ? data.requests : [];
}

export async function postPublicClientSiteRequestMessage(
  token: string,
  requestId: string,
  input: { body: string; senderName?: string },
): Promise<ClientSiteRequest> {
  const response = await fetch(
    `${apiBase()}/public/client-site-request/${encodeURIComponent(token)}/requests/${encodeURIComponent(requestId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new Error(await parseApiError(response));
  const data = await response.json();
  return data.request as ClientSiteRequest;
}

export async function postStaffClientSiteRequestMessage(
  requestId: string,
  input: { body: string },
): Promise<ClientSiteRequest> {
  const data = await apiRequest<{ request: ClientSiteRequest }>(
    `/client-site-requests/${encodeURIComponent(requestId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data.request;
}

export async function listClientSiteRequests(filters?: {
  status?: ClientSiteRequestStatus | "all";
  clientId?: number | string;
}): Promise<ClientSiteRequest[]> {
  if (!isApiModeEnabled()) return [];
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.clientId != null && String(filters.clientId).trim()) params.set("clientId", String(filters.clientId));
  const query = params.toString();
  return apiRequest<ClientSiteRequest[]>(`/client-site-requests${query ? `?${query}` : ""}`);
}

export async function listClientSiteRequestLinks(): Promise<ClientSiteRequestLink[]> {
  if (!isApiModeEnabled()) return [];
  return apiRequest<ClientSiteRequestLink[]>("/client-site-request-links");
}

export async function ensureClientSiteRequestLink(clientId: number | string): Promise<ClientSiteRequestLink> {
  return apiRequest<ClientSiteRequestLink>(`/clients/${encodeURIComponent(String(clientId))}/site-request-link`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rotateClientSiteRequestLink(clientId: number | string): Promise<ClientSiteRequestLink> {
  return apiRequest<ClientSiteRequestLink>(
    `/clients/${encodeURIComponent(String(clientId))}/site-request-link/rotate`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function setClientSiteRequestLinkDisabled(
  clientId: number | string,
  disabled: boolean,
): Promise<ClientSiteRequestLink> {
  return apiRequest<ClientSiteRequestLink>(
    `/clients/${encodeURIComponent(String(clientId))}/site-request-link/disabled`,
    {
      method: "PATCH",
      body: JSON.stringify({ disabled }),
    },
  );
}

export async function updateClientSiteRequestStatus(
  id: string,
  input: { status: ClientSiteRequestStatus; processNote?: string },
): Promise<ClientSiteRequest> {
  const data = await apiRequest<{ request: ClientSiteRequest }>(`/client-site-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.request;
}
