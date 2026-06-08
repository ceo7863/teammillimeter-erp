import React from "react";
import { createPortal } from "react-dom";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clientSiteRequestPublicStatusLabel,
  clientSiteRequestPublicStatusTone,
} from "@/utils/clientSiteRequests";
import type { ClientSiteRequest, ClientSiteRequestChangeSource } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestWorkPeriod } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestDayLabel, shiftCalendarDate } from "@/utils/clientSiteRequestCalendar";
import type { ScSchedule } from "@/utils/scSchedules";
import { formatScScheduleHeadcount, formatScScheduleTimeRange, resolveScScheduleWorkers } from "@/utils/scSchedules";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import { useBodyScrollLock } from "@/utils/bodyScrollLock";
import { useBackdropPointerDismiss, useModalDismissGuard } from "@/utils/modalBackdrop";

const L = {
  close: "\uB2EB\uAE30",
  prevDay: "\uC774\uC804 \uB0A0",
  nextDay: "\uB2E4\uC74C \uB0A0",
  empty: "\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  sectionRequests: "\uC811\uC218 \uC694\uCCAD",
  sectionSc: "SC \uD655\uC815 \uC77C\uC815",
  scBadge: "\uD655\uC815",
  workerName: "\uC2DC\uACF5\uC790\uBA85",
  workerPhone: "\uC804\uD654\uBC88\uD638",
  workerVehicle: "\uCC28\uB7C9\uBC88\uD638",
  registerSchedule: "\uC77C\uC815 \uC811\uC218",
  changeSchedule: "\uC77C\uC815 \uBCC0\uACBD \uC694\uCCAD",
};

type ClientSiteRequestCalendarDayDrawerProps = {
  date: string;
  requests: ClientSiteRequest[];
  scSchedules: ScSchedule[];
  workers?: WorkerMasterLike[];
  selectedRequestId: string;
  selectedScScheduleId?: string;
  onClose: () => void;
  onShiftDate: (date: string) => void;
  onSelectRequest: (requestId: string, date?: string) => void;
  onSelectScSchedule?: (scheduleId: string, date?: string) => void;
  onRegisterDate?: (date: string) => void;
  onChangeRequest?: (source: ClientSiteRequestChangeSource) => void;
  elevated?: boolean;
};

function statusTone(request: ClientSiteRequest) {
  return clientSiteRequestPublicStatusTone(request);
}

