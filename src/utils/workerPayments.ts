import * as XLSX from "xlsx";
import {
  buildWorkerFeeMap,
  calculateWorkerLineAmounts,
  calculateWorkerLineMetrics,
  parseWorkerMoney,
  resolveWorkerFeeRate,
} from "./workerLineMetrics";
import { formatKRW, monthStartISO, todayISO } from "./receivables";

export { formatKRW, monthStartISO, todayISO };

export type WorkerMasterLike = {
  id?: number | string;
  name?: string;
  phone?: string;
  bank?: string;
  account?: string;
  feeRate?: number;
};

export type SaleLike = {
  id?: number | string;
  voucherNo?: string | number;
  date?: string;
  client?: string;
  site?: string;
  worker?: string;
  workers?: WorkerLineLike[];
  memo?: string;
  amount?: number;
};

export type WorkerLineLike = {
  worker?: string;
  quantity?: string | number;
  unitCost?: string | number;
  chargeAmount?: string | number;
  meal?: string | number;
  lodging?: string | number;
  accommodation?: string | number;
  room?: string | number;
  expense?: string | number;
  extraExpense?: string | number;
  overtimeHours?: string | number;
  overtimeCost?: string | number;
  feeRate?: string | number;
  lineBill?: string | number;
  lineSpend?: string | number;
  lineMargin?: string | number;
  memo?: string;
  no?: string | number;
};

export type WorkerPaymentDetailRow = {
  id: string;
  saleId: number | string;
  voucherNo: string;
  date: string;
  client: string;
  site: string;
  worker: string;
  quantity: number;
  unitCost: number;
  basePay: number;
  meal: number;
  lodging: number;
  expense: number;
  overtime: number;
  totalPay: number;
  feeRate: number;
  fee: number;
  netPay: number;
  bill: number;
  margin: number;
  memo: string;
};

export type WorkerPaymentSummaryRow = {
  workerId?: number | string;
  name: string;
  phone?: string;
  bank?: string;
  account?: string;
  feeRate: number;
  lineCount: number;
  headcount: number;
  grossPay: number;
  fee: number;
  netPay: number;
};

export function formatStatementDate(value: string) {
  if (!value) return "";
  const parts = String(value).split("-");
  if (parts.length !== 3) return value;
  const year = Number(parts[0]) % 100;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return `${month}/${day}/${year}`;
}

export function formatStatementDashAmount(value: number) {
  const amount = Number(value) || 0;
  return amount ? formatKRW(amount) : "-";
}

export function filterSalesByDate(sales: SaleLike[] = [], startDate = "", endDate = "") {
  return sales.filter((sale) => {
    const startMatch = startDate ? String(sale.date || "") >= startDate : true;
    const endMatch = endDate ? String(sale.date || "") <= endDate : true;
    return startMatch && endMatch;
  });
}

function saleWorkerLines(sale: SaleLike): WorkerLineLike[] {
  if (sale.workers?.length) return sale.workers;
  if (!sale.worker) return [];

  return String(sale.worker || "")
    .split(",")
    .map((name) => ({
      worker: name.trim(),
      quantity: "1",
      unitCost: String(sale.amount || 0),
      chargeAmount: String(sale.amount || 0),
      meal: "",
      overtimeHours: "",
      overtimeCost: "30000",
      memo: sale.memo || "",
    }))
    .filter((line) => line.worker);
}

export function flattenSalesToWorkerPaymentRows(
  sales: SaleLike[] = [],
  workersMaster: WorkerMasterLike[] = []
): WorkerPaymentDetailRow[] {
  const feeMap = buildWorkerFeeMap(workersMaster);

  return sales.flatMap((sale) => {
    const lines = saleWorkerLines(sale);

    return lines.map((line, lineIndex) => {
      const calculated = calculateWorkerLineAmounts(line);
      const feeRate = resolveWorkerFeeRate(line, feeMap);
      const quantity = parseWorkerMoney(line.quantity || "1") || 1;
      const unitCost = parseWorkerMoney(line.unitCost);
      const meal = parseWorkerMoney(line.meal);
      const lodging = parseWorkerMoney(line.lodging || line.accommodation || line.room);
      const expense = parseWorkerMoney(line.expense || line.extraExpense);
      const overtime = parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
      const basePay = quantity * unitCost;
      const totalPay = calculated.spend;
      const fee = Math.round(totalPay * feeRate);
      const metrics = calculateWorkerLineMetrics(line, feeRate);

      return {
        id: `${sale.id}-${line.worker}-${line.no ?? lineIndex}`,
        saleId: sale.id ?? "",
        voucherNo: String(sale.voucherNo ?? sale.id ?? ""),
        date: sale.date || "",
        client: sale.client || "",
        site: sale.site || "",
        worker: String(line.worker || "").trim(),
        quantity,
        unitCost,
        basePay,
        meal,
        lodging,
        expense,
        overtime,
        totalPay,
        feeRate,
        fee,
        netPay: totalPay - fee,
        bill: metrics.bill,
        margin: metrics.margin,
        memo: String(line.memo || sale.memo || "").trim(),
      };
    });
  });
}

