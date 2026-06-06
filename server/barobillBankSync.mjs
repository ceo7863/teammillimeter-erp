import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { mergeIbkBankImport } from "./ibkBankImport.mjs";
import { applySentStatementAutoLinksToErpData } from "./bankSentStatementAutoLink.ts";
import { getBarobillBankConfigStatus } from "./barobill/bankAccountClient.mjs";
import {
  countMergeAgainstExisting,
  fetchBarobillBankTransactionsInRange,
} from "./barobill/bankAccountSync.mjs";

let syncRunning = false;
let lastStatus = {
  configured: false,
  enabled: false,
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastNotice: null,
  lastAdded: 0,
  lastAutoLinked: 0,
  lastSkipped: 0,
  lastFetched: 0,
  lastLatestTransactionAt: null,
  lastFromDate: null,
  lastToDate: null,
  bankAccountNum: "",
};

function formatYmd(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getBarobillBankSyncStatus() {
  const cfg = getBarobillBankConfigStatus();
  return {
    ...lastStatus,
    configured: cfg.configured,
    enabled: cfg.enabled,
    bankAccountNum: cfg.bankAccountNum,
    syncDays: cfg.syncDays,
    test: cfg.test,
  };
}

export async function runBarobillBankSync(options = {}) {
  const cfg = getBarobillBankConfigStatus();
  if (!cfg.enabled) {
    return { ok: false, skipped: true, reason: "barobill_bank_disabled" };
  }
  if (!cfg.configured) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }
  if (syncRunning) {
    return { ok: false, skipped: true, reason: "sync_in_progress" };
  }

  syncRunning = true;
  const runAt = new Date().toISOString();
  lastStatus.lastRunAt = runAt;
  lastStatus.configured = cfg.configured;
  lastStatus.enabled = cfg.enabled;
  lastStatus.bankAccountNum = cfg.bankAccountNum;

  try {
    const days = Number(options.syncDays || cfg.syncDays || 7);
    const toDate = String(options.endDate || formatYmd(new Date())).slice(0, 10);
    const from = options.startDate
      ? new Date(`${options.startDate}T00:00:00`)
      : new Date();
    if (!options.startDate) {
      from.setDate(from.getDate() - Math.max(1, days));
    }
    const fromDate = String(options.startDate || formatYmd(from)).slice(0, 10);

    const fetched = await fetchBarobillBankTransactionsInRange({
      startDate: fromDate,
      endDate: toDate,
      requestRefresh: Boolean(options.requestRefresh),
    });
    const preview = fetched.preview;
    const notices = Array.isArray(fetched.notices) ? fetched.notices : [];

    if (fetched.collecting) {
      lastStatus = {
        ...lastStatus,
        lastRunAt: runAt,
        lastSuccessAt: runAt,
        lastError: null,
        lastNotice: notices.join(" ") || null,
        lastAdded: 0,
        lastAutoLinked: 0,
        lastSkipped: 0,
        lastFetched: 0,
        lastLatestTransactionAt: null,
        lastFromDate: fromDate,
        lastToDate: toDate,
      };
      return {
        ok: true,
        added: 0,
        skipped: 0,
        fetched: 0,
        collecting: true,
        notices,
        scrapStatus: fetched.scrapStatus,
        fromDate,
        toDate,
      };
    }

    if (options.previewOnly) {
      const { added, skipped } = countMergeAgainstExisting(
        Array.isArray(options.existing) ? options.existing : [],
        preview,
      );
      return {
        ok: true,
        previewOnly: true,
        added,
        skipped,
        fetched: preview.rows.length,
        preview,
        errors: fetched.errors,
        scrapStatus: fetched.scrapStatus,
        fromDate,
        toDate,
      };
    }

    const state = getErpState();
    const data = state.data || {};
    const existing = Array.isArray(data.bankTransactions) ? data.bankTransactions : [];
    const merged = mergeIbkBankImport(existing, preview, {
      importBatchId: `barobill-bank-${Date.now()}`,
    });

    const bankSyncMeta = {
      lastImportAt: runAt,
      lastImportSource: "barobill-bank-api",
      lastImportAdded: merged.added,
      lastImportSkipped: merged.skipped,
      lastImportLatestAt: preview.latestTransactionAt || null,
      lastImportBy: options.updatedBy || "barobill-bank-sync",
      lastImportFromDate: fromDate,
      lastImportToDate: toDate,
    };

    let nextPayload = {
      ...data,
      bankTransactions: merged.next,
      bankSyncMeta: {
        ...(data.bankSyncMeta || {}),
        ...bankSyncMeta,
      },
    };

    let autoLinkedCount = 0;
    if (merged.addedIds?.length) {
      const linked = await applySentStatementAutoLinksToErpData(nextPayload, {
        onlyTransactionIds: merged.addedIds,
        updatedBy: options.updatedBy || "barobill-bank-sync",
      });
      nextPayload = linked.data;
      autoLinkedCount = linked.autoLinkedCount;
    }

    saveErpState(nextPayload, state.version, options.updatedBy || "barobill-bank-sync");

    lastStatus = {
      ...lastStatus,
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      lastError: fetched.errors.length ? fetched.errors.join(" ") : null,
      lastNotice: notices.length ? notices.join(" ") : null,
      lastAdded: merged.added,
      lastAutoLinked: autoLinkedCount,
      lastSkipped: merged.skipped,
      lastFetched: preview.rows.length,
      lastLatestTransactionAt: preview.latestTransactionAt || null,
      lastFromDate: fromDate,
      lastToDate: toDate,
    };

    return {
      ok: true,
      added: merged.added,
      autoLinked: autoLinkedCount,
      skipped: merged.skipped,
      fetched: preview.rows.length,
      latestTransactionAt: preview.latestTransactionAt || null,
      fromDate,
      toDate,
      errors: fetched.errors,
      notices,
      scrapStatus: fetched.scrapStatus,
      version: getErpState().version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastStatus.lastError = message;
    lastStatus.lastNotice = null;
    return { ok: false, error: message };
  } finally {
    syncRunning = false;
  }
}
