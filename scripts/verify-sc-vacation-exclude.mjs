import assert from "node:assert/strict";
import {
  isScPersonalVacationSchedule,
  withoutScPersonalVacationSchedules,
} from "../server/scScheduleVacation.mjs";
import { filterSchedulesForDate } from "../server/scScheduleNotify.mjs";
import { filterSchedulesForWeek } from "../server/scWeeklyBriefingNotify.mjs";
import { buildScScheduleNotifyPreview } from "../server/scScheduleNotify.mjs";

const vacation = {
  id: "vac-1",
  workDate: "2026-06-12",
  projectName: "\uAC1C\uC778\uD734\uAC00",
  workType: "\uD734\uAC00",
  participantNames: ["\uC804\uC9C4\uC601"],
};

const site = {
  id: "site-1",
  workDate: "2026-06-12",
  projectName: "\uD37C\uB9BD\uC2A4",
  workType: "??",
  clientName: "\uD37C\uB9BD\uC2A4",
  participantNames: ["\uC2E0\uB3D9\uC6B1"],
};

assert.equal(isScPersonalVacationSchedule(vacation), true);
assert.equal(isScPersonalVacationSchedule({ ...vacation, projectName: "", workType: "\uAC1C\uC778\uD734\uAC00" }), true);
assert.equal(isScPersonalVacationSchedule(site), false);
assert.equal(withoutScPersonalVacationSchedules([vacation, site]).length, 1);

const byDate = filterSchedulesForDate([vacation, site], "2026-06-12");
assert.equal(byDate.length, 1);
assert.equal(byDate[0].id, "site-1");

const byWeek = filterSchedulesForWeek([vacation, site], "2026-06-08", "2026-06-14");
assert.equal(byWeek.length, 1);
assert.equal(byWeek[0].id, "site-1");

const preview = buildScScheduleNotifyPreview({
  scSchedules: [vacation, site],
  clients: [],
  workers: [{ name: "\uC804\uC9C4\uC601", phone: "01030274988" }, { name: "\uC2E0\uB3D9\uC6B1", phone: "01011112222" }],
  notificationSettings: { enabled: true, scScheduleNotifyEnabled: true, scScheduleNotifyMode: "both" },
});
assert.equal(preview.scheduleCount, 1);
assert.equal(
  preview.rows.every((row) => row.scheduleId !== "vac-1"),
  true,
);

console.log("verify-sc-vacation-exclude: ok");
