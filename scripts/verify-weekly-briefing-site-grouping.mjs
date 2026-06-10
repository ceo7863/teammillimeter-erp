import {
  buildScWeeklyBriefingPreview,
  normalizeWeeklySiteNameForMatch,
  weeklySiteGroupKey,
  weeklySiteNamesMatch,
} from "../server/scWeeklyBriefingNotify.mjs";

const CLIENT_ID = "client-mimu";
const CLIENT_NAME = "??";
const WEEK_START = "2026-06-09";

const sites = [
  "SK?????",
  "SK ?????",
  "??? ???????",
  "?? ??3??",
  "?? ????",
];

const schedules = sites.flatMap((siteName, siteIndex) =>
  ["2026-06-09", "2026-06-10"].map((workDate, dayIndex) => ({
    id: `sched-${siteIndex}-${dayIndex}`,
    clientId: CLIENT_ID,
    clientName: CLIENT_NAME,
    scProjectId: "shared-project-id",
    projectName: siteName,
    siteName,
    workDate,
    expectedHeadcount: siteIndex + 1,
  })),
);

const preview = buildScWeeklyBriefingPreview({ scSchedules: schedules, clients: [] }, { weekStart: WEEK_START });
const group = preview.groups.find((row) => row.clientName === CLIENT_NAME);

console.log("=== weekly briefing site grouping verification ===");
console.log("input site names:", sites.length);
console.log("grouped site count:", group?.siteCount ?? 0);
console.log(
  "grouped site names:",
  (group?.sites || []).map((site) => site.siteName),
);

const skVariantsMatch =
  normalizeWeeklySiteNameForMatch("SK?????") === normalizeWeeklySiteNameForMatch("SK ?????");
const fuzzyWouldMergeDifferent =
  weeklySiteNamesMatch("??? ???????", "?? ??3??") ||
  weeklySiteNamesMatch("SK?????", "??? ???????");

const keys = new Set(schedules.map((schedule) => weeklySiteGroupKey(schedule)));
const expectedSiteCount = 4;
const ok =
  skVariantsMatch &&
  !fuzzyWouldMergeDifferent &&
  group?.siteCount === expectedSiteCount &&
  keys.size === expectedSiteCount;

console.log("SK variants normalize together:", skVariantsMatch);
console.log("distinct site keys:", keys.size, [...keys]);
console.log("status:", ok ? "PASS" : "FAIL");

if (!ok) process.exit(1);
