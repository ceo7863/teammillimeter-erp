const PERSONAL_VACATION_LABEL = "\uAC1C\uC778\uD734\uAC00";

export function isScPersonalVacationSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return false;
  const projectName = String(schedule.projectName || "").trim();
  const clientName = String(schedule.clientName || "").trim();
  return projectName === PERSONAL_VACATION_LABEL || clientName === PERSONAL_VACATION_LABEL;
}

export function withoutScPersonalVacationSchedules(schedules) {
  return (Array.isArray(schedules) ? schedules : []).filter((row) => !isScPersonalVacationSchedule(row));
}
