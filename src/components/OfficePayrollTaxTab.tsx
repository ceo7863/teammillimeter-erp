import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CompanyProfile } from "@/utils/companyProfile";
import { formatMonthLabel, formatPayrollKRW, type OfficePayrollSheet } from "@/utils/officePayroll";
import {
  buildOfficePayrollMonthlyTaxSummary,
  buildOfficePayrollYearlyTaxSummary,
  currentPayrollYear,
  formatPayTypeList,
} from "@/utils/officePayrollTax";
import {
  downloadOfficePayrollWithholdingMonthExcel,
  downloadOfficePayrollYearEndExcel,
  printOfficePayrollMonthlyWithholdingReceipt,
  printOfficePayrollWithholdingReceipt,
} from "@/utils/officePayrollTaxExport";

type OfficePayrollTaxTabProps = {
  sheets: OfficePayrollSheet[];
  companyProfile?: CompanyProfile;
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <div className="erp-text-caption font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

export function OfficePayrollTaxTab({ sheets, companyProfile }: OfficePayrollTaxTabProps) {
  const [mode, setMode] = useState<"monthly" | "yearly">("monthly");
  const [monthKey, setMonthKey] = useState(() => {
    const eligible = sheets
      .filter((sheet) => sheet.status === "confirmed" || sheet.status === "paid")
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    return eligible[0]?.monthKey || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).slice(0, 7);
  });
  const [year, setYear] = useState(currentPayrollYear());

  const monthSheet = useMemo(
    () => sheets.find((sheet) => sheet.monthKey === monthKey) || null,
    [sheets, monthKey],
  );
  const monthlySummary = useMemo(
    () => buildOfficePayrollMonthlyTaxSummary(monthSheet),
    [monthSheet],
  );
  const yearlySummary = useMemo(
    () => buildOfficePayrollYearlyTaxSummary(year, sheets),
    [year, sheets],
  );

  const shiftMonth = (delta: number) => {
    const [yearText, monthText] = monthKey.split("-");
    const date = new Date(Number.parseInt(yearText, 10), Number.parseInt(monthText, 10) - 1 + delta, 1);
    setMonthKey(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={mode === "monthly" ? "default" : "outline"} onClick={() => setMode("monthly")}>
          월별 원천징수
        </Button>
        <Button type="button" variant={mode === "yearly" ? "default" : "outline"} onClick={() => setMode("yearly")}>
          연말정산 보조
        </Button>
      </div>

      {mode === "monthly" ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
                  <ChevronLeft size={18} />
                </Button>
                <div className="min-w-[120px] text-center text-lg font-bold text-slate-900">
                  {formatMonthLabel(monthKey)}
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)}>
                  <ChevronRight size={18} />
                </Button>
              </div>
              {monthlySummary ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => downloadOfficePayrollWithholdingMonthExcel(monthlySummary, companyProfile)}
                >
                  <FileSpreadsheet size={16} className="mr-2" />
                  원천징수 엑셀
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {!monthSheet ? (
            <Card>
              <CardContent className="p-6 text-sm text-slate-500">
                해당 월의 급여표가 없습니다. 월별 급여에서 먼저 작성·확정해 주세요.
              </CardContent>
            </Card>
          ) : monthSheet.status === "draft" ? (
            <Card>
              <CardContent className="p-6 text-sm text-amber-700">
                {formatMonthLabel(monthKey)} 급여표가 아직 <strong>작성 중</strong>입니다. 원천징수 집계는{" "}
                <strong>확정</strong> 또는 <strong>지급완료</strong>된 급여표만 포함합니다.
              </CardContent>
            </Card>
          ) : null}

          {monthlySummary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="대상 인원" value={`${monthlySummary.totals.headcount}명`} />
                <SummaryCard label="지급합" value={formatPayrollKRW(monthlySummary.totals.grossPay)} />
                <SummaryCard
                  label="원천징수합"
                  value={formatPayrollKRW(monthlySummary.totals.withholdingTotal)}
                />
                <SummaryCard label="실지급" value={formatPayrollKRW(monthlySummary.totals.netPay)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <SummaryCard
                  label="근로소득"
                  value={`${monthlySummary.laborIncome.headcount}명 · ${formatPayrollKRW(monthlySummary.laborIncome.withholdingTotal)}`}
                />
                <SummaryCard
                  label="기타소득(3.3%)"
                  value={`${monthlySummary.otherIncome.headcount}명 · ${formatPayrollKRW(monthlySummary.otherIncome.withholdingTotal)}`}
                />
              </div>
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <table className="erp-table w-full min-w-[960px]">
                    <thead>
                      <tr>
                        <th>성명</th>
                        <th>소득구분</th>
                        <th>지급액</th>
                        <th>소득세</th>
                        <th>지방세</th>
                        <th>4대보험</th>
                        <th>실지급</th>
                        <th className="erp-table-export-skip">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummary.rows.map((row) => (
                        <tr key={row.staffId}>
                          <td>{row.staffName}</td>
                          <td>{row.incomeCategory}</td>
                          <td>{formatPayrollKRW(row.tax.grossPay)}</td>
                          <td>{formatPayrollKRW(row.tax.incomeTax)}</td>
                          <td>{formatPayrollKRW(row.tax.localTax)}</td>
                          <td>
                            {formatPayrollKRW(
                              row.tax.nationalPension +
                                row.tax.healthInsurance +
                                row.tax.longTermCare +
                                row.tax.employmentInsurance,
                            )}
                          </td>
                          <td className="font-bold">{formatPayrollKRW(row.tax.netPay)}</td>
                          <td className="erp-table-export-skip">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                printOfficePayrollMonthlyWithholdingReceipt({
                                  companyProfile,
                                  summary: monthlySummary,
                                  staffId: row.staffId,
                                })
                              }
                            >
                              <Printer size={14} className="mr-1" />
                              영수증
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setYear((prev) => String(Number(prev) - 1))}>
                  <ChevronLeft size={18} />
                </Button>
                <div className="min-w-[100px] text-center text-lg font-bold text-slate-900">{year}년</div>
                <Button type="button" variant="outline" size="icon" onClick={() => setYear((prev) => String(Number(prev) + 1))}>
                  <ChevronRight size={18} />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadOfficePayrollYearEndExcel(yearlySummary, companyProfile)}
              >
                <FileSpreadsheet size={16} className="mr-2" />
                연말정산 보조 엑셀
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="대상 인원" value={`${yearlySummary.totals.headcount}명`} />
            <SummaryCard label="집계 월" value={`${yearlySummary.totals.monthCount}개월`} />
            <SummaryCard label="연간 지급" value={formatPayrollKRW(yearlySummary.totals.grossPay)} />
            <SummaryCard label="연간 원천" value={formatPayrollKRW(yearlySummary.totals.withholdingTotal)} />
          </div>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="erp-table w-full min-w-[980px]">
                <thead>
                  <tr>
                    <th>성명</th>
                    <th>부서</th>
                    <th>유형</th>
                    <th>지급월</th>
                    <th>연간 지급</th>
                    <th>연간 소득세</th>
                    <th>연간 지방세</th>
                    <th>연간 실지급</th>
                    <th className="erp-table-export-skip">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlySummary.rows.length ? (
                    yearlySummary.rows.map((row) => (
                      <tr key={row.staffId}>
                        <td>{row.staffName}</td>
                        <td>{row.department || "-"}</td>
                        <td>{formatPayTypeList(row.payTypes)}</td>
                        <td>{row.months.length}개월</td>
                        <td>{formatPayrollKRW(row.tax.grossPay)}</td>
                        <td>{formatPayrollKRW(row.tax.incomeTax)}</td>
                        <td>{formatPayrollKRW(row.tax.localTax)}</td>
                        <td className="font-bold">{formatPayrollKRW(row.tax.netPay)}</td>
                        <td className="erp-table-export-skip">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              printOfficePayrollWithholdingReceipt({
                                companyProfile,
                                year,
                                row,
                              })
                            }
                          >
                            <Printer size={14} className="mr-1" />
                            영수증
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-sm text-slate-500">
                        {year}년 확정·지급완료 급여표가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
