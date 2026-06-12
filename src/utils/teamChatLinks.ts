import type { ErpChatAction } from "@/utils/erpChatApi";

export type TeamChatLinkType =
  | "client"
  | "sale"
  | "bank_tx"
  | "worker"
  | "project"
  | "client_statement"
  | "worker_statement"
  | "receivable"
  | "calendar"
  | "tax_invoice"
  | "client_site_request"
  | "worker_payment"
  | "daily_report"
  | "sale_comment"
  | "pdf_archive"
  | "deposit_history"
  | "page";

export type TeamChatLink = {
  type: TeamChatLinkType;
  id: string;
  label: string;
};

export const TEAM_CHAT_LINK_LABELS: Record<TeamChatLinkType, string> = {
  client: "\uAC70\uB798\uCC98",
  sale: "\uB9E4\uCD9C",
  bank_tx: "\uC740\uD589\uAC70\uB798",
  worker: "\uC778\uC0AC",
  project: "\uD504\uB85C\uC81D\uD2B8",
  client_statement: "\uAC70\uB798\uCC98 \uB0B4\uC5ED\uC11C",
  worker_statement: "\uC2DC\uACF5 \uB0B4\uC5ED\uC11C",
  receivable: "\uBBF8\uC218\uAE08",
  calendar: "\uCE98\uB9B0\uB354",
  tax_invoice: "\uC138\uAE08\uACC4\uC0B0\uC11C",
  client_site_request: "\uD604\uC7A5 \uC811\uC218",
  worker_payment: "\uC2DC\uACF5\uC790 \uC9C0\uAE09",
  daily_report: "\uC77C\uC77C\uBCF4\uACE0",
  sale_comment: "\uC804\uD45C \uCF54\uBA58\uD2B8",
  pdf_archive: "PDF \uBCF4\uAD00\uD568",
  deposit_history: "\uC785\uAE08 \uB0B4\uC5ED",
  page: "ERP",
};

function splitTeamChatPayloadId(id: string, parts = 3) {
  const segments = String(id || "").split("|");
  while (segments.length < parts) segments.push("");
  return segments;
}

function parseBankTxLinkMeta(link: Pick<TeamChatLink, "id" | "label">) {
  const id = String(link.id || "").trim();
  const parts = String(link.label || "")
    .split("\u00B7")
    .map((part) => part.trim())
    .filter(Boolean);
  const dateRaw = parts[0] || "";
  const txDate = /^\d{4}-\d{2}-\d{2}/.exec(dateRaw)?.[0] || "";
  return {
    id,
    txDate,
    counterparty: parts[1] || "",
    amount: parts[2] || "",
  };
}

