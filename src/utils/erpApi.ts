import type { CompanyProfile } from "./companyProfile";

const TOKEN_KEY = "teammillimeter-erp-token";
const USER_KEY = "teammillimeter-erp-session";

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
  auditLogs: unknown[];
  loginLogs?: unknown[];
  workerPaymentRecords?: unknown[];
  companyExpenses?: unknown[];
  attendanceRecords?: unknown[];
  fixedExpenses?: unknown[];
  fixedExpensePayments?: unknown[];
  bankLedgerRules?: unknown[];
  expenseCategories?: unknown[];
  fixedExpenseCategories?: unknown[];
  companyNotices?: unknown[];
  workPosts?: unknown[];
  taxInvoices?: unknown[];
  bankTransactions?: unknown[];
  bankTransactionFolders?: unknown[];
  statementGenerationLogs?: unknown[];
  statementFolders?: unknown[];
  companyProfile?: CompanyProfile;
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
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(TOKEN_KEY) || "";
}

export function saveAuthSession(token: string, user: ErpUser) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadAuthUser(): ErpUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
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

export async function updateSidebarOrderApi(sidebarOrder: string[]) {
  const result = await apiRequest<{ user: ErpUser }>("/auth/me/sidebar-order", {
    method: "PATCH",
    body: JSON.stringify({ sidebarOrder }),
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

export async function saveErpData(payload: ErpPayload) {
  return apiRequest<{ ok: boolean; version: number; updatedAt: string }>("/erp", {
    method: "PUT",
    body: JSON.stringify(payload),
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
};

export type BankSyncSnapshot = {
  version: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
  changed: boolean;
  bankTransactions?: unknown[];
  bankTransactionFolders?: unknown[];
  bankSyncMeta?: BankSyncMeta | null;
  liveSyncStatus?: BankLiveSyncStatus | null;
};

export type BankFolderSyncResult = {
  ok: boolean;
  added?: number;
  skipped?: number;
  sourceFile?: string;
  latestTransactionAt?: string | null;
  version?: number;
  updatedAt?: string;
  reason?: string;
  error?: string;
  bankSyncMeta?: BankSyncMeta | null;
  liveSyncStatus?: BankLiveSyncStatus | null;
};

export async function fetchBankSyncSnapshot(sinceVersion: number) {
  return apiRequest<BankSyncSnapshot>(`/erp/bank-sync?sinceVersion=${encodeURIComponent(String(sinceVersion))}`);
}

export async function runBankFolderSync() {
  return apiRequest<BankFolderSyncResult>("/bank-sync/run", { method: "POST" });
}

export async function fetchBankSyncStatus() {
  return apiRequest<{
    liveSyncStatus: BankLiveSyncStatus;
    bankSyncMeta?: BankSyncMeta | null;
    version: number;
    updatedAt?: string | null;
  }>("/bank-sync/status");
}
