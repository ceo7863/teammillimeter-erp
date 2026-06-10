import {
  aggregateSaleBilling,
  getSaleWorkerLines,
  getWorkerLineBill,
  getWorkerLineChargeAmount,
  getWorkerLineExtras,
  getWorkerLineOriginalBill,
} from "./saleBilling";
import { parseWorkerMoney } from "./workerLineMetrics";
import { filterSalesByDate, type SaleLike } from "./workerPayments";

import { LEGACY_COMPANY_BANK_ACCOUNT } from "./companyProfile";

export const COMPANY_BANK_ACCOUNT = LEGACY_COMPANY_BANK_ACCOUNT;

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
    memo: formatStatementMemo(sale.memo || ""),
  };
}

export function buildClientStatementRows(sales: ClientStatementSaleLike[] = []): ClientStatementRow[] {
  return sales.map(aggregateClientSale);
}

export function normalizeClientStatementName(value: unknown) {
  return String(value || "").trim() || "(\uBBF8\uC9C0\uC815)";
}

export function listClientsWithStatementRows(
  sales: SaleLike[] = [],
  dateFilter: { startDate?: string; endDate?: string } = {}
) {
  const filtered = filterSalesByDate(sales, dateFilter.startDate, dateFilter.endDate);
  const grouped = new Map<string, number>();

  for (const sale of filtered) {
    const name = normalizeClientStatementName(sale.client);
    grouped.set(name, (grouped.get(name) || 0) + 1);
  }

  return [...grouped.entries()]
    .map(([name, rowCount]) => ({ name, rowCount }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function formatChargeAmountLabel(chargeAmount: number) {
  if (!chargeAmount) return "0";
  const scaled = chargeAmount / 10000;
  if (Number.isInteger(scaled)) return String(scaled);
  return String(Number(scaled.toFixed(1)));
}

export function formatWorkerNameSummary(lines: ReturnType<typeof getSaleWorkerLines>) {
  return lines
    .map((line) => `${String(line.worker || "").trim()}(${formatChargeAmountLabel(getWorkerLineChargeAmount(line))})`)
    .filter((entry) => entry && !entry.startsWith("("))
    .join(", ");
}

export function normalizeStatementMemo(memo?: string | null) {
  return String(memo ?? "").replace(/\s+/g, " ").trim();
}

const MEMO_SEGMENT_SPLIT = /\s*[\/|,·|;|\n]+\s*/;

/** "주차비 / 주차비" → "주차비" — 비고 문자열 안의 반복 구절 제거 */
export function dedupeMemoSegments(memo?: string | null) {
  const text = normalizeStatementMemo(memo);
  if (!text) return "";

  const segments = text
    .split(MEMO_SEGMENT_SPLIT)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length <= 1) return text;

  const seen = new Set<string>();
  const unique: string[] = [];

  segments.forEach((segment) => {
    if (seen.has(segment)) return;
    seen.add(segment);
    unique.push(segment);
  });

  return unique.join(" / ");
}

function formatStatementMemo(memo?: string | null) {
  return dedupeMemoSegments(memo);
}

/** 요약·상세 현장 행 비고: 공통비고 + 시공자별 비고(중복 제거) */
export function collectClientStatementSiteMemo(sale: ClientStatementSaleLike): string {
  const parts: string[] = [];
  const seen = new Set<string>();

  const push = (raw?: string | null) => {
    const memo = formatStatementMemo(raw);
    if (!memo || seen.has(memo)) return;
    seen.add(memo);
    parts.push(memo);
  };

  push(sale.memo);
  getSaleWorkerLines(sale).forEach((line) => {
    if (String(line.worker || "").trim()) push(line.memo);
  });

  return parts.join(" / ");
}

/** 비고가 여러 행에 같으면 첫 행만 표시 */
export function dedupeStatementRowMemos<T extends { memo?: string }>(rows: T[] = []): T[] {
  const seen = new Set<string>();

  return rows.map((row) => {
    const memo = formatStatementMemo(row.memo);
    if (!memo || seen.has(memo)) {
      return { ...row, memo: "" };
    }
    seen.add(memo);
    return { ...row, memo };
  });
}

/** 요약: 현장 1행 + 시공자명(청구단가) 나열 행 */
export function buildClientStatementSummaryDisplayRows(sales: ClientStatementSaleLike[] = []): ClientStatementDisplayRow[] {
  const rows = sales.flatMap((sale) => {
    const aggregated = aggregateClientSale(sale);
    const lines = getSaleWorkerLines(sale);
    const workerLabel = formatWorkerNameSummary(lines);

    const groupRows: ClientStatementDisplayRow[] = [
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
        memo: collectClientStatementSiteMemo(sale),
      },
    ];

    if (workerLabel) {
      groupRows.push({
        id: `${sale.id}-workers`,
        kind: "sub",
        site: workerLabel,
      });
    }

    return groupRows;
  });

  return dedupeStatementRowMemos(rows);
}

/** 상세: 현장 1행(총시공비) + 시공자별 행(총시공비=lineBill, 원시공비=청구합-부대비용) */
export function buildClientStatementDetailDisplayRows(sales: ClientStatementSaleLike[] = []): ClientStatementDisplayRow[] {
  const rows = sales.flatMap((sale) => {
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
        originalCost: aggregated.originalCost,
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
        totalConstructionCost: getWorkerLineBill(line),
        originalCost: getWorkerLineOriginalBill(line),
        overtimeCost: extras.overtime,
        lodgingCost: extras.lodging,
        mealCost: extras.meal,
        expenseCost: extras.expense,
        memo: formatStatementMemo(line.memo || ""),
      });
    });

    return rows;
  });

  return dedupeStatementRowMemos(rows);
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
