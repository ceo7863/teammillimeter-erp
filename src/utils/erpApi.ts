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
  receipts?: unknown[];
  receiptAllocations?: unknown[];
  effectivePaymentVouchers?: unknown[];
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
  workTasks?: unknown[];
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
  probationEvalTemplates?: import("@/utils/probationEval").ProbationEvalTemplate[];
  probationEvalRequests?: import("@/utils/probationEval").ProbationEvalRequest[];
  probationEvalNotifyMeta?: unknown;
  officeStaff?: unknown[];
  officePayrollSettings?: unknown;
  officePayrollProfiles?: unknown[];
  officePayrollSheets?: unknown[];
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
    (error as Error & {
      status?: number;
      currentVersion?: number;
      settings?: unknown;
      updatedAt?: string;
    }).status = response.status;
    (error as Error & { currentVersion?: number }).currentVersion = data.currentVersion as number | undefined;
    (error as Error & { settings?: unknown }).settings = data.settings;
    (error as Error & { updatedAt?: string }).updatedAt =
      typeof data.updatedAt === "string" ? data.updatedAt : undefined;
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
  "officeStaff",
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
    case "officeStaff":
      return {
        officeStaff: payload.officeStaff || [],
        officePayrollSettings: payload.officePayrollSettings,
        officePayrollProfiles: payload.officePayrollProfiles || [],
        officePayrollSheets: payload.officePayrollSheets || [],
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
        workTasks: payload.workTasks || [],
        statementGenerationLogs: payload.statementGenerationLogs || [],
        statementFolders: payload.statementFolders || [],
        notificationSettings: payload.notificationSettings,
        saleAiRules: payload.saleAiRules,
        workerAiRules: payload.workerAiRules,
        probationEvalTemplates: payload.probationEvalTemplates || [],
        probationEvalRequests: payload.probationEvalRequests || [],
        probationEvalNotifyMeta: payload.probationEvalNotifyMeta || null,
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

export type WorkerPortalScSyncUpdate = {
  workerId?: number | string | null;
  workerName: string;
  portalLoginId: string;
  previousPortalLoginId?: string | null;
  scName: string;
  employeeNoStr: string;
};

export type WorkerPortalScSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  configured?: boolean;
  scUserCount?: number;
  updatedCount?: number;
  updates?: WorkerPortalScSyncUpdate[];
  skippedItems?: Array<{
    scName?: string;
    employeeNoStr?: string;
    workerName?: string;
    reason: string;
    otherWorkerName?: string;
  }>;
  version?: number;
};

export async function previewWorkerPortalLoginIdsFromSc() {
  return apiRequest<WorkerPortalScSyncResult>("/workers/portal-login-sc-sync/preview");
}

