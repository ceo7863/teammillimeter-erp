import { addDaysISO, todayISO } from "@/utils/receivables";
import { normalizeWorkerName, type WorkerMasterLike } from "@/utils/workerPayments";

export type WorkerEGradePayPeriod = {
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  isProbation: boolean;
  label: string;
};

function parseISODate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function formatISO(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonthsToHireDay(hireDate: string, months: number) {
  const parsed = parseISODate(hireDate);
  if (!parsed) return "";
  const date = new Date(parsed.y, parsed.m - 1 + months, parsed.d);
  if (Number.isNaN(date.getTime())) return "";
  return formatISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function endOfMonthISO(dateStr: string) {
  const parsed = parseISODate(dateStr);
  if (!parsed) return dateStr;
  const lastDay = new Date(parsed.y, parsed.m, 0).getDate();
  return formatISO(parsed.y, parsed.m, lastDay);
}

function formatShortRange(start: string, end: string) {
  return `${start.slice(5).replace(/-/g, "/")}~${end.slice(5).replace(/-/g, "/")}`;
}

function formatPayDateLabel(paymentDate: string) {
  return paymentDate.slice(5).replace(/-/g, "/");
}

export function isEGradePayPeriodKey(monthKey: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(monthKey || ""));
}

export function isWorkerEGrade(worker?: Pick<WorkerMasterLike, "grade" | "hireDate"> | null) {
  if (!worker) return false;
  const grade = String(worker.grade || "")
    .trim()
    .toUpperCase();
  const hireDate = String(worker.hireDate || "").trim();
  return grade === "E" && /^\d{4}-\d{2}-\d{2}$/.test(hireDate);
}

export function findWorkerMasterByNameLoose(
  workers: Array<WorkerMasterLike & { hireDate?: string }>,
  workerName: string,
) {
  const target = normalizeWorkerName(workerName);
  return workers.find((row) => normalizeWorkerName(row.name) === target);
}

export function buildEGradePayPeriods(hireDate: string, untilDate = todayISO()): WorkerEGradePayPeriod[] {
  const hire = String(hireDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hire)) return [];
  const until = String(untilDate || todayISO()).trim();
  const periods: WorkerEGradePayPeriod[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const paymentDate = addMonthsToHireDay(hire, index);
    if (!paymentDate) continue;
    const periodStart = index === 1 ? hire : addMonthsToHireDay(hire, index - 1);
    const periodEnd = addDaysISO(paymentDate, -1);
    if (periodStart > until) break;
    periods.push({
      monthKey: paymentDate,
      periodStart,
      periodEnd,
      paymentDate,
      isProbation: true,
      label: `\uC218\uC2B5 ${index}\uCC28 \u00B7 ${formatShortRange(periodStart, periodEnd)} (\uC2E4\uC9C0\uAE09 ${formatPayDateLabel(paymentDate)})`,
    });
  }

  const thirdPayment = addMonthsToHireDay(hire, 3);
  if (thirdPayment) {
    const tailStart = addDaysISO(thirdPayment, 1);
    const tailEnd = endOfMonthISO(thirdPayment);
    if (tailStart <= tailEnd && tailStart <= until) {
      periods.push({
        monthKey: tailEnd,
        periodStart: tailStart,
        periodEnd: tailEnd,
        paymentDate: tailEnd,
        isProbation: true,
        label: `\uC218\uC2B5 \uB9C8\uAC10 \u00B7 ${formatShortRange(tailStart, tailEnd)} (\uC2E4\uC9C0\uAE09 ${formatPayDateLabel(tailEnd)})`,
      });
    }
  }

  let paymentIndex = 4;
  while (paymentIndex <= 240) {
    const paymentDate = addMonthsToHireDay(hire, paymentIndex);
    if (!paymentDate) break;
    const tailEnd = thirdPayment ? endOfMonthISO(thirdPayment) : "";
    const periodStart =
      paymentIndex === 4 && tailEnd
        ? addDaysISO(tailEnd, 1)
        : addMonthsToHireDay(hire, paymentIndex - 1);
    const periodEnd = addDaysISO(paymentDate, -1);
    if (periodStart > until) break;
    periods.push({
      monthKey: paymentDate,
      periodStart,
      periodEnd,
      paymentDate,
      isProbation: false,
      label: `${formatShortRange(periodStart, periodEnd)} (\uC2E4\uC9C0\uAE09 ${formatPayDateLabel(paymentDate)})`,
    });
    if (paymentDate > until && periodEnd > until) break;
    paymentIndex += 1;
  }

  return periods;
}

