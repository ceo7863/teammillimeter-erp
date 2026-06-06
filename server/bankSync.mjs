import fs from "fs";
import path from "path";
import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { mergeIbkBankImport, parseIbkBankExcelBuffer } from "./ibkBankImport.mjs";

const IBK_FILE_PATTERN = /\uAC70\uB798|transaction|ibk/i;

let syncRunning = false;
let lastStatus = {
  enabled: false,
  importDir: "",
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastSourceFile: null,
  lastAdded: 0,
  lastSkipped: 0,
  lastLatestTransactionAt: null,
};

function isIbkExcelFile(name) {
  if (!/\.xlsx$/i.test(name)) return false;
  return IBK_FILE_PATTERN.test(name);
}

function listImportCandidates(importDir) {
  if (!importDir || !fs.existsSync(importDir)) return [];
  return fs
    .readdirSync(importDir)
    .filter(isIbkExcelFile)
    .map((name) => {
      const fullPath = path.join(importDir, name);
      const stat = fs.statSync(fullPath);
      return { name, fullPath, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

export function getBankSyncStatus() {
  return {
    ...lastStatus,
    enabled: Boolean(config.ibkBankImportDir),
    importDir: config.ibkBankImportDir || "",
    intervalMs: config.bankSyncIntervalMs,
  };
}

export async function runUnifiedBankSync(options = {}) {
  const barobillResult = await runBarobillBankSyncIfConfigured(options);
  if (barobillResult?.ok && (barobillResult.added > 0 || options.forceMetaUpdate)) {
    return { ...barobillResult, source: "barobill-bank" };
  }
  if (barobillResult?.ok && !barobillResult.skipped) {
    return { ...barobillResult, source: "barobill-bank" };
  }

  const openResult = await runOpenBankingSyncIfConfigured(options);
  if (openResult?.ok && (openResult.added > 0 || options.forceMetaUpdate)) {
    return { ...openResult, source: "open-banking", barobillBank: barobillResult };
  }
  if (openResult?.ok && !openResult.skipped) {
    return { ...openResult, source: "open-banking", barobillBank: barobillResult };
  }
  const folderResult = runBankFolderSync(options);
  return { ...folderResult, source: "folder", barobillBank: barobillResult, openBanking: openResult };
}

async function runBarobillBankSyncIfConfigured(options) {
  try {
    const { runBarobillBankSync } = await import("./barobillBankSync.mjs");
    return await runBarobillBankSync(options);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runOpenBankingSyncIfConfigured(options) {
  try {
    const { runOpenBankingSync } = await import("./openBankingSync.mjs");
    return await runOpenBankingSync(options);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function runBankFolderSync(options = {}) {
  const importDir = config.ibkBankImportDir;
  if (!importDir) {
    return { ok: false, skipped: true, reason: "IBK_BANK_IMPORT_DIR not configured" };
  }
  if (syncRunning) {
    return { ok: false, skipped: true, reason: "sync_in_progress" };
  }

  syncRunning = true;
  const runAt = new Date().toISOString();
  lastStatus.lastRunAt = runAt;

  try {
    const candidates = listImportCandidates(importDir);
    if (!candidates.length) {
      lastStatus.lastError = null;
      return { ok: true, added: 0, skipped: 0, reason: "no_files" };
    }

    const target = options.fileName
      ? candidates.find((row) => row.name === options.fileName) || null
      : candidates[0];

    if (!target) {
      return { ok: false, skipped: true, reason: "file_not_found" };
    }

    const buffer = fs.readFileSync(target.fullPath);
    const preview = parseIbkBankExcelBuffer(buffer, target.name);
    const state = getErpState();
    const existing = Array.isArray(state.data.bankTransactions) ? state.data.bankTransactions : [];
    const merged = mergeIbkBankImport(existing, preview, {
      importBatchId: `ibk-sync-${Date.now()}`,
    });

    const bankSyncMeta = {
      lastImportAt: runAt,
      lastImportSource: target.name,
      lastImportAdded: merged.added,
      lastImportSkipped: merged.skipped,
      lastImportLatestAt: preview.latestTransactionAt || null,
      lastImportDir: importDir,
      lastImportBy: options.updatedBy || "ibk-auto-sync",
    };

    if (merged.added > 0 || options.forceMetaUpdate) {
      const nextPayload = {
        ...state.data,
        bankTransactions: merged.next,
        bankSyncMeta,
      };
      saveErpState(nextPayload, state.version, options.updatedBy || "ibk-auto-sync");
    } else {
      const nextPayload = {
        ...state.data,
        bankSyncMeta: {
          ...(state.data.bankSyncMeta || {}),
          ...bankSyncMeta,
        },
      };
      saveErpState(nextPayload, state.version, options.updatedBy || "ibk-auto-sync");
    }

    lastStatus = {
      ...lastStatus,
      enabled: true,
      importDir,
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      lastError: null,
      lastSourceFile: target.name,
      lastAdded: merged.added,
      lastSkipped: merged.skipped,
      lastLatestTransactionAt: preview.latestTransactionAt || null,
    };

    return {
      ok: true,
      added: merged.added,
      skipped: merged.skipped,
      sourceFile: target.name,
      latestTransactionAt: preview.latestTransactionAt || null,
      version: getErpState().version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastStatus.lastError = message;
    return { ok: false, error: message };
  } finally {
    syncRunning = false;
  }
}

let intervalHandle = null;

export function startBankSyncScheduler() {
  if (config.bankSyncIntervalMs <= 0) return;
  if (intervalHandle) return;
  const hasBarobillBank = config.barobill?.bankSyncEnabled && Boolean(config.barobill?.bankAccountNum);
  const hasOpenBanking = config.openBanking?.enabled;
  const hasFolder = Boolean(config.ibkBankImportDir);
  if (!hasBarobillBank && !hasOpenBanking && !hasFolder) return;

  intervalHandle = setInterval(() => {
    runUnifiedBankSync({ requestRefresh: true }).catch((error) => {
      console.error("bank sync failed:", error);
    });
  }, config.bankSyncIntervalMs);

  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }

  console.log(
    `[bank-sync] scheduler every ${Math.round(config.bankSyncIntervalMs / 1000)}s` +
      (hasBarobillBank ? " (barobill-bank)" : "") +
      (hasOpenBanking ? " (open-banking)" : "") +
      (hasFolder ? ` folder=${config.ibkBankImportDir}` : ""),
  );
}
