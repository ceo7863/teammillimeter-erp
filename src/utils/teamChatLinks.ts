import type { ErpChatAction } from "@/utils/erpChatApi";

export type TeamChatLinkType =
  | "client"
  | "sale"
  | "bank_tx"
  | "worker"
  | "project"
  | "client_statement"
  | "worker_statement"
  | "receivable";

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
};

function splitTeamChatPayloadId(id: string, parts = 3) {
  const segments = String(id || "").split("|");
  while (segments.length < parts) segments.push("");
  return segments;
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
      return { type: "open_sale_voucher", saleId: id || label };
    case "bank_tx":
      return {
        type: "navigate_erp",
        page: "accounting",
        accountingTab: "bank",
        bankSearchQuery: label || id,
        label: label || id,
      };
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
