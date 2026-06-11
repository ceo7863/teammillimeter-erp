import { resolveUserAllowedPages } from "./attendanceAccess.mjs";

const PAGE_LABELS = {
  accounting: "\uD68C\uACC4\u00B7\uD1B5\uC7A5",
  receivables: "\uC785\uAE08/\uBBF8\uC218\uAE08",
  sales: "\uB9E4\uCD9C\uAD00\uB9AC",
  salesVoucherSearch: "\uB9E4\uCD9C\uC804\uD45C\uAC80\uC0C9",
  calendar: "\uCE98\uB9B0\uB354",
  clientSiteRequestCalendars: "\uC5C5\uCCB4\uBCC4 \uCE98\uB9B0\uB354",
  scAlimtalk: "\uC54C\uB9BC\uD1A1",
  statements: "\uB0B4\uC5ED\uC11C",
  workerPayments: "\uC2DC\uACF5\uC790 \uC9C0\uAE09",
  analysis: "\uBD84\uC11D",
  dashboard: "\uB300\uC2DC\uBCF4\uB4DC",
  attendance: "\uADFC\uD009 \uAD00\uB9AC",
  clients: "\uAC70\uB798\uCC98 \uAD00\uB9AC",
  workers: "\uC2DC\uACF5\uC790 \uAD00\uB9AC",
  basicInfo: "\uAE30\uBCF8\uC815\uBCF4",
  usersAdmin: "\uC0AC\uC6A9\uC790 \uAD00\uB9AC",
};

export const CHAT_TOOL_PAGE_MAP = {
  get_client_unpaid: "receivables",
  get_unpaid_list: "receivables",
  get_deposit_total: "receivables",
  open_client_deposit_history: "receivables",
  get_statement_sent_unpaid: "receivables",
  get_sales_total: "sales",
  get_tax_invoice_summary: "accounting",
  get_client_tax_invoice_issued: "accounting",
  open_client_tax_invoice_history: "accounting",
  get_schedule_count: "calendar",
  get_client_site_on_date: "calendar",
  get_person_bank_account: "workers",
  get_client_contacts: "clients",
  lookup_contact: "clients",
  search_client: "clients",
  get_client_business_reg: "clients",
  open_client_business_reg: "clients",
  find_sale_voucher: "salesVoucherSearch",
  open_client_calendar: "calendar",
  open_sc_schedule: "clientSiteRequestCalendars",
  open_client_site_request_calendar: "clientSiteRequestCalendars",
  open_worker_construction_cost_statement: "workerPayments",
  open_client_construction_cost_statement: "statements",
  open_client_unpaid_statement_link: "statements",
};

const NAV_TARGET_PAGE_MAP = {
  dashboard: "dashboard",
  calendar: "calendar",
  client_site_requests: "clientSiteRequests",
  client_site_request_calendars: "clientSiteRequestCalendars",
  sc_schedule: "clientSiteRequestCalendars",
  sc_alimtalk: "scAlimtalk",
  attendance: "attendance",
  sales_input: "salesInput",
  sales: "sales",
  sales_voucher_search: "salesVoucherSearch",
  receivables: "receivables",
  worker_payments: "workerPayments",
  reports: "reports",
  statements: "statements",
  basic_info: "basicInfo",
  basic_info_clients: "clients",
  basic_info_workers: "workers",
  accounting: "accounting",
  accounting_bank: "accounting",
  accounting_tax: "accounting",
  accounting_ledger: "accounting",
  analysis: "analysis",
  company_notices: "companyNotices",
  users_admin: "usersAdmin",
};

