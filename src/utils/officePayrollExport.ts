import * as XLSX from "xlsx";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  formatMonthLabel,
  formatPayrollKRW,
  OFFICE_PAYROLL_PAY_TYPE_LABELS,
  roundPayAmount,
  sumMoneyLines,
  type OfficePayrollLine,
  type OfficePayrollSheet,
} from "@/utils/officePayroll";
import { formatAttendanceSummaryLabel } from "@/utils/officePayrollAttendance";
import { printHtmlDocument, safeExportFileName } from "@/utils/tableExport";

export function buildOfficePayrollBankTransferRows(sheet: OfficePayrollSheet) {
  return sheet.lines
    .filter((line) => !line.excluded && line.netPay > 0)
    .map((line) => ({
      name: line.staffName,
      bank: line.bank || "",
      account: String(line.account || "").replace(/\D/g, ""),
      amount: line.netPay,
      memo: `${formatMonthLabel(sheet.monthKey)} 급여`,
    }));
}

export function downloadOfficePayrollBankExcel(sheet: OfficePayrollSheet, companyName?: string) {
  const rows = buildOfficePayrollBankTransferRows(sheet);
  const header = ["입금은행", "입금계좌", "예금주", "이체금액", "받는분통장표시", "CMS코드"];
  const data = rows.map((row) => [
    row.bank,
    row.account,
    row.name,
    row.amount,
    row.memo,
    "",
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "급여이체");
  const fileName = safeExportFileName(
    `${companyName || "팀밀리미터"}_${sheet.monthKey}_급여이체`,
  );
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function buildOfficePayrollSummaryTable(sheet: OfficePayrollSheet) {
  const headers = [
    "성명",
    "부서",
    "직급",
    "유형",
    "근태",
    "기본급/일당",
    "일수",
    "지급합",
    "원천(3.3%)",
    "공제합",
    "실지급",
    "은행",
    "계좌",
  ];
  const rows = sheet.lines
    .filter((line) => !line.excluded)
    .map((line) => [
      line.staffName,
      line.department || "",
      line.position || "",
      OFFICE_PAYROLL_PAY_TYPE_LABELS[line.payType],
      formatAttendanceSummaryLabel(line.attendanceSummary),
      line.payType === "daily_33" ? String(line.dailyRate) : String(line.baseSalary),
      line.payType === "daily_33" ? String(line.dailyDays) : "-",
      String(line.grossPay),
      String(line.withholdingAmount),
      String(sumMoneyLines(line.deductions)),
      String(line.netPay),
      line.bank || "",
      line.account || "",
    ]);
  return { headers, rows };
}

export function downloadOfficePayrollSummaryExcel(sheet: OfficePayrollSheet, companyName?: string) {
  const table = buildOfficePayrollSummaryTable(sheet);
  const worksheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "급여대장");
  const fileName = safeExportFileName(`${companyName || "팀밀리미터"}_${sheet.monthKey}_급여대장`);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMoneyLines(lines: { label: string; amount: number }[]) {
  if (!lines.length) return "<tr><td colspan=\"2\" class=\"muted\">-</td></tr>";
  return lines
    .filter((line) => roundPayAmount(line.amount) !== 0)
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.label)}</td><td class="num">${formatPayrollKRW(line.amount)}</td></tr>`,
    )
    .join("") || "<tr><td colspan=\"2\" class=\"muted\">-</td></tr>";
}

export function buildOfficePayrollPayslipHtml(input: {
  sheet: OfficePayrollSheet;
  line: OfficePayrollLine;
  companyProfile?: CompanyProfile;
}) {
  const { sheet, line, companyProfile } = input;
  const companyName = companyProfile?.name || "회사";
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(line.staffName)} ${formatMonthLabel(sheet.monthKey)} 급여명세</title>
  <style>
    body { font-family: "Malgun Gothic", sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #64748b; font-size: 13px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
    th { background: #f8fafc; text-align: left; width: 38%; }
    .section-title { font-weight: 700; margin: 18px 0 8px; }
    .num { text-align: right; white-space: nowrap; }
    .net { font-size: 18px; font-weight: 700; color: #0f172a; }
    .muted { color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <h1>급여명세서</h1>
  <div class="sub">${escapeHtml(companyName)} · ${escapeHtml(formatMonthLabel(sheet.monthKey))} · 지급일 ${escapeHtml(sheet.payDate || "-")}</div>
  <table>
    <tr><th>성명</th><td>${escapeHtml(line.staffName)}</td></tr>
    <tr><th>부서 / 직급</th><td>${escapeHtml([line.department, line.position].filter(Boolean).join(" / ") || "-")}</td></tr>
    <tr><th>급여 유형</th><td>${escapeHtml(OFFICE_PAYROLL_PAY_TYPE_LABELS[line.payType])}</td></tr>
    <tr><th>근태</th><td>${escapeHtml(line.attendanceSummary ? formatAttendanceSummaryLabel(line.attendanceSummary) : "-")}</td></tr>
    <tr><th>은행 / 계좌</th><td>${escapeHtml([line.bank, line.account].filter(Boolean).join(" ") || "-")}</td></tr>
  </table>
  <div class="grid">
    <div>
      <div class="section-title">지급</div>
      <table>
        ${line.payType === "daily_33"
          ? `<tr><th>일당</th><td class="num">${formatPayrollKRW(line.dailyRate)}</td></tr>
             <tr><th>일수</th><td class="num">${line.dailyDays}일</td></tr>`
          : `<tr><th>기본급</th><td class="num">${formatPayrollKRW(line.baseSalary)}</td></tr>`}
        ${renderMoneyLines(line.allowances.map((row) => ({ label: `수당 · ${row.label}`, amount: row.amount })))}
        <tr><th>지급합</th><td class="num">${formatPayrollKRW(line.grossPay)}</td></tr>
      </table>
    </div>
    <div>
      <div class="section-title">공제</div>
      <table>
        ${line.withholdingAmount > 0 ? `<tr><th>원천징수(3.3%)</th><td class="num">${formatPayrollKRW(line.withholdingAmount)}</td></tr>` : ""}
        ${renderMoneyLines(line.deductions)}
        <tr><th>공제합</th><td class="num">${formatPayrollKRW(line.withholdingAmount + sumMoneyLines(line.deductions))}</td></tr>
      </table>
    </div>
  </div>
  <div class="section-title">실지급액</div>
  <div class="net">${formatPayrollKRW(line.netPay)}</div>
  ${line.memo ? `<p style="margin-top:16px;font-size:12px;color:#64748b;">비고: ${escapeHtml(line.memo)}</p>` : ""}
</body>
</html>`;
}

export function printOfficePayrollPayslip(input: {
  sheet: OfficePayrollSheet;
  line: OfficePayrollLine;
  companyProfile?: CompanyProfile;
}) {
  printHtmlDocument(buildOfficePayrollPayslipHtml(input));
}

export function printOfficePayrollAllPayslips(input: {
  sheet: OfficePayrollSheet;
  companyProfile?: CompanyProfile;
}) {
  const lines = input.sheet.lines.filter((line) => !line.excluded && line.netPay > 0);
  if (!lines.length) {
    window.alert("출력할 급여 명세가 없습니다.");
    return;
  }
  const body = lines
    .map(
      (line) =>
        `<section style="page-break-after: always;">${buildOfficePayrollPayslipHtml({ sheet: input.sheet, line, companyProfile: input.companyProfile }).replace(/^[\s\S]*<body>/, "").replace(/<\/body>[\s\S]*$/, "")}</section>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8" /><title>급여명세 일괄출력</title></head><body>${body}</body></html>`;
  printHtmlDocument(html);
}
