import { getErpState, saveErpState } from "./db.mjs";
import { runUnifiedBankSync } from "./bankSync.mjs";
import { syncBarobillTaxInvoices } from "./barobill/taxInvoiceSync.mjs";
import {
  buildDailyReport,
  formatDailyReportTemplateVars,
  formatCommentTemplateVars,
  formatCommentNotifyMessage,
} from "./dailyReport.mjs";
import {
  listCommentNotifyPhones,
  listDailyReportPhones,
  normalizeNotificationSettings,
} from "./notificationSettings.mjs";
import { sendCommentAlimtalk, sendDailyReportAlimtalk } from "./alimtalkNotify.mjs";
import { config } from "./config.mjs";
import { runScScheduleNotifyJob } from "./scScheduleNotify.mjs";
import { weekRangeISO, runScWeeklyBriefingNotifyJob } from "./scWeeklyBriefingNotify.mjs";

let lastDailyReportDateKey = null;
let lastScScheduleNotifyDateKey = null;
let lastScWeeklyBriefingWeekKey = null;
let schedulerHandle = null;

function nowKstParts(now = new Date()) {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return {
    year: kst.getFullYear(),
    month: kst.getMonth() + 1,
    day: kst.getDate(),
    hour: kst.getHours(),
    minute: kst.getMinutes(),
    dateKey: `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`,
  };
}

async function syncFreshData(existingData) {
  try {
    await runUnifiedBankSync({ forceMetaUpdate: true });
  } catch (error) {
    console.warn("[notify] bank sync before report failed:", error?.message || error);
  }
  try {
    const taxInvoices = Array.isArray(existingData?.taxInvoices) ? existingData.taxInvoices : [];
    const kst = nowKstParts();
    const endDate = kst.dateKey;
    const start = new Date(`${endDate}T00:00:00+09:00`);
    start.setDate(start.getDate() - 2);
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    const result = await syncBarobillTaxInvoices({
      startDate,
      endDate,
      flowTypes: ["purchase", "sales"],
      existing: taxInvoices,
      author: { name: "daily-report", loginId: "system" },
      apply: true,
    });
    if (result?.taxInvoices) {
      const latest = getErpState();
      saveErpState(
        { ...(latest.data || {}), taxInvoices: result.taxInvoices },
        latest.version,
        "daily-report-sync",
      );
    }
  } catch (error) {
    console.warn("[notify] tax invoice sync before report failed:", error?.message || error);
  }
}

export async function runDailyReportJob(options = {}) {
  const state = getErpState();
  const settings = normalizeNotificationSettings(options.settingsOverride ?? state.data?.notificationSettings);
  const forTest = options.force === true;
  if (!forTest && (!settings.enabled || !settings.dailyReportEnabled)) {
    return { ok: false, skipped: true, reason: "disabled" };
  }

  const phones = listDailyReportPhones(settings, { forTest });
  if (!phones.length) {
    return { ok: false, skipped: true, reason: "no-recipients" };
  }

  if (!options.skipSync) {
    await syncFreshData(state.data || {});
  }

  const freshState = getErpState();
  const report = buildDailyReport(freshState.data || {}, options);
  const variables = formatDailyReportTemplateVars(report);
  const result = await sendDailyReportAlimtalk({ phones, variables });
  console.log("[notify] daily report sent", report.dateKey, result.ok ? "ok" : result);
  return {
    ok: result.ok !== false && !result.skipped,
    skipped: result.skipped,
    reason: result.reason,
    dryRun: result.dryRun,
    report,
    result,
    message: variables.reportBody,
  };
}

export async function notifyNewSaleComments(previousComments, nextComments, erpData) {
  const settings = normalizeNotificationSettings(erpData?.notificationSettings);
  if (!settings.enabled || !settings.commentNotifyEnabled) {
    return { ok: false, skipped: true, reason: "disabled" };
  }
  const phones = listCommentNotifyPhones(settings);
  if (!phones.length) {
    return { ok: false, skipped: true, reason: "no-recipients" };
  }

  const prevIds = new Set((Array.isArray(previousComments) ? previousComments : []).map((row) => String(row?.id || "")));
  const added = (Array.isArray(nextComments) ? nextComments : []).filter((row) => row?.id && !prevIds.has(String(row.id)));
  if (!added.length) {
    return { ok: true, skipped: true, reason: "no-new-comments" };
  }

  const sales = Array.isArray(erpData?.sales) ? erpData.sales : [];
  const saleById = new Map(sales.map((sale) => [String(sale?.id), sale]));
  const results = [];
  for (const comment of added.slice(-5)) {
    const sale = saleById.get(String(comment.saleId)) || {};
    const variables = formatCommentTemplateVars({ sale, comment });
    const result = await sendCommentAlimtalk({ phones, variables });
    results.push({
      commentId: comment.id,
      message: formatCommentNotifyMessage({ sale, comment }),
      result,
    });
  }
  return { ok: true, results };
}

