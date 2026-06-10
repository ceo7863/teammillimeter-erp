/** SC ??? ??? ??? � workType(?? ??) ??, ??? projectName */
export function resolveScScheduleSiteName(schedule) {
  const workType = String(schedule?.workType || "").trim();
  if (workType) return workType;
  return String(schedule?.projectName || "").trim();
}