export function formatWorkerPayPeriodLabel(
  monthKey: string,
  options: { periodLabel?: string; isProbation?: boolean } = {},
) {
  if (options.periodLabel) return options.periodLabel;
  if (isEGradePayPeriodKey(monthKey)) {
    const prefix = options.isProbation ? "\uC218\uC2B5 \u00B7 " : "";
    return `${prefix}\uC2E4\uC9C0\uAE09 ${monthKey.replace(/-/g, ".")}`;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey || "-";
  return `${match[1]}\uB144 ${Number(match[2])}\uC6D4`;
}

export function dateInInclusiveRange(date: string, start: string, end: string) {
  const value = String(date || "").slice(0, 10);
  if (!value) return false;
  if (start && value < start) return false;
  if (end && value > end) return false;
  return true;
}

export function resolveLatestDateFromRows(dates: string[]) {
  return dates.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row)).sort().pop() || todayISO();
}

export type WorkerEGradePayProfile = {
  workerName: string;
  hireDate: string;
  untilDate: string;
  historicalOnly: boolean;
};

export function workerHasEGradePayHistory(
  worker: Pick<WorkerMasterLike, "grade" | "hireDate" | "eGradeEndedAt">,
  workerVoucherMonthKeys: string[] = [],
) {
  const hireDate = String(worker.hireDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return false;
  if (isWorkerEGrade(worker)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(worker.eGradeEndedAt || "").trim())) return true;
  return workerVoucherMonthKeys.some((monthKey) => isEGradePayPeriodKey(monthKey));
}

export function resolveWorkerEGradePayProfiles(
  workers: WorkerMasterLike[] = [],
  vouchers: Array<{ worker?: string; monthKey?: string }> = [],
  globalUntilDate = todayISO(),
  resolveName: (worker?: string) => string = (name) => normalizeWorkerName(name),
): WorkerEGradePayProfile[] {
  const profiles: WorkerEGradePayProfile[] = [];

  for (const worker of workers) {
    const workerName = resolveName(worker.name);
    if (!workerName) continue;

    const workerVouchers = vouchers.filter(
      (row) => resolveName(row.worker) === workerName && isEGradePayPeriodKey(String(row.monthKey || "")),
    );
    if (!workerHasEGradePayHistory(worker, workerVouchers.map((row) => String(row.monthKey || "")))) continue;

    const hireDate = String(worker.hireDate || "").trim();
    const maxVoucherDate = workerVouchers
      .map((row) => String(row.monthKey || ""))
      .filter((monthKey) => isEGradePayPeriodKey(monthKey))
      .sort()
      .pop();

    if (isWorkerEGrade(worker)) {
      profiles.push({
        workerName,
        hireDate,
        untilDate: resolveLatestDateFromRows([globalUntilDate, maxVoucherDate || ""]),
        historicalOnly: false,
      });
      continue;
    }

    const probationEnds = buildEGradePayPeriods(hireDate, globalUntilDate)
      .filter((period) => period.isProbation)
      .map((period) => period.periodEnd);
    const untilDate = resolveLatestDateFromRows(
      [String(worker.eGradeEndedAt || "").slice(0, 10), maxVoucherDate || "", ...probationEnds].filter(Boolean),
    );
    if (!untilDate) continue;

    profiles.push({
      workerName,
      hireDate,
      untilDate,
      historicalOnly: true,
    });
  }

  return profiles;
}
