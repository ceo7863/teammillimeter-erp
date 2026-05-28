import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { mergeIbkBankImport } from "./ibkBankImport.mjs";
import {
  exchangeAuthorizationCode,
  fetchAllTransactions,
  formatYmd,
  mapOpenBankingRowsToImportPreview,
} from "./openBankingClient.mjs";
import {
  getOpenBankingPublicStatus,
  getOpenBankingSecrets,
  loadOpenBankingStore,
  saveOpenBankingStore,
} from "./openBankingStore.mjs";

let syncRunning = false;

export function getOpenBankingSyncStatus() {
  return getOpenBankingPublicStatus();
}

export function connectOpenBankingManual(input = {}) {
  const fintechUseNum = String(input.fintechUseNum || "").trim();
  const accessToken = String(input.accessToken || "").trim();
  const refreshToken = String(input.refreshToken || "").trim();
  const accountMask = String(input.accountMask || "").trim();

  if (!fintechUseNum || fintechUseNum.length !== 24) {
    return { ok: false, error: "??????? 24??? ??? ???." };
  }
  if (!accessToken) {
    return { ok: false, error: "access_token ? ??? ???." };
  }

  const store = saveOpenBankingStore({
    fintechUseNum,
    accessToken,
    refreshToken,
    accountMask,
    connectedAt: new Date().toISOString(),
    lastError: null,
  });

  return { ok: true, status: getOpenBankingPublicStatus(store) };
}

export async function handleOpenBankingOAuthCallback(code) {
  if (!code) return { ok: false, error: "authorization code ? ????." };
  const tokens = await exchangeAuthorizationCode(code);
  const userSeqNo = tokens.user_seq_no || tokens.userSeqNo;
  saveOpenBankingStore({
    connectedAt: new Date().toISOString(),
    lastError: null,
    accountMask: userSeqNo ? `user-${userSeqNo}` : loadOpenBankingStore().accountMask,
  });
  return { ok: true, status: getOpenBankingPublicStatus() };
}

export async function runOpenBankingSync(options = {}) {
  if (!config.openBanking.enabled) {
    return { ok: false, skipped: true, reason: "open_banking_disabled" };
  }
  const secrets = getOpenBankingSecrets();
  if (!secrets.fintechUseNum || !secrets.accessToken) {
    return { ok: false, skipped: true, reason: "not_connected" };
  }
  if (syncRunning) {
    return { ok: false, skipped: true, reason: "sync_in_progress" };
  }

  syncRunning = true;
  const runAt = new Date().toISOString();

  try {
    const days = Number(options.syncDays || config.openBanking.syncDays || 7);
    const toDate = formatYmd(new Date());
    const from = new Date();
    from.setDate(from.getDate() - Math.max(1, days));
    const fromDate = formatYmd(from);

    const store = loadOpenBankingStore();
    const { rows, meta } = await fetchAllTransactions({
      fromDate,
      toDate,
      fintechUseNum: secrets.fintechUseNum,
    });

    const preview = mapOpenBankingRowsToImportPreview(rows, {
      accountMask: store.accountMask,
      bankName: store.bankName,
    });

    const state = getErpState();
    const existing = Array.isArray(state.data.bankTransactions) ? state.data.bankTransactions : [];
    const merged = mergeIbkBankImport(existing, preview, {
      importBatchId: `open-banking-${Date.now()}`,
    });

    const bankSyncMeta = {
      lastImportAt: runAt,
      lastImportSource: "open-banking-api",
      lastImportAdded: merged.added,
      lastImportSkipped: merged.skipped,
      lastImportLatestAt: preview.latestTransactionAt || null,
      lastImportBy: options.updatedBy || "open-banking-sync",
      lastImportFromDate: fromDate,
      lastImportToDate: toDate,
    };

    const nextPayload = {
      ...state.data,
      bankTransactions: merged.next,
      bankSyncMeta: {
        ...(state.data.bankSyncMeta || {}),
        ...bankSyncMeta,
      },
    };
    saveErpState(nextPayload, state.version, options.updatedBy || "open-banking-sync");

    saveOpenBankingStore({
      lastSyncAt: runAt,
      lastSyncAdded: merged.added,
      lastSyncSkipped: merged.skipped,
      lastError: null,
      accountMask: store.accountMask || preview.accountNumber,
    });

    return {
      ok: true,
      added: merged.added,
      skipped: merged.skipped,
      fetched: rows.length,
      latestTransactionAt: preview.latestTransactionAt || null,
      fromDate,
      toDate,
      balanceAmt: meta?.balance_amt || null,
      version: getErpState().version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    saveOpenBankingStore({ lastError: message });
    return { ok: false, error: message };
  } finally {
    syncRunning = false;
  }
}

export function disconnectOpenBanking() {
  saveOpenBankingStore({
    fintechUseNum: "",
    accessToken: "",
    refreshToken: "",
    accessTokenExpiresAt: null,
    accountMask: "",
    connectedAt: null,
    lastSyncAt: null,
    lastSyncAdded: 0,
    lastSyncSkipped: 0,
    lastError: null,
  });
  return { ok: true, status: getOpenBankingPublicStatus() };
}
