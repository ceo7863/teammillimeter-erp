import {
  toolOpenClientCalendar,
  toolOpenClientConstructionCostStatement,
  toolOpenClientDepositHistory,
  toolOpenClientTaxInvoiceHistory,
  toolOpenWorkerConstructionCostStatement,
  extractClientStatementQuery,
  extractWorkerStatementQuery,
  extractDepositHistoryQuery,
  extractTaxInvoiceHistoryQuery,
  buildChatActionsFromCalendarOpen,
  buildChatActionsFromClientStatementOpen,
  buildChatActionsFromDepositOpen,
  buildChatActionsFromTaxInvoiceOpen,
  buildChatActionsFromWorkerStatementOpen,
  formatCalendarOpenAnswer,
  formatClientStatementOpenAnswer,
  formatDepositOpenAnswer,
  formatTaxInvoiceOpenAnswer,
  formatWorkerStatementOpenAnswer,
} from "./erpChatTools.mjs";

const OPEN_VERB = /(?:\uC5F4|\uBD10|\uCC28|\uC774\uB3D9|\uD655\uC778|\uC918|\uBCF4\uAE30|\uC0DD\uC131|\uD655\uC778|\uC774\uB3D9\uD574|\uAC00|\uB4E4|\uC785|\uD574)/;

