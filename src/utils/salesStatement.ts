import * as XLSX from "xlsx";
import {
  calculateWorkerLineMetrics,
  parseWorkerMoney,
  resolveWorkerFeeRate,
  buildWorkerFeeMap,
} from "./workerLineMetrics";

export type SaleLike = {
  id?: number | string;
  voucherNo?: string | number;
  date?: string;
  client?: string;
  site?: string;
  worker?: string;
  workers?: WorkerLineLike[];
  amount?: number;
  paid?: number;
  basePaid?: number;
  memo?: string;
};

export type WorkerLineLike = {
  worker?: string;
  quantity?: string | number;
  unitCost?: string | number;
  chargeAmount?: string | number;
  meal?: string | number;
  lodging?: string | number;
  expense?: string | number;
  overtimeHours?: string | number;
  overtimeCost?: string | number;
  feeRate?: string | number;
  memo?: string;
  lineBill?: string | number;
  lineSpend?: string | number;
  lineMargin?: string | number;
};

export type PaymentVoucherLike = {
  salesId?: number | string;
  date?: string;
  amount?: number;
  finalAmount?: number;
};

export type SalesStatementRow = {
  rowKey: string;
  saleId: number | string;
  lineIndex: number;
  isFirstLine: boolean;
  voucherNo: string;
  date: string;
  client: string;
  site: string;
  quantity: number;
  meal: number;
  expense: number;
  overtimeHours: number;
  lodging: number;
  chargeAmount: number;
  lineBill: number;
  lineSpend: number;
  lineMargin: number;
  worker: string;
  memo: string;
  unitCost: number;
  overtimeCost: number;
  feeRate: number;
  saleAmount: number;
  paid: number;
  unpaid: number;
  paymentDate: string;
  paymentAmount: number;
};

export const SALES_SHEET_COLUMNS = [
  { key: "voucherNo", label: "NO", align: "left", sticky: true },
  { key: "date", label: "일자", align: "left", sticky: true },
  { key: "client", label: "거래처", align: "left", sticky: true },
  { key: "site", label: "현장", align: "left" },
  { key: "quantity", label: "인원", align: "right", numeric: true },
  { key: "worker", label: "시공자", align: "left" },
  { key: "chargeAmount", label: "청구단가", align: "right", numeric: true },
  { key: "lineBill", label: "청구", align: "right", numeric: true },
  { key: "lineSpend", label: "지급", align: "right", numeric: true },
  { key: "lineMargin", label: "마진", align: "right", numeric: true },
  { key: "meal", label: "식대", align: "right", numeric: true },
  { key: "expense", label: "경비", align: "right", numeric: true },
  { key: "overtimeHours", label: "야근", align: "right", numeric: true },
  { key: "lodging", label: "숙박", align: "right", numeric: true },
  { key: "memo", label: "비고", align: "left" },
  { key: "unitCost", label: "지급단가", align: "right", numeric: true },
  { key: "overtimeCost", label: "야근단가", align: "right", numeric: true },
  { key: "feeRate", label: "수수료율", align: "right", numeric: true, percent: true },
  { key: "paymentDate", label: "입금일", align: "left" },
  { key: "paymentAmount", label: "입금액", align: "right", numeric: true },
  { key: "saleAmount", label: "전표매출", align: "right", numeric: true, voucherOnly: true },
  { key: "paid", label: "반영입금", align: "right", numeric: true, voucherOnly: true },
  { key: "unpaid", label: "미수", align: "right", numeric: true, voucherOnly: true },
] as const;

type SheetColumn = (typeof SALES_SHEET_COLUMNS)[number] & {
  percent?: boolean;
  voucherOnly?: boolean;
};

export function getSaleUnpaid(row: SaleLike) {
  const paid = row.paid ?? row.basePaid ?? 0;
  return Math.max((row.amount || 0) - paid, 0);
}

function saleWorkerLines(sale: SaleLike): WorkerLineLike[] {
  if (sale.workers?.length) return sale.workers;
  if (!sale.worker) return [];
  return [{
    worker: sale.worker,
    quantity: "1",
    chargeAmount: String(sale.amount || ""),
    unitCost: String(sale.amount || ""),
  }];
}

function paymentSummaryForSale(vouchers: PaymentVoucherLike[], saleId: number | string) {
  const linked = vouchers.filter((voucher) => String(voucher.salesId) === String(saleId));
  if (!linked.length) return { paymentDate: "", paymentAmount: 0 };
  const paymentAmount = linked.reduce((sum, voucher) => sum + (voucher.finalAmount ?? voucher.amount ?? 0), 0);
  const paymentDate = linked.map((voucher) => voucher.date || "").filter(Boolean).sort().pop() || linked[0]?.date || "";
  return { paymentDate, paymentAmount };
}