export async function runCommentNotifyTestJob(options = {}) {
  const state = getErpState();
  const settings = normalizeNotificationSettings(options.settingsOverride ?? state.data?.notificationSettings);
  const phones = listCommentNotifyPhones(settings, { forTest: true });
  if (!phones.length) {
    return { ok: false, skipped: true, reason: "no-recipients" };
  }
  const variables = formatCommentTemplateVars({
    sale: { client: "\uD14C\uC2A4\uD2B8 \uAC70\uB798\uCC98", site: "\uD14C\uC2A4\uD2B8 \uD604\uC7A5" },
    comment: { authorName: "ERP", body: "\uC54C\uB9BC\uD1A1 \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC785\uB2C8\uB2E4." },
  });
  const result = await sendCommentAlimtalk({ phones, variables });
  return {
    ok: result.ok !== false && !result.skipped,
    skipped: result.skipped,
    reason: result.reason,
    dryRun: result.dryRun,
    result,
    message: variables.message,
  };
}

function kstDayOfWeek(now = new Date()) {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return kst.getDay();
}

function tickScheduler() {
  const kst = nowKstParts();
  const state = getErpState();
  const settings = normalizeNotificationSettings(state.data?.notificationSettings);

  if (settings.enabled && settings.dailyReportEnabled) {
    if (kst.hour === settings.dailyReportHour && kst.minute === settings.dailyReportMinute) {
      if (lastDailyReportDateKey !== kst.dateKey) {
        lastDailyReportDateKey = kst.dateKey;
        void runDailyReportJob().catch((error) => {
          console.error("[notify] daily report failed:", error);
          lastDailyReportDateKey = null;
        });
      }
    }
  }

  const scNotify = config.sc.scheduleNotify;
  if (
    settings.enabled &&
    settings.scScheduleNotifyEnabled !== false &&
    scNotify.enabled &&
    config.alimtalk.scheduleTemplate
  ) {
    if (kst.hour === settings.scScheduleNotifyHour && kst.minute === settings.scScheduleNotifyMinute) {
      if (lastScScheduleNotifyDateKey !== kst.dateKey) {
        lastScScheduleNotifyDateKey = kst.dateKey;
        void runScScheduleNotifyJob().catch((error) => {
          console.error("[notify] sc schedule notify failed:", error);
          lastScScheduleNotifyDateKey = null;
        });
      }
    }
  }

  if (
    settings.enabled &&
    settings.scWeeklyBriefingNotifyEnabled !== false &&
    config.alimtalk.weeklyBriefingTemplate
  ) {
    const weekday = kstDayOfWeek();
    if (
      weekday === settings.scWeeklyBriefingWeekday &&
      kst.hour === settings.scWeeklyBriefingHour &&
      kst.minute === settings.scWeeklyBriefingMinute
    ) {
      const { startDate: weekStart } = weekRangeISO(kst.dateKey);
      if (lastScWeeklyBriefingWeekKey !== weekStart) {
        lastScWeeklyBriefingWeekKey = weekStart;
        void runScWeeklyBriefingNotifyJob({ weekStart }).catch((error) => {
          console.error("[notify] weekly briefing failed:", error);
          lastScWeeklyBriefingWeekKey = null;
        });
      }
    }
  }
}

export function startNotificationScheduler() {
  if (schedulerHandle) return;
  if (!config.alimtalk.schedulerEnabled) return;
  schedulerHandle = setInterval(tickScheduler, 30_000);
  if (typeof schedulerHandle.unref === "function") schedulerHandle.unref();
  console.log("[notify] scheduler started (daily report + SC schedule + weekly briefing, KST)");
}