/** @type {Array<{ id: string; page: string; label: string; aliases: string[]; accountingTab?: string; basicInfoTab?: string; analysisTab?: string; userAdminTab?: string; receivablesTab?: string; workerPaymentsTab?: string; special?: string }>} */
export const ERP_NAV_ENTRIES = [
  { id: "dashboard", page: "dashboard", label: "\uB300\uC784\uBCF4\uB4DC", aliases: ["\uB300\uC784\uBCF4\uB4DC", "\uD648", "\uBA54\uC778"] },
  { id: "calendar", page: "calendar", label: "\uCE04\uB9B0\uB354", aliases: ["\uCE04\uB9B0\uB354", "\uCE98\uBCC0\uB354", "\uC77C\uC815", "\uB2EC\uB825"], special: "calendar" },
  { id: "clientSiteRequests", page: "clientSiteRequests", label: "\uD604\uC7A5 \uC811\uC218", aliases: ["\uD604\uC7A5 \uC811\uC218", "\uD604\uC7A5\uC811\uC218"] },
  { id: "clientSiteRequestCalendars", page: "clientSiteRequestCalendars", label: "\uC5C5\uCCB4\uBCC4 \uCE04\uB9B0\uB354", aliases: ["\uC5C5\uCCB4\uBCC4 \uCE04\uB9B0\uB354", "\uC5C5\uCCB4\uBCC4\uCE98\uBCC0\uB354"] },
  { id: "scAlimtalk", page: "scAlimtalk", label: "\uC54C\uB9BC\uD1A1", aliases: ["\uC54C\uB9BC\uD1A1", "SC \uC54C\uB9BC\uD1A1", "SC\uC54C\uB9BC\uD1A1"] },
  { id: "attendance", page: "attendance", label: "\uADFC\uD009 \uAD00\uB9AC", aliases: ["\uADFC\uD009", "\uADFC\uD009 \uAD00\uB9AC", "\uADFC\uD839"] },
  { id: "salesInput", page: "salesInput", label: "\uB9E4\uCD9C\uB4F1\uB85D", aliases: ["\uB9E4\uCD9C\uB4F1\uB85D", "\uB9E4\uCD9C \uB4F1\uB85D"] },
  { id: "sales", page: "sales", label: "\uB9E4\uCD9C\uAD00\uB9AC", aliases: ["\uB9E4\uCD9C\uAD00\uB9AC", "\uB9E4\uCD9C \uAD00\uB9AC"] },
  { id: "salesVoucherSearch", page: "salesVoucherSearch", label: "\uB9E4\uCD9C\uC804\uD45C\uAC80\uC0C9", aliases: ["\uB9E4\uCD9C\uC804\uD45C\uAC80\uC0C9", "\uB9E4\uCD9C \uC804\uD45C \uAC80\uC0C9", "\uC804\uD45C\uAC80\uC0C9", "\uC804\uD45C \uAC80\uC0C9"] },
  { id: "saleComments", page: "saleComments", label: "\uC804\uD45C \uCF54\uBA58\uD2B8", aliases: ["\uC804\uD45C \uCF54\uBA58\uD2B8", "\uCF54\uBA58\uD2B8"] },
  { id: "receivables_input", page: "receivables", receivablesTab: "input", label: "\uC785\uAE08 \uC785\uB825", aliases: ["\uC785\uAE08 \uC785\uB825", "\uC785\uAE08\uC785\uB825"] },
  { id: "receivables_unpaid", page: "receivables", receivablesTab: "receivables", label: "\uBBF8\uC218\uAE08", aliases: ["\uBBF8\uC218\uAE08 \uD604\uD669", "\uBBF8\uC218\uAE08"] },
  { id: "receivables_history", page: "receivables", receivablesTab: "history", label: "\uC785\uAE08 \uB0B4\uC5ED", aliases: ["\uC785\uAE08\uB0B4\uC5ED", "\uC785\uAE08 \uB0B4\uC5ED"], special: "deposit" },
  { id: "receivables_log", page: "receivables", receivablesTab: "log", label: "\uC785\uAE08\uB85C\uADF8", aliases: ["\uC785\uAE08\uB85C\uADF8", "\uC785\uAE08 \uB85C\uADF8"] },
  { id: "receivables", page: "receivables", label: "\uC785\uAE08/\uBBF8\uC218\uAE08", aliases: ["\uC785\uAE08/\uBBF8\uC218\uAE08", "\uC785\uAE08\uBBF8\uC218\uAE08"] },
  { id: "workerPayments_statement", page: "workerPayments", workerPaymentsTab: "statement", label: "\uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC11C", aliases: ["\uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC11C", "\uC2DC\uACF5\uB0B4\uC5ED\uC11C PDF"] },
  { id: "workerPayments", page: "workerPayments", label: "\uC2DC\uACF5\uC790 \uC9C0\uAE09", aliases: ["\uC2DC\uACF5\uC790 \uC9C0\uAE09", "\uC2DC\uACF5\uC790\uC9C0\uAE09", "\uC2DC\uACF5\uC790 \uC9C0\uAE09"] },
  { id: "reports", page: "reports", label: "\uBCF4\uACE0\uC11C", aliases: ["\uBCF4\uACE0\uC11C", "\uD53C\uBC97", "PIVOT"] },
  { id: "statements", page: "statements", label: "\uB0B4\uC5ED\uC11C", aliases: ["\uB0B4\uC5ED\uC11C", "PDF \uBCF4\uAD00"] },
  { id: "basicInfo_clients", page: "basicInfo", basicInfoTab: "clients", label: "\uAC70\uB798\uCC98 \uAD00\uB9AC", aliases: ["\uAC70\uB798\uCC98 \uAD00\uB9AC", "\uAC70\uB798\uCC98\uBAA9\uB85D", "\uAC70\uB798\uCC98 \uBAA9\uB85D"] },
  { id: "basicInfo_workers", page: "basicInfo", basicInfoTab: "workers", label: "\uC2DC\uACF5\uC790 \uAD00\uB9AC", aliases: ["\uC2DC\uACF5\uC790 \uAD00\uB9AC", "\uC2DC\uACF5\uC790\uBAA9\uB85D", "\uC2DC\uACF5\uC790 \uBAA9\uB85D"] },
  { id: "basicInfo_company", page: "basicInfo", basicInfoTab: "company", label: "\uD68C\uC0AC\uC815\uBCF4", aliases: ["\uD68C\uC0AC\uC815\uBCF4", "\uD68C\uC0AC \uC815\uBCF4"] },
  { id: "basicInfo", page: "basicInfo", label: "\uAE30\uBCF8\uC815\uBCF4", aliases: ["\uAE30\uBCF8\uC815\uBCF4", "\uAE30\uC900\uC815\uBCF4"] },
  { id: "accounting_bank", page: "accounting", accountingTab: "bank", label: "\uD1B5\uC7A5 \u00B7 \uAC00\uACC4\uBD80", aliases: ["\uD1B5\uC7A5\uB0B4\uC5ED", "\uD1B5\uC7A5 \uB0B4\uC5ED", "\uD1B5\uC7A5", "\uC740\uD589", "\uACC4\uC88C"] },
  { id: "accounting_ledger", page: "accounting", accountingTab: "ledger", label: "\uAC00\uACC4\uBD80 \uC870\uD68C", aliases: ["\uAC00\uACC4\uBD80 \uC870\uD68C", "\uC7A5\uBD80", "\uD68C\uC0AC\uAC00\uACC4\uBD80", "\uAC00\uACC4\uBD80"] },
  { id: "accounting_tax", page: "accounting", accountingTab: "tax", label: "\uC138\uAE08\uACC4\uC0B0\uC11C", aliases: ["\uC138\uAE08\uACC4\uC0B0\uC11C", "\uACC4\uC0B0\uC11C", "\uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED"], special: "taxInvoice" },
  { id: "accounting_classify", page: "accounting", accountingTab: "classify", label: "\uBD84\uB958 \uAD00\uB9AC", aliases: ["\uBD84\uB958\uAD00\uB9AC", "\uBD84\uB958 \uAD00\uB9AC"] },
  { id: "accounting", page: "accounting", label: "\uD68C\uACC4\u00B7\uD1B5\uC7A5", aliases: ["\uD68C\uACC4", "\uD68C\uACC4\uD1B5\uC7A5", "\uD68C\uACC4 \uD1B5\uC7A5"] },
  { id: "analysis_summary", page: "analysis", analysisTab: "accountSummary", label: "\uACC4\uC815 \uC694\uC57D", aliases: ["\uACC4\uC815 \uC694\uC57D", "\uACC4\uC815\uC694\uC57D"] },
  { id: "analysis_pl", page: "analysis", analysisTab: "profitLoss", label: "\uC190\uC775\uACC4\uC0B0\uC11C", aliases: ["\uC190\uC775\uACC4\uC0B0\uC11C", "\uC190\uC775"] },
  { id: "analysis_fixed", page: "analysis", analysisTab: "fixedExpense", label: "\uACE0\uC815\uBE44 \uBD84\uC11D", aliases: ["\uACE0\uC815\uBE44 \uBD84\uC11D", "\uACE0\uC815\uBE44\uBD84\uC11D"] },
  { id: "analysis_trend", page: "analysis", analysisTab: "accountTrend", label: "\uACC4\uC815\uBCC4 \uCD94\uC774", aliases: ["\uACC4\uC815\uBCC4 \uCD94\uC774", "\uACC4\uC815\uCD94\uC774"] },
  { id: "analysis_cash", page: "analysis", analysisTab: "cashStatus", label: "\uD1B5\uC7A5 \uC790\uAE08", aliases: ["\uD1B5\uC7A5 \uC790\uAE08", "\uD1B5\uC7A5\uC790\uAE08"] },
  { id: "analysis_cf", page: "analysis", analysisTab: "cashFlow", label: "\uD604\uAE08\uD770\uB984\uD45C", aliases: ["\uD604\uAE08\uD770\uB984\uD45C", "\uCF58\uD770\uB984"] },
  { id: "analysis_custom", page: "analysis", analysisTab: "custom", label: "\uB9DE\uCDA4 \uBD84\uC11D", aliases: ["\uB9DE\uCDA4 \uBD84\uC11D", "\uB9DE\uCDA4\uBD84\uC11D"] },
  { id: "analysis", page: "analysis", label: "\uBD84\uC11D", aliases: ["\uBD84\uC11D", "\uBD84\uC11D \uBA54\uB274"] },
  { id: "companyNotices", page: "companyNotices", label: "\uD68C\uC0AC\uAC8C\uC2DC\uD310", aliases: ["\uD68C\uC0AC\uAC8C\uC2DC\uD310", "\uAC8C\uC2DC\uD310", "\uAC8C\uC2DC\uD310"] },
  { id: "usersAdmin_users", page: "usersAdmin", userAdminTab: "users", label: "\uC0AC\uC6A9\uC790 \uAD00\uB9AC", aliases: ["\uC0AC\uC6A9\uC790 \uAD00\uB9AC", "\uC0AC\uC6A9\uC790\uAD00\uB9AC"] },
  { id: "usersAdmin_audit", page: "usersAdmin", userAdminTab: "audit", label: "\uAC10\uC0AC\uB85C\uADF8", aliases: ["\uAC10\uC0AC\uB85C\uADF8", "\uAC10\uC0AC \uB85C\uADF8"] },
  { id: "usersAdmin_login", page: "usersAdmin", userAdminTab: "login", label: "\uB85C\uADF8\uC778 \uC774\uB825", aliases: ["\uB85C\uADF8\uC778 \uC774\uB825", "\uB85C\uADF8\uC778\uC774\uB825"] },
  { id: "usersAdmin_system", page: "usersAdmin", userAdminTab: "system", label: "\uC11C\uBC84 \uB9AC\uC18C\uC2A4", aliases: ["\uC11C\uBC84 \uB9AC\uC18C\uC2A4", "\uC11C\uBC84\uB9AC\uC18C\uC2A4", "\uC2DC\uC2A4\uD15C \uB300\uC2DC\uBCF4\uB4DC"] },
  { id: "usersAdmin", page: "usersAdmin", label: "\uC0AC\uC6A9\uC790 \uAD00\uB9AC", aliases: ["\uC0AC\uC6A9\uC790\uAD00\uB9AC \uD5C8\uB974"] },
];