export function flattenSalesToStatementRows(
  sales: SaleLike[] = [],
  workersMaster: Array<{ name?: string; feeRate?: number }> = [],
  paymentVouchers: PaymentVoucherLike[] = []
): SalesStatementRow[] {
  const feeMap = buildWorkerFeeMap(workersMaster);
  const sortedSales = [...sales].sort(
    (a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(a.id || 0) - Number(b.id || 0)
  );

  return sortedSales.flatMap((sale) => {
    const lines = saleWorkerLines(sale);
    const payment = paymentSummaryForSale(paymentVouchers, sale.id ?? "");
    const unpaid = getSaleUnpaid(sale);
    const paid = sale.paid ?? 0;

    if (!lines.length) {
      return [{
        rowKey: `${sale.id}-0`,
        saleId: sale.id ?? "",
        lineIndex: 0,
        isFirstLine: true,
        voucherNo: String(sale.voucherNo ?? sale.id ?? ""),
        date: sale.date || "",
        client: sale.client || "",
        site: sale.site || "",
        quantity: 0,
        meal: 0,
        expense: 0,
        overtimeHours: 0,
        lodging: 0,
        chargeAmount: 0,
        lineBill: sale.amount || 0,
        lineSpend: 0,
        lineMargin: 0,
        worker: sale.worker || "",
        memo: sale.memo || "",
        unitCost: 0,
        overtimeCost: 0,
        feeRate: 0,
        saleAmount: sale.amount || 0,
        paid,
        unpaid,
        paymentDate: payment.paymentDate,
        paymentAmount: payment.paymentAmount,
      }];
    }

    return lines.map((line, lineIndex) => {
      const feeRate = resolveWorkerFeeRate(line, feeMap);
      const metrics = calculateWorkerLineMetrics(line, feeRate);
      return {
        rowKey: `${sale.id}-${lineIndex}`,
        saleId: sale.id ?? "",
        lineIndex,
        isFirstLine: lineIndex === 0,
        voucherNo: String(sale.voucherNo ?? sale.id ?? ""),
        date: sale.date || "",
        client: sale.client || "",
        site: sale.site || "",
        quantity: parseWorkerMoney(line.quantity || "1") || 1,
        meal: parseWorkerMoney(line.meal),
        expense: parseWorkerMoney(line.expense),
        overtimeHours: parseWorkerMoney(line.overtimeHours),
        lodging: parseWorkerMoney(line.lodging),
        chargeAmount: parseWorkerMoney(line.chargeAmount),
        lineBill: metrics.bill,
        lineSpend: metrics.spend,
        lineMargin: metrics.margin,
        worker: String(line.worker || "").trim(),
        memo: String(line.memo || "").trim(),
        unitCost: parseWorkerMoney(line.unitCost),
        overtimeCost: parseWorkerMoney(line.overtimeCost) || 30000,
        feeRate: metrics.feeRate,
        saleAmount: sale.amount || 0,
        paid,
        unpaid,
        paymentDate: lineIndex === 0 ? payment.paymentDate : "",
        paymentAmount: lineIndex === 0 ? payment.paymentAmount : 0,
      };
    });
  });
}

function statementRowToExcelArray(row: SalesStatementRow) {
  const arr = new Array(25).fill("");
  arr[0] = row.voucherNo;
  arr[1] = row.date;
  arr[2] = row.client;
  arr[3] = row.site;
  arr[4] = row.quantity || "";
  arr[5] = row.meal || "";
  arr[6] = row.expense || "";
  arr[7] = row.overtimeHours || "";
  arr[8] = row.lodging || "";
  arr[9] = row.chargeAmount || "";
  arr[11] = row.lineBill || "";
  arr[12] = row.lineSpend || "";
  arr[13] = row.lineMargin || "";
  arr[14] = row.worker;
  arr[15] = row.memo;
  arr[20] = row.unitCost || "";
  arr[21] = row.overtimeCost || "";
  arr[22] = row.feeRate ? Math.round(row.feeRate * 100) : "";
  if (row.isFirstLine) {
    arr[23] = row.paymentDate;
    arr[24] = row.paymentAmount || "";
  }
  return arr;
}

const EXCEL_HEADER_ROW = [
  "NO", "일자", "거래처", "현장", "인원", "식대", "경비", "야근", "숙박", "청구단가", "",
  "청구", "지급", "마진", "시공자", "비고", "", "", "", "", "지급단가", "야근단가", "수수료율", "입금일", "입금액",
];

export function downloadSalesStatementExcel(rows: SalesStatementRow[], filenamePrefix = "매출내역서") {
  const titleRow = ["(주)팀밀리미터 매출내역서", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
  const dataRows = rows.map(statementRowToExcelArray);
  const worksheet = XLSX.utils.aoa_to_sheet([titleRow, EXCEL_HEADER_ROW, ...dataRows]);
  worksheet["!cols"] = [
    { wch: 8 }, { wch: 11 }, { wch: 14 }, { wch: 18 }, { wch: 5 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 8 },
    { wch: 10 }, { wch: 4 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 4 }, { wch: 4 },
    { wch: 4 }, { wch: 4 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 11 }, { wch: 10 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "매출내역서");
  XLSX.writeFile(workbook, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function formatSheetNumber(value: number, options?: { percent?: boolean }) {
  if (options?.percent) return `${Math.round(value * 100)}%`;
  if (!value) return "-";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
}

export function summarizeStatementRows(rows: SalesStatementRow[]) {
  const voucherIds = new Set(rows.filter((row) => row.isFirstLine).map((row) => String(row.saleId)));
  return {
    lineCount: rows.length,
    voucherCount: voucherIds.size,
    billTotal: rows.reduce((sum, row) => sum + row.lineBill, 0),
    spendTotal: rows.reduce((sum, row) => sum + row.lineSpend, 0),
    marginTotal: rows.reduce((sum, row) => sum + row.lineMargin, 0),
    paidTotal: rows.filter((row) => row.isFirstLine).reduce((sum, row) => sum + row.paid, 0),
    unpaidTotal: rows.filter((row) => row.isFirstLine).reduce((sum, row) => sum + row.unpaid, 0),
  };
}