export function teamChatLinkToAction(link: TeamChatLink): ErpChatAction | null {
  const label = String(link.label || "").trim();
  const id = String(link.id || "").trim();
  if (!label && !id) return null;

  switch (link.type) {
    case "client":
      return {
        type: "navigate_erp",
        page: "basicInfo",
        basicInfoTab: "clients",
        clientName: label,
        label,
      };
    case "sale":
    case "sale_comment":
      return { type: "open_sale_voucher", saleId: id || label };
    case "bank_tx": {
      const meta = parseBankTxLinkMeta(link);
      if (meta.id) {
        return {
          type: "navigate_erp",
          page: "accounting",
          accountingTab: "bank",
          bankTransactionId: meta.id,
          startDate: meta.txDate || undefined,
          endDate: meta.txDate || undefined,
          label: label || meta.id,
        };
      }
      return {
        type: "navigate_erp",
        page: "accounting",
        accountingTab: "bank",
        bankSearchQuery: meta.counterparty || meta.amount || label || id,
        startDate: meta.txDate || undefined,
        endDate: meta.txDate || undefined,
        label: label || id,
      };
    }
    case "worker":
      return {
        type: "navigate_erp",
        page: "basicInfo",
        basicInfoTab: "workers",
        workerName: label,
        label,
      };
    case "project":
      return {
        type: "navigate_erp",
        page: "clientSiteRequests",
        clientName: label,
        label,
      };
    case "client_statement": {
      const [client, startDate, endDate] = splitTeamChatPayloadId(id);
      if (!client) return null;
      return {
        type: "open_client_statement",
        client,
        startDate: startDate || "",
        endDate: endDate || "",
        saleIds: [],
        autoGenerate: true,
        unpaidOnly: false,
      };
    }
    case "worker_statement": {
      const [workerName, startDate, endDate] = splitTeamChatPayloadId(id);
      if (!workerName) return null;
      return {
        type: "open_worker_construction_cost_statement",
        workerName,
        startDate: startDate || "",
        endDate: endDate || "",
        autoGenerate: true,
      };
    }
    case "receivable": {
      const [clientName, startDate, endDate, receivablesTab] = splitTeamChatPayloadId(id, 4);
      const tab = receivablesTab === "input" ? "input" : "receivables";
      return {
        type: "navigate_erp",
        page: "receivables",
        receivablesTab: tab,
        clientName: clientName || label,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        label: label || clientName,
      };
    }
    case "calendar": {
      const [clientName, anchorDate] = splitTeamChatPayloadId(id, 2);
      if (!clientName) return null;
      return {
        type: "open_client_calendar",
        clientName,
        anchorDate: anchorDate || "",
      };
    }
    case "tax_invoice": {
      const [clientName, startDate, endDate] = splitTeamChatPayloadId(id, 3);
      if (!clientName) return null;
      return {
        type: "open_client_tax_invoice_history",
        clientName,
        startDate: startDate || "",
        endDate: endDate || "",
      };
    }
    case "client_site_request": {
      const [clientName, clientId] = splitTeamChatPayloadId(id, 2);
      if (!clientName) return null;
      return {
        type: "open_client_site_request_calendar",
        clientName,
        clientId: clientId || undefined,
      };
    }
    case "worker_payment": {
      const [workerName, tab] = splitTeamChatPayloadId(id, 2);
      const workerPaymentsTab =
        tab === "detail" ||
        tab === "monthly" ||
        tab === "monthlyActual" ||
        tab === "statement" ||
        tab === "payoutHistory" ||
        tab === "assignmentFairness"
          ? tab
          : "summary";
      return {
        type: "navigate_erp",
        page: "workerPayments",
        workerName: workerName || label,
        workerPaymentsTab,
        label: label || workerName,
      };
    }
    case "daily_report": {
      const [dateKey] = splitTeamChatPayloadId(id, 1);
      return {
        type: "navigate_erp",
        page: "dailyReport",
        startDate: dateKey || undefined,
        label: label || "\uC77C\uC77C\uBCF4\uACE0",
      };
    }
    case "pdf_archive": {
      const [archiveId, subjectName, startDate, endDate] = splitTeamChatPayloadId(id, 4);
      return {
        type: "navigate_erp",
        page: "pdfArchive",
        clientName: subjectName || label,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        label: label || subjectName || archiveId,
      };
    }
    case "deposit_history": {
      const [clientName, startDate, endDate, allHistoryFlag] = splitTeamChatPayloadId(id, 4);
      if (!clientName) return null;
      return {
        type: "open_client_deposit_history",
        clientName,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        allHistory: allHistoryFlag === "all",
      };
    }
    case "page": {
      const [page, workerPaymentsTab, clientName, startDate, endDate, workerName, accountingTab, basicInfoTab] =
        splitTeamChatPayloadId(id, 8);
      if (!page) return null;
      const action: ErpChatAction = {
        type: "navigate_erp",
        page,
        label: label || page,
      };
      if (workerPaymentsTab) {
        (action as { workerPaymentsTab?: string }).workerPaymentsTab = workerPaymentsTab as never;
      }
      if (clientName) action.clientName = clientName;
      if (workerName) action.workerName = workerName;
      if (startDate) action.startDate = startDate;
      if (endDate) action.endDate = endDate;
      if (accountingTab === "bank" || accountingTab === "ledger" || accountingTab === "tax" || accountingTab === "classify") {
        action.accountingTab = accountingTab;
      }
      if (basicInfoTab === "clients" || basicInfoTab === "workers" || basicInfoTab === "company") {
        action.basicInfoTab = basicInfoTab;
      }
      return action;
    }
    default:
      return null;
  }
}

export function buildClientTeamChatLink(client: { id?: string | number; name?: string }): TeamChatLink {
  return {
    type: "client",
    id: String(client.id ?? client.name ?? ""),
    label: String(client.name || "").trim(),
  };
}

export function buildWorkerTeamChatLink(worker: { id?: string | number; name?: string }): TeamChatLink {
  return {
    type: "worker",
    id: String(worker.id ?? worker.name ?? ""),
    label: String(worker.name || "").trim(),
  };
}

export function buildSaleTeamChatLink(sale: {
  id?: string | number;
  client?: string;
  date?: string;
  amount?: number;
}): TeamChatLink {
  const client = String(sale.client || "").trim();
  const label = client
    ? `${client} ${String(sale.date || "").trim()}`.trim()
    : `\uB9E4\uCD9C #${sale.id ?? ""}`;
  return {
    type: "sale",
    id: String(sale.id ?? ""),
    label: label || String(sale.id ?? ""),
  };
}

