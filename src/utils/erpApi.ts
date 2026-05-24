const TOKEN_KEY = "teammillimeter-erp-token";
const USER_KEY = "teammillimeter-erp-session";

export type ErpUser = {
  id: number;
  email: string;
  name: string;
  role: string;
};

export type ErpPayload = {
  sales: unknown[];
  paymentVouchers: unknown[];
  clients: unknown[];
  workers: unknown[];
  auditLogs: unknown[];
  version?: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
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

export async function loginWithApi(email: string, password: string) {
  const result = await apiRequest<{ token: string; user: ErpUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveAuthSession(result.token, result.user);
  return result.user;
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
