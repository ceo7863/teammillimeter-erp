import React, { useMemo, useRef } from "react";
import { WorkerStatementSheet } from "@/components/WorkerStatementSheet";
import { TableExportToolbar } from "@/components/TableExportSection";
import { findWorkerPortalAck, type WorkerPortalStatementAck } from "@/utils/workerPortalAcknowledgment";
import { dedupeStatementRowMemos } from "@/utils/statementSheets";
import { formatMonthLabel } from "@/utils/workerMonthlyPayments";
import {
  buildWorkerStatementSummary,
  sortWorkerPaymentRowsByDate,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
} from "@/utils/workerPayments";

function getMonthEndISO(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]), 0);
  return `${monthKey}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildStatementTotals(rows: WorkerPaymentDetailRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.basePay += row.basePay || 0;
      acc.overtime += row.overtime || 0;
      acc.lodging += row.lodging || 0;
      acc.meal += row.meal || 0;
      acc.expense += row.expense || 0;
      acc.totalPay += row.totalPay || 0;
      return acc;
    },
    { count: 0, basePay: 0, overtime: 0, lodging: 0, meal: 0, expense: 0, totalPay: 0 },
  );
}

export function WorkerMonthlyStatementExport({
  worker,
  monthKey,
  rows,
  workerInfo = {},
  workerPortalStatementAcks = [],
}: {
  worker: string;
  monthKey: string;
  rows: WorkerPaymentDetailRow[];
  workerInfo?: WorkerMasterLike;
  workerPortalStatementAcks?: WorkerPortalStatementAck[];
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const periodStart = `${monthKey}-01`;
  const periodEnd = getMonthEndISO(monthKey);
  const displayRows = useMemo(
    () => sortWorkerPaymentRowsByDate(dedupeStatementRowMemos(rows)),
    [rows],
  );
  const summary = useMemo(() => buildWorkerStatementSummary(rows, workerInfo), [rows, workerInfo]);
  const totals = useMemo(() => buildStatementTotals(rows), [rows]);
  const portalAckConfirmed = useMemo(
    () =>
      Boolean(
        workerInfo.id != null &&
          findWorkerPortalAck(workerPortalStatementAcks, workerInfo.id, monthKey),
      ),
    [monthKey, workerInfo.id, workerPortalStatementAcks],
  );
  const safeName = worker.replace(/[\\/:*?"<>|]/g, "_");
  const fileName = `시공내역서_시공자_${safeName}_${monthKey}`;
  const title = `${formatMonthLabel(monthKey)} ${worker} 시공내역서`;

  return (
    <div className="erp-worker-month-statement-export">
      <div className="erp-worker-month-statement-host" aria-hidden="true">
        <WorkerStatementSheet
          ref={sheetRef}
          workerName={worker}
          workerInfo={workerInfo}
          periodStart={periodStart}
          periodEnd={periodEnd}
          summary={summary}
          rows={displayRows}
          totals={totals}
          emptyMessage={"\uD45C\uC2DC\uD560 \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
          portalAckConfirmed={portalAckConfirmed}
        />
      </div>
      <TableExportToolbar
        className="erp-worker-month-statement-toolbar"
        getTable={() => sheetRef.current?.querySelector(".excel-data-table") as HTMLTableElement | null}
        getExportRoot={() => sheetRef.current}
        fileName={fileName}
        title={title}
        disabled={rows.length === 0}
        pdfArchiveMeta={{
          category: "statement-worker",
          workerName: worker,
          monthKey,
        }}
      />
    </div>
  );
}
