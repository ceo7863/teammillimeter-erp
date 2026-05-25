import React, { useMemo } from "react";
import { StatementFillerRows } from "@/components/StatementFillerRows";
import { StatementFitCell, StatementFitTd } from "@/components/StatementFitCell";
import { StatementSheetFooter, StatementSheetHeader } from "@/components/StatementBrand";
import {
  type ClientMasterLike,
  type ClientStatementDisplayRow,
  type ClientStatementSummary,
  countClientStatementBodyRows,
  groupClientStatementDisplayRows,
  isClientStatementWorkerDetailRow,
} from "@/utils/statementSheets";
import { DEFAULT_COMPANY_PROFILE, resolveStatementBankAccount, type CompanyProfile } from "@/utils/companyProfile";
import { getStatementFillerRowCount } from "@/utils/statementSheetLayout";
import { buildClientStatementExcelPayload, serializeStatementExcelPayload } from "@/utils/statementExcel";
import { formatKRW, formatStatementDashAmount, formatStatementDate } from "@/utils/workerPayments";

type ClientStatementSheetProps = {
  clientName: string;
  clientInfo?: ClientMasterLike;
  companyProfile?: CompanyProfile;
  periodStart?: string;
  periodEnd?: string;
  summary: ClientStatementSummary;
  rows: ClientStatementDisplayRow[];
  emptyMessage?: string;
  className?: string;
};

function formatStatementCellAmount(value?: number | null) {
  if (value === undefined || value === null) return "";
  return formatStatementDashAmount(value);
}

