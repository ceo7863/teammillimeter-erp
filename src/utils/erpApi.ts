import type { CompanyProfile } from "./companyProfile";

const TOKEN_KEY = "teammillimeter-erp-token";
const USER_KEY = "teammillimeter-erp-session";

function readPersistedAuthItem(key: string) {
  if (typeof window === "undefined") return "";
  const local = window.localStorage.getItem(key);
  if (local) return local;
  const session = window.sessionStorage.getItem(key);
  if (!session) return "";
  window.localStorage.setItem(key, session);
  window.sessionStorage.removeItem(key);
  return session;
}

function writePersistedAuthItem(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
  window.sessionStorage.removeItem(key);
}

function removePersistedAuthItem(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
}

export type ErpUser = {
  id: number;
  loginId: string;
  email?: string | null;
  name: string;
  role: string;
  phone?: string | null;
  isActive?: boolean;
  allowedPages?: string[] | null;
  sidebarOrder?: string[] | null;
  sidebarHidden?: string[] | null;
  attendanceViewUserIds?: number[] | null;
};

export type ErpUserRecord = ErpUser & {
  createdAt?: string;
  updatedAt?: string | null;
};

export type ErpPayload = {
  sales: unknown[];
  paymentVouchers: unknown[];
  paymentInputLogs?: unknown[];
  clients: unknown[];
  workers: unknown[];
  workerMonthlyPaymentMemos?: Record<string, string>;
  auditLogs: unknown[];
  loginLogs?: unknown[];
  workerPaymentRecords?: unknown[];
  workerPayoutVouchers?: unknown[];
  workerMonthlyActualVouchers?: unknown[];
  workerPayWithVatLearnRules?: unknown[];
  companyExpenses?: unknown[];
  attendanceRecords?: unknown[];
  fixedExpenses?: unknown[];
  fixedExpensePayments?: unknown[];
  bankLedgerRules?: unknown[];
  expenseCategories?: unknown[];
  fixedExpenseCategories?: unknown[];
  accountCodes?: unknown[];
  ledgerCategories?: unknown[];
  companyNotices?: unknown[];
  workPosts?: unknown[];
  saleComments?: unknown[];
  taxInvoices?: unknown[];
  bankTransactions?: unknown[];
  bankTransactionFolders?: unknown[];
  statementGenerationLogs?: unknown[];
  statementFolders?: unknown[];
  clientContracts?: unknown[];
  companyProfile?: CompanyProfile;
  notificationSettings?: import("./notificationSettings").NotificationSettings;
  saleAiRules?: import("@/utils/saleAiRules").SaleAiRules;
  workerAiRules?: import("@/utils/workerAiRules").WorkerAiRules;
  version?: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type CreateUserInput = {
  loginId: string;
  password: string;
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  allowedPages?: string[] | null;
  attendanceViewUserIds?: number[] | null;
};

export type UpdateUserInput = {
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  allowedPages?: string[] | null;
  attendanceViewUserIds?: number[] | null;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

export function getAuthToken() {
  return readPersistedAuthItem(TOKEN_KEY);
}

export function saveAuthSession(token: string, user: ErpUser) {
  writePersistedAuthItem(TOKEN_KEY, token);
  writePersistedAuthItem(USER_KEY, JSON.stringify(user));
}

export function loadAuthUser(): ErpUser | null {
  try {
    const raw = readPersistedAuthItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  removePersistedAuthItem(TOKEN_KEY);
  removePersistedAuthItem(USER_KEY);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiBase()}${path}`, { ...options, headers });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    const error = new Error(String(data.error || `API ${response.status}`));
    (error as Error & { status?: number; currentVersion?: number }).status = response.status;
    (error as Error & { currentVersion?: number }).currentVersion = data.currentVersion as number | undefined;
    throw error;
  }

  return data as T;
}

export async function loginWithApi(loginId: string, password: string) {
  const result = await apiRequest<{ token: string; user: ErpUser; erpVersion?: number | null }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ loginId, password }),
  });
  saveAuthSession(result.token, result.user);
  return { user: result.user, erpVersion: result.erpVersion ?? null };
}

export async function fetchAuthMe() {
  const result = await apiRequest<{ user: ErpUser }>("/auth/me");
  return result.user;
}

export type UpdateSelfProfileInput = {
  name: string;
  phone?: string;
  email?: string;
};

export async function updateSelfProfileApi(input: UpdateSelfProfileInput) {
  const result = await apiRequest<{ user: ErpUser }>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const token = getAuthToken();
  if (token) saveAuthSession(token, result.user);
  return result.user;
}

export async function changeSelfPasswordApi(currentPassword: string, password: string) {
  return apiRequest<{ ok: boolean }>("/auth/me/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, password }),
  });
}

export async function updateSidebarOrderApi(payload: { sidebarOrder?: string[]; sidebarHidden?: string[] }) {
  const body =
    typeof payload === "object" && payload != null && !Array.isArray(payload)
      ? payload
      : { sidebarOrder: payload as string[] };
  const result = await apiRequest<{ user: ErpUser }>("/auth/me/sidebar-order", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const token = getAuthToken();
  if (token) saveAuthSession(token, result.user);
  return result.user;
}

export async function fetchUsers() {
  const result = await apiRequest<{ users: ErpUserRecord[] }>("/users");
  return result.users;
}

export async function fetchAttendanceViewableUsers() {
  const result = await apiRequest<{ users: Array<{ id: number; name: string }> }>("/users/attendance-viewable");
  return result.users;
}

export async function createUserApi(input: CreateUserInput) {
  const result = await apiRequest<{ user: ErpUserRecord }>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function updateUserApi(id: number, input: UpdateUserInput) {
  const result = await apiRequest<{ user: ErpUserRecord }>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function resetUserPasswordApi(id: number, password: string) {
  return apiRequest<{ ok: boolean }>(`/users/${id}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

export async function setUserStatusApi(id: number, isActive: boolean) {
  return apiRequest<{ user: ErpUserRecord }>(`/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function fetchErpData() {
  return apiRequest<ErpPayload>("/erp");
}

export type ErpVersionMeta = {
  version: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export async function fetchErpVersion() {
  return apiRequest<ErpVersionMeta>("/erp/version");
}

export const ERP_SAVE_DOMAIN_NAMES = [
  "sales",
  "clients",
  "workers",
  "bankTransactions",
  "taxInvoices",
  "companyProfile",
  "settings",
] as const;

export type ErpSaveDomain = (typeof ERP_SAVE_DOMAIN_NAMES)[number];

export function buildErpDomainChunk(domain: ErpSaveDomain, payload: ErpPayload) {
  switch (domain) {
    case "sales":
      return {
        sales: payload.sales || [],
        paymentVouchers: payload.paymentVouchers || [],
        paymentInputLogs: payload.paymentInputLogs || [],
        saleComments: payload.saleComments || [],
      };
    case "clients":
      return { clients: payload.clients || [] };
    case "workers":
      return {
        workers: payload.workers || [],
        workerMonthlyPaymentMemos: payload.workerMonthlyPaymentMemos || {},
        workerPaymentRecords: payload.workerPaymentRecords || [],
        workerPayoutVouchers: payload.workerPayoutVouchers || [],
        workerMonthlyActualVouchers: payload.workerMonthlyActualVouchers || [],
        workerPayWithVatLearnRules: payload.workerPayWithVatLearnRules || [],
      };
    case "bankTransactions":
      return {
        bankTransactions: payload.bankTransactions || [],
        bankTransactionFolders: payload.bankTransactionFolders || [],
      };
    case "taxInvoices":
      return { taxInvoices: payload.taxInvoices || [] };
    case "companyProfile":
      return { companyProfile: payload.companyProfile ?? null };
    case "settings":
      return {
        auditLogs: payload.auditLogs || [],
        loginLogs: payload.loginLogs || [],
        companyExpenses: payload.companyExpenses || [],
        attendanceRecords: payload.attendanceRecords || [],
        fixedExpenses: payload.fixedExpenses || [],
        fixedExpensePayments: payload.fixedExpensePayments || [],
        bankLedgerRules: payload.bankLedgerRules || [],
        expenseCategories: payload.expenseCategories || [],
        fixedExpenseCategories: payload.fixedExpenseCategories || [],
        accountCodes: payload.accountCodes || [],
        ledgerCategories: payload.ledgerCategories || [],
        companyNotices: payload.companyNotices || [],
        workPosts: payload.workPosts || [],
        statementGenerationLogs: payload.statementGenerationLogs || [],
        statementFolders: payload.statementFolders || [],
        notificationSettings: payload.notificationSettings,
        saleAiRules: payload.saleAiRules,
        workerAiRules: payload.workerAiRules,
      };
    default:
      return {};
  }
}

export function findDirtyErpDomains(
  payload: ErpPayload,
  lastSaved: Record<string, string>,
  options?: { includeBank?: boolean },
) {
  const dirty: ErpSaveDomain[] = [];
  for (const domain of ERP_SAVE_DOMAIN_NAMES) {
    if (domain === "bankTransactions" && !options?.includeBank) continue;
    const chunk = buildErpDomainChunk(domain, payload);
    const serialized = JSON.stringify(chunk);
    if (serialized !== lastSaved[domain]) {
      dirty.push(domain);
    }
  }
  return dirty;
}

export async function fetchErpDomains(domains: ErpSaveDomain[]) {
  const params = new URLSearchParams({ domains: domains.join(",") });
  return apiRequest<Partial<ErpPayload> & ErpVersionMeta>(`/erp/domains?${params.toString()}`);
}

export async function patchErpDomains(input: {
  expectedVersion?: number;
  domains: Partial<Record<ErpSaveDomain, Record<string, unknown>>>;
}) {
  return apiRequest<{ ok: boolean; version: number; updatedAt: string; domains?: ErpSaveDomain[] }>(
    "/erp/domains",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function saveErpData(payload: ErpPayload) {
  return apiRequest<{ ok: boolean; version: number; updatedAt: string }>("/erp", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function saveWorkerMonthlyPaymentMemoApi(
  workerId: number | string,
  monthlyPaymentMemo: string,
  version?: number,
) {
  return apiRequest<{
    ok: boolean;
    version: number;
    updatedAt: string;
    workerId: string;
    monthlyPaymentMemo: string;
    workerMonthlyPaymentMemos?: Record<string, string>;
  }>(`/erp/workers/${encodeURIComponent(String(workerId))}/monthly-payment-memo`, {
    method: "PATCH",
    body: JSON.stringify({ monthlyPaymentMemo, version }),
  });
}

export function isApiModeEnabled() {
  return import.meta.env.VITE_USE_API !== "false";
}

export type BankSyncMeta = {
  lastImportAt?: string;
  lastImportSource?: string;
  lastImportAdded?: number;
  lastImportSkipped?: number;
  lastImportLatestAt?: string | null;
  lastImportDir?: string;
  lastImportBy?: string;
};

export type BankLiveSyncStatus = {
  enabled: boolean;
  importDir: string;
  intervalMs?: number;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  lastSourceFile?: string | null;
  lastAdded?: number;
  lastSkipped?: number;
  lastLatestTransactionAt?: string | null;
  sources?: {
    barobillBank?: boolean;
    openBanking?: boolean;
    folder?: boolean;
  };
};

export type BankSyncSnapshot = {
  version: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  changed: boolean;
  bankTransactionCount?: number;
  bankTransactions?: unknown[];
  bankTransactionFolders?: unknown[];
  bankSyncMeta?: BankSyncMeta | null;
  liveSyncStatus?: BankLiveSyncStatus | null;
};

export type BankFolderSyncResult = {
  ok: boolean;
  added?: number;
  skipped?: number;
  fetched?: number;
  source?: string;
  sourceFile?: string;
  latestTransactionAt?: string | null;
  version?: number;
  updatedAt?: string;
  reason?: string;
  error?: string;
  collecting?: boolean;
  bankSyncMeta?: BankSyncMeta | null;
  liveSyncStatus?: BankLiveSyncStatus | null;
};

export type BankTransactionsSnapshot = {
  version: number;
  updatedAt?: string | null;
  bankTransactions: unknown[];
  bankTransactionFolders?: unknown[];
  bankSyncMeta?: BankSyncMeta | null;
};

export async function fetchBankTransactionsSnapshot() {
  return apiRequest<BankTransactionsSnapshot>("/erp/bank-transactions");
}

export async function fetchBankSyncSnapshot(
  sinceVersion: number,
  localCount?: number,
  localLatestAt?: string,
  localImportAt?: string,
) {
  const params = new URLSearchParams({ sinceVersion: String(sinceVersion) });
  if (localCount != null && Number.isFinite(localCount)) {
    params.set("localCount", String(localCount));
  }
  if (localLatestAt) {
    params.set("localLatestAt", localLatestAt);
  }
  if (localImportAt) {
    params.set("localImportAt", localImportAt);
  }
  return apiRequest<BankSyncSnapshot>(`/erp/bank-sync?${params.toString()}`);
}

export async function runBankFolderSync(options?: { refresh?: boolean }) {
  return apiRequest<BankFolderSyncResult>("/bank-sync/run", {
    method: "POST",
    body: JSON.stringify({ refresh: options?.refresh === true }),
  });
}

export async function fetchBankSyncStatus() {
  return apiRequest<{
    liveSyncStatus: BankLiveSyncStatus;
    bankSyncMeta?: BankSyncMeta | null;
    version: number;
    updatedAt?: string | null;
  }>("/bank-sync/status");
}
