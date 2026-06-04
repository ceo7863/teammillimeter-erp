import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WorkerStatementModal } from "@/components/WorkerStatementModal";
import type { WorkerPortalStatementAck } from "@/utils/workerPortalAcknowledgment";
import { formatMonthLabel, shiftMonthKey } from "@/utils/workerMonthlyPayments";
import {
  formatKRW,
  monthStartISO,
  summarizeWorkerPaymentRows,
  workerStatementRowVat,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
  type WorkerPaymentSummaryRow,
} from "@/utils/workerPayments";

function SearchBox({
  query,
  setQuery,
  placeholder,
}: {
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex max-w-xl items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <Search size={18} className="text-slate-400" />
      <input
        lang="ko"
        className="erp-input w-full bg-transparent outline-none"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

type WorkerStatementTabProps = {
  allDetailRows: WorkerPaymentDetailRow[];
  workers?: WorkerMasterLike[];
  workerPortalStatementAcks?: WorkerPortalStatementAck[];
  monthKey: string;
  setMonthKey: (value: string | ((prev: string) => string)) => void;
};

export function WorkerStatementTab({
  allDetailRows,
  workers = [],
  workerPortalStatementAcks = [],
  monthKey,
  setMonthKey,
}: WorkerStatementTabProps) {
  const [listQuery, setListQuery] = useState("");
  const [modalWorker, setModalWorker] = useState<string | null>(null);

  const monthRows = useMemo(
    () => allDetailRows.filter((row) => String(row.date || "").slice(0, 7) === monthKey),
    [allDetailRows, monthKey],
  );

  const workerList = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    return summarizeWorkerPaymentRows(monthRows, workers)
      .filter((row) => row.lineCount > 0)
      .filter((row) => !query || row.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [listQuery, monthRows, workers]);

  const monthGrossPayTotal = useMemo(
    () => workerList.reduce((sum, row) => sum + row.grossPay, 0),
    [workerList],
  );

  const monthNetPayTotal = useMemo(
    () => workerList.reduce((sum, row) => sum + row.netPay, 0),
    [workerList],
  );

  const monthNetPayWithVatTotal = useMemo(
    () => workerList.reduce((sum, row) => sum + workerStatementRowVat(row.netPay).withVat, 0),
    [workerList],
  );

  const modalRows = useMemo(() => {
    if (!modalWorker) return [];
    return monthRows.filter((row) => row.worker === modalWorker);
  }, [modalWorker, monthRows]);

  const modalWorkerInfo = workers.find((row) => row.name === modalWorker) || {};

  const openStatement = (row: WorkerPaymentSummaryRow) => {
    setModalWorker(row.name);
  };

  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="erp-text-section font-black">{"\uC2DC\uACF5\uB0B4\uC5ED\uC11C / PDF"}</h2>
              <p className="mt-1 erp-text-body text-slate-500">
                {"\uC6D4\uC744 \uC120\uD0DD\uD55C \uB4A4 \uC2DC\uACF5\uC790\uBA85\uC744 \uB204\uB974\uBA74 \uB0B4\uC5ED\uC11C\uB97C \uC0DD\uC131\u00B7\uBBF8\uB9AC\uBCF4\uAE30\u00B7PDF\uB85C \uBCF4\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4."}
              </p>
            </div>
            <div className="erp-worker-month-nav">
              <button
                type="button"
                className="erp-worker-month-nav-btn"
                onClick={() => setMonthKey((prev) => shiftMonthKey(prev, -1))}
                aria-label={"\uC774\uC804 \uB2EC"}
              >
                <ChevronLeft size={16} />
              </button>
              <div className="erp-worker-month-nav-label">{formatMonthLabel(monthKey)}</div>
              <button
                type="button"
                className="erp-worker-month-nav-btn"
                onClick={() => setMonthKey((prev) => shiftMonthKey(prev, 1))}
                aria-label={"\uB2E4\uC74C \uB2EC"}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchBox query={listQuery} setQuery={setListQuery} placeholder={"\uC2DC\uACF5\uC790\uBA85 \uAC80\uC0C9"} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => setMonthKey(monthStartISO().slice(0, 7))}>
                {"\uC774\uBC88 \uB2EC"}
              </Button>
              <span className="erp-text-caption font-semibold text-slate-500">
                {workerList.length}
                {"\uBA85 \u00B7 \uD569\uACC4 "}
                {formatKRW(monthGrossPayTotal)}
                {" \u00B7 \uC2E4\uC218\uB839 "}
                {formatKRW(monthNetPayTotal)}
                {" \u00B7 \uBD80\uAC00\uC138\uD3EC\uD568 "}
                {formatKRW(monthNetPayWithVatTotal)}
              </span>
            </div>
          </div>

          <div className="erp-table-wrap">
            <table className="erp-table erp-table--lg">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">{"\uC2DC\uACF5\uC790"}</th>
                  <th className="text-right">{"\uAC74\uC218"}</th>
                  <th className="text-right">{"\uD569\uACC4"}</th>
                  <th className="text-right">{"\uC2E4\uC218\uB839"}</th>
                  <th className="text-right">{"\uBD80\uAC00\uC138\uD3EC\uD568\uAE08\uC561"}</th>
                  <th className="text-center">{"\uB0B4\uC5ED\uC11C"}</th>
                </tr>
              </thead>
              <tbody>
                {workerList.map((row) => (
                  <tr key={row.name} className="border-t hover:bg-slate-50">
                    <td className="text-left">
                      <button
                        type="button"
                        className="font-bold text-slate-900 underline-offset-2 hover:text-emerald-700 hover:underline"
                        onClick={() => openStatement(row)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="text-right">{row.lineCount}</td>
                    <td className="text-right font-semibold text-slate-900">{formatKRW(row.grossPay)}</td>
                    <td className="text-right font-semibold text-emerald-700">{formatKRW(row.netPay)}</td>
                    <td className="text-right font-semibold text-slate-800">
                      {formatKRW(workerStatementRowVat(row.netPay).withVat)}
                    </td>
                    <td className="text-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => openStatement(row)}
                      >
                        <FileText size={14} className="mr-1" />
                        {"\uC0DD\uC131"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {workerList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      {formatMonthLabel(monthKey)}
                      {"\uC5D0 \uC2DC\uACF5 \uB0B4\uC5ED\uC774 \uC788\uB294 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {modalWorker ? (
        <WorkerStatementModal
          workerName={modalWorker}
          monthKey={monthKey}
          rows={modalRows}
          workerInfo={modalWorkerInfo}
          workerPortalStatementAcks={workerPortalStatementAcks}
          onClose={() => setModalWorker(null)}
        />
      ) : null}
    </>
  );
}
