import React, { useMemo } from "react";
import { WorkerPortalStatementAckBadge } from "@/components/WorkerPortalStatementAckBadge";
import { WorkerStatementSignatureBlock } from "@/components/WorkerStatementSignatureBlock";
import { StatementFillerRows } from "@/components/StatementFillerRows";
import { StatementFitCell, StatementFitTd } from "@/components/StatementFitCell";
import { StatementSheetFooter, StatementSheetHeader } from "@/components/StatementBrand";
import { getStatementFillerRowCount } from "@/utils/statementSheetLayout";
import type { CompanyProfile } from "@/utils/companyProfile";
import { buildWorkerStatementExcelPayload, serializeStatementExcelPayload } from "@/utils/statementExcel";
import {
  formatKRW,
  formatStatementDashAmount,
  formatWorkerStatementBankAccount,
  formatWorkerStatementDate,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
} from "@/utils/workerPayments";

import type { WorkerStatementSummary, WorkerStatementTotals } from "@/utils/statementExcel/types";

export type { WorkerStatementSummary, WorkerStatementTotals } from "@/utils/statementExcel/types";

type WorkerStatementSheetProps = {
  workerName: string;
  workerInfo?: WorkerMasterLike;
  companyProfile?: CompanyProfile;
  periodStart?: string;
  periodEnd?: string;
  summary: WorkerStatementSummary;
  rows: WorkerPaymentDetailRow[];
  totals: WorkerStatementTotals;
  emptyMessage?: string;
  className?: string;
  /** When true, show portal confirmation badge on header table worker row (PDF export). */
  portalAckConfirmed?: boolean;
  portalSignatureDataUrl?: string;
  portalSignatureConfirmedAt?: string;
  /** Portal: embed signature pad inside the statement before save. */
  portalSignatureInteractive?: boolean;
  onPortalSignatureChange?: (dataUrl: string) => void;
  portalSignatureDisabled?: boolean;
};

