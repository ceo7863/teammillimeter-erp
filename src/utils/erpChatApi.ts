import { apiRequest, getAuthToken } from "@/utils/erpApi";

function erpApiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

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
  | { type: "open_client_calendar"; clientName: string; anchorDate: string }
  | {
      type: "open_worker_construction_cost_statement";
      workerName: string;
      startDate: string;
      endDate: string;
      autoGenerate?: boolean;
    }
  | {
      type: "open_client_statement";
      client: string;
      startDate: string;
      endDate: string;
      saleIds: Array<string | number>;
      autoGenerate?: boolean;
      unpaidOnly?: boolean;
      autoShareLink?: boolean;
    }
  | { type: "open_client_deposit_history"; clientName: string; allHistory?: boolean; startDate?: string; endDate?: string }
  | {
      type: "open_client_tax_invoice_history";
      clientName: string;
      startDate: string;
      endDate: string;
    }
  | { type: "open_client_business_reg"; clientName: string; clientId: string | number }
  | { type: "open_sc_schedule"; url: string }
  | { type: "open_client_site_request_calendar"; clientName: string; clientId?: string | number }
  | {
      type: "navigate_erp";
      page: string;
      label?: string;
      accountingTab?: "bank" | "ledger" | "tax" | "classify";
      basicInfoTab?: "clients" | "workers" | "company";
      analysisTab?:
        | "accountSummary"
        | "profitLoss"
        | "fixedExpense"
        | "accountTrend"
        | "cashStatus"
        | "cashFlow"
        | "custom";
      userAdminTab?: "users" | "audit" | "login" | "notify" | "system";
      receivablesTab?: "input" | "receivables" | "history" | "log";
      workerPaymentsTab?:
        | "summary"
        | "detail"
        | "monthly"
        | "monthlyActual"
        | "statement"
        | "payoutHistory"
        | "assignmentFairness";
      clientName?: string;
      workerName?: string;
      startDate?: string;
      endDate?: string;
      bankColumnPreset?: "account_only";
      bankSearchQuery?: string;
      taxSearchQuery?: string;
      taxBankLinkFilter?: "unlinked" | "linked";
    }
  | { type: "open_chat_guide_pdf" };

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

export async function openErpChatGuidePdf() {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${erpApiBase()}/erp/chat/guide-pdf`, { headers });
  if (!response.ok) {
    let message = "PDF를 불러올 수 없습니다.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
