import { getErpState } from "../server/db.mjs";
import { buildScScheduleNotifyPreview } from "../server/scScheduleNotify.mjs";
import { buildScWeeklyBriefingPreview } from "../server/scWeeklyBriefingNotify.mjs";
import { findClientForSchedule, resolveClientContacts } from "../server/clientContacts.mjs";

const data = getErpState().data || {};
const schedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
const kst = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false });

console.log("kst", kst, "totalSchedules", schedules.length);

const week = buildScWeeklyBriefingPreview(data, {});
console.log("thisWeek", week.weekStart, week.weekEnd, "sites", week.siteCount, "notify", week.notifyCount);

const tomorrow = buildScScheduleNotifyPreview(data);
console.log(
  "tomorrow",
  tomorrow.targetDate,
  "schedules",
  tomorrow.scheduleCount,
  "notify",
  tomorrow.notifyCount,
  "missingPhone",
  tomorrow.missingPhoneCount,
);

const sampleDates = [...new Set(schedules.map((r) => String(r.workDate || "").slice(0, 10)))].sort().slice(-14);
console.log("recentDates", sampleDates.join(", "));

for (const anchor of sampleDates.slice(-3)) {
  const w = buildScWeeklyBriefingPreview(data, { weekStart: anchor });
  if (w.siteCount > 0) {
    console.log("weekWithSites", w.weekStart, w.weekEnd, "sites", w.siteCount);
    for (const g of w.groups.slice(0, 5)) {
      const sched = schedules.find((r) => g.scheduleIds.includes(String(r.id)));
      const match = findClientForSchedule(data.clients || [], sched || { clientId: g.clientId, clientName: g.clientName });
      console.log(
        " group",
        g.clientName,
        "/",
        g.siteName,
        "matched",
        match?.name || "NONE",
        "clientPhone",
        match?.phone ? "yes" : "no",
        "contacts",
        (match?.contacts || []).length,
        "notify",
        g.notifyCount,
      );
    }
    break;
  }
}

if (tomorrow.scheduleCount > 0) {
  const id = tomorrow.rows[0]?.scheduleId || tomorrow.scheduleLinks?.[0]?.scheduleId;
  const sched = schedules.find((r) => String(r.id) === String(id));
  if (sched) {
    const contacts = resolveClientContacts(data.clients || [], sched);
    console.log("tomorrowSample", sched.clientName, sched.projectName, "contacts", contacts.length, contacts.map((c) => ({ name: c.name, phone: c.phone ? "yes" : "no" })));
  }
}
