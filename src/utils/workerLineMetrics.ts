export type WorkerLineLike = {
  worker?: string;
  quantity?: string | number;
  unitCost?: string | number;
  chargeAmount?: string | number;
  lineBill?: string | number;
  lineSpend?: string | number;
  lineMargin?: string | number;
  feeRate?: string | number;
  meal?: string | number;
  lodging?: string | number;
  accommodation?: string | number;
  room?: string | number;
  expense?: string | number;
  extraExpense?: string | number;
  overtimeHours?: string | number;
  overtimeCost?: string | number;
};

export type WorkerLineMetrics = {
  staffCount: number;
  bill: number;
  spend: number;
  margin: number;
  feeRate: number;
};

export type WorkerFormTotals = {
  bill: number;
  spend: number;
  margin: number;
  fee: number;
};

export function parseWorkerMoney(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

/** lineBill 등 시트/DB에 값이 있으면 true — "0"도 명시적 값으로 취급 */
export function hasExplicitWorkerField(value: unknown) {
  return value != null && String(value).trim() !== "";
}

export function normalizeFeeRate(value: unknown) {
  const raw = parseWorkerMoney(value);
  return raw > 1 ? raw / 100 : raw;
}

export function calculateWorkerLineAmounts(line: WorkerLineLike) {
  const quantity = parseWorkerMoney(line.quantity || "1") || 1;
  const unitCost = parseWorkerMoney(line.unitCost);
  const chargeAmount = parseWorkerMoney(line.chargeAmount) || unitCost;
  const meal = parseWorkerMoney(line.meal);
  const lodging = parseWorkerMoney(line.lodging || line.accommodation || line.room);
  const expense = parseWorkerMoney(line.expense || line.extraExpense);
  const overtime = parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
  const extras = meal + lodging + expense + overtime;

  return {
    staffCount: quantity,
    spend: quantity * unitCost + extras,
    bill: quantity * chargeAmount + extras,
  };
}

export function calculateWorkerMargin(bill: number, spend: number, feeRate: number) {
  return bill - spend + Math.round(spend * feeRate);
}

export function buildWorkerFeeMap(workers: Array<{ name?: string; feeRate?: number }> = []) {
  return new Map(workers.map((worker) => [String(worker.name || "").trim(), normalizeFeeRate(worker.feeRate)]));
}

export function resolveWorkerFeeRate(line: WorkerLineLike, feeMap?: Map<string, number>) {
  if (line.feeRate != null && line.feeRate !== "") return normalizeFeeRate(line.feeRate);

  const name = String(line.worker || "").trim();
  if (feeMap && name && feeMap.has(name)) return feeMap.get(name) || 0;

  return 0;
}

export function calculateWorkerLineMetrics(line: WorkerLineLike, feeRate = 0): WorkerLineMetrics {
  const normalizedFee =
    line.feeRate != null && line.feeRate !== "" ? normalizeFeeRate(line.feeRate) : normalizeFeeRate(feeRate);

  if (hasExplicitWorkerField(line.lineBill)) {
    const sheetBill = parseWorkerMoney(line.lineBill);
    const sheetSpend = parseWorkerMoney(line.lineSpend);
    const sheetMargin = parseWorkerMoney(line.lineMargin);
    return {
      staffCount: parseWorkerMoney(line.quantity || "1") || 1,
      bill: sheetBill,
      spend: sheetSpend,
      margin: sheetMargin || calculateWorkerMargin(sheetBill, sheetSpend, normalizedFee),
      feeRate: normalizedFee,
    };
  }

  const sheetSpend = parseWorkerMoney(line.lineSpend);
  const sheetMargin = parseWorkerMoney(line.lineMargin);
  if (sheetSpend || sheetMargin) {
    return {
      staffCount: parseWorkerMoney(line.quantity || "1") || 1,
      bill: 0,
      spend: sheetSpend,
      margin: sheetMargin || calculateWorkerMargin(0, sheetSpend, normalizedFee),
      feeRate: normalizedFee,
    };
  }

  const amounts = calculateWorkerLineAmounts(line);
  return {
    ...amounts,
    margin: calculateWorkerMargin(amounts.bill, amounts.spend, normalizedFee),
    feeRate: normalizedFee,
  };
}

export function enrichWorkerLineWithMetrics(line: WorkerLineLike, feeRate = 0) {
  const metrics = calculateWorkerLineMetrics(line, feeRate);

  return {
    ...line,
    feeRate: metrics.feeRate,
    lineBill: String(metrics.bill),
    lineSpend: String(metrics.spend),
    lineMargin: String(metrics.margin),
  };
}

export function sumWorkerFormTotals(lines: WorkerLineLike[] = [], workers: Array<{ name?: string; feeRate?: number }> = []): WorkerFormTotals {
  const feeMap = buildWorkerFeeMap(workers);

  return lines.reduce(
    (acc, line) => {
      if (!line.worker) return acc;

      const metrics = calculateWorkerLineMetrics(line, resolveWorkerFeeRate(line, feeMap));
      acc.bill += metrics.bill;
      acc.spend += metrics.spend;
      acc.margin += metrics.margin;
      acc.fee += Math.round(metrics.spend * metrics.feeRate);
      return acc;
    },
    { bill: 0, spend: 0, margin: 0, fee: 0 }
  );
}