const WORKER_DATA_COLGROUP = (
  <colgroup>
    <col style={{ width: "8%" }} />
    <col style={{ width: "12%" }} />
    <col style={{ width: "16%" }} />
    <col style={{ width: "5%" }} />
    <col style={{ width: "9%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "8%" }} />
    <col style={{ width: "9%" }} />
    <col style={{ width: "9%" }} />
  </colgroup>
);

export const WorkerStatementSheet = React.forwardRef<HTMLDivElement, WorkerStatementSheetProps>(function WorkerStatementSheet(
  {
    workerName,
    workerInfo = {},
    companyProfile,
    periodStart = "",
    periodEnd = "",
    summary,
    rows,
    totals,
    emptyMessage = "\uD45C\uC2DC\uD560 \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    className = "",
    portalAckConfirmed = false,
    portalSignatureDataUrl = "",
    portalSignatureConfirmedAt = "",
    portalSignatureInteractive = false,
    onPortalSignatureChange,
    portalSignatureDisabled = false,
  },
  ref
) {
  const showSignatureBlock =
    portalSignatureInteractive || Boolean(portalSignatureDataUrl) || Boolean(portalSignatureConfirmedAt);
  const hasRows = rows.length > 0;
  const bankAccount = formatWorkerStatementBankAccount(workerInfo, workerName);
  const visibleBodyRows = hasRows ? rows.length : 1;
  const fillerRowCount = Math.min(getStatementFillerRowCount(visibleBodyRows, companyProfile), 4);
  const workerDataColumnCount = 11;
  const excelPayload = useMemo(
    () =>
      buildWorkerStatementExcelPayload({
        workerName,
        workerInfo,
        companyProfile,
        periodStart,
        periodEnd,
        summary,
        rows,
        totals,
        emptyMessage,
      }),
    [companyProfile, emptyMessage, periodEnd, periodStart, rows, summary, totals, workerInfo, workerName]
  );

  return (
    <div
      ref={ref}
      data-pdf-export-root
      data-statement-kind="worker"
      data-statement-excel={serializeStatementExcelPayload(excelPayload)}
      className={`erp-statement-sheet ${className}`.trim()}
    >
      <StatementSheetHeader title="시 공 내 역 서" companyProfile={companyProfile} />

      <div className="excel-client-recipient">
        <span>{workerName || "\uC2DC\uACF5\uC790"}</span>
        <span className="honorific">{"\u00A0\uADC0\uD558"}</span>
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
            <td className="label">{"\uC2DC\uACF5\uC790"}</td>
            <td colSpan={5} className="excel-worker-name-cell">
              <span>{workerName || "\uC2DC\uACF5\uC790"}</span>
              {portalAckConfirmed ? <WorkerPortalStatementAckBadge /> : null}
            </td>
          </tr>
          <tr>
            <td className="label">연락처</td>
            <td colSpan={3}>{workerInfo.phone || "-"}</td>
            <td className="label">합계</td>
            <td className="amount">{formatKRW(summary.grossPay)}</td>
          </tr>
          <tr>
            <td className="label">계좌정보</td>
            <td colSpan={3}>{bankAccount}</td>
            <td className="label">수수료</td>
            <td className="amount">{formatKRW(summary.fee)}</td>
          </tr>
          <tr>
            <td className="label">시공기간</td>
            <td>{formatWorkerStatementDate(periodStart)}</td>
            <td style={{ textAlign: "center" }}>~</td>
            <td>{formatWorkerStatementDate(periodEnd)}</td>
            <td className="label">실수령</td>
            <td className="amount">{formatKRW(summary.netPay)}</td>
          </tr>
        </tbody>
      </table>

      <div className="excel-data-table-shell">
        <table className="excel-data-table">
          {WORKER_DATA_COLGROUP}
          <thead>
            <tr>
              <th>시공일</th>
              <th>거래처</th>
              <th>현장</th>
              <th>수량</th>
              <th>시공비</th>
              <th>야근비</th>
              <th>숙소비</th>
              <th>식사</th>
              <th>경비</th>
              <th>지급합계</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <StatementFitTd tdClassName="excel-date-cell" align="left">
                  {formatWorkerStatementDate(row.date)}
                </StatementFitTd>
                <StatementFitTd tdClassName="excel-text-cell" align="left">
                  {row.client || ""}
                </StatementFitTd>
                <StatementFitTd tdClassName="excel-text-cell excel-site-cell" align="left">
                  {row.site || ""}
                </StatementFitTd>
                <StatementFitTd tdClassName="num" align="right">
                  {row.quantity}
                </StatementFitTd>
                <StatementFitTd tdClassName="num" align="right">
                  {formatStatementDashAmount(row.basePay)}
                </StatementFitTd>
                <StatementFitTd tdClassName="num" align="right">
                  {formatStatementDashAmount(row.overtime)}
                </StatementFitTd>
                <StatementFitTd tdClassName="num" align="right">
                  {formatStatementDashAmount(row.lodging)}
                </StatementFitTd>
                <StatementFitTd tdClassName="num" align="right">
                  {formatStatementDashAmount(row.meal)}
                </StatementFitTd>
                <StatementFitTd tdClassName="num" align="right">
                  {formatStatementDashAmount(row.expense)}
                </StatementFitTd>
                <StatementFitTd tdClassName="num" align="right">
                  {formatStatementDashAmount(row.totalPay)}
                </StatementFitTd>
                <StatementFitTd tdClassName="excel-memo-cell" align="left">
                  {row.memo || ""}
                </StatementFitTd>
              </tr>
            ))}
            {!hasRows && (
              <tr>
                <td colSpan={workerDataColumnCount} className="excel-empty-cell">
                  {emptyMessage}
                </td>
              </tr>
            )}
            <StatementFillerRows columnCount={workerDataColumnCount} rowCount={fillerRowCount} />
          </tbody>
          {hasRows && (
            <tfoot>
              <tr>
                <td colSpan={3} className="num">
                  <StatementFitCell align="right">합계</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{totals.count}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(totals.basePay)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(totals.overtime)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(totals.lodging)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(totals.meal)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(totals.expense)}</StatementFitCell>
                </td>
                <td className="num">
                  <StatementFitCell align="right">{formatStatementDashAmount(totals.totalPay)}</StatementFitCell>
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showSignatureBlock ? (
        <WorkerStatementSignatureBlock
          workerName={workerName || "\uC2DC\uACF5\uC790"}
          signatureDataUrl={portalSignatureDataUrl}
          confirmedAt={portalSignatureConfirmedAt}
          interactive={portalSignatureInteractive}
          disabled={portalSignatureDisabled}
          onSignatureChange={onPortalSignatureChange}
        />
      ) : null}

      <StatementSheetFooter companyProfile={companyProfile} />
    </div>
  );
});
