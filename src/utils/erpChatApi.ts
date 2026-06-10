import { apiRequest } from "@/utils/erpApi";

export type ErpChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ErpChatLog = {
  id: number;
  question: string;
  answer: string;
  engine?: string;
  toolsJson?: string;
  createdAt: string;
};

export type ErpChatAction =
  | { type: "open_sale_voucher"; saleId: string | number }
  | { type: "open_sale_voucher_search"; client: string; startDate: string; endDate: string }
  | { type: "open_client_calendar"; clientName: string; anchorDate: string };

export type ErpChatResponse = {
  ok: boolean;
  answer?: string;
  engine?: string;
  logId?: number;
  toolsUsed?: string[];
  actions?: ErpChatAction[];
  error?: string;
};

export async function sendErpChatMessage(messages: ErpChatMessage[]) {
  return apiRequest<ErpChatResponse>("/erp/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}

export async function fetchErpChatHistory(limit = 30) {
  return apiRequest<{ logs: ErpChatLog[] }>(`/erp/chat/history?limit=${limit}`);
}

export async function clearErpChatHistoryApi() {
  return apiRequest<{ ok: boolean }>("/erp/chat/history", { method: "DELETE" });
}

export async function fetchErpChatAudit(limit = 100) {
  return apiRequest<{ logs: ErpChatLog[] }>(`/erp/chat/audit?limit=${limit}`);
}