const ALIAS_INDEX = ERP_NAV_ENTRIES.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias, entry })),
).sort((a, b) => b.alias.length - a.alias.length);

const ID_INDEX = new Map(ERP_NAV_ENTRIES.map((entry) => [entry.id, entry]));
const PAGE_INDEX = new Map(ERP_NAV_ENTRIES.map((entry) => [entry.page, entry]));

function normalizeNavText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function resolveNavEntryByTarget(target) {
  const raw = String(target || "").trim();
  if (!raw) return null;
  if (ID_INDEX.has(raw)) return ID_INDEX.get(raw);
  const key = normalizeNavText(raw);
  for (const { alias, entry } of ALIAS_INDEX) {
    if (normalizeNavText(alias) === key || normalizeNavText(entry.id) === key) return entry;
  }
  if (PAGE_INDEX.has(raw)) return PAGE_INDEX.get(raw);
  for (const { alias, entry } of ALIAS_INDEX) {
    if (key.includes(normalizeNavText(alias))) return entry;
  }
  return null;
}

export function matchNavEntryFromMessage(text) {
  const raw = String(text || "").trim();
  const normalized = normalizeNavText(raw);
  if (!normalized) return null;

  for (const { alias, entry } of ALIAS_INDEX) {
    if (!normalized.includes(normalizeNavText(alias))) continue;
    return { entry, alias };
  }
  return null;
}

