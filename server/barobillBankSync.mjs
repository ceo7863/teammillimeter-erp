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

const KOREA_TZ = "Asia/Seoul";

function formatYmdKst(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: KOREA_TZ });
}

function subtractDaysYmdKst(days, from = new Date()) {
  const kst = new Date(from.toLocaleString("en-US", { timeZone: KOREA_TZ }));
  kst.setDate(kst.getDate() - Math.max(0, days));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
    const toDate = String(options.endDate || formatYmdKst(new Date())).slice(0, 10);
    const fromDate = options.startDate
      ? String(options.startDate).slice(0, 10)
      : subtractDaysYmdKst(Math.max(1, days));

    const fetched = await fetchBarobillBankTransactionsInRange({
      startDate: fromDate,
      endDate: toDate,
      requestRefresh: Boolean(options.requestRefresh),
    });
    const preview = fetched.preview;
    const notices = Array.isArray(fetched.notices) ? fetched.notices : [];
    const collecting = Boolean(fetched.collecting);

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
        collecting,
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
      collecting,
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
