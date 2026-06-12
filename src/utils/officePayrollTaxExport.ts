import * as XLSX from "xlsx";
import type { CompanyProfile } from "@/utils/companyProfile";
import { formatMonthLabel, formatPayrollKRW } from "@/utils/officePayroll";
import {
  formatPayTypeList,
  type OfficePayrollMonthlyTaxSummary,
  type OfficePayrollYearlyStaffRow,
  type OfficePayrollYearlyTaxSummary,
} from "@/utils/officePayrollTax";
import { safeExportFileName, printHtmlDocument } from "@/utils/tableExport";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadOfficePayrollWithholdingMonthExcel(
  summary: OfficePayrollMonthlyTaxSummary,
  companyProfile?: CompanyProfile,
) {
  const companyName = companyProfile?.name || "회사";
  const header = [
    "귀속월",
    "성명",
    "부서",
    "소득구분",
    "급여유형",
    "지급액",
    "소득세",
    "지방세",
    "원천합계",
    "국민연금",
    "건강보험",
    "장기요양",
    "고용보험",
    "기타공제",
    "실지급",
  ];
  const rows = summary.rows.map((row) => [
    summary.monthKey,
    row.staffName,
    row.department || "",
    row.incomeCategory,
    row.payType === "daily_33" ? "일당(3.3%)" : "월급",
    row.tax.grossPay,
    row.tax.incomeTax,
    row.tax.localTax,
    row.tax.withholdingTotal,
    row.tax.nationalPension,
    row.tax.healthInsurance,
    row.tax.longTermCare,
    row.tax.employmentInsurance,
    row.tax.otherDeductions,
    row.tax.netPay,
  ]);
  const totals = summary.totals;
  rows.push([
    "합계",
    `${summary.totals.headcount}명`,
    "",
    "",
    "",
    totals.grossPay,
    totals.incomeTax,
    totals.localTax,
    totals.withholdingTotal,
    totals.nationalPension,
    totals.healthInsurance,
    totals.longTermCare,
    totals.employmentInsurance,
    totals.otherDeductions,
    totals.netPay,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "원천징수");
  const filing = [
    ["원천징수 이행상황 보조자료", ""],
    ["회사명", companyName],
    ["사업자번호", companyProfile?.businessNo || ""],
    ["귀속월", summary.monthKey],
    ["", ""],
    ["구분", "인원", "지급액", "소득세", "지방세", "원천합계"],
    [
      "근로소득",
      summary.laborIncome.headcount,
      summary.laborIncome.grossPay,
      summary.laborIncome.incomeTax,
      summary.laborIncome.localTax,
      summary.laborIncome.withholdingTotal,
    ],
    [
      "기타소득(3.3%)",
      summary.otherIncome.headcount,
      summary.otherIncome.grossPay,
      summary.otherIncome.incomeTax,
      summary.otherIncome.localTax,
      summary.otherIncome.withholdingTotal,
    ],
    [
      "합계",
      summary.totals.headcount,
      summary.totals.grossPay,
      summary.totals.incomeTax,
      summary.totals.localTax,
      summary.totals.withholdingTotal,
    ],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(filing), "신고집계");
  XLSX.writeFile(
    workbook,
    `${safeExportFileName(`${companyName}_${summary.monthKey}_원천징수`)}.xlsx`,
  );
}

export function downloadOfficePayrollYearEndExcel(
  summary: OfficePayrollYearlyTaxSummary,
  companyProfile?: CompanyProfile,
) {
  const companyName = companyProfile?.name || "회사";
  const header = [
    "성명",
    "부서",
    "급여유형",
    "지급월수",
    "연간지급액",
    "연간소득세",
    "연간지방세",
    "연간원천합계",
    "국민연금",
    "건강보험",
    "장기요양",
    "고용보험",
    "연간실지급",
  ];
  const rows = summary.rows.map((row) => [
    row.staffName,
    row.department || "",
    formatPayTypeList(row.payTypes),
    row.months.length,
    row.tax.grossPay,
    row.tax.incomeTax,
    row.tax.localTax,
    row.tax.withholdingTotal,
    row.tax.nationalPension,
    row.tax.healthInsurance,
    row.tax.longTermCare,
    row.tax.employmentInsurance,
    row.tax.netPay,
  ]);
  const totals = summary.totals;
  rows.push([
    "합계",
    `${totals.headcount}명`,
    "",
    totals.monthCount,
    totals.grossPay,
    totals.incomeTax,
    totals.localTax,
    totals.withholdingTotal,
    totals.nationalPension,
    totals.healthInsurance,
    totals.longTermCare,
    totals.employmentInsurance,
    totals.netPay,
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ...rows]), "연간집계");

  const detailHeader = ["성명", "귀속월", "지급액", "소득세", "지방세", "실지급"];
  const detailRows: Array<Array<string | number>> = [];
  for (const row of summary.rows) {
    for (const month of row.monthly) {
      detailRows.push([
        row.staffName,
        month.monthKey,
        month.tax.grossPay,
        month.tax.incomeTax,
        month.tax.localTax,
        month.tax.netPay,
      ]);
    }
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]), "월별상세");

  const cover = [
    ["연말정산 보조자료", ""],
    ["회사명", companyName],
    ["사업자번호", companyProfile?.businessNo || ""],
    ["귀속연도", summary.year],
    ["확정 급여표 기준", `${summary.totals.monthCount}개월`],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cover), "표지");
  XLSX.writeFile(workbook, `${safeExportFileName(`${companyName}_${summary.year}_연말정산보조`)}.xlsx`);
}

