import {
  compactSaleForm,
  createWorkerLine,
  enrichWorkerLineOnWorkerSelect,
  type SaleFormData,
  type SaleWorkerLine,
} from "@/utils/saleForm";
import {
  getSaleStaffCount,
  getSaleWorkerLines,
  resolveWorkerLineChargeAmount,
  sumWorkerLinesChargeOnlyForHeadcount,
} from "@/utils/saleBilling";
import { parseMoney } from "@/utils/receivables";
import { parseWorkerMoney } from "@/utils/workerLineMetrics";
import type { ScSchedule } from "@/utils/scSchedules";
import {
  extractScParticipantExtras,
  formatScScheduleTimeRange,
  getScScheduleEffectiveWorkTimes,
  getScScheduleWorkerDetails,
  parseScParticipantMoney,
} from "@/utils/scSchedules";
import type { ClientMasterLike } from "@/utils/clientMaster";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import {
  formatScheduleWorkHoursLabel,
  computeScheduleOvertimeHours,
  computeScheduleWorkHours,
  computeShortShiftChargeAmount,
  DEFAULT_SALE_AI_RULES,
  normalizeSaleAiRules,
  type SaleAiRules,
} from "@/utils/saleAiRules";

export {
  computeScheduleOvertimeHours,
  computeScheduleWorkHours,
  computeShortShiftChargeAmount,
  formatScheduleWorkHoursLabel,
} from "@/utils/saleAiRules";

export function resolveScScheduleSiteName(schedule: Pick<ScSchedule, "workType" | "projectName">) {
  const workType = String(schedule.workType || "").trim();
  if (workType) return workType;
  return String(schedule.projectName || "").trim();
}

export function buildScheduleWorkMemo(
  effectiveTimes: Pick<{ startTime: string; endTime: string }, "startTime" | "endTime">,
  workHours: number | null,
  fromWorkLog = false,
) {
  const prefix = fromWorkLog ? "\uADFC\uBB34\uAE30\uB85D" : "\uC608\uC815";
  const range = formatScScheduleTimeRange(effectiveTimes);
  const hoursLabel = workHours != null ? formatScheduleWorkHoursLabel(workHours) : "";
  if (range && hoursLabel) return `${prefix} ${range} (${hoursLabel}\uC2DC\uAC04)`;
  if (range) return `${prefix} ${range}`;
  if (hoursLabel) return `${prefix} ${hoursLabel}\uC2DC\uAC04`;
  return "";
}

export function resolveScScheduleWorkHoursForBilling(
  schedule: Pick<import("@/utils/scSchedules").ScSchedule, "startTime" | "endTime" | "workLog">,
) {
  const effective = getScScheduleEffectiveWorkTimes(schedule);
  if (
    effective.fromWorkLog &&
    effective.durationMinutes != null &&
    effective.durationMinutes > 0
  ) {
    return effective.durationMinutes / 60;
  }
  return computeScheduleWorkHours(effective.startTime, effective.endTime);
}

export function findSaleByScScheduleId(
  sales: Array<{ scScheduleId?: string | number | null }>,
  scheduleId: string,
) {
  const key = String(scheduleId || "").trim();
  if (!key) return null;
  return sales.find((row) => String(row.scScheduleId || "").trim() === key) || null;
}

export function isScScheduleRegistered(
  sales: Array<{ scScheduleId?: string | number | null }>,
  scheduleId: string,
) {
  return Boolean(findSaleByScScheduleId(sales, scheduleId));
}

type SaleHistoryRow = {
  client?: string;
  workers?: Array<{ worker?: string; meal?: string | number; expense?: string | number }>;
};

function inferWorkerExtrasFromHistory(
  sales: SaleHistoryRow[],
  clientName: string,
  workerName: string,
) {
  let mealTotal = 0;
  let mealCount = 0;
  let expenseTotal = 0;
  let expenseCount = 0;

  for (const sale of sales) {
    if (String(sale.client || "").trim() !== clientName) continue;
    for (const line of getSaleWorkerLines(sale)) {
      if (String(line.worker || "").trim() !== workerName) continue;
      const meal = parseMoney(line.meal);
      const expense = parseMoney(line.expense);
      if (meal > 0) {
        mealTotal += meal;
        mealCount += 1;
      }
      if (expense > 0) {
        expenseTotal += expense;
        expenseCount += 1;
      }
    }
  }

  return {
    meal: mealCount ? Math.round(mealTotal / mealCount) : 0,
    expense: expenseCount ? Math.round(expenseTotal / expenseCount) : 0,
  };
}

function applyWorkerExtrasFromScOrHistory(
  line: SaleWorkerLine,
  workerInfo: { meal?: number | string | null; expense?: number | string | null },
  mealIncluded: boolean,
  salesHistory: SaleHistoryRow[],
  clientName: string,
  workerName: string,
) {
  const next = { ...line };
  const scExtras = extractScParticipantExtras(workerInfo as Record<string, unknown>);
  const scMeal = parseScParticipantMoney(workerInfo.meal) ?? scExtras.meal;
  const scExpense = parseScParticipantMoney(workerInfo.expense) ?? scExtras.expense;

  if (!mealIncluded) {
    if (scMeal != null) {
      next.meal = String(scMeal);
    } else {
      const extras = inferWorkerExtrasFromHistory(salesHistory, clientName, workerName);
      if (extras.meal > 0) next.meal = String(extras.meal);
    }
  }

  if (scExpense != null) {
    next.expense = String(scExpense);
  } else {
    const extras = inferWorkerExtrasFromHistory(salesHistory, clientName, workerName);
    if (extras.expense > 0) next.expense = String(extras.expense);
  }

  return next;
}