export async function syncWorkerPortalLoginIdsFromSc() {
  return apiRequest<WorkerPortalScSyncResult>("/workers/portal-login-sc-sync", {
    method: "POST",
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

export type ReceiptApiResult = {
  ok: boolean;
  idempotent?: boolean;
  receipt: import("./receiptLedger").ReceiptRecord;
  allocations: import("./receiptLedger").ReceiptAllocationRecord[];
  summary?: import("./receiptLedger").ReceiptSummary;
  original?: import("./receiptLedger").ReceiptRecord;
  version?: number;
  updatedAt?: string;
};

export async function createReceiptApi(input: import("./receiptLedger").CreateReceiptInput) {
  return apiRequest<ReceiptApiResult>("/receipts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createReceiptRegisterApi(
  input: import("./receiptLedger").CreateReceiptInput & {
    requireSentStatements?: boolean;
    autoAllocate?: boolean;
  },
) {
  return apiRequest<any>("/receipts/register", { method: "POST", body: JSON.stringify(input) });
}

export async function createDisbursementRegisterApi(input: Record<string, unknown>) {
  return apiRequest<any>("/disbursements/register", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchApCutoverStatusApi() {
  return apiRequest<Record<string, unknown>>("/admin/ap-cutover/status");
}

export async function previewApCutoverApi(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/ap-cutover/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function activateApCutoverApi(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/ap-cutover/activate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function emergencyApCutoverPauseApi(input: { enabled?: boolean; memo?: string } = {}) {
  return apiRequest<Record<string, unknown>>("/admin/ap-cutover/emergency-pause", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reverseDisbursementApi(id: string, input: Record<string, unknown> = {}) {
  return apiRequest<any>("/disbursements/" + encodeURIComponent(id) + "/reverse", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reverseReceiptApi(receiptId: string, input?: { operationId?: string; memo?: string }) {
  return apiRequest<ReceiptApiResult>(`/receipts/${encodeURIComponent(receiptId)}/reverse`, {
    method: "POST",
    body: JSON.stringify(input || {}),
  });
}

export async function fetchReceiptApi(receiptId: string) {
  return apiRequest<ReceiptApiResult>(`/receipts/${encodeURIComponent(receiptId)}`);
}

export type BankTransactionReceiptResult = ReceiptApiResult & {
  bankTransactionId?: string;
  bankTransaction?: Record<string, unknown>;
  linkKind?: "receipt" | "legacy" | "none";
};

export type CreateBankTransactionReceiptInput = {
  operationId: string;
  clientId: string | number;
  allocations?: Array<{ saleId: string | number; amount: number }>;
  sentStatementId?: string | null;
  memo?: string;
  source?: "bank_manual" | "bank_auto";
};

/**
 * Phase 2: turn a bank deposit into a Receipt. The server owns grossAmount
 * (always tx.deposit) and the bank-side link fields, so no voucher is created.
 */
export async function createBankTransactionReceiptApi(
  bankTransactionId: string,
  input: CreateBankTransactionReceiptInput,
) {
  return apiRequest<BankTransactionReceiptResult>(
    `/bank-transactions/${encodeURIComponent(bankTransactionId)}/receipt`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function reverseBankTransactionReceiptApi(
  bankTransactionId: string,
  input?: { operationId?: string; receiptId?: string; memo?: string },
) {
  return apiRequest<BankTransactionReceiptResult>(
    `/bank-transactions/${encodeURIComponent(bankTransactionId)}/receipt/reverse`,
    { method: "POST", body: JSON.stringify(input || {}) },
  );
}

export async function fetchBankTransactionReceiptApi(bankTransactionId: string) {
  return apiRequest<BankTransactionReceiptResult>(
    `/bank-transactions/${encodeURIComponent(bankTransactionId)}/receipt`,
  );
}

export async function fetchClientArSubledgerApi(clientId: string | number, params?: { startDate?: string; endDate?: string }) {
  const query = new URLSearchParams();
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<Record<string, unknown>>(`/ar-subledger/${encodeURIComponent(String(clientId))}${suffix}`);
}

export async function fetchReceiptMigrationDryRunApi() {
  return apiRequest<Record<string, unknown>>("/receipts-migration/dry-run");
}

export type UnifiedClientArLedgerRow = {
  saleId: string;
  saleDate?: string;
  site?: string;
  billedAmount: number;
  legacyAppliedAmount: number;
  receiptAllocatedAmount: number;
  totalAppliedAmount: number;
  outstandingAmount: number;
  paymentStatus: "unpaid" | "partial" | "paid" | "overpaid";
  sourceLedger: "none" | "receipt" | "legacy" | "mixed";
};

export type UnifiedClientArLedgerResponse =
  import("./unifiedArReadModel").UnifiedArClientSummary & {
    sales: UnifiedClientArLedgerRow[];
    receipts: Array<Record<string, unknown>>;
    policyNotes: Record<string, string>;
    version?: number;
  };

/**
 * Phase 3 unified client AR ledger. The server owns every number here; the panel renders the
 * returned header figures and rows verbatim so the UI can never drift from the subledger.
 */
export async function fetchUnifiedClientArLedgerApi(
  clientId: string | number,
  params?: { start?: string; end?: string },
) {
  const query = new URLSearchParams();
  if (params?.start) query.set("start", params.start);
  if (params?.end) query.set("end", params.end);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<UnifiedClientArLedgerResponse>(
    `/ar/clients/${encodeURIComponent(String(clientId))}/ledger${suffix}`,
  );
}

export async function fetchBankSyncStatus() {
  return apiRequest<{
    liveSyncStatus: BankLiveSyncStatus;
    bankSyncMeta?: BankSyncMeta | null;
    version: number;
    updatedAt?: string | null;
  }>("/bank-sync/status");
}