function buildNavPayload(entry, extras = {}) {
  return {
    page: entry.page,
    label: entry.label,
    accountingTab: entry.accountingTab,
    basicInfoTab: entry.basicInfoTab,
    analysisTab: entry.analysisTab,
    userAdminTab: entry.userAdminTab,
    receivablesTab: entry.receivablesTab,
    workerPaymentsTab: entry.workerPaymentsTab,
    ...extras,
  };
}

function hasStatementKeywords(text) {
  return (
    text.includes("\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C") ||
    text.includes("\uC2DC\uACF5\uB0B4\uC5ED\uC11C") ||
    text.includes("\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C")
  );
}

function trySpecializedNavigate({ entry, text, clientName, workerName, startDate, endDate, period }) {
  const resolvedClient = clientName || extractClientStatementQuery(text).clientName || extractDepositHistoryQuery(text).clientName || extractTaxInvoiceHistoryQuery(text).clientName;
  const resolvedWorker = workerName || extractWorkerStatementQuery(text).workerName;
  const clientPeriod = extractClientStatementQuery(text);
  const workerPeriod = extractWorkerStatementQuery(text);
  const taxPeriod = extractTaxInvoiceHistoryQuery(text);

  if (hasStatementKeywords(text) && resolvedClient) {
    return toolOpenClientConstructionCostStatement({
      clientName: resolvedClient,
      startDate: startDate || clientPeriod.startDate,
      endDate: endDate || clientPeriod.endDate,
      period,
    });
  }
  if (hasStatementKeywords(text) && resolvedWorker) {
    return toolOpenWorkerConstructionCostStatement({
      workerName: resolvedWorker,
      startDate: startDate || workerPeriod.startDate,
      endDate: endDate || workerPeriod.endDate,
      period,
    });
  }

  if ((entry.special === "calendar" || entry.page === "calendar") && resolvedClient) {
    return toolOpenClientCalendar({ clientName: resolvedClient });
  }
  if ((entry.special === "deposit" || entry.receivablesTab === "history") && resolvedClient) {
    return toolOpenClientDepositHistory({ clientName: resolvedClient });
  }
  if ((entry.special === "taxInvoice" || entry.accountingTab === "tax") && resolvedClient) {
    return toolOpenClientTaxInvoiceHistory({
      clientName: resolvedClient,
      startDate: startDate || taxPeriod.startDate,
      endDate: endDate || taxPeriod.endDate,
      period,
    });
  }

  return null;
}

