import {
  DEFAULT_COMPANY_PROFILE,
  resolveStatementBankAccount,
  type CompanyProfile,
} from "@/utils/companyProfile";
import { getStatementFillerRowCount } from "@/utils/statementSheetLayout";
import {
  countClientStatementBodyRows,
  groupClientStatementDisplayRows,
  isClientStatementWorkerDetailRow,
  type ClientMasterLike,
  type ClientStatementDisplayRow,
  type ClientStatementSummary,
} from "@/utils/statementSheets";
import { formatKRW, formatStatementDashAmount, formatStatementDate } from "@/utils/workerPayments";
import type {
  ClientStatementExcelBodyRow,
  ClientStatementExcelPayload,
  StatementExcelCompany,
  WorkerStatementExcelBodyRow,
  WorkerStatementExcelPayload,
  WorkerStatementSummary,
  WorkerStatementTotals,
} from "./types";
import type { WorkerMasterLike, WorkerPaymentDetailRow } from "@/utils/workerPayments";

const CLIENT_DATA_COLUMNS = ["시공일", "현장", "인원", "총시공비", "원시공비", "야근비", "숙소비", "식사", "경비", "비고"];
const WORKER_DATA_COLUMNS = ["시공일", "거래처", "현장", "수량", "시공비", "야근비", "숙소비", "식사", "경비", "지급합계", "비고"];

function formatStatementCellAmount(value?: number | null) {
  if (value === undefined || value === null) return "";
  return formatStatementDashAmount(value);
}

function buildCompanyExcelInfo(companyProfile?: CompanyProfile): StatementExcelCompany {
  const profile = companyProfile || DEFAULT_COMPANY_PROFILE;

  const headerLines = [
    profile.businessNo ? `사업자번호 ${profile.businessNo}` : "",
    profile.phone ? `Tel ${profile.phone}` : "",
    profile.fax ? `Fax ${profile.fax}` : "",
    profile.address || "",
  ].filter(Boolean);

  return {
    name: profile.name || DEFAULT_COMPANY_PROFILE.name,
    headerLines,
    headerLinks: [],
    footerLines: [profile.name || DEFAULT_COMPANY_PROFILE.name],
    footerLinks: [],
  };
}

function buildClientBodyRows(rows: ClientStatementDisplayRow[], emptyMessage: string, hasRows: boolean): ClientStatementExcelBodyRow[] {
  if (!hasRows) {
    return [{ type: "empty", message: emptyMessage }];
  }

  const bodyRows: ClientStatementExcelBodyRow[] = [];
  const groups = groupClientStatementDisplayRows(rows);

  groups.forEach((group) => {
    const { site } = group;
    bodyRows.push({
      type: "site",
      date: formatStatementDate(site.date || ""),
      site: site.site || "",
      staffCount: site.staffCount || 0,
      totalConstructionCost: formatStatementDashAmount(site.totalConstructionCost || 0),
      originalCost: formatStatementCellAmount(site.originalCost),
      overtimeCost: formatStatementDashAmount(site.overtimeCost || 0),
      lodgingCost: formatStatementDashAmount(site.lodgingCost || 0),
      mealCost: formatStatementDashAmount(site.mealCost || 0),
      expenseCost: formatStatementDashAmount(site.expenseCost || 0),
      memo: site.memo || "",
      rowSpan: 1 + group.subs.length,
    });

    group.subs.forEach((sub) => {
      if (isClientStatementWorkerDetailRow(sub)) {
        bodyRows.push({
          type: "worker-detail",
          site: sub.site || "",
          staffCount: sub.staffCount || 0,
          totalConstructionCost: formatStatementCellAmount(sub.totalConstructionCost),
          originalCost: formatStatementCellAmount(sub.originalCost),
          overtimeCost: formatStatementDashAmount(sub.overtimeCost || 0),
          lodgingCost: formatStatementDashAmount(sub.lodgingCost || 0),
          mealCost: formatStatementDashAmount(sub.mealCost || 0),
          expenseCost: formatStatementDashAmount(sub.expenseCost || 0),
          memo: sub.memo || "",
        });
        return;
      }

      bodyRows.push({
        type: "worker-merged",
        text: sub.site || "",
      });
    });
  });

  return bodyRows;
}

