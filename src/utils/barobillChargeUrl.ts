import { getAuthToken } from "@/utils/erpApi";

export type BarobillChargeUrlResult = {
  ok: boolean;
  url: string;
};

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
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
    throw new Error(String(data.error || `API ${response.status}`));
  }
  return data as T;
}

export async function fetchBarobillChargeUrl() {
  return apiRequest<BarobillChargeUrlResult>("/barobill/charge-url");
}