export function toolNavigateErp({ target, clientName, workerName, startDate, endDate, period, message }) {
  const entry = resolveNavEntryByTarget(target);
  if (!entry) {
    return {
      ok: false,
      error: `\uC778\uC2DD\uD560 \uC218 \uC5C6\uB294 \uD654\uBA74: ${target}. navigate_erp \uB610\uB294 list_erp_pages\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.`,
    };
  }

  const contextText = String(message || "");
  const specialized = trySpecializedNavigate({
    entry,
    text: contextText,
    clientName,
    workerName,
    startDate,
    endDate,
    period,
  });
  if (specialized?.ok) {
    return { ...specialized, navKind: "specialized" };
  }

  return {
    ok: true,
    navKind: "page",
    nav: buildNavPayload(entry, {
      clientName: clientName || undefined,
      workerName: workerName || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  };
}

export function toolListErpPages() {
  return {
    ok: true,
    pages: ERP_NAV_ENTRIES.map((entry) => ({
      id: entry.id,
      page: entry.page,
      label: entry.label,
      aliases: entry.aliases.slice(0, 4),
      accountingTab: entry.accountingTab,
      basicInfoTab: entry.basicInfoTab,
      analysisTab: entry.analysisTab,
      userAdminTab: entry.userAdminTab,
      receivablesTab: entry.receivablesTab,
      workerPaymentsTab: entry.workerPaymentsTab,
    })),
  };
}

export function formatListErpPagesAnswer(data) {
  if (!data?.ok || !data.pages?.length) {
    return "\uD654\uBA74 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
  }
  const lines = [
    "\uCC57\uBD07\uC5D0\uC11C \uC5F4 \uC218 \uC788\uB294 \uD654\uBA74 \uC608\uC2DC\uC785\uB2C8\uB2E4. \"~ \uC5F4\uC5B4\uC918\" \uB610\uB294 \"~ \uC5F4\uC5B4\" \uB77C\uACE0 \uB9D0\uD574 \uC8FC\uC138\uC694.",
    "",
  ];
  const seen = new Set();
  for (const row of data.pages) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const hint = row.aliases?.[0] || row.label;
    lines.push(`\u00B7 ${row.label} \u2014 "${hint} \uC5F4\uC5B4\uC918"`);
  }
  lines.push(
    "",
    "\uAC70\uB798\uCC98/\uC2DC\uACF5\uC790 \uC774\uB984\uC744 \uBD99\uC774\uBA74 \uD544\uD130\uB3C4 \uB429\uB2C8\uB2E4.",
    "\uC608: \"\uC778\uB514\uD37C \uCE04\uB9B0\uB354 \uC5F4\uC5B4\uC918\", \"\uAE40\uBBFC\uC131 5\uC6D4 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uC5F4\uC5B4\uC918\"",
  );
  return lines.join("\n");
}

export function tryRuleBasedListErpPages(message) {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "");

  const asksPageList =
    /\uC5B4\uB290.*\uD654\uBA74|\uD654\uBA74.*\uC5F4.*\uC218|\uC5F4.*\uC218.*\uD654\uBA74|\uD654\uBA74.*\uBAA9\uB85D|\uBA54\uB274.*\uBAA9\uB85D|\uBA54\uB274.*\uC5F4|\uBB34\uC2A8.*\uC5F4|\uC5B4\uB090.*\uC5F4|\uC5F4\s*\uC218\s*\uC788|\uC5F4\uC218\uC788|\uAC00\uB2A5.*\uD654\uBA74|\uD654\uBA74.*\uC788|\uD654\uBA74.*\uC124\uBA85|\uC5B4\uB290.*\uBA54\uB274|\uBA54\uB274.*\uC124\uBA85/.test(
      normalized,
    ) ||
    /\uC5B4\uB290.*\uC5F4|\uBB34\uC2A8.*\uD654\uBA74|\uD654\uBA74.*\uC5BC\uB9C8|\uD654\uBA74.*\uC5E7\uAC70|\uC5F4\s*\uC218\s*\uC788\uB294|\uC5F4\uC218\uC788\uB294/.test(
      normalized,
    );

  if (!asksPageList) return null;
  return toolListErpPages();
}

