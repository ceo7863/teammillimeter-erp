import React from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatScScheduleHeadcount,
  formatScScheduleWorkLogSummary,
  getScScheduleWorkerDetails,
  type ScSchedule,
} from "@/utils/scSchedules";
import {
  isScScheduleRegistered,
  resolveScScheduleSiteName,
} from "@/utils/scScheduleSaleImport";
import type { WorkerMasterLike } from "@/utils/workerPayments";

const L = {
  title: "CalWalk \uC2A4\uCF00\uC904 \uAC00\uc838\uc624\uae30",
  empty: "\uC774 \uB0A0\uC9D0 CalWalk \uD655\uC815 \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  loading: "CalWalk\uC5D0\uC11C \uCD5C\uC2E0 \uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.",
  refreshed: "\uCD5C\uC2E0 \uD655\uC778",
  registered: "\uB4F1\uB85D\uB428",
  alreadyRegistered: "\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC2A4\uCF00\uC904\uC785\uB2C8\uB2E4.",
  close: "\uB2EB\uAE30",
  scBadge: "\uD655\uC815",
  workLog: "\uADFC\uBB34\uAE30\uB85D",
  workers: (names: string) => names || "-",
};

type CalendarScScheduleImportModalProps = {
  open: boolean;
  dateLabel: string;
  schedules: ScSchedule[];
  sales: Array<{ scScheduleId?: string | number | null }>;
  workers?: WorkerMasterLike[];
  loading?: boolean;
  error?: string;
  warning?: string;
  refreshedAt?: string;
  onClose: () => void;
  onSelect: (schedule: ScSchedule) => void;
};

export function CalendarScScheduleImportModal({
  open,
  dateLabel,
  schedules,
  sales,
  workers = [],
  loading = false,
  error = "",
  warning = "",
  refreshedAt = "",
  onClose,
  onSelect,
}: CalendarScScheduleImportModalProps) {
  if (!open) return null;

  const handleSelect = (schedule: ScSchedule) => {
    const scheduleId = String(schedule.id || "").trim();
    if (scheduleId && isScScheduleRegistered(sales, scheduleId)) {
      window.alert(L.alreadyRegistered);
      return;
    }
    onSelect(schedule);
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-calendar-sc-import-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-sc-import-title"
      >
        <div className="erp-calendar-sc-import-head">
          <div>
            <h2 id="calendar-sc-import-title" className="text-base font-bold text-slate-900 md:text-lg">
              {L.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {dateLabel}
              {refreshedAt && !loading
                ? ` \u00B7 ${L.refreshed} ${new Date(refreshedAt).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onClose}>
            <X size={14} className="mr-1" />
            {L.close}
          </Button>
        </div>

        <div className="erp-calendar-sc-import-body">
          {loading ? (
            <p className="erp-calendar-side-empty flex items-center justify-center gap-2">
              <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
              {L.loading}
            </p>
          ) : error ? (
            <p className="erp-calendar-side-empty text-rose-600" role="alert">
              {error}
            </p>
          ) : (
            <>
              {warning ? (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800" role="status">
                  {warning}
                </p>
              ) : null}
              {!schedules.length ? (
                <p className="erp-calendar-side-empty">{L.empty}</p>
              ) : (
                <ul className="erp-csr-cal-drawer-list">
              {schedules.map((schedule) => {
                const scheduleId = String(schedule.id || "");
                const registered = scheduleId ? isScScheduleRegistered(sales, scheduleId) : false;
                const scheduleWorkers = getScScheduleWorkerDetails(schedule, workers);
                const workerNames = scheduleWorkers.map((row) => row.name).filter(Boolean).join(", ");
                const workLogSummary = formatScScheduleWorkLogSummary(schedule);
                const clientName = String(schedule.clientName || "").trim();
                const siteName = resolveScScheduleSiteName(schedule);
                return (
                  <li key={schedule.id}>
                    <button
                      type="button"
                      className={[
                        "erp-csr-cal-drawer-card is-clickable is-sc-schedule",
                        registered ? "is-registered" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleSelect(schedule)}
                      aria-disabled={registered || undefined}
                    >
                      <span
                        className={[
                          "erp-csr-cal-drawer-dot is-sc-schedule",
                          registered ? "is-registered" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-hidden="true"
                      />
                      <div className="erp-csr-cal-drawer-card-main">
                        <p className="erp-csr-cal-drawer-card-title erp-calendar-sc-import-card-title">
                          {clientName && siteName ? (
                            <>
                              <span className="erp-calendar-sc-import-client">{clientName}</span>
                              <span className="erp-calendar-sc-import-sep"> / </span>
                              <span className="erp-calendar-sc-import-site">{siteName}</span>
                            </>
                          ) : (
                            clientName || siteName || "-"
                          )}
                        </p>
                        <div className="erp-csr-cal-drawer-card-badges">
                          <span className="erp-csr-cal-drawer-badge is-sc-schedule">{L.scBadge}</span>
                          {workLogSummary ? (
                            <span className="erp-csr-cal-drawer-badge is-work-log" title={L.workLog}>
                              {L.workLog} {workLogSummary}
                            </span>
                          ) : null}
                          {formatScScheduleHeadcount(schedule) ? (
                            <span className="erp-csr-cal-drawer-badge is-muted">
                              {formatScScheduleHeadcount(schedule)}
                            </span>
                          ) : null}
                          {registered ? (
                            <span className="erp-csr-cal-drawer-badge is-registered">{L.registered}</span>
                          ) : null}
                        </div>
                        {workerNames ? (
                          <p className="erp-csr-cal-drawer-card-meta">{L.workers(workerNames)}</p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
