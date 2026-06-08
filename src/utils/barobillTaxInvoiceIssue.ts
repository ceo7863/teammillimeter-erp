import { getAuthToken } from "@/utils/erpApi";
import type { TaxInvoice, TaxInvoiceDocumentType } from "@/utils/taxInvoices";

export type BarobillNtsSendOption = {
  value: number;
  label: string;
  description: string;
};

export type BarobillTaxInvoiceIssueOptions = {
  ntsSendOptions: BarobillNtsSendOption[];
  accountDefaults: {
    taxation: number;
    taxExemption: number;
  };
  defaultNtsSendOption: number;
};

export type BarobillTaxInvoiceIssueRequest = {
  issueDate: string;
  client: string;
  businessNo: string;
  documentType: TaxInvoiceDocumentType;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  itemName?: string;
  memo?: string;
  purposeType?: number;
  ntsSendOption?: number;
  invoiceeCeoName?: string;
  invoiceeContactName?: string;
  invoiceeEmail?: string;
  invoiceeAddr?: string;
  invoiceePhone?: string;
  invoiceeBizType?: string;
  invoiceeBizClass?: string;
  apply?: boolean;
  version?: number;
};

export type BarobillTaxInvoiceIssueResult = {
  ok: boolean;
  mgtKey: string;
  invoiceNo?: string;
  message: string;
  errCode?: number;
  taxInvoice?: TaxInvoice;
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
    const err = new Error(String(data.error || `API ${response.status}`)) as Error & { errCode?: number };
    if (typeof data.errCode === "number") err.errCode = data.errCode;
    throw err;
  }
  return data as T;
}

export async function fetchBarobillTaxInvoiceIssueOptions(documentType: TaxInvoiceDocumentType = "tax") {
  const query = new URLSearchParams({ documentType });
  return apiRequest<BarobillTaxInvoiceIssueOptions>(`/barobill/tax-invoices/issue-options?${query.toString()}`);
}

export function resolveDefaultNtsSendOption(
  documentType: TaxInvoiceDocumentType,
  accountDefaults: BarobillTaxInvoiceIssueOptions["accountDefaults"],
) {
  return documentType === "bill" ? accountDefaults.taxExemption : accountDefaults.taxation;
}

export function getNtsSendOptionLabel(
  value: number,
  options?: BarobillNtsSendOption[],
) {
  return options?.find((option) => option.value === value)?.label || (value === 2 ? "\uC775\uC77C\uBC1C\uAE09" : "\uBC14\uB85C\uBC1C\uAE09");
}

export async function issueBarobillTaxInvoice(input: BarobillTaxInvoiceIssueRequest) {
  return apiRequest<BarobillTaxInvoiceIssueResult>("/barobill/tax-invoices/issue", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
