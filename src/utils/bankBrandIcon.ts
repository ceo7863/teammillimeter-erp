const IBK_ICON_SRC = "/banks/ibk.png";

function normalizeBankName(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function resolveBankBrandIconSrc(bankName: string | null | undefined): string | null {
  const normalized = normalizeBankName(bankName || "IBK");
  if (
    normalized === "ibk" ||
    normalized.includes("ibk") ||
    normalized.includes("????") ||
    normalized.includes("industrialbankofkorea")
  ) {
    return IBK_ICON_SRC;
  }
  return null;
}

export function resolveBankAccountDisplayLabel(
  bankName: string | null | undefined,
  accountNumber: string | null | undefined,
): string {
  const suffix = String(accountNumber || "").slice(-4);
  const iconSrc = resolveBankBrandIconSrc(bankName);
  if (iconSrc && suffix) return suffix;
  return `${bankName || "IBK"} ${suffix}`.trim();
}