export function buildClientStatementExcelPayload(input: {
  clientName: string;
  clientInfo?: ClientMasterLike;
  companyProfile?: CompanyProfile;
  periodStart?: string;
  periodEnd?: string;
  summary: ClientStatementSummary;
  rows: ClientStatementDisplayRow[];
  emptyMessage?: string;
}): ClientStatementExcelPayload {
  const hasRows = input.rows.length > 0;
  const visibleBodyRows = countClientStatementBodyRows(input.rows);
  const clientInfo = input.clientInfo || {};
  const bankAccount = resolveStatementBankAccount(input.companyProfile || DEFAULT_COMPANY_PROFILE, clientInfo.vat);

  return {
    kind: "client",
    title: "시 공 비 내 역 서",
    recipientName: input.clientName || "거래처",
    company: buildCompanyExcelInfo(input.companyProfile),
    meta: {
      businessNo: clientInfo.businessNo || "",
      manager: clientInfo.manager || "",
      phone: clientInfo.phone || "",
      bankAccount,
      periodStart: formatStatementDate(input.periodStart || ""),
      periodEnd: formatStatementDate(input.periodEnd || ""),
      subtotal: formatKRW(input.summary.subtotal),
      vatAmount: formatKRW(input.summary.vatAmount),
      grandTotal: formatKRW(input.summary.grandTotal),
    },
    dataColumns: CLIENT_DATA_COLUMNS,
    bodyRows: buildClientBodyRows(input.rows, input.emptyMessage || "표시할 거래처 내역이 없습니다.", hasRows),
    totalsRow: hasRows
      ? [
          "합계",
          "",
          String(input.summary.staffCount),
          formatKRW(input.summary.totalConstructionCost),
          formatKRW(input.summary.originalCost),
          formatStatementDashAmount(input.summary.overtimeCost),
          formatStatementDashAmount(input.summary.lodgingCost),
          formatStatementDashAmount(input.summary.mealCost),
          formatStatementDashAmount(input.summary.expenseCost),
          "",
        ]
      : null,
    fillerRowCount: getStatementFillerRowCount(hasRows ? visibleBodyRows : 1, input.companyProfile),
    emptyMessage: input.emptyMessage || "표시할 거래처 내역이 없습니다.",
  };
}

export function buildWorkerStatementExcelPayload(input: {
  workerName: string;
  workerInfo?: WorkerMasterLike;
  companyProfile?: CompanyProfile;
  periodStart?: string;
  periodEnd?: string;
  summary: WorkerStatementSummary;
  rows: WorkerPaymentDetailRow[];
  totals: WorkerStatementTotals;
  emptyMessage?: string;
}): WorkerStatementExcelPayload {
  const hasRows = input.rows.length > 0;
  const workerInfo = input.workerInfo || {};
  const bodyRows: WorkerStatementExcelBodyRow[] = hasRows
    ? input.rows.map((row) => ({
        type: "data",
        date: formatStatementDate(row.date),
        client: row.client || "",
        site: row.site || "",
        quantity: row.quantity,
        basePay: formatStatementDashAmount(row.basePay),
        overtime: formatStatementDashAmount(row.overtime),
        lodging: formatStatementDashAmount(row.lodging),
        meal: formatStatementDashAmount(row.meal),
        expense: formatStatementDashAmount(row.expense),
        totalPay: formatStatementDashAmount(row.totalPay),
        memo: row.memo || "",
      }))
    : [{ type: "empty", message: input.emptyMessage || "표시할 시공자 내역이 없습니다." }];

  return {
    kind: "worker",
    title: "시 공 내 역 서",
    recipientName: input.workerName || "시공자",
    company: buildCompanyExcelInfo(input.companyProfile),
    meta: {
      phone: workerInfo.phone || "",
      bankAccount: [workerInfo.bank, workerInfo.account].filter(Boolean).join(" "),
      periodStart: formatStatementDate(input.periodStart || ""),
      periodEnd: formatStatementDate(input.periodEnd || ""),
      grossPay: formatKRW(input.summary.grossPay),
      fee: formatKRW(input.summary.fee),
      netPay: formatKRW(input.summary.netPay),
    },
    dataColumns: WORKER_DATA_COLUMNS,
    bodyRows,
    totalsRow: hasRows
      ? [
          "합계",
          "",
          "",
          String(input.totals.count),
          formatKRW(input.totals.basePay),
          formatStatementDashAmount(input.totals.overtime),
          formatStatementDashAmount(input.totals.lodging),
          formatStatementDashAmount(input.totals.meal),
          formatStatementDashAmount(input.totals.expense),
          formatKRW(input.totals.totalPay),
          "",
        ]
      : null,
    fillerRowCount: getStatementFillerRowCount(hasRows ? input.rows.length : 1, input.companyProfile),
    emptyMessage: input.emptyMessage || "표시할 시공자 내역이 없습니다.",
  };
}

export function parseStatementExcelPayload(root: HTMLElement): import("./types").StatementExcelPayload | null {
  const raw = root.dataset.statementExcel;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as import("./types").StatementExcelPayload;
  } catch {
    return null;
  }
}
