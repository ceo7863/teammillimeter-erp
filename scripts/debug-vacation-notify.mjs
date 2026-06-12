#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { buildScScheduleNotifyPreview } from "../server/scScheduleNotify.mjs";
import { buildScWeeklyBriefingPreview } from "../server/scWeeklyBriefingNotify.mjs";

function loadData(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const data = {};
  for (const domain of ["settings", "clients", "workers"]) {
    const row = db.prepare("SELECT payload FROM erp_domain_state WHERE domain = ?").get(domain);
    if (row) Object.assign(data, JSON.parse(String(row.payload)));
  }
  db.close();
  return data;
}

function isVacationSchedule(row) {
  const text = `${row.clientName || ""} ${row.projectName || ""} ${row.workType || ""}`;
  return /\uAC1C\uC778\uD734\uAC00|\uD734\uAC00/.test(text);
}

const dbPath = process.argv[2] || "data/erp.sqlite";
const data = loadData(dbPath);
const schedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
const vacation = schedules.filter(isVacationSchedule);
const preview = buildScScheduleNotifyPreview(data);
const weekly = buildScWeeklyBriefingPreview(data, {});
const vacationInTomorrow = (preview.rows || []).filter((row) =>
  isVacationSchedule({ clientName: row.clientName, projectName: row.projectName, workType: row.variables?.site }),
);
const vacationGroups = (weekly.groups || []).filter((g) =>
  /\uAC1C\uC778\uD734\uAC00|\uD734\uAC00/.test(`${g.clientName} ${g.siteName}`),
);

console.log(
  JSON.stringify(
    {
      dbPath,
      totalSchedules: schedules.length,
      vacationScheduleCount: vacation.length,
      vacationSamples: vacation.slice(0, 8).map((row) => ({
        id: row.id,
        workDate: row.workDate,
        clientName: row.clientName,
        projectName: row.projectName,
        workType: row.workType,
        scProjectId: row.scProjectId,
        participants: row.participantNames,
      })),
      tomorrowPreview: {
        targetDate: preview.targetDate,
        scheduleCount: preview.scheduleCount,
        notifyCount: preview.notifyCount,
        vacationRows: vacationInTomorrow,
      },
      weeklyPreview: {
        weekStart: weekly.weekStart,
        siteCount: weekly.siteCount,
        vacationGroups: vacationGroups.map((g) => ({
          clientName: g.clientName,
          siteName: g.siteName,
          scheduleIds: g.scheduleIds,
          notifyCount: g.notifyCount,
        })),
      },
    },
    null,
    2,
  ),
);
