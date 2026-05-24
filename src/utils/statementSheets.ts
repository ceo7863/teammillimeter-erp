import {
  aggregateSaleBilling,
  getSaleWorkerLines,
  getWorkerLineChargeAmount,
  getWorkerLineExtras,
} from "./saleBilling";
import { parseWorkerMoney } from "./workerLineMetrics";

export const COMPANY_BANK_ACCOUNT = "969-046529-04-015 기업은행 (주)팀밀리미터";

export type ClientMasterLike = {
  name?: string;
  businessNo?: string;
  manager?: string;
  phone?: string;
  vat?: string;
};

export type ClientStatementRow = {
  id: number | string;
  date?: string;
  site?: string;
  staffCount?: number;
  totalConstructionCost?: number;
  originalCost?: number;
  overtimeCost?: number;
  lodgingCost?: number;
  mealCost?: number;
  expenseCost?: number;
  memo?: string;
};

/** 현장 1행 + 아래 시공자(또는 시공자명 나열) 행 */
export type ClientStatementDisplayRow = {
  id: string;
  kind: "site" | "sub";
  date?: string;
  site?: string;
  staffCount?: number;
  /** undefined면 빈 칸(상세 시공자 행 총시공비 등) */
  totalConstructionCost?: number | null;
  /** undefined면 빈 칸(상세 현장 행 원시공비) */
  originalCost?: number | null;
  overtimeCost?: number;
  lodgingCost?: number;
  mealCost?: number;
  expenseCost?: number;
  memo?: string;
};

export type ClientStatementSaleLike = {
  id?: number | string;
  date?: string;
  site?: string;
  memo?: string;
  amount?: number;
  workers?: ClientStatementWorkerLineLike[];
};

export type ClientStatementWorkerLineLike = {
  worker?: string;
  quantity?: string | number;
  chargeAmount?: string | number;
  unitCost?: string | number;
  lineBill?: string | number;
  meal?: string | number;
  lodging?: string | number;
  accommodation?: string | number;
  room?: string | number;
  expense?: string | number;
  extraExpense?: string | number;
  overtimeHours?: string | number;
  overtimeCost?: string | number;
  memo?: string;
  no?: string | number;
};

function aggregateClientSale(sale: ClientStatementSaleLike): ClientStatementRow {
  const billing = aggregateSaleBilling(sale);

  return {
    id: sale.id ?? "",
    date: sale.date,
    site: sale.site,
    staffCount: billing.staffCount,
    totalConstructionCost: billing.totalConstructionCost,
    originalCost: billing.originalCost,
    overtimeCost: billing.overtimeCost,
    lodgingCost: billing.lodgingCost,
    mealCost: billing.mealCost,
    expenseCost: billing.expenseCost,
    memo: sale.memo || "",
  };
}

export function buildClientStatementRows(sales: ClientStatementSaleLike[] = []): ClientStatementRow[] {
  return sales.map(aggregateClientSale);
}

function formatChargeAmountLabel(chargeAmount: number) {
  if (!chargeAmount) return "0";
  const scaled = chargeAmount / 10000;
  if (Number.isInteger(scaled)) return String(scaled);
  return String(Number(scaled.toFixed(1)));
}

function formatWorkerNameSummary(lines: ReturnType<typeof getSaleWorkerLines>) {
  return lines
    .map((line) => `${String(line.worker || "").trim()}(${formatChargeAmountLabel(getWorkerLineChargeAmount(line))})`)
    .join(", ");
}

/** 요약: 현장 1행 + 시공자명(청구단가) 나열 행 */
export function buildClientStatementSummaryDisplayRows(sales: ClientStatementSaleLike[] = []): ClientStatementDisplayRow[] {
  return sales.flatMap((sale) => {
    const aggregated = aggregateClientSale(sale);
    const lines = getSaleWorkerLines(sale);
    const workerLabel = formatWorkerNameSummary(lines);

    const rows: ClientStatementDisplayRow[] = [
      {
        id: `${sale.id}-site`,
        kind: "site",
        date: aggregated.date,
        site: aggregated.site,
        staffCount: aggregated.staffCount,
        totalConstructionCost: aggregated.totalConstructionCost,
        originalCost: aggregated.originalCost,
        overtimeCost: aggregated.overtimeCost,
        lodgingCost: aggregated.lodgingCost,
        mealCost: aggregated.mealCost,
        expenseCost: aggregated.expenseCost,
        memo: aggregated.memo,
      },
    ];

    if (workerLabel) {
      rows.push({
        id: `${sale.id}-workers`,
        kind: "sub",
        site: workerLabel,
      });
    }

    return rows;
  });
}