export function tryRuleBasedNavigateOpen(message) {
  const text = String(message || "").trim();
  if (tryRuleBasedListErpPages(text)) return null;
  if (!OPEN_VERB.test(text)) return null;

  if (
    text.includes("\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C") ||
    text.includes("\uC2DC\uACF5\uB0B4\uC5ED\uC11C") ||
    text.includes("\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C") ||
    (text.includes("\uC785\uAE08\uB0B4\uC5ED") && !text.includes("\uC785\uAE08 \uC785\uB825")) ||
    (text.includes("\uC785\uAE08 \uB0B4\uC5ED") && !text.includes("\uC785\uAE08 \uC785\uB825")) ||
    (text.includes("\uC138\uAE08\uACC4\uC0B0\uC11C") && text.includes("\uB0B4\uC5ED")) ||
    (text.includes("\uCE04\uB9B0\uB354") && /(?:\uC5F4|\uBD10|\uCC28|\uC774\uB3D9)/.test(text))
  ) {
    return null;
  }

  const matched = matchNavEntryFromMessage(text);
  if (!matched) return null;

  return toolNavigateErp({
    target: matched.entry.id,
    message: text,
  });
}

export function formatNavigateAnswer(data) {
  if (!data.ok) return data.error || "\uD654\uBA74 \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (data.navKind === "specialized") {
    if (data.clientName && data.saleIds) return formatClientStatementOpenAnswer(data);
    if (data.workerName) return formatWorkerStatementOpenAnswer(data);
    if (data.anchorDate) return formatCalendarOpenAnswer(data);
    if (data.depositCount != null) return formatDepositOpenAnswer(data);
    if (data.invoiceCount != null) return formatTaxInvoiceOpenAnswer(data);
  }
  const label = data.nav?.label || data.nav?.page || "\uD654\uBA74";
  return `${label}\uC73C(\uB97C) \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.`;
}

export function buildChatActionsFromNavigateResult(data) {
  if (!data?.ok) return [];
  if (data.navKind === "specialized") {
    if (data.clientName && Array.isArray(data.saleIds)) return buildChatActionsFromClientStatementOpen(data);
    if (data.workerName && data.startDate) return buildChatActionsFromWorkerStatementOpen(data);
    if (data.anchorDate) return buildChatActionsFromCalendarOpen(data);
    if (data.depositCount != null) return buildChatActionsFromDepositOpen(data);
    if (data.invoiceCount != null) return buildChatActionsFromTaxInvoiceOpen(data);
  }
  if (data.nav?.page) {
    return [{ type: "navigate_erp", ...data.nav }];
  }
  return [];
}

export const NAVIGATE_ERP_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "navigate_erp",
    description:
      "ERP \uBA54\uB274/\uD654\uBA74\uC744 \uC5F4\uC796\uB2C8\uB2E4. \uB300\uC2DC\uBCF4\uB4DC, \uCE04\uB9B0\uB354, \uD86D\uAE08/\uBBF8\uC218\uAE08, \uD1B5\uC7A5, \uC138\uAE08\uACC4\uC0B0\uC11C, \uBD84\uC11D, \uB0B4\uC5ED\uC11C, \uADFC\uD009 \uB4F1 \uC804\uCCB4 \uD654\uBA74. \uAC70\uB798\uCC98/\uC2DC\uACF5\uC790/\uAE30\uAC04\uC774 \uC788\uC73C\uBA74 \uD544\uD130 \uC801\uC6A9. list_erp_pages\uB85C \uD654\uBA74 \uBAA9\uB85D \uC870\uD68C.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "\uD654\uBA74 id \uB610\uB294 \uC774\uB984 (\uC608: dashboard, calendar, accounting_bank, receivables_history, analysis, basicInfo_clients)",
        },
        clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC120\uD0DD)" },
        workerName: { type: "string", description: "\uC2DC\uACF5\uC790 \uC774\uB984 (\uC120\uD0DD)" },
        startDate: { type: "string", description: "YYYY-MM-DD (\uC120\uD0DD)" },
        endDate: { type: "string", description: "YYYY-MM-DD (\uC120\uD0DD)" },
        period: { type: "string", description: "\uC774\uBC88\uB2EC, 5\uC6D4 \uB4F1 (\uC120\uD0DD)" },
      },
      required: ["target"],
    },
  },
};

export const LIST_ERP_PAGES_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "list_erp_pages",
    description: "ERP \uCC57\uBD07\uC774 \uC5F4 \uC218 \uC788\uB294 \uD654\uBA74 \uBAA9\uB85D\uC744 \uC870\uD68C\uD569\uB2C8\uB2E4.",
    parameters: { type: "object", properties: {} },
  },
};