export function ClientSiteRequestCalendarDayDrawer({
  date,
  requests,
  scSchedules,
  workers = [],
  selectedRequestId,
  selectedScScheduleId = "",
  onClose,
  onShiftDate,
  onSelectRequest,
  onSelectScSchedule,
  onRegisterDate,
  onChangeRequest,
  elevated = false,
}: ClientSiteRequestCalendarDayDrawerProps) {
  const { onPointerDown, onPointerUp, isTouchDevice } = useBackdropPointerDismiss(Boolean(date), onClose);
  const { guardedClose } = useModalDismissGuard(Boolean(date));
  const closeDrawer = () => guardedClose(onClose);

  useBodyScrollLock(Boolean(date));

  if (typeof document === "undefined") return null;

  const totalCount = requests.length + scSchedules.length;
  const selectedRequest = requests.find((row) => row.id === selectedRequestId) || null;
  const selectedScSchedule = scSchedules.find((row) => row.id === selectedScScheduleId) || null;
  const canChangeRequest = Boolean(onChangeRequest && (selectedRequest || selectedScSchedule));

  const handleChangeRequest = () => {
    if (!onChangeRequest) return;
    if (selectedRequest) {
      onChangeRequest({ kind: "request", date, request: selectedRequest });
      return;
    }
    if (selectedScSchedule) {
      onChangeRequest({ kind: "sc", date, schedule: selectedScSchedule });
    }
  };

  return createPortal(
    <div
      className={`erp-csr-cal-drawer-backdrop${elevated ? " erp-csr-cal-drawer-backdrop--elevated" : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      data-touch-device={isTouchDevice ? "true" : undefined}
    >
      <aside
        className="erp-csr-cal-drawer erp-calendar-side-panel erp-csr-cal-drawer--with-foot"
        role="dialog"
        aria-modal="true"
        aria-label={`${date} \uC77C\uC815`}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="erp-csr-cal-drawer-head">
          <div className="erp-csr-cal-drawer-nav">
            <button
              type="button"
              className="erp-calendar-nav-btn"
              aria-label={L.prevDay}
              onClick={() => onShiftDate(shiftCalendarDate(date, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <strong className="erp-csr-cal-drawer-date">{formatClientSiteRequestDayLabel(date)}</strong>
            <button
              type="button"
              className="erp-calendar-nav-btn"
              aria-label={L.nextDay}
              onClick={() => onShiftDate(shiftCalendarDate(date, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-3 text-xs" onClick={closeDrawer}>
            <X size={14} className="mr-1" />
            {L.close}
          </Button>
        </div>

        <div className="erp-csr-cal-drawer-body erp-calendar-side-panel-body">
          {totalCount === 0 ? (
            <p className="erp-calendar-side-empty">{L.empty}</p>
          ) : (
            <div className="erp-csr-cal-drawer-sections">
              {scSchedules.length > 0 ? (
                <section className="erp-csr-cal-drawer-section">
                  <h3 className="erp-csr-cal-drawer-section-title">{L.sectionSc}</h3>
                  <ul className="erp-csr-cal-drawer-list">
                    {scSchedules.map((schedule) => (
                      <li key={`sc-${schedule.id}`}>
                        <button
                          type="button"
                          className={[
                            "erp-csr-cal-drawer-card is-sc-schedule is-clickable",
                            selectedScScheduleId === schedule.id ? "is-active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            onSelectScSchedule?.(schedule.id, date);
                            if (schedule.id !== selectedScScheduleId) {
                              onSelectRequest("", date);
                            }
                          }}
                        >
                          <span className="erp-csr-cal-drawer-dot is-sc-schedule" aria-hidden="true" />
                          <div className="erp-csr-cal-drawer-card-main">
                            <p className="erp-csr-cal-drawer-card-title">{schedule.workType}</p>
                            <div className="erp-csr-cal-drawer-card-badges">
                              <span className="erp-csr-cal-drawer-badge is-sc-schedule">{L.scBadge}</span>
                              {formatScScheduleTimeRange(schedule) ? (
                                <span className="erp-csr-cal-drawer-badge is-muted">
                                  {formatScScheduleTimeRange(schedule)}
                                </span>
                              ) : null}
                              {formatScScheduleHeadcount(schedule) ? (
                                <span className="erp-csr-cal-drawer-badge is-muted">
                                  {formatScScheduleHeadcount(schedule)}
                                </span>
                              ) : null}
                            </div>
                            {schedule.participantNames?.length ? (
                              workers.length ? (
                                <div className="erp-csr-cal-drawer-sc-workers">
                                  {resolveScScheduleWorkers(workers, schedule.participantNames).map((worker) => (
                                    <div key={`${schedule.id}-${worker.participantName}`} className="erp-csr-cal-drawer-sc-worker">
                                      <p className="erp-csr-cal-drawer-sc-worker-line">
                                        <span className="erp-csr-cal-drawer-sc-worker-label">{L.workerName}</span>
                                        {" "}
                                        {worker.name}
                                      </p>
                                      <p className="erp-csr-cal-drawer-sc-worker-line">
                                        <span className="erp-csr-cal-drawer-sc-worker-label">{L.workerPhone}</span>
                                        {" "}
                                        {worker.phone || "-"}
                                      </p>
                                      <p className="erp-csr-cal-drawer-sc-worker-line">
                                        <span className="erp-csr-cal-drawer-sc-worker-label">{L.workerVehicle}</span>
                                        {" "}
                                        {worker.vehicleNo || "-"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="erp-csr-cal-drawer-card-meta">{schedule.participantNames.join(", ")}</p>
                              )
                            ) : null}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {requests.length > 0 ? (
                <section className="erp-csr-cal-drawer-section">
                  <h3 className="erp-csr-cal-drawer-section-title">{L.sectionRequests}</h3>
                  <ul className="erp-csr-cal-drawer-list">
                    {requests.map((request) => (
                      <li key={request.id}>
                        <button
                          type="button"
                          className={`erp-csr-cal-drawer-card is-clickable ${
                            selectedRequestId === request.id ? "is-active" : ""
                          }`}
                          onClick={() => {
                            onSelectScSchedule?.("");
                            onSelectRequest(request.id, date);
                          }}
                        >
                          <span
                            className={`erp-csr-cal-drawer-dot is-${statusTone(request)}`}
                            aria-hidden="true"
                          />
                          <div className="erp-csr-cal-drawer-card-main">
                            <p className="erp-csr-cal-drawer-card-title">{request.siteName}</p>
                            <div className="erp-csr-cal-drawer-card-badges">
                              <span className={`erp-csr-cal-drawer-badge is-${statusTone(request)}`}>
                                {clientSiteRequestPublicStatusLabel(request)}
                              </span>
                              <span className="erp-csr-cal-drawer-badge is-muted">
                                {request.workerCount}
                                {"\uBA85"}
                              </span>
                            </div>
                            <p className="erp-csr-cal-drawer-card-meta">
                              {formatClientSiteRequestWorkPeriod(request)}
                              {request.contactName ? ` \u00B7 ${request.contactName}` : ""}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>

        {onRegisterDate || canChangeRequest ? (
          <div className="erp-csr-cal-drawer-foot">
            {canChangeRequest ? (
              <Button
                type="button"
                className="erp-touch-target erp-csr-cal-drawer-register-btn w-full rounded-xl"
                onClick={handleChangeRequest}
              >
                <CalendarClock size={16} className="mr-1.5" />
                {L.changeSchedule}
              </Button>
            ) : null}
            {onRegisterDate ? (
              <Button
                type="button"
                variant={canChangeRequest ? "outline" : "default"}
                className="erp-touch-target erp-csr-cal-drawer-register-btn w-full rounded-xl"
                onClick={() => onRegisterDate(date)}
              >
                <CalendarPlus size={16} className="mr-1.5" />
                {L.registerSchedule}
              </Button>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
