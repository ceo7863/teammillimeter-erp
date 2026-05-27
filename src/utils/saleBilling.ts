import {
  buildWorkerFeeMap,
  calculateWorkerLineAmounts,
  enrichWorkerLineWithMetrics,
  hasExplicitWorkerField,
  parseWorkerMoney,
  resolveWorkerFeeRate,
  type WorkerLineLike,
} from "./workerLineMetrics";

export type SaleBillingLike = {
  id?: number | string;
  amount?: number;
  worker?: string;
  workers?: WorkerLineLike[];
};

export type SaleBillingBreakdown = {
  staffCount: number;
  totalConstructionCost: number;
  originalCost: number;
  overtimeCost: number;
  lodgingCost: number;
  mealCost: number;
  expenseCost: number;
};

function resolveImpliedWorkerLineExtras(line: WorkerLineLike, fieldExtras: ReturnType<typeof readWorkerLineExtraFields>) {
  const bill = getWorkerLineBill(line);
  const quantity = parseWorkerMoney(line.quantity || "1") || 1;
  const chargeBase = quantity * getWorkerLineChargeAmount(line);
  const impliedTotal = Math.max(0, bill - chargeBase);
  const fieldTotal = fieldExtras.meal + fieldExtras.lodging + fieldExtras.expense + fieldExtras.overtime;

  if (impliedTotal <= 0) {
    return fieldExtras;
  }

  if (fieldTotal >= impliedTotal) {
    return fieldExtras;
  }

  let meal = fieldExtras.meal;
  let lodging = fieldExtras.lodging;
  let expense = fieldExtras.expense;
  let overtime = fieldExtras.overtime;
  let remainder = impliedTotal - fieldTotal;

  if (remainder > 0 && overtime === 0 && hasExplicitWorkerField(line.overtimeHours)) {
    const overtimeAmount =
      parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
    if (overtimeAmount > 0 && overtimeAmount <= remainder) {
      overtime = overtimeAmount;
      remainder -= overtimeAmount;
    }
  }

  if (remainder > 0) {
    meal += remainder;
  }

  return {
    meal,
    lodging,
    expense,
    overtime,
    total: meal + lodging + expense + overtime,
  };
}

function readWorkerLineExtraFields(line: WorkerLineLike) {
  const meal = parseWorkerMoney(line.meal);
  const lodging = parseWorkerMoney(line.lodging || line.accommodation || line.room);
  const expense = parseWorkerMoney(line.expense || line.extraExpense);
  const overtime = parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);

  return {
    meal,
    lodging,
    expense,
    overtime,
    total: meal + lodging + expense + overtime,
  };
}

export function getWorkerLineExtras(line: WorkerLineLike) {
  const fieldExtras = readWorkerLineExtraFields(line);

  if (!hasExplicitWorkerField(line.lineBill)) {
    return fieldExtras;
  }

  return resolveImpliedWorkerLineExtras(line, fieldExtras);
}

/** 시공자 1줄 청구합계 — lineBill(엑셀 11열)이 있으면 0 포함 그대로, 없으면 인원×청구단가+부대비용 */
export function getWorkerLineBill(line: WorkerLineLike) {
  if (hasExplicitWorkerField(line.lineBill)) return parseWorkerMoney(line.lineBill);
  return calculateWorkerLineAmounts(line).bill;
}

/** 청구합계에서 부대비용을 뺀 원시공비(내역서 합계용) */
export function getWorkerLineOriginalBill(line: WorkerLineLike) {
  const bill = getWorkerLineBill(line);
  const extras = getWorkerLineExtras(line);
  return Math.max(bill - extras.total, 0);
}

export function getWorkerLineChargeAmount(line: WorkerLineLike) {
  if (hasExplicitWorkerField(line.chargeAmount)) {
    return parseWorkerMoney(line.chargeAmount);
  }
  // chargeAmount 필드는 있지만 비어 있음 → 청구 0 (지급단가로 대체하지 않음)
  if (Object.prototype.hasOwnProperty.call(line, "chargeAmount")) {
    return 0;
  }
  // 구 데이터: chargeAmount 없음 — lineBill이 있으면 원시공비에서 역산 (지급단가와 다를 수 있음)
  if (hasExplicitWorkerField(line.lineBill)) {
    const quantity = parseWorkerMoney(line.quantity || "1") || 1;
    return Math.round(getWorkerLineOriginalBill(line) / quantity);
  }
  // lineBill도 없는 아주 오래된 행만 지급단가 참고
  return parseWorkerMoney(line.unitCost);
}

