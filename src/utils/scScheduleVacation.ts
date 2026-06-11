import type { ScSchedule } from "@/utils/scSchedules";

const PERSONAL_VACATION_LABEL = "\uAC1C\uC778\uD734\uAC00";
const VACATION_WORK_TYPE = "\uD734\uAC00";

export function isScPersonalVacationSchedule(
  schedule: Pick<ScSchedule, "projectName" | "clientName" | "workType"> | null | undefined,
) {
  if (!schedule) return false;
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

export function withoutScPersonalVacationSchedules<
  T extends Pick<ScSchedule, "projectName" | "clientName" | "workType">,
>(
  schedules: T[],
) {
  return schedules.filter((row) => !isScPersonalVacationSchedule(row));
}
