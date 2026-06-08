import { resolveClientTaxInvoiceCorpName, extractClientTaxFields, type ClientMasterLike } from "@/utils/clientMaster";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  DEFAULT_TAX_INVOICE_ITEM_NAME,
  getTaxInvoiceDocumentTypeLabel,
  type TaxInvoice,
} from "@/utils/taxInvoices";

export type TaxInvoiceCopyParty = {
  name: string;
  businessNo: string;
  ceoName: string;
  address: string;
  bizType: string;
  bizClass: string;
  email: string;
  phone: string;
};

export type TaxInvoiceCopySheetData = {
  title: string;
  issueDate: string;
  invoiceNo: string;
  itemName: string;
  memo: string;
  supplier: TaxInvoiceCopyParty;
  buyer: TaxInvoiceCopyParty;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
};

export type BarobillTaxInvoiceCopyDetail = {
  mgtKey: string;
  issueDate: string;
  invoiceNo: string;
  itemName: string;
  memo: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  documentType: "tax" | "bill";
  supplier: TaxInvoiceCopyParty;
  buyer: TaxInvoiceCopyParty;
};

function formatBusinessNo(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatIssueDate(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return String(value || "").slice(0, 10);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function partyFromProfile(profile: {
  name?: string;
  businessNo?: string;
  ceoName?: string;
  address?: string;
  bizType?: string;
  bizClass?: string;
  email?: string;
  phone?: string;
}): TaxInvoiceCopyParty {
  return {
    name: String(profile.name || "").trim(),
    businessNo: formatBusinessNo(String(profile.businessNo || "")),
    ceoName: String(profile.ceoName || "").trim(),
    address: String(profile.address || "").trim(),
    bizType: String(profile.bizType || "").trim(),
    bizClass: String(profile.bizClass || "").trim(),
    email: String(profile.email || "").trim(),
    phone: String(profile.phone || "").trim(),
  };
}

function resolveClientForInvoice(invoice: TaxInvoice, clients: ClientMasterLike[]) {
  const name = String(invoice.client || "").trim();
  return (
    clients.find((client) => resolveClientTaxInvoiceCorpName(client) === name) ||
    clients.find((client) => String(client.name || "").trim() === name) ||
    null
  );
}

function stripMgtKeyMemo(memo?: string) {
  return String(memo || "")
    .replace(/\s*MgtKey:\s*[^\s\u00B7]+/gi, "")
    .replace(/\s*\u00B7\s*$/g, "")
    .trim();
}

function resolveItemNameFromMemo(memo?: string) {
  const cleaned = stripMgtKeyMemo(memo);
  return cleaned || DEFAULT_TAX_INVOICE_ITEM_NAME;
}

export function buildTaxInvoiceCopySheetDataFromLocal(input: {
  invoice: TaxInvoice;
  companyProfile: CompanyProfile;
  clients?: ClientMasterLike[];
  itemName?: string;
}): TaxInvoiceCopySheetData {
  const { invoice, companyProfile, clients = [] } = input;
  const matched = resolveClientForInvoice(invoice, clients);
  const buyerProfile = matched ? extractClientTaxFields(matched) : null;
  const buyerName = buyerProfile
    ? resolveClientTaxInvoiceCorpName(matched) || String(invoice.client || "").trim()
    : String(invoice.client || "").trim();

  return {
    title: getTaxInvoiceDocumentTypeLabel(invoice.documentType),
    issueDate: formatIssueDate(invoice.issueDate),
    invoiceNo: String(invoice.invoiceNo || "").trim(),
    itemName: input.itemName || resolveItemNameFromMemo(invoice.memo),
    memo: stripMgtKeyMemo(invoice.memo),
    supplier: partyFromProfile(companyProfile),
    buyer: buyerProfile
      ? partyFromProfile({ ...buyerProfile, name: buyerName, businessNo: invoice.businessNo || buyerProfile.businessNo })
      : partyFromProfile({ name: buyerName, businessNo: invoice.businessNo }),
    supplyAmount: Math.round(Number(invoice.supplyAmount) || 0),
    vatAmount: Math.round(Number(invoice.vatAmount) || 0),
    totalAmount: Math.round(Number(invoice.totalAmount) || 0),
  };
}

export function buildTaxInvoiceCopySheetDataFromBarobill(detail: BarobillTaxInvoiceCopyDetail): TaxInvoiceCopySheetData {
  return {
    title: detail.documentType === "bill" ? "\uACC4\uC0B0\uC11C" : "\uC138\uAE08\uACC4\uC0B0\uC11C",
    issueDate: formatIssueDate(detail.issueDate),
    invoiceNo: detail.invoiceNo,
    itemName: detail.itemName || DEFAULT_TAX_INVOICE_ITEM_NAME,
    memo: detail.memo,
    supplier: detail.supplier,
    buyer: detail.buyer,
    supplyAmount: detail.supplyAmount,
    vatAmount: detail.vatAmount,
    totalAmount: detail.totalAmount,
  };
}

export function buildTaxInvoiceCopyFileName(invoice: Pick<TaxInvoice, "client" | "issueDate">) {
  const client = String(invoice.client || "\uAC70\uB798\uCC98").replace(/[\\/:*?"<>|]/g, "_").trim();
  const date = formatIssueDate(invoice.issueDate).replace(/-/g, "");
  return `${client}_${date}_\uC0AC\uBCF8.jpg`;
}
