import { getDb, getErpState } from "../server/db.mjs";
import { tomorrowKstDateKey, formatScheduleTemplateVars } from "../server/scScheduleNotify.mjs";
import { resolveWeeklyBriefingSiteName } from "../server/scWeeklyBriefingNotify.mjs";

getDb();
const target = tomorrowKstDateKey();
const state = getErpState();
const schedules = (state.data.scSchedules || []).filter(
  (r) => String(r.workDate || "").slice(0, 10) === target,
);

console.log("target", target, "count", schedules.length);
for (const s of schedules.slice(0, 10)) {
  const vars = formatScheduleTemplateVars(s);
  console.log(
    JSON.stringify({
      clientName: s.clientName,
      projectName: s.projectName,
      workType: s.workType,
      client: vars.client,
      site: vars.site,
      weeklySite: resolveWeeklyBriefingSiteName(s),
    }),
  );
}
