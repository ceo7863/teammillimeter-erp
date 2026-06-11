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