export function buildSaleCommentTeamChatLink(params: {
  saleId: string | number;
  client?: string;
  voucherLabel?: string;
  commentBody?: string;
}): TeamChatLink {
  const client = String(params.client || "").trim();
  const voucher = String(params.voucherLabel || "").trim();
  const label = voucher
    ? `${client ? `${client} ` : ""}${voucher} \uCF54\uBA58\uD2B8`
    : client
      ? `${client} \uCF54\uBA58\uD2B8`
      : `\uC804\uD45C \uCF54\uBA58\uD2B8 #${params.saleId}`;
  return {
    type: "sale_comment",
    id: String(params.saleId ?? ""),
    label: label.trim() || String(params.saleId ?? ""),
  };
}

export function buildClientStatementTeamChatLink(params: {
  client: string;
  startDate: string;
  endDate: string;
}): TeamChatLink {
  const client = String(params.client || "").trim();
  const startDate = String(params.startDate || "").trim();
  const endDate = String(params.endDate || "").trim();
  const period =
    startDate && endDate && startDate !== endDate ? `${startDate}~${endDate}` : startDate || endDate;
  return {
    type: "client_statement",
    id: [client, startDate, endDate].join("|"),
    label: period ? `${client} \uB0B4\uC5ED\uC11C ${period}` : `${client} \uB0B4\uC5ED\uC11C`,
  };
}

export function buildWorkerStatementTeamChatLink(params: {
  workerName: string;
  startDate: string;
  endDate: string;
}): TeamChatLink {
  const workerName = String(params.workerName || "").trim();
  const startDate = String(params.startDate || "").trim();
  const endDate = String(params.endDate || "").trim();
  const period =
    startDate && endDate && startDate !== endDate ? `${startDate}~${endDate}` : startDate || endDate;
  return {
    type: "worker_statement",
    id: [workerName, startDate, endDate].join("|"),
    label: period ? `${workerName} \uB0B4\uC5ED\uC11C ${period}` : `${workerName} \uB0B4\uC5ED\uC11C`,
  };
}

export function buildReceivableClientTeamChatLink(params: {
  client: string;
  startDate?: string;
  endDate?: string;
  tab?: "input" | "receivables";
  label?: string;
}): TeamChatLink {
  const client = String(params.client || "").trim();
  const startDate = String(params.startDate || "").trim();
  const endDate = String(params.endDate || "").trim();
  const tab = params.tab === "input" ? "input" : "receivables";
  return {
    type: "receivable",
    id: [client, startDate, endDate, tab].join("|"),
    label: params.label || `${client} \uBBF8\uC218\uAE08`,
  };
}

export function buildReceivableSaleTeamChatLink(
  row: { id?: string | number; client?: string; voucherNo?: string },
  filters: { startDate?: string; endDate?: string } = {},
): TeamChatLink {
  const client = String(row.client || "").trim();
  const voucher = String(row.voucherNo || row.id || "").trim();
  return {
    type: "receivable",
    id: [client, String(filters.startDate || "").trim(), String(filters.endDate || "").trim(), "input"].join("|"),
    label: voucher ? `${client} ${voucher} \uBBF8\uC218` : `${client} \uBBF8\uC218`,
  };
}

export function buildSentStatementPendingTeamChatLink(record: {
  subjectName?: string;
  periodStart?: string;
  periodEnd?: string;
}): TeamChatLink {
  const client = String(record.subjectName || "").trim();
  const startDate = String(record.periodStart || "").trim();
  const endDate = String(record.periodEnd || "").trim();
  const period =
    startDate && endDate && startDate !== endDate ? `${startDate}~${endDate}` : startDate || endDate;
  return buildReceivableClientTeamChatLink({
    client,
    startDate,
    endDate,
    tab: "input",
    label: period ? `${client} \uC785\uAE08\uB300\uAE30 ${period}` : `${client} \uC785\uAE08\uB300\uAE30`,
  });
}

export function buildBankTxTeamChatLink(tx: {
  id?: string;
  description?: string;
  counterpartyName?: string;
  deposit?: number;
  withdrawal?: number;
  transactionAt?: string;
}): TeamChatLink {
  const amount = (tx.deposit || 0) > 0 ? tx.deposit : tx.withdrawal;
  const parts = [
    String(tx.transactionAt || "").trim(),
    String(tx.counterpartyName || tx.description || "").trim(),
    amount != null && amount > 0 ? `${amount}` : "",
  ].filter(Boolean);
  return {
    type: "bank_tx",
    id: String(tx.id ?? ""),
    label: parts.join(" \u00B7 ") || String(tx.id ?? ""),
  };
}

export function buildCalendarTeamChatLink(params: {
  clientName: string;
  anchorDate?: string;
}): TeamChatLink {
  const clientName = String(params.clientName || "").trim();
  const anchorDate = String(params.anchorDate || "").trim();
  const period = anchorDate ? ` ${anchorDate}` : "";
  return {
    type: "calendar",
    id: [clientName, anchorDate].join("|"),
    label: `${clientName} \uCE98\uB9B0\uB354${period}`.trim(),
  };
}