export function listWorkersWithPaymentRows(
  sales: SaleLike[] = [],
  dateFilter: { startDate?: string; endDate?: string } = {},
  workersMaster: WorkerMasterLike[] = []
) {
  const filtered = filterSalesByDate(sales, dateFilter.startDate, dateFilter.endDate);
  const rows = flattenSalesToWorkerPaymentRows(filtered, workersMaster);
  const grouped = new Map<string, number>();

  for (const row of rows) {
    if (!row.worker) continue;
    grouped.set(row.worker, (grouped.get(row.worker) || 0) + 1);
  }

  return [...grouped.entries()]
    .map(([name, rowCount]) => ({ name, rowCount }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function buildWorkerStatementSummary(rows: WorkerPaymentDetailRow[], workerInfo: WorkerMasterLike = {}) {
  const grossPay = rows.reduce((sum, row) => sum + (row.totalPay || 0), 0);
  const feeRate = workerInfo?.feeRate || 0;
  const fee = Math.round(grossPay * feeRate);
  return { grossPay, fee, netPay: grossPay - fee };
}

export function summarizeWorkerPaymentRows(
  rows: WorkerPaymentDetailRow[] = [],
  workersMaster: WorkerMasterLike[] = []
): WorkerPaymentSummaryRow[] {
  const masterByName = new Map(workersMaster.map((worker) => [String(worker.name || "").trim(), worker]));
  const grouped = new Map<string, { lineCount: number; headcount: number; grossPay: number; fee: number }>();

  for (const row of rows) {
    if (!row.worker) continue;
    const current = grouped.get(row.worker) || { lineCount: 0, headcount: 0, grossPay: 0, fee: 0 };
    current.lineCount += 1;
    current.headcount += row.quantity || 0;
    current.grossPay += row.totalPay || 0;
    current.fee += row.fee || 0;
    grouped.set(row.worker, current);
  }

  const names = new Set([
    ...workersMaster.map((worker) => String(worker.name || "").trim()).filter(Boolean),
    ...grouped.keys(),
  ]);

  return [...names]
    .map((name) => {
      const master = masterByName.get(name) || {};
      const totals = grouped.get(name) || { lineCount: 0, headcount: 0, grossPay: 0, fee: 0 };
      const feeRate = master.feeRate ?? 0;
      const grossPay = totals.grossPay;
      const fee = totals.grossPay > 0 ? Math.round(grossPay * feeRate) : totals.fee;
      const netPay = grossPay - fee;

      return {
        workerId: master.id,
        name,
        phone: master.phone,
        bank: master.bank,
        account: master.account,
        feeRate,
        lineCount: totals.lineCount,
        headcount: totals.headcount,
        grossPay,
        fee,
        netPay,
      };
    })
    .sort((a, b) => b.grossPay - a.grossPay || a.name.localeCompare(b.name, "ko"));
}

export function summarizeWorkerPaymentDetailTotals(rows: WorkerPaymentDetailRow[] = []) {
  return rows.reduce(
    (acc, row) => {
      acc.lineCount += 1;
      acc.headcount += row.quantity || 0;
      acc.basePay += row.basePay || 0;
      acc.meal += row.meal || 0;
      acc.lodging += row.lodging || 0;
      acc.expense += row.expense || 0;
      acc.overtime += row.overtime || 0;
      acc.grossPay += row.totalPay || 0;
      acc.fee += row.fee || 0;
      acc.netPay += row.netPay || 0;
      return acc;
    },
    {
      lineCount: 0,
      headcount: 0,
      basePay: 0,
      meal: 0,
      lodging: 0,
      expense: 0,
      overtime: 0,
      grossPay: 0,
      fee: 0,
      netPay: 0,
    }
  );
}

export function downloadWorkerPaymentExcel(rows: WorkerPaymentDetailRow[], filenamePrefix = "시공자지급") {
  const header = ["일자", "전표", "거래처", "현장", "시공자", "인원", "지급단가", "시공비", "식대", "숙박", "경비", "야근", "지급합계", "수수료", "실지급", "비고"];
  const dataRows = rows.map((row) => [
    row.date,
    row.voucherNo,
    row.client,
    row.site,
    row.worker,
    row.quantity,
    row.unitCost,
    row.basePay,
    row.meal || "",
    row.lodging || "",
    row.expense || "",
    row.overtime || "",
    row.totalPay,
    row.fee,
    row.netPay,
    row.memo,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  worksheet["!cols"] = [
    { wch: 11 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 5 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "시공자지급");
  XLSX.writeFile(workbook, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
