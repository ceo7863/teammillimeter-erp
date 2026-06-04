import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkerPortalStatementScaler } from "@/components/WorkerPortalStatementScaler";
import { WorkerStatementSheet } from "@/components/WorkerStatementSheet";
import { DEFAULT_COMPANY_PROFILE, normalizeCompanyProfile } from "@/utils/companyProfile";
import { dedupeStatementRowMemos } from "@/utils/statementSheets";
import {
  clearWorkerPortalSession,
  fetchWorkerPortalMonths,
  fetchWorkerPortalStatement,
  getWorkerPortalWorkerName,
} from "@/utils/workerPortalApi";
import {
  currentStatementMonthKey,
  formatMonthLabel,
  shiftMonthKey,
} from "@/utils/workerMonthlyPayments";
import {
  buildWorkerStatementSummary,
  sortWorkerPaymentRowsByDateDesc,
  type WorkerPaymentDetailRow,
} from "@/utils/workerPayments";

function getMonthEndISO(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]), 0);
  return `${monthKey}-${String(date.getDate()).padStart(2, "0")}`;
}

const PORTAL_MONTH_MIN = "2020-01";

function isValidMonthKey(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function resolvePortalMonthKey(preferred: string, monthsWithData: string[]) {
  const current = currentStatementMonthKey();
  if (isValidMonthKey(preferred) && preferred <= current) return preferred;
  if (monthsWithData.includes(current)) return current;
  return monthsWithData[0] || current;
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

type WorkerPortalViewProps = {
  onLogout: () => void;
};

export function WorkerPortalView({ onLogout }: WorkerPortalViewProps) {
  const workerName = getWorkerPortalWorkerName();
  const [months, setMonths] = useState<string[]>([]);
  const [monthKey, setMonthKey] = useState(currentStatementMonthKey);
  const [rows, setRows] = useState<WorkerPaymentDetailRow[]>([]);
  const [workerInfo, setWorkerInfo] = useState({});
  const [companyProfile, setCompanyProfile] = useState(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [statementLoading, setStatementLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMonths = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchWorkerPortalMonths();
      const list = result.months || [];
      setMonths(list);
      setMonthKey((prev) => resolvePortalMonthKey(prev, list));
    } catch (err) {
      setError(err instanceof Error ? err.message : "\uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMonths();
  }, [loadMonths]);

  useEffect(() => {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return;
    let cancelled = false;
    setStatementLoading(true);
    setError("");
    void fetchWorkerPortalStatement(monthKey)
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.rows || []);
        setWorkerInfo(payload.workerInfo || {});
        setCompanyProfile(
          payload.companyProfile ? normalizeCompanyProfile(payload.companyProfile) : DEFAULT_COMPANY_PROFILE,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "\uB0B4\uC5ED\uC11C\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      })
      .finally(() => {
        if (!cancelled) setStatementLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  const displayRows = useMemo(
    () => sortWorkerPaymentRowsByDateDesc(dedupeStatementRowMemos(rows)),
    [rows],
  );
  const summary = useMemo(() => buildWorkerStatementSummary(rows, workerInfo), [rows, workerInfo]);
  const totals = useMemo(() => buildStatementTotals(rows), [rows]);
  const periodStart = monthKey ? `${monthKey}-01` : "";
  const periodEnd = monthKey ? getMonthEndISO(monthKey) : "";

  const handleLogout = () => {
    clearWorkerPortalSession();
    onLogout();
  };

  const currentMonth = currentStatementMonthKey();
  const canShiftPrev =
    isValidMonthKey(monthKey) && shiftMonthKey(monthKey, -1) >= PORTAL_MONTH_MIN;
  const canShiftNext =
    isValidMonthKey(monthKey) && shiftMonthKey(monthKey, 1) <= currentMonth;

  return (
    <div className="erp-login-page erp-worker-portal-page min-h-screen p-4 text-white sm:p-6" lang="ko">
      <div className="erp-login-page__glow" aria-hidden="true" />
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <Card className="erp-worker-portal-card rounded-3xl border-0 bg-white text-slate-900 shadow-2xl">
          <CardContent className="erp-worker-portal-card-body p-6 sm:p-8">
            <div className="erp-worker-portal-card-head mb-6 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="erp-text-section font-black">{"\uC2DC\uACF5\uB0B4\uC5ED\uC11C"}</h2>
                <p className="erp-text-body mt-1 text-slate-500">
                  {workerName ? `${workerName} \uB2D8\uC758 \uC6D4\uBCC4 \uC2DC\uACF5 \uB0B4\uC5ED` : ""}
                </p>
              </div>
              <Button variant="outline" className="rounded-2xl" onClick={handleLogout}>
                <LogOut size={16} className="mr-2" />
                {"\uB85C\uADF8\uC544\uC6C3"}
              </Button>
            </div>

            {loading ? (
              <p className="erp-text-body text-slate-500">{"\uBD88\uB7EC\uC624\uB294 \uC911\u2026"}</p>
            ) : (
              <>
                <div className="erp-worker-portal-month-nav mb-6 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    className="erp-worker-month-nav-btn"
                    disabled={!monthKey || !canShiftPrev}
                    onClick={() => setMonthKey((prev) => shiftMonthKey(prev, -1))}
                    aria-label={"\uC774\uC804 \uB2ec"}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="erp-worker-month-nav-label min-w-[8rem] text-center">
                    {monthKey ? formatMonthLabel(monthKey) : "-"}
                  </div>
                  <button
                    type="button"
                    className="erp-worker-month-nav-btn"
                    disabled={!monthKey || !canShiftNext}
                    onClick={() => setMonthKey((prev) => shiftMonthKey(prev, 1))}
                    aria-label={"\uB2E4\uC74C \uB2ec"}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {months.length === 0 && !statementLoading ? (
                  <p className="erp-text-body rounded-2xl bg-slate-50 px-4 py-6 text-center text-slate-600">
                    {"\uD45C\uC2DC\uD560 \uC2DC\uACF5 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                  </p>
                ) : null}

                {error ? (
                  <div className="erp-text-body mb-4 rounded-2xl bg-red-50 px-4 py-3 font-semibold text-red-600">
                    {error}
                  </div>
                ) : null}

                {statementLoading ? (
                  <p className="erp-text-body text-slate-500">{"\uB0B4\uC5ED\uC11C \uBD88\uB7EC\uC624\uB294 \uC911\u2026"}</p>
                ) : monthKey ? (
                  <div className="erp-worker-portal-statement-shell rounded-2xl border bg-white p-2 shadow-inner">
                    <WorkerPortalStatementScaler>
                      <WorkerStatementSheet
                        workerName={workerName || String(workerInfo.name || "")}
                        workerInfo={workerInfo}
                        companyProfile={companyProfile}
                        periodStart={periodStart}
                        periodEnd={periodEnd}
                        summary={summary}
                        rows={displayRows}
                        totals={totals}
                        emptyMessage={"\uD45C\uC2DC\uD560 \uC2DC\uACF5 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                        className="mx-auto"
                      />
                    </WorkerPortalStatementScaler>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
