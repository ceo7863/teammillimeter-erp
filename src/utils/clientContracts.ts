import { apiRequest, getAuthToken, isApiModeEnabled } from "@/utils/erpApi";

export type ClientContractStatus = "draft" | "sent" | "signed" | "expired";

export type ContractPdfContent = {
  basicUnitPrice?: string;
  nightWorkRate?: string;
  mealAllowance?: string;
  accommodationFee?: string;
  vehicleRate?: string;
};

export type ClientContract = {
  id: string;
  clientName: string;
  title: string;
  contactName?: string;
  contactPhone: string;
  status: ClientContractStatus;
  originalFileName: string;
  originalStorageKey: string;
  templateId?: string;
  pdfContent?: ContractPdfContent;
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
  /** ?? ? ??? ?? URL (?? API) */
  signUrl?: string | null;
};

export type PublicClientContractSignInfo = {
  id: string;
  clientName: string;
  title: string;
  contactName?: string;
  status: ClientContractStatus;
  originalFileName: string;
  tokenExpiresAt?: string;
  signedAt?: string;
  signedByName?: string;
  hasSignedPdf?: boolean;
};

function triggerPdfDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function parseContentDispositionFileName(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  return match ? decodeURIComponent(match[1]) : fallback;
}

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

export type ClientContractTemplate = {
  id: string;
  title: string;
  fileName: string;
  defaultPdfContent?: ContractPdfContent;
};

export async function listClientContractTemplates(): Promise<ClientContractTemplate[]> {
  if (!isApiModeEnabled()) return [];
  return apiRequest<ClientContractTemplate[]>("/client-contracts/templates");
}

export async function generateClientContract(input: {
  templateId: string;
  clientName: string;
}): Promise<ClientContract> {
  return apiRequest<ClientContract>("/client-contracts/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function getContractTemplateDefaults(templateId: string): Promise<ContractPdfContent> {
  const result = await apiRequest<{ templateId: string; pdfContent: ContractPdfContent }>(
    `/client-contracts/templates/${encodeURIComponent(templateId)}/defaults`,
  );
  return result.pdfContent;
}

export async function rebuildClientContractPdf(
  id: string,
  patch: {
    contactName?: string;
    contactPhone?: string;
    pdfContent?: ContractPdfContent;
  },
): Promise<ClientContract> {
  return apiRequest<ClientContract>(`/client-contracts/${encodeURIComponent(id)}/rebuild-pdf`, {
    method: "POST",
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
  const url = clientContractPreviewUrl(id, kind, 1);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export async function downloadClientContractPdf(id: string, kind: "original" | "signed" = "signed") {
  const token = getAuthToken();
  const url = clientContractFileUrl(id, kind, true);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const blob = await response.blob();
  const fallback = kind === "signed" ? "contract-signed.pdf" : "contract.pdf";
  triggerPdfDownload(blob, parseContentDispositionFileName(response, fallback));
}

export async function fetchPublicContractSignInfo(token: string): Promise<PublicClientContractSignInfo> {
  const response = await fetch(`${apiBase()}/public/client-contracts/sign/${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
}

export function publicContractPdfUrl(token: string) {
  return `${apiBase()}/public/client-contracts/sign/${encodeURIComponent(token)}/pdf`;
}

export function publicSignedContractPdfUrl(token: string, download = true) {
  const suffix = download ? "?download=1" : "";
  return `${apiBase()}/public/client-contracts/sign/${encodeURIComponent(token)}/signed-pdf${suffix}`;
}

export async function downloadPublicSignedContractPdf(token: string, fallbackFileName = "contract-signed.pdf") {
  const response = await fetch(publicSignedContractPdfUrl(token, true));
  if (!response.ok) throw new Error(await parseApiError(response));
  const blob = await response.blob();
  triggerPdfDownload(blob, parseContentDispositionFileName(response, fallbackFileName));
}

export function publicContractPreviewUrl(token: string, page = 1) {
  const query = page > 1 ? `?page=${page}` : "";
  return `${apiBase()}/public/client-contracts/sign/${encodeURIComponent(token)}/preview${query}`;
}

export function clientContractPreviewUrl(id: string, kind: "original" | "signed" = "original", page = 1) {
  const params = new URLSearchParams();
  if (kind === "signed") params.set("kind", "signed");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `${apiBase()}/client-contracts/${encodeURIComponent(id)}/preview${query ? `?${query}` : ""}`;
}

export async function fetchContractPreviewMeta(url: string) {
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) throw new Error(await parseApiError(response));
  return {
    page: Number.parseInt(response.headers.get("X-Preview-Page") || "1", 10) || 1,
    pageCount: Number.parseInt(response.headers.get("X-Preview-Page-Count") || "1", 10) || 1,
  };
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