function resolveBasicInfoTabAccess(user) {
  if (!user) return { clients: false, workers: false, company: false };
  if (user.role === "admin") return { clients: true, workers: true, company: true };

  const rawPages = user.allowedPages;
  if (Array.isArray(rawPages) && rawPages.length) {
    const rawSet = new Set(rawPages.filter((page) => typeof page === "string"));
    const hasBasicInfo = rawSet.has("basicInfo");
    return {
      clients: hasBasicInfo || rawSet.has("clients"),
      workers: hasBasicInfo || rawSet.has("workers"),
      company: hasBasicInfo || rawSet.has("companyProfile"),
    };
  }

  return { clients: true, workers: true, company: false };
}

export function getChatPageLabel(pageKey) {
  return PAGE_LABELS[pageKey] || pageKey || "ERP \uBA54\uB274";
}

export function formatChatAccessDenied(pageKey) {
  const label = getChatPageLabel(pageKey);
  return [
    `\uD574\uB2F9 \uC815\uBCF4\uB294 \uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`,
    `ERP \u300C\uC0AC\uC6A9\uC790 \uAD00\uB9AC\u300D\uC5D0\uC11C \uD5C8\uC6A9\uB41C \uBA54\uB274(\uC608: ${label})\uAC00 \uC788\uC744 \uB54C\uB9CC \uCC57\uBD07\uC73C\uB85C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
    `\uAD8C\uD55C \uBCC0\uACBD\uC774 \uD544\uC694\uD558\uBA74 \uAD00\uB9AC\uC790\uC5D0\uAC8C \uBB38\uC758\uD574 \uC8FC\uC138\uC694.`,
  ].join("\n");
}

export function canUserAccessChatPage(user, pageKey) {
  if (!user) return false;
  if (user.role === "admin") return true;

  const basicInfo = resolveBasicInfoTabAccess(user);
  if (pageKey === "clients") return basicInfo.clients;
  if (pageKey === "workers") return basicInfo.workers;
  if (pageKey === "companyProfile") return basicInfo.company;
  if (pageKey === "basicInfo") return basicInfo.clients || basicInfo.workers || basicInfo.company;

  return resolveUserAllowedPages(user).includes(pageKey);
}

export function canUserAccessWorkersChatData(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return canUserAccessChatPage(user, "workers") || canUserAccessChatPage(user, "workerPayments");
}

export function canUserViewContactPhones(user) {
  if (user?.role === "admin") return true;
  return canUserAccessChatPage(user, "clients");
}

function resolveNavigateTargetPage(target) {
  const key = String(target || "").trim();
  if (!key) return null;
  return NAV_TARGET_PAGE_MAP[key] || null;
}

export function assertChatToolAccess(user, toolName, args = {}, question = "") {
  if (!user || user.role === "admin") return null;

  const name = String(toolName || "").trim();
  if (!name || name === "get_weather" || name === "list_erp_pages") return null;

  if (name === "navigate_erp") {
    const pageKey = resolveNavigateTargetPage(args?.target);
    if (pageKey && !canUserAccessChatPage(user, pageKey)) {
      return { ok: false, error: formatChatAccessDenied(pageKey) };
    }
    return null;
  }

  if (name === "get_worker_info") {
    const pageKey = /\uB2F4\uB2F9|\uAC70\uB798\uCC98|\uC804\uD654|\uC5F0\uB77D/.test(String(question || ""))
      ? "clients"
      : "workers";
    if (pageKey === "workers" && !canUserAccessWorkersChatData(user)) {
      return { ok: false, error: formatChatAccessDenied("workers") };
    }
    if (pageKey === "clients" && !canUserAccessChatPage(user, "clients")) {
      return { ok: false, error: formatChatAccessDenied("clients") };
    }
    return null;
  }

  if (name === "get_person_bank_account") {
    if (!canUserAccessWorkersChatData(user)) {
      return { ok: false, error: formatChatAccessDenied("workers") };
    }
    return null;
  }

  const pageKey = CHAT_TOOL_PAGE_MAP[name];
  if (pageKey && !canUserAccessChatPage(user, pageKey)) {
    return { ok: false, error: formatChatAccessDenied(pageKey) };
  }

  return null;
}
