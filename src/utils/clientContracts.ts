import { apiRequest, getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type ClientContractStatus = "draft" | "sent" | "signed" | "expired";

export type ClientContract = {
  id: string;
  clientName: string;
  title: string;
  contactName?: string;
  contactPhone: string;
  status: ClientContractStatus;
  originalFileName: string;
  originalStorageKey: string;
  signedStorageKey?: string;
  signatureDataUrl?: string;
  signToken?: string;
  tokenExpiresAt?: string;
  sentAt?: string;
  signedAt?: string;
  signedByName?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type PublicClientContractSignInfo = {
  id: string;
  clientName: string;
  title: string;
  contactName?: string;
  status: ClientContractStatus;
  originalFileName: string;
  tokenExpiresAt?: string;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra || {});
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
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

export function contractStatusLabel(status: ClientContractStatus) {
  if (status === "draft") return "\uCD08\uC548";
  if (status === "sent") return "\uBC1C\uC1A1\uC644\uB8CC";
  if (status === "signed") return "\uC11C\uBA85\uC644\uB8CC";
  return "\uB9CC\uB8CC";
}

export async function listClientContracts(): Promise<ClientContract[]> {
  if (!isApiModeEnabled()) return [];
  return apiRequest<ClientContract[]>("/client-contracts");
}

export async function uploadClientContract(input: {
  file: File;
  clientName: string;
  title: string;
  contactName?: string;
  contactPhone: string;
}): Promise<ClientContract> {
  const meta = {
    fileName: input.file.name,
    clientName: input.clientName,
    title: input.title,
    contactName: input.contactName || "",
    contactPhone: input.contactPhone,
  };
  const response = await fetch(`${apiBase()}/client-contracts`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/pdf",
      "X-Contract-Meta": encodeURIComponent(JSON.stringify(meta)),
    }),
    body: input.file,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
}

export async function updateClientContract(
  id: string,
  patch: Partial<Pick<ClientContract, "title" | "contactName" | "contactPhone">>,
): Promise<ClientContract> {
  return apiRequest<ClientContract>(`/client-contracts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteClientContract(id: string): Promise<void> {
  await apiRequest(`/client-contracts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function sendClientContract(id: string): Promise<{ contract: ClientContract; signUrl: string }> {
  return apiRequest(`/client-contracts/${encodeURIComponent(id)}/send`, { method: "POST" });
}

export function clientContractFileUrl(id: string, kind: "original" | "signed" = "original", download = false) {
  const suffix = download ? "?download=1" : "";
  return `${apiBase()}/client-contracts/${encodeURIComponent(id)}/${kind}${suffix}`;
}

export async function openClientContractPdf(id: string, kind: "original" | "signed" = "original") {
  const token = getAuthToken();
  const response = await fetch(clientContractFileUrl(id, kind), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function fetchPublicContractSignInfo(token: string): Promise<PublicClientContractSignInfo> {
  const response = await fetch(`${apiBase()}/public/client-contracts/sign/${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
}

export function publicContractPdfUrl(token: string) {
  return `${apiBase()}/public/client-contracts/sign/${encodeURIComponent(token)}/pdf`;
}

export async function submitPublicContractSignature(
  token: string,
  input: { signedByName: string; signatureDataUrl: string },
): Promise<{ contract: PublicClientContractSignInfo }> {
  const response = await fetch(`${apiBase()}/public/client-contracts/sign/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
}