const CLIENT_DATA_COLGROUP = (
  <colgroup>
    <col style={{ width: "8%" }} />
    <col style={{ width: "20%" }} />
    <col style={{ width: "5%" }} />
    <col style={{ width: "9%" }} />
    <col style={{ width: "9%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "17%" }} />
  </colgroup>
);

const WORKER_MERGED_COLSPAN = 9;

function renderWorkerDetailRow(row: ClientStatementDisplayRow) {
  return (
    <>
      <td className="excel-text-cell excel-site-cell excel-worker-line">
        <span className="excel-worker-prefix" aria-hidden="true">
          ↳
        </span>
        {row.site || ""}
      </td>
      <td className="num">{row.staffCount || 0}</td>
      <td className="num">{formatStatementCellAmount(row.totalConstructionCost)}</td>
      <td className="num">{formatStatementCellAmount(row.originalCost)}</td>
      <td className="num">{formatStatementDashAmount(row.overtimeCost || 0)}</td>
      <td className="num">{formatStatementDashAmount(row.lodgingCost || 0)}</td>
      <td className="num">{formatStatementDashAmount(row.mealCost || 0)}</td>
      <td className="num">{formatStatementDashAmount(row.expenseCost || 0)}</td>
      <td className="excel-memo-cell">{row.memo || ""}</td>
    </>
  );
}

export const ClientStatementSheet = React.forwardRef<HTMLDivElement, ClientStatementSheetProps>(function ClientStatementSheet(
  {
    clientName,
    clientInfo = {},
    companyProfile,
    periodStart = "",
    periodEnd = "",
    summary,
    rows,
    emptyMessage = "표시할 거래처 내역이 없습니다.",
    className = "",
  },
  ref
) {
  const hasRows = rows.length > 0;
  const visibleBodyRows = countClientStatementBodyRows(rows);
  const fillerRowCount = getStatementFillerRowCount(hasRows ? visibleBodyRows : 1);
  const clientDataColumnCount = 10;
  const rowGroups = groupClientStatementDisplayRows(rows);
  const bankAccount = resolveStatementBankAccount(companyProfile || DEFAULT_COMPANY_PROFILE, clientInfo.vat);
  const excelPayload = useMemo(
    () =>
      buildClientStatementExcelPayload({
        clientName,
        clientInfo,
        companyProfile,
        periodStart,
        periodEnd,
        summary,
        rows,
        emptyMessage,
      }),
    [clientInfo, clientName, companyProfile, emptyMessage, periodEnd, periodStart, rows, summary]
  );

  return (
    <div
      ref={ref}
      data-pdf-export-root
      data-statement-kind="client"
      data-statement-excel={serializeStatementExcelPayload(excelPayload)}
      className={`erp-statement-sheet ${className}`.trim()}
    >
      <StatementSheetHeader title="시 공 비 내 역 서" companyProfile={companyProfile} />

      <div className="excel-client-recipient">
        <span>{clientName || "거래처"}</span>
        <span className="honorific">귀하</span>
      </div>

      <table className="excel-header-table">
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "5%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "38%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="label">사업자번호</td>
            <td colSpan={3}>{clientInfo.businessNo || ""}</td>
            <td className="label">계좌정보</td>
            <td>{bankAccount}</td>
          </tr>
          <tr>
            <td className="label">담당자</td>
            <td colSpan={3}>{clientInfo.manager || ""}</td>
            <td className="label">합계</td>
            <td className="amount">{formatKRW(summary.subtotal)}</td>
          </tr>
          <tr>
            <td className="label">연락처</td>
            <td colSpan={3}>{clientInfo.phone || ""}</td>
            <td className="label">부가세</td>
            <td className="amount">{formatKRW(summary.vatAmount)}</td>
          </tr>
          <tr>
            <td className="label">시공일자</td>
            <td>{formatStatementDate(periodStart)}</td>
            <td style={{ textAlign: "center" }}>~</td>
            <td>{formatStatementDate(periodEnd)}</td>
            <td className="label">총합계</td>
            <td className="amount">{formatKRW(summary.grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="excel-data-table-shell">
        <table className="excel-data-table">
          {CLIENT_DATA_COLGROUP}
          <thead>
            <tr>
              <th>시공일</th>
              <th>현장</th>
              <th>인원</th>
              <th>총시공비</th>
              <th>원시공비</th>
              <th>야근비</th>
              <th>숙소비</th>
              <th>식사</th>
              <th>경비</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {rowGroups.map((group) => {
              const groupRowSpan = 1 + group.subs.length;
              const { site } = group;

              return (
                <React.Fragment key={site.id}>
                  <tr>
                    <td rowSpan={groupRowSpan} className="excel-date-cell excel-date-cell-rowspan">
                      {formatStatementDate(site.date || "")}
                    </td>
                    <StatementFitTd tdClassName="excel-text-cell excel-site-cell excel-site-line" align="left">
                      {site.site || ""}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="num" align="right">
                      {site.staffCount || 0}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="num" align="right">
                      {formatStatementDashAmount(site.totalConstructionCost || 0)}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="num" align="right">
                      {formatStatementCellAmount(site.originalCost)}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="num" align="right">
                      {formatStatementDashAmount(site.overtimeCost || 0)}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="num" align="right">
                      {formatStatementDashAmount(site.lodgingCost || 0)}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="num" align="right">
                      {formatStatementDashAmount(site.mealCost || 0)}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="num" align="right">
                      {formatStatementDashAmount(site.expenseCost || 0)}
                    </StatementFitTd>
                    <StatementFitTd tdClassName="excel-memo-cell" align="left">
                      {site.memo || ""}
                    </StatementFitTd>
                  </tr>
                  {group.subs.map((sub) => (
                    <tr key={sub.id} className="excel-worker-sub-row">
                      {isClientStatementWorkerDetailRow(sub) ? (
                        renderWorkerDetailRow(sub)
                      ) : (
                        <td colSpan={WORKER_MERGED_COLSPAN} className="excel-worker-merged-cell">
                          <span className="excel-worker-prefix" aria-hidden="true">
                            ↳
                          </span>
                          {sub.site || ""}
                        </td>
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {!hasRows && (
              <tr>
                <td colSpan={clientDataColumnCount} className="excel-empty-cell">
                  {emptyMessage}
                </td>
              </tr>
            )}
            <StatementFillerRows columnCount={clientDataColumnCount} rowCount={fillerRowCount} />
          </tbody>
          {hasRows && (
            <tfoot>
              <tr>
                <td colSpan={2} className="num">
                  <StatementFitCell align="right">합계</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{summary.staffCount}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatKRW(summary.totalConstructionCost)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatKRW(summary.originalCost)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(summary.overtimeCost)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(summary.lodgingCost)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(summary.mealCost)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(summary.expenseCost)}</StatementFitCell>
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <StatementSheetFooter companyProfile={companyProfile} />
    </div>
  );
});
