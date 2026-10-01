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
  findSaleByScScheduleId,
  isScScheduleRegistered,
  resolveScScheduleSiteName,
} from "@/utils/scScheduleSaleImport";
import {
  buildCalwalkReimportPreview,
  formatCalwalkAmount,
  resolveCalwalkParticipantExtras,
  type CalwalkReimportPreview,
} from "@/utils/calwalkLineProvenance";
import type { WorkerMasterLike } from "@/utils/workerPayments";

const L = {
  title: "CalWalk \uC2A4\uCF00\uC904 \uAC00\uC838\uC624\uAE30",
  empty: "\uC774 \uB0A0\uC9D0 CalWalk \uD655\uC815 \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  loading: "CalWalk\uC5D0\uC11C \uCD5C\uC2E0 \uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.",
  refreshed: "\uCD5C\uC2E0 \uD655\uC778",
  registered: "\uB4F1\uB85D\uB428",
  alreadyRegistered: "\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC2A4\uCF00\uC904\uC785\uB2C8\uB2E4.",
  close: "\uB2EB\uAE30",
  scBadge: "\uD655\uC815",
  workLog: "\uADFC\uBB34\uAE30\uB85D",
  workers: (names: string) => names || "-",
  meal: "\uC2DD\uB300",
  expense: "\uACBD\uBE44",
  mealIncluded: "\uC2DD\uB300 \uD3EC\uD568 \uAC70\uB798\uCC98 \u00B7 \uC2DD\uB300 \uBBF8\uBC18\uC601",
  extrasHint: "CalWalk\uC5D0 \uC785\uB825\uB41C \uAC12\uB9CC \uBC18\uC601\uD569\uB2C8\uB2E4. \uAC12\uC774 \uC5C6\uC73C\uBA74 \uBE48\uCE78\uC73C\uB85C \uB461\uB2C8\uB2E4.",
  duplicateName: "\uAC19\uC740 \uC774\uB984 \uCC38\uC5EC\uC790\uAC00 \uC5EC\uB7EC \uBA85\uC785\uB2C8\uB2E4. \uC2DC\uACF5\uC790\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  diffTitle: "\uB4F1\uB85D\uB41C \uB9E4\uCD9C\uACFC \uBE44\uAD50 (\uBCC0\uACBD\uB418\uC9C0 \uC54A\uC74C)",
  diffNone: "\uB4F1\uB85D\uB41C \uB9E4\uCD9C\uACFC CalWalk \uC2DD\uB300\u00B7\uACBD\uBE44\uAC00 \uC77C\uCE58\uD569\uB2C8\uB2E4.",
  colCalwalk: "CalWalk",
  colErp: "ERP",
  colPlanned: "\uC608\uC815",
};

export const CALWALK_SCHEDULE_IMPORT_LABELS = L;

type CalendarScScheduleImportModalProps = {
  open: boolean;
  dateLabel: string;
  schedules: ScSchedule[];
  sales: Array<{ scScheduleId?: string | number | null }>;
  workers?: WorkerMasterLike[];
  clients?: Array<{ name?: string; mealIncluded?: string }>;
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
  clients = [],
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
                const mealIncluded =
                  String(clients.find((row) => String(row.name || "").trim() === clientName)?.mealIncluded || "N")
                    .trim()
                    .toUpperCase() === "Y";
                const nameCounts = new Map<string, number>();
                scheduleWorkers.forEach((row) => {
                  const key = String(row.participantName || row.name || "").trim();
                  if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
                });
                const hasDuplicateNames = [...nameCounts.values()].some((count) => count > 1);
                const reimport: CalwalkReimportPreview | null = registered
                  ? buildCalwalkReimportPreview(
                      findSaleByScScheduleId(sales, scheduleId) as Parameters<typeof buildCalwalkReimportPreview>[0],
                      schedule,
                      scheduleWorkers,
                      { mealIncluded },
                    )
                  : null;
                return (
                  <li key={schedule.id} data-sc-schedule-id={scheduleId}>
                    <button
                      type="button"
                      className={[
                        "erp-csr-cal-drawer-card is-clickable is-sc-schedule",
                        registered ? "is-registered" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        if (loading || error) return;
                        handleSelect(schedule);
                      }}
                      disabled={loading || Boolean(error)}
                      aria-disabled={registered || loading || Boolean(error) || undefined}
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
                        {scheduleWorkers.length ? (
                          <span className="erp-calendar-sc-import-extras" data-testid="calwalk-import-extras">
                            {scheduleWorkers.map((row, index) => {
                              const extras = resolveCalwalkParticipantExtras(row);
                              return (
                                <span
                                  key={`${row.participantName}-${index}`}
                                  className="erp-calendar-sc-import-extras-row"
                                  data-calwalk-worker={row.name}
                                  data-calwalk-meal={extras.meal == null ? "" : String(extras.meal)}
                                  data-calwalk-expense={extras.expense == null ? "" : String(extras.expense)}
                                >
                                  <span className="erp-calendar-sc-import-extras-name">{row.name}</span>
                                  <span>
                                    {L.meal} {mealIncluded ? "-" : formatCalwalkAmount(extras.meal)}
                                  </span>
                                  <span>
                                    {L.expense} {formatCalwalkAmount(extras.expense)}
                                  </span>
                                </span>
                              );
                            })}
                            <span className="erp-calendar-sc-import-extras-hint">
                              {mealIncluded ? `${L.mealIncluded} \u00B7 ` : ""}
                              {L.extrasHint}
                            </span>
                            {hasDuplicateNames ? (
                              <span className="erp-calendar-sc-import-extras-warn" role="status">
                                {L.duplicateName}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    {reimport?.applicable ? (
                      <div className="erp-calendar-sc-import-diff" data-testid="calwalk-reimport-diff">
                        <p className="erp-calendar-sc-import-diff-title">{L.diffTitle}</p>
                        {reimport.changeCount === 0 && reimport.conflictCount === 0 && reimport.warningCount === 0 ? (
                          <p className="erp-calendar-sc-import-diff-none">{L.diffNone}</p>
                        ) : (
                          <table className="erp-calendar-sc-import-diff-table">
                            <thead>
                              <tr>
                                <th scope="col" />
                                <th scope="col" />
                                <th scope="col">{L.colCalwalk}</th>
                                <th scope="col">{L.colErp}</th>
                                <th scope="col">{L.colPlanned}</th>
                                <th scope="col" />
                              </tr>
                            </thead>
                            <tbody>
                              {reimport.rows.flatMap((row) => [
                                ...(row.warnings.length
                                  ? [
                                      <tr key={`${row.key}-row`} data-diff-status={row.rowStatus} className="is-conflict">
                                        <td>{row.worker}</td>
                                        <td colSpan={5}>{row.warnings.join(" \u00B7 ")}</td>
                                      </tr>,
                                    ]
                                  : []),
                                ...row.fields
                                      .filter((field) => field.status !== "unchanged" && field.status !== "suppressed")
                                      .map((field) => (
                                        <tr
                                          key={`${row.key}-${field.field}`}
                                          data-diff-status={field.status}
                                          className={`is-${field.status}`}
                                        >
                                          <td>{row.worker}</td>
                                          <td>{field.field === "meal" ? L.meal : L.expense}</td>
                                          <td>{formatCalwalkAmount(field.calwalk)}</td>
                                          <td>{field.erp ? formatCalwalkAmount(Number(field.erp)) : "-"}</td>
                                          <td>{field.planned ? formatCalwalkAmount(Number(field.planned)) : "-"}</td>
                                          <td>{field.message}</td>
                                        </tr>
                                      )),
                              ])}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ) : null}
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
