import { getAuthToken } from "@/utils/erpApi";
import type { HometaxImportPreview, HometaxImportRow } from "@/utils/hometaxTaxInvoiceImport";
import type { TaxInvoice, TaxInvoiceFlowType } from "@/utils/taxInvoices";

export type BarobillTaxInvoiceSyncRequest = {
  startDate: string;
  endDate: string;
  flowTypes?: TaxInvoiceFlowType[];
  apply?: boolean;
};

export type BarobillTaxInvoiceSyncPreview = HometaxImportPreview & {
  startDate?: string;
  endDate?: string;
  flowTypes?: TaxInvoiceFlowType[];
};

export type BarobillTaxInvoiceSyncResult = {
  ok: boolean;
  apply: boolean;
  added: number;
  skipped: number;
  preview: BarobillTaxInvoiceSyncPreview;
  taxInvoices?: TaxInvoice[];
  version?: number;
  updatedAt?: string | null;
  error?: string;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiBase()}${path}`, { ...options, headers });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!response.ok) {
    throw new Error(String(data.error || `API ${response.status}`));
  }
  return data as T;
}

export async function syncBarobillTaxInvoices(input: BarobillTaxInvoiceSyncRequest) {
  return apiRequest<BarobillTaxInvoiceSyncResult>("/barobill/tax-invoices/sync", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type BarobillScrapStatus = {
  active: boolean;
  collecting?: boolean;
  code?: number;
  message?: string;
};

export async function fetchBarobillScrapStatus() {
  return apiRequest<BarobillScrapStatus>("/barobill/scrap-status");
}

export async function fetchBarobillScrapRequestUrl() {
  return apiRequest<{ ok: boolean; url: string }>("/barobill/scrap-request-url");
}

export function barobillPreviewToHometaxPreview(preview: BarobillTaxInvoiceSyncPreview): HometaxImportPreview {
  return {
    flowType: preview.flowType,
    sourceFile: preview.sourceFile,
    title: preview.title,
    earliestIssueDate: preview.earliestIssueDate,
    latestIssueDate: preview.latestIssueDate,
    rows: preview.rows as HometaxImportRow[],
    parsedTotals: preview.parsedTotals,
    errors: preview.errors,
  };
}
