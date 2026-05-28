import fs from "fs";
import path from "path";
import { config } from "./config.mjs";

const STORE_PATH = path.join(path.dirname(config.dbPath), "open-banking.json");

function ensureDir() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

export function loadOpenBankingStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return { ...emptyStore(), ...parsed };
  } catch {
    return emptyStore();
  }
}

function emptyStore() {
  return {
    fintechUseNum: "",
    accessToken: "",
    refreshToken: "",
    accessTokenExpiresAt: null,
    accountMask: "",
    bankName: "IBK????",
    connectedAt: null,
    lastSyncAt: null,
    lastSyncAdded: 0,
    lastSyncSkipped: 0,
    lastError: null,
  };
}

export function saveOpenBankingStore(patch) {
  ensureDir();
  const next = { ...loadOpenBankingStore(), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function getOpenBankingPublicStatus(store = loadOpenBankingStore()) {
  return {
    enabled: config.openBanking.enabled,
    configured: Boolean(config.openBanking.clientId && config.openBanking.clientSecret),
    connected: Boolean(store.fintechUseNum && store.accessToken),
    fintechUseNumMask: maskValue(store.fintechUseNum, 4),
    accountMask: store.accountMask || "",
    bankName: store.bankName || "IBK????",
    connectedAt: store.connectedAt,
    lastSyncAt: store.lastSyncAt,
    lastSyncAdded: store.lastSyncAdded || 0,
    lastSyncSkipped: store.lastSyncSkipped || 0,
    lastError: store.lastError || null,
    baseUrl: config.openBanking.baseUrl,
    redirectUri: config.openBanking.redirectUri || "",
    syncDays: config.openBanking.syncDays,
    intervalMs: config.bankSyncIntervalMs,
  };
}

function maskValue(value, visible = 4) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= visible * 2) return "*".repeat(text.length);
  return `${text.slice(0, visible)}${"*".repeat(text.length - visible * 2)}${text.slice(-visible)}`;
}

export function getOpenBankingSecrets() {
  const store = loadOpenBankingStore();
  return {
    fintechUseNum: store.fintechUseNum || config.openBanking.fintechUseNum || "",
    accessToken: store.accessToken || config.openBanking.accessToken || "",
    refreshToken: store.refreshToken || config.openBanking.refreshToken || "",
    accessTokenExpiresAt: store.accessTokenExpiresAt || null,
  };
}
