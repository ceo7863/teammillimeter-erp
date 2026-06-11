import type { ErpChatAction } from "@/utils/erpChatApi";

export type TeamChatLinkType = "client" | "sale" | "bank_tx" | "worker" | "project";

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
};

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