export function buildTaxInvoiceTeamChatLink(params: {
  clientName: string;
  startDate?: string;
  endDate?: string;
  invoiceNo?: string;
}): TeamChatLink {
  const clientName = String(params.clientName || "").trim();
  const startDate = String(params.startDate || "").trim();
  const endDate = String(params.endDate || "").trim();
  const invoiceNo = String(params.invoiceNo || "").trim();
  const period =
    startDate && endDate && startDate !== endDate ? `${startDate}~${endDate}` : startDate || endDate;
  const label = invoiceNo
    ? `${clientName} ${invoiceNo}`
    : period
      ? `${clientName} \uC138\uAE08\uACC4\uC0B0\uC11C ${period}`
      : `${clientName} \uC138\uAE08\uACC4\uC0B0\uC11C`;
  return {
    type: "tax_invoice",
    id: [clientName, startDate, endDate].join("|"),
    label,
  };
}

export function buildClientSiteRequestTeamChatLink(params: {
  clientName: string;
  clientId?: string | number;
}): TeamChatLink {
  const clientName = String(params.clientName || "").trim();
  return {
    type: "client_site_request",
    id: [clientName, String(params.clientId ?? "")].join("|"),
    label: `${clientName} \uD604\uC7A5 \uC811\uC218`,
  };
}

export function buildWorkerPaymentTeamChatLink(params: {
  workerName: string;
  tab?: "summary" | "detail" | "monthly" | "monthlyActual" | "statement" | "payoutHistory" | "assignmentFairness";
}): TeamChatLink {
  const workerName = String(params.workerName || "").trim();
  const tab = params.tab || "summary";
  return {
    type: "worker_payment",
    id: [workerName, tab].join("|"),
    label: `${workerName} \uC2DC\uACF5\uC790 \uC9C0\uAE09`,
  };
}

export function buildDailyReportTeamChatLink(params: { date?: string } = {}): TeamChatLink {
  const date = String(params.date || "").trim();
  return {
    type: "daily_report",
    id: date,
    label: date ? `\uC77C\uC77C\uBCF4\uACE0 ${date}` : "\uC77C\uC77C\uBCF4\uACE0",
  };
}

export function buildPdfArchiveTeamChatLink(params: {
  id?: string;
  subjectName?: string;
  startDate?: string;
  endDate?: string;
  label?: string;
}): TeamChatLink {
  const archiveId = String(params.id || "").trim();
  const subjectName = String(params.subjectName || "").trim();
  const startDate = String(params.startDate || "").trim();
  const endDate = String(params.endDate || "").trim();
  const period =
    startDate && endDate && startDate !== endDate ? `${startDate}~${endDate}` : startDate || endDate;
  return {
    type: "pdf_archive",
    id: [archiveId, subjectName, startDate, endDate].join("|"),
    label:
      params.label ||
      (subjectName
        ? period
          ? `${subjectName} PDF ${period}`
          : `${subjectName} PDF`
        : "PDF \uBCF4\uAD00\uD568"),
  };
}

export function buildDepositHistoryTeamChatLink(params: {
  clientName: string;
  startDate?: string;
  endDate?: string;
  allHistory?: boolean;
}): TeamChatLink {
  const clientName = String(params.clientName || "").trim();
  const startDate = String(params.startDate || "").trim();
  const endDate = String(params.endDate || "").trim();
  const period =
    startDate && endDate && startDate !== endDate ? `${startDate}~${endDate}` : startDate || endDate;
  return {
    type: "deposit_history",
    id: [clientName, startDate, endDate, params.allHistory ? "all" : ""].join("|"),
    label: period ? `${clientName} \uC785\uAE08\uB0B4\uC5ED ${period}` : `${clientName} \uC785\uAE08\uB0B4\uC5ED`,
  };
}

export function buildPageTeamChatLink(params: {
  page: string;
  label?: string;
  workerPaymentsTab?: string;
  clientName?: string;
  workerName?: string;
  startDate?: string;
  endDate?: string;
  accountingTab?: string;
  basicInfoTab?: string;
}): TeamChatLink {
  const page = String(params.page || "").trim();
  return {
    type: "page",
    id: [
      page,
      String(params.workerPaymentsTab || ""),
      String(params.clientName || ""),
      String(params.startDate || ""),
      String(params.endDate || ""),
      String(params.workerName || ""),
      String(params.accountingTab || ""),
      String(params.basicInfoTab || ""),
    ].join("|"),
    label: params.label || page,
  };
}
