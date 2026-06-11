import type { ScSchedule } from "@/utils/scSchedules";

const PERSONAL_VACATION_LABEL = "\uAC1C\uC778\uD734\uAC00";

export function isScPersonalVacationSchedule(
  schedule: Pick<ScSchedule, "projectName" | "clientName"> | null | undefined,
) {
  if (!schedule) return false;
  const projectName = String(schedule.projectName || "").trim();
  const clientName = String(schedule.clientName || "").trim();
  return projectName === PERSONAL_VACATION_LABEL || clientName === PERSONAL_VACATION_LABEL;
}

export function withoutScPersonalVacationSchedules<T extends Pick<ScSchedule, "projectName" | "clientName">>(
  schedules: T[],
) {
  return schedules.filter((row) => !isScPersonalVacationSchedule(row));
}