export function printOfficePayrollWithholdingReceipt(input: {
  companyProfile?: CompanyProfile;
  year: string;
  row: OfficePayrollYearlyStaffRow;
}) {
  const { companyProfile, year, row } = input;
  const companyName = companyProfile?.name || "회사";
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(row.staffName)} ${escapeHtml(year)}년 원천징수영수증(보조)</title>
  <style>
    body { font-family: "Malgun Gothic", sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #64748b; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
    th { background: #f8fafc; text-align: left; width: 34%; }
    .num { text-align: right; }
    .note { margin-top: 16px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <h1>원천징수영수증 (ERP 보조 출력)</h1>
  <div class="sub">${escapeHtml(companyName)} · ${escapeHtml(year)}년 · ${escapeHtml(row.staffName)}</div>
  <table>
    <tr><th>사업자등록번호</th><td>${escapeHtml(companyProfile?.businessNo || "-")}</td></tr>
    <tr><th>대표자</th><td>${escapeHtml(companyProfile?.ceoName || "-")}</td></tr>
    <tr><th>부서</th><td>${escapeHtml(row.department || "-")}</td></tr>
    <tr><th>급여 유형</th><td>${escapeHtml(formatPayTypeList(row.payTypes))}</td></tr>
    <tr><th>지급월수</th><td>${row.months.length}개월</td></tr>
    <tr><th>연간 지급액</th><td class="num">${formatPayrollKRW(row.tax.grossPay)}</td></tr>
    <tr><th>연간 소득세</th><td class="num">${formatPayrollKRW(row.tax.incomeTax)}</td></tr>
    <tr><th>연간 지방세</th><td class="num">${formatPayrollKRW(row.tax.localTax)}</td></tr>
    <tr><th>4대보험 공제합</th><td class="num">${formatPayrollKRW(
      row.tax.nationalPension +
        row.tax.healthInsurance +
        row.tax.longTermCare +
        row.tax.employmentInsurance,
    )}</td></tr>
    <tr><th>연간 실지급</th><td class="num">${formatPayrollKRW(row.tax.netPay)}</td></tr>
  </table>
  <table>
    <thead>
      <tr><th>귀속월</th><th>지급액</th><th>소득세</th><th>지방세</th><th>실지급</th></tr>
    </thead>
    <tbody>
      ${row.monthly
        .map(
          (month) =>
            `<tr><td>${escapeHtml(formatMonthLabel(month.monthKey))}</td><td class="num">${formatPayrollKRW(month.tax.grossPay)}</td><td class="num">${formatPayrollKRW(month.tax.incomeTax)}</td><td class="num">${formatPayrollKRW(month.tax.localTax)}</td><td class="num">${formatPayrollKRW(month.tax.netPay)}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <p class="note">본 문서는 ERP 급여 데이터를 바탕으로 한 연말정산·원천징수 보조 자료입니다. 국세청 제출용 서식과 다를 수 있습니다.</p>
</body>
</html>`;

  printHtmlDocument(html);
}

export function printOfficePayrollMonthlyWithholdingReceipt(input: {
  companyProfile?: CompanyProfile;
  summary: OfficePayrollMonthlyTaxSummary;
  staffId: string;
}) {
  const row = input.summary.rows.find((item) => item.staffId === input.staffId);
  if (!row) {
    window.alert("해당 직원의 원천징수 데이터가 없습니다.");
    return;
  }
  const companyName = input.companyProfile?.name || "회사";
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(row.staffName)} ${escapeHtml(formatMonthLabel(input.summary.monthKey))} 원천징수</title>
  <style>
    body { font-family: "Malgun Gothic", sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .sub { color: #64748b; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
    th { background: #f8fafc; text-align: left; width: 34%; }
    .num { text-align: right; }
    .note { margin-top: 16px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <h1>원천징수영수증 (월별 보조)</h1>
  <div class="sub">${escapeHtml(companyName)} · ${escapeHtml(formatMonthLabel(input.summary.monthKey))}</div>
  <table>
    <tr><th>성명</th><td>${escapeHtml(row.staffName)}</td></tr>
    <tr><th>소득구분</th><td>${escapeHtml(row.incomeCategory)}</td></tr>
    <tr><th>지급액</th><td class="num">${formatPayrollKRW(row.tax.grossPay)}</td></tr>
    <tr><th>소득세</th><td class="num">${formatPayrollKRW(row.tax.incomeTax)}</td></tr>
    <tr><th>지방세</th><td class="num">${formatPayrollKRW(row.tax.localTax)}</td></tr>
    <tr><th>실지급</th><td class="num">${formatPayrollKRW(row.tax.netPay)}</td></tr>
  </table>
  <p class="note">확정·지급완료된 급여표 기준 보조 출력입니다.</p>
</body>
</html>`;
  printHtmlDocument(html);
}
