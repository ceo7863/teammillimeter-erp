/** ?? ??: ERP ??? ??? ??? ?? ??? ?? ?? ??? (C ??) */

const DEFAULT_STAFF_PAGE_KEYS = [
  "dailyReport",
  "dashboard",
  "calendar",
  "clientSiteRequests",
  "clientSiteRequestCalendars",
  "scAlimtalk",
  "salesInput",
  "sales",
  "salesVoucherSearch",
  "saleComments",
  "receivables",
  "workerPayments",
  "reports",
  "statements",
  "accounting",
  "analysis",
  "companyNotices",
  "basicInfo",
  "attendance",
];

const LEGACY_ACCOUNTING_PAGE_KEYS = new Set(["companyLedger", "taxInvoices", "bankTransactions"]);
const LEGACY_STATEMENT_PAGE_KEYS = new Set(["pdfArchive"]);

function normalizeAllowedPages(pages) {
  if (!Array.isArray(pages)) return null;
  let hasLegacyAccounting = false;
  let hasLegacyStatement = false;
  const unique = [];
  const seen = new Set();

  for (const page of pages) {
    if (typeof page !== "string") continue;
    if (LEGACY_ACCOUNTING_PAGE_KEYS.has(page)) {
      hasLegacyAccounting = true;
      continue;
    }
    if (LEGACY_STATEMENT_PAGE_KEYS.has(page)) {
      hasLegacyStatement = true;
      continue;
    }
    if (page === "clients" || page === "workers" || page === "companyProfile") {
      if (!seen.has("basicInfo")) {
        seen.add("basicInfo");
        unique.push("basicInfo");
      }
      continue;
    }
    if (page === "auditLog" || page === "loginHistory") {
      if (!seen.has("usersAdmin")) {
        seen.add("usersAdmin");
        unique.push("usersAdmin");
      }
      continue;
    }
    if (!seen.has(page)) {
      seen.add(page);
      unique.push(page);
    }
  }

  if (!unique.length) {
    if (hasLegacyAccounting) return ["accounting"];
    if (hasLegacyStatement) return ["statements"];
  }
  return unique.length ? unique : null;
}

export function resolveUserAllowedPages(user) {
  if (!user) return [];
  if (user.role === "admin") return [...DEFAULT_STAFF_PAGE_KEYS, "usersAdmin"];

  const custom = normalizeAllowedPages(user.allowedPages);
  if (custom?.length) return custom;

  return [...DEFAULT_STAFF_PAGE_KEYS];
}

export function isAttendanceTargetUser(user) {
  if (!user || user.isActive === false) return false;
  if (user.role === "admin") return true;
  return resolveUserAllowedPages(user).includes("attendance");
}
