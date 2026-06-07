import type { ClientFormState } from "@/components/ClientFormModal";

export type BusinessRegImportFieldKey =
  | "name"
  | "taxInvoiceCorpName"
  | "businessNo"
  | "ceoName"
  | "address"
  | "bizType"
  | "bizClass";

export const BUSINESS_REG_IMPORT_FIELDS: Array<{ key: BusinessRegImportFieldKey; label: string }> = [
  { key: "name", label: "\uAC70\uB798\uCC98\uBA85" },
  { key: "taxInvoiceCorpName", label: "\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589\uC6A9 \uC0C1\uD638" },
  { key: "businessNo", label: "\uC0AC\uC5C5\uC790\uBC88\uD638" },
  { key: "ceoName", label: "\uB300\uD45C\uC790\uBA85" },
  { key: "address", label: "\uC8FC\uC18C" },
  { key: "bizType", label: "\uC5C5\uD0DC" },
  { key: "bizClass", label: "\uC5C5\uC885" },
];

export function normalizeImportedBusinessNo(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 10) return String(raw || "").trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function cleanImportedText(raw: string) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

/** \uC0C1\uD638(\uBC95\uC778\uBA85) \u2192 ERP \uAC70\uB798\uCC98\uBA85 \uC6A9 \uC57D\uCE6D */
export function simplifyClientNameFromLegalName(legalName: string) {
  const legal = cleanImportedText(legalName);
  if (!legal) return "";
  const simplified = legal
    .replace(/^\(?\s*(?:\uC8FC\uC2DD\uD68C\uC0AC|\(\uC8FC\)|\u3231|\uC720\uD55C\uD68C\uC0AC|\(\uC720\))\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
  return cleanImportedText(simplified) || legal;
}

export function mergeBusinessRegImport(
  current: ClientFormState,
  patch: Partial<Pick<ClientFormState, BusinessRegImportFieldKey>>,
  options: { fillEmptyOnly: boolean },
): { next: ClientFormState; filled: BusinessRegImportFieldKey[]; skipped: BusinessRegImportFieldKey[] } {
  const next = { ...current };
  const filled: BusinessRegImportFieldKey[] = [];
  const skipped: BusinessRegImportFieldKey[] = [];

  for (const { key } of BUSINESS_REG_IMPORT_FIELDS) {
    let value = cleanImportedText(patch[key] || "");
    if (!value) continue;
    if (key === "businessNo") value = normalizeImportedBusinessNo(value);
    const existing = cleanImportedText(current[key] || "");
    if (options.fillEmptyOnly && existing) {
      skipped.push(key);
      continue;
    }
    next[key] = value;
    filled.push(key);
  }

  return { next, filled, skipped };
}

export function suggestBusinessRegValues(text: string): Partial<Record<BusinessRegImportFieldKey, string>> {
  const normalized = String(text || "");
  const suggestions: Partial<Record<BusinessRegImportFieldKey, string>> = {};

  const bizMatch = normalized.match(/\d{3}[-\s.]?\d{2}[-\s.]?\d{5}/);
  if (bizMatch) suggestions.businessNo = normalizeImportedBusinessNo(bizMatch[0]);

  const ceoMatch = normalized.match(
    /(?:\uB300\s*\uD45C\s*\uC790|\uC131\s*\uBA85|\uB300\uD45C\uC790)\s*[:?]?\s*([\uAC00-\uD7A3A-Za-z\s]{2,20})/,
  );
  if (ceoMatch) suggestions.ceoName = cleanImportedText(ceoMatch[1]);

  const nameMatch = normalized.match(
    /(?:\uC0C1\s*\uD638|\uBC95\s*\uC778\s*\uBA85|\uC0C1\s*\uD638\s*\(\uBC95\s*\uC778\s*\uBA85\))\s*[:?]?\s*([^\n\r]{2,60})/,
  );
  if (nameMatch) {
    const legal = cleanImportedText(nameMatch[1]);
    suggestions.taxInvoiceCorpName = legal;
    suggestions.name = simplifyClientNameFromLegalName(legal);
  }

  const addressMatch = normalized.match(
    /(?:\uC0AC\s*\uC5C5\s*\uC7A5\s*\uC18C\s*\uC7AC\s*\uC9C0|\uC0AC\s*\uC5C5\s*\uC7A5|\uC18C\s*\uC7AC\s*\uC9C0|\uC8FC\s*\uC18C)\s*[:?]?\s*([^\n\r]{5,120})/,
  );
  if (addressMatch) suggestions.address = cleanImportedText(addressMatch[1]);

  const bizTypeMatch = normalized.match(/\uC5C5\s*\uD0DC\s*[:?]?\s*([^\n\r]{2,40})/);
  if (bizTypeMatch) suggestions.bizType = cleanImportedText(bizTypeMatch[1]);

  const bizClassMatch = normalized.match(/\uC885\s*\uBAA9\s*[:?]?\s*([^\n\r]{2,60})/);
  if (bizClassMatch) suggestions.bizClass = cleanImportedText(bizClassMatch[1]);

  return suggestions;
}
