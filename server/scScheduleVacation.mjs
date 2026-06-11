const PERSONAL_VACATION_LABEL = "\uAC1C\uC778\uD734\uAC00";
const VACATION_WORK_TYPE = "\uD734\uAC00";

export function isScPersonalVacationSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return false;
  const projectName = String(schedule.projectName || "").trim();
  const clientName = String(schedule.clientName || "").trim();
  const workType = String(schedule.workType || "").trim();
  if (
    projectName === PERSONAL_VACATION_LABEL
    || clientName === PERSONAL_VACATION_LABEL
    || workType === PERSONAL_VACATION_LABEL
  ) {
    return true;
  }
  if (workType === VACATION_WORK_TYPE && projectName === PERSONAL_VACATION_LABEL) {
    return true;
  }
  return false;
}

export function withoutScPersonalVacationSchedules(schedules) {
  return (Array.isArray(schedules) ? schedules : []).filter((row) => !isScPersonalVacationSchedule(row));
}

export function onlyScPersonalVacationSchedules(schedules) {
  return (Array.isArray(schedules) ? schedules : []).filter((row) => isScPersonalVacationSchedule(row));
}

export function buildScVacationSummaryForDate(schedules, dateKey) {
  const target = String(dateKey || "").slice(0, 10);
  const memberMap = new Map();

  for (const schedule of onlyScPersonalVacationSchedules(schedules)) {
    if (String(schedule?.workDate || "").slice(0, 10) !== target) continue;
    for (const rawName of schedule.participantNames || []) {
      const name = String(rawName || "").trim();
      if (!name) continue;
      const key = name.replace(/\s+/g, "").toLowerCase();
      if (memberMap.has(key)) continue;
      memberMap.set(key, {
        name,
        workType: String(schedule.workType || "").trim() || VACATION_WORK_TYPE,
        startTime: String(schedule.startTime || "").trim(),
        endTime: String(schedule.endTime || "").trim(),
        scheduleId: String(schedule.id || ""),
      });
    }
  }

  const members = [...memberMap.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return {
    dateKey: target,
    count: members.length,
    members,
  };
}

export function buildScVacationSummariesForDates(schedules, dateKeys) {
  const keys = (Array.isArray(dateKeys) ? dateKeys : []).map((row) => String(row || "").slice(0, 10)).filter(Boolean);
  return Object.fromEntries(keys.map((dateKey) => [dateKey, buildScVacationSummaryForDate(schedules, dateKey)]));
}
