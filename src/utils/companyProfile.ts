export type CompanyProfile = {
  name: string;
  businessNo: string;
  ceoName: string;
  email: string;
  bizType: string;
  bizClass: string;
  phone: string;
  fax: string;
  address: string;
  bankAccountVatIncluded: string;
  bankAccountVatExcluded: string;
  website: string;
  instagram: string;
  youtube: string;
};

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "(\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130",
  businessNo: "",
  ceoName: "",
  email: "",
  bizType: "",
  bizClass: "",
  phone: "",
  fax: "",
  address: "",
  bankAccountVatIncluded: "969-046529-04-015 \uAE30\uC5C5\uC740\uD589 (\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130",
  bankAccountVatExcluded: "",
  website: "",
  instagram: "",
  youtube: "",
};

/** @deprecated use resolveStatementBankAccount with companyProfile */
export const LEGACY_COMPANY_BANK_ACCOUNT = DEFAULT_COMPANY_PROFILE.bankAccountVatIncluded;

export function normalizeCompanyProfile(raw: unknown): CompanyProfile {
  const source = raw && typeof raw === "object" ? (raw as Partial<CompanyProfile>) : {};
  return {
    name: String(source.name ?? DEFAULT_COMPANY_PROFILE.name).trim() || DEFAULT_COMPANY_PROFILE.name,
    businessNo: String(source.businessNo ?? "").trim(),
    ceoName: String(source.ceoName ?? "").trim(),
    email: String(source.email ?? "").trim(),
    bizType: String(source.bizType ?? "").trim(),
    bizClass: String(source.bizClass ?? "").trim(),
    phone: String(source.phone ?? "").trim(),
    fax: String(source.fax ?? "").trim(),
    address: String(source.address ?? "").trim(),
    bankAccountVatIncluded:
      String(source.bankAccountVatIncluded ?? DEFAULT_COMPANY_PROFILE.bankAccountVatIncluded).trim() ||
      DEFAULT_COMPANY_PROFILE.bankAccountVatIncluded,
    bankAccountVatExcluded: String(source.bankAccountVatExcluded ?? "").trim(),
    website: String(source.website ?? "").trim(),
    instagram: String(source.instagram ?? "").trim(),
    youtube: String(source.youtube ?? "").trim(),
  };
}

/** ??? ???(Y/N)? ?? ??? ?? ?? */
export function resolveStatementBankAccount(profile: CompanyProfile, clientVat?: string): string {
  const vatIncluded = String(clientVat || "Y").toUpperCase() === "Y";
  const primary = vatIncluded ? profile.bankAccountVatIncluded : profile.bankAccountVatExcluded;
  const fallback = vatIncluded ? profile.bankAccountVatExcluded : profile.bankAccountVatIncluded;
  return primary || fallback || DEFAULT_COMPANY_PROFILE.bankAccountVatIncluded;
}

export function companyProfileContactLines(profile: CompanyProfile): string[] {
  const lines: string[] = [];
  if (profile.name) lines.push(profile.name);
  if (profile.businessNo) lines.push(`\uC0AC\uC5C5\uC790\uBC88\uD638 ${profile.businessNo}`);
  if (profile.phone) lines.push(`Tel ${profile.phone}`);
  if (profile.fax) lines.push(`Fax ${profile.fax}`);
  if (profile.address) lines.push(profile.address);
  return lines;
}

export function companyProfileLinkItems(profile: CompanyProfile): Array<{ label: string; href: string }> {
  const items: Array<{ label: string; href: string }> = [];
  if (profile.website) items.push({ label: "\uD648\uD398\uC774\uC9C0", href: normalizeUrl(profile.website) });
  if (profile.instagram) items.push({ label: "Instagram", href: normalizeUrl(profile.instagram) });
  if (profile.youtube) items.push({ label: "YouTube", href: normalizeUrl(profile.youtube) });
  return items;
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
