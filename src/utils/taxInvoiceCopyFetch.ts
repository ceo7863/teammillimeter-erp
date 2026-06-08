import { getAuthToken } from "@/utils/erpApi";
import type { CompanyProfile } from "@/utils/companyProfile";
import type { ClientMasterLike } from "@/utils/clientMaster";
import { extractBarobillMgtKeyFromMemo } from "@/utils/barobillMgtKey";
import type { TaxInvoice } from "@/utils/taxInvoices";
import {
  buildTaxInvoiceCopySheetDataFromBarobill,
  buildTaxInvoiceCopySheetDataFromLocal,
  type BarobillTaxInvoiceCopyDetail,
  type TaxInvoiceCopySheetData,
} from "@/utils/taxInvoiceCopyData";

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

export async function fetchBarobillTaxInvoiceCopyDetail(mgtKey: string): Promise<BarobillTaxInvoiceCopyDetail | null> {
  const trimmed = String(mgtKey || "").trim();
  if (!trimmed) return null;

  const headers = new Headers();
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const query = new URLSearchParams({ mgtKey: trimmed });
  const response = await fetch(`${apiBase()}/barobill/tax-invoices/copy-data?${query.toString()}`, { headers });
  if (!response.ok) return null;

  const data = (await response.json()) as BarobillTaxInvoiceCopyDetail;
  if (!data || typeof data !== "object") return null;
  return data;
}

export async function resolveTaxInvoiceCopySheetData(input: {
  invoice: TaxInvoice;
  companyProfile: CompanyProfile;
  clients?: ClientMasterLike[];
}): Promise<TaxInvoiceCopySheetData> {
  const mgtKey = extractBarobillMgtKeyFromMemo(input.invoice.memo);
  if (mgtKey) {
    const detail = await fetchBarobillTaxInvoiceCopyDetail(mgtKey);
    if (detail) return buildTaxInvoiceCopySheetDataFromBarobill(detail);
  }
  return buildTaxInvoiceCopySheetDataFromLocal(input);
}