function applyScheduleBillingRules(
  line: SaleWorkerLine,
  effectiveTimes: Pick<{ startTime: string; endTime: string }, "startTime" | "endTime">,
  workHours: number | null,
  overtimeHours: number,
  rules: SaleAiRules,
  fromWorkLog = false,
) {
  const next = { ...line };
  const isShortShift =
    workHours != null && workHours > 0 && workHours < rules.shortShiftMaxHours;
  const hasOvertime = overtimeHours > 0;
  const workMemo = buildScheduleWorkMemo(effectiveTimes, workHours, fromWorkLog);

  if (isShortShift && workHours != null) {
    const shortCharge = String(computeShortShiftChargeAmount(workHours, rules));
    next.chargeAmount = shortCharge;
    next.unitCost = shortCharge;
  }

  if (hasOvertime) {
    next.overtimeHours = String(Math.round(overtimeHours * 10) / 10);
  } else {
    next.overtimeHours = "";
  }

  if (isShortShift || hasOvertime) {
    next.memo = workMemo;
  }

  return next;
}

export function buildSaleFormFromScSchedule(
  schedule: ScSchedule,
  workers: WorkerMasterLike[],
  clients: ClientMasterLike[],
  salesHistory: SaleHistoryRow[] = [],
  rulesInput?: SaleAiRules | null,
): SaleFormData {
  const rules = normalizeSaleAiRules(rulesInput ?? DEFAULT_SALE_AI_RULES);
  const base = compactSaleForm();
  const clientName = String(schedule.clientName || "").trim();
  const siteName = resolveScScheduleSiteName(schedule);
  const workDate = String(schedule.workDate || "").slice(0, 10);
  const client = clients.find((row) => String(row.name || "").trim() === clientName);
  const mealIncluded = String(client?.mealIncluded || "N").trim().toUpperCase() === "Y";
  const effectiveTimes = getScScheduleEffectiveWorkTimes(schedule);
  const workHours = resolveScScheduleWorkHoursForBilling(schedule);
  const overtimeHours = computeScheduleOvertimeHours(effectiveTimes.endTime, rules);
  const scheduleWorkers = getScScheduleWorkerDetails(schedule, workers);

  const workerLines = scheduleWorkers.map((workerInfo, index) => {
    const workerName = String(workerInfo.name || workerInfo.participantName || "").trim();
    let line = enrichWorkerLineOnWorkerSelect(
      createWorkerLine(index),
      workers,
      clients,
      clientName,
      workerName,
    );
    line.quantity = "1";

    line = applyWorkerExtrasFromScOrHistory(
      line,
      workerInfo,
      mealIncluded,
      salesHistory,
      clientName,
      workerName,
    );

    line = applyScheduleBillingRules(
      line,
      effectiveTimes,
      workHours,
      overtimeHours,
      rules,
      effectiveTimes.fromWorkLog,
    );
    return line;
  });

  while (workerLines.length < 8) {
    workerLines.push(createWorkerLine(workerLines.length));
  }

  return {
    ...base,
    date: workDate || base.date,
    client: clientName,
    site: siteName,
    workers: workerLines,
    memo: "",
    officeMemo: "",
  };
}

export type ScScheduleChargeHeadcountWarning = {
  requestedHeadcount: number;
  actualHeadcount: number;
  requestedChargeTotal: number;
  actualChargeTotal: number;
  overchargeAmount: number;
};

function resolveRequestedChargeTotalForHeadcount(
  sale: { client?: string; workers?: SaleWorkerLine[]; worker?: string },
  requested: number,
  clients: ClientMasterLike[] = [],
) {
  const clientName = String(sale.client || "").trim();
  const client = clients.find((row) => String(row.name || "").trim() === clientName);
  const clientUnitCharge = parseWorkerMoney(resolveWorkerLineChargeAmount(null, client));
  if (clientUnitCharge > 0) {
    return requested * clientUnitCharge;
  }
  return sumWorkerLinesChargeOnlyForHeadcount(getSaleWorkerLines(sale), requested);
}

/** SC 요청 인원(expectedHeadcount) 대비 청구단가 합계가 많을 때 경고 */
export function detectScScheduleChargeHeadcountWarning(
  sale: { client?: string; workers?: SaleWorkerLine[]; worker?: string },
  requestedHeadcount?: number | null,
  clients: ClientMasterLike[] = [],
): ScScheduleChargeHeadcountWarning | null {
  const requested = Math.floor(Number(requestedHeadcount));
  if (!Number.isFinite(requested) || requested <= 0) return null;

  const lines = getSaleWorkerLines(sale);
  if (!lines.length) return null;

  const actualHeadcount = getSaleStaffCount(sale);
  if (actualHeadcount <= requested) return null;

  const requestedChargeTotal = resolveRequestedChargeTotalForHeadcount(sale, requested, clients);
  const actualChargeTotal = sumWorkerLinesChargeOnlyForHeadcount(lines, actualHeadcount);
  if (actualChargeTotal <= requestedChargeTotal) return null;

  return {
    requestedHeadcount: requested,
    actualHeadcount,
    requestedChargeTotal,
    actualChargeTotal,
    overchargeAmount: actualChargeTotal - requestedChargeTotal,
  };
}