/** 상세: 현장 1행(총시공비) + 시공자별 행(원시공비=청구단가) */
export function buildClientStatementDetailDisplayRows(sales: ClientStatementSaleLike[] = []): ClientStatementDisplayRow[] {
  return sales.flatMap((sale) => {
    const aggregated = aggregateClientSale(sale);
    const lines = getSaleWorkerLines(sale);

    const rows: ClientStatementDisplayRow[] = [
      {
        id: `${sale.id}-site`,
        kind: "site",
        date: aggregated.date,
        site: aggregated.site,
        staffCount: aggregated.staffCount,
        totalConstructionCost: aggregated.totalConstructionCost,
        originalCost: null,
        overtimeCost: aggregated.overtimeCost,
        lodgingCost: aggregated.lodgingCost,
        mealCost: aggregated.mealCost,
        expenseCost: aggregated.expenseCost,
        memo: aggregated.memo,
      },
    ];

    lines.forEach((line, index) => {
      const extras = getWorkerLineExtras(line);
      const quantity = parseWorkerMoney(line.quantity || "1") || 1;

      rows.push({
        id: `${sale.id}-worker-${index}`,
        kind: "sub",
        site: String(line.worker).trim(),
        staffCount: quantity,
        totalConstructionCost: null,
        originalCost: getWorkerLineChargeAmount(line),
        overtimeCost: extras.overtime,
        lodgingCost: extras.lodging,
        mealCost: extras.meal,
        expenseCost: extras.expense,
        memo: String(line.memo || "").trim(),
      });
    });

    return rows;
  });
}

export function countClientStatementBodyRows(rows: ClientStatementDisplayRow[] = []) {
  return rows.length || 1;
}

export function isClientStatementWorkerDetailRow(row: ClientStatementDisplayRow) {
  if (row.kind !== "sub") return false;

  return (
    row.originalCost != null ||
    row.totalConstructionCost != null ||
    row.staffCount != null ||
    Boolean(row.overtimeCost || row.lodgingCost || row.mealCost || row.expenseCost || row.memo)
  );
}

export type ClientStatementDisplayGroup = {
  site: ClientStatementDisplayRow;
  subs: ClientStatementDisplayRow[];
};

export function groupClientStatementDisplayRows(rows: ClientStatementDisplayRow[] = []): ClientStatementDisplayGroup[] {
  const groups: ClientStatementDisplayGroup[] = [];
  let current: ClientStatementDisplayGroup | null = null;

  rows.forEach((row) => {
    if (row.kind === "site") {
      current = { site: row, subs: [] };
      groups.push(current);
      return;
    }

    if (current) {
      current.subs.push(row);
    }
  });

  return groups;
}

export type ClientStatementSummary = {
  staffCount: number;
  totalConstructionCost: number;
  originalCost: number;
  overtimeCost: number;
  lodgingCost: number;
  mealCost: number;
  expenseCost: number;
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
};

export function buildClientStatementSummary(
  rows: ClientStatementRow[] = [],
  clientInfo: ClientMasterLike = {}
): ClientStatementSummary {
  const totals = rows.reduce(
    (acc, row) => {
      acc.staffCount += row.staffCount || 0;
      acc.totalConstructionCost += row.totalConstructionCost || 0;
      acc.originalCost += row.originalCost || 0;
      acc.overtimeCost += row.overtimeCost || 0;
      acc.lodgingCost += row.lodgingCost || 0;
      acc.mealCost += row.mealCost || 0;
      acc.expenseCost += row.expenseCost || 0;
      return acc;
    },
    {
      staffCount: 0,
      totalConstructionCost: 0,
      originalCost: 0,
      overtimeCost: 0,
      lodgingCost: 0,
      mealCost: 0,
      expenseCost: 0,
    }
  );

  const subtotal = totals.totalConstructionCost;
  const vatAmount = clientInfo?.vat === "Y" ? Math.round(subtotal * 0.1) : 0;

  return {
    ...totals,
    subtotal,
    vatAmount,
    grandTotal: subtotal + vatAmount,
  };
}

export {
  aggregateSaleBilling,
  getSaleTotalBill as getClientSaleTotalBill,
  getSaleStaffCount as getClientSaleStaffCount,
  getSaleOriginalBill as getClientSaleBaseBill,
} from "./saleBilling";