export function getSaleWorkerLines(sale: SaleBillingLike): WorkerLineLike[] {
  if (sale.workers?.length) {
    return sale.workers.filter((line) => String(line.worker || "").trim());
  }

  return String(sale.worker || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((worker) => ({ worker, quantity: "1" }));
}

export function getSaleStaffCount(sale: SaleBillingLike) {
  return getSaleWorkerLines(sale).reduce((sum, line) => sum + (parseWorkerMoney(line.quantity || "1") || 1), 0);
}

/** 전표 총시공비 = 시공자별 lineBill 합 */
export function getSaleTotalBill(sale: SaleBillingLike) {
  const lines = getSaleWorkerLines(sale);
  if (!lines.length) return sale.amount || 0;
  return lines.reduce((sum, line) => sum + getWorkerLineBill(line), 0);
}

export function getSaleOriginalBill(sale: SaleBillingLike) {
  const lines = getSaleWorkerLines(sale);
  if (!lines.length) return sale.amount || 0;
  return lines.reduce((sum, line) => sum + getWorkerLineOriginalBill(line), 0);
}

export function aggregateSaleBilling(sale: SaleBillingLike): SaleBillingBreakdown {
  const lines = getSaleWorkerLines(sale);
  const extras = lines.reduce(
    (acc, line) => {
      const lineExtras = getWorkerLineExtras(line);
      acc.overtimeCost += lineExtras.overtime;
      acc.mealCost += lineExtras.meal;
      acc.lodgingCost += lineExtras.lodging;
      acc.expenseCost += lineExtras.expense;
      return acc;
    },
    { overtimeCost: 0, mealCost: 0, lodgingCost: 0, expenseCost: 0 }
  );

  const totalConstructionCost = getSaleTotalBill(sale);
  const originalCost = getSaleOriginalBill(sale);

  return {
    staffCount: getSaleStaffCount(sale),
    totalConstructionCost,
    originalCost,
    ...extras,
  };
}

/** workers[] lineBill·amount 재계산 */
export function normalizeSaleRecord<T extends SaleBillingLike>(sale: T, workersMaster: Array<{ name?: string; feeRate?: number }> = []): T {
  const lines = getSaleWorkerLines(sale);
  if (!lines.length) {
    return { ...sale, amount: sale.amount || 0 };
  }

  const feeMap = buildWorkerFeeMap(workersMaster);
  const enrichedWorkers = lines.map((line) => {
    const enriched = enrichWorkerLineWithMetrics(line, resolveWorkerFeeRate(line, feeMap));
    const bill = getWorkerLineBill(enriched);
    return {
      ...enriched,
      lineBill: String(bill),
    };
  });

  const amount = enrichedWorkers.reduce((sum, line) => sum + getWorkerLineBill(line), 0);
  const workerLabel = enrichedWorkers.map((line) => line.worker).filter(Boolean).join(", ");

  return {
    ...sale,
    workers: enrichedWorkers,
    worker: workerLabel || sale.worker,
    amount,
  };
}

export function normalizeSalesRecords<T extends SaleBillingLike>(
  sales: T[] = [],
  workersMaster: Array<{ name?: string; feeRate?: number }> = []
): T[] {
  return sales.map((sale) => normalizeSaleRecord(sale, workersMaster));
}

/** amount·lineBill·부대비용 합계 일치 여부 */
export function auditSaleBilling(sale: SaleBillingLike) {
  const breakdown = aggregateSaleBilling(sale);
  const componentTotal =
    breakdown.originalCost +
    breakdown.overtimeCost +
    breakdown.mealCost +
    breakdown.lodgingCost +
    breakdown.expenseCost;
  const storedAmount = sale.amount || 0;
  const computedAmount = breakdown.totalConstructionCost;

  return {
    saleId: sale.id,
    storedAmount,
    computedAmount,
    componentTotal,
    amountMatchesBill: storedAmount === computedAmount,
    billMatchesComponents: computedAmount === componentTotal,
    breakdown,
  };
}

export function auditSalesBilling(sales: SaleBillingLike[] = []) {
  const issues = sales
    .map((sale) => auditSaleBilling(sale))
    .filter((result) => !result.amountMatchesBill || !result.billMatchesComponents);

  return {
    totalSales: sales.length,
    issueCount: issues.length,
    issues,
  };
}
