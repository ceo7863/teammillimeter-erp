import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clientSiteRequestPublicStatusLabel,
  clientSiteRequestPublicStatusTone,
} from "@/utils/clientSiteRequests";
import type { ClientSiteRequest } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestWorkPeriod } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestDayLabel, shiftCalendarDate } from "@/utils/clientSiteRequestCalendar";
import type { ScSchedule } from "@/utils/scSchedules";
import { formatScScheduleHeadcount, formatScScheduleTimeRange } from "@/utils/scSchedules";
import { useBackdropPointerDismiss, useModalDismissGuard } from "@/utils/modalBackdrop";

const L = {
  close: "\uB2EB\uAE30",
  prevDay: "\uC774\uC804 \uB0A0",
  nextDay: "\uB2E4\uC74C \uB0A0",
  empty: "\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  sectionRequests: "\uC811\uC218 \uC694\uCCAD",
  sectionSc: "SC \uD655\uC815 \uC77C\uC815",
  scBadge: "\uD655\uC815",
};

type ClientSiteRequestCalendarDayDrawerProps = {
  date: string;
  requests: ClientSiteRequest[];
  scSchedules: ScSchedule[];
  selectedRequestId: string;
  onClose: () => void;
  onShiftDate: (date: string) => void;
  onSelectRequest: (requestId: string, date?: string) => void;
  elevated?: boolean;
};

function statusTone(request: ClientSiteRequest) {
  return clientSiteRequestPublicStatusTone(request);
}

export function ClientSiteRequestCalendarDayDrawer({
  date,
  requests,
  scSchedules,
  selectedRequestId,
  onClose,
  onShiftDate,
  onSelectRequest,
  elevated = false,
}: ClientSiteRequestCalendarDayDrawerProps) {
  const { onPointerDown, onPointerUp, isTouchDevice } = useBackdropPointerDismiss(Boolean(date), onClose);
  const { guardedClose } = useModalDismissGuard(Boolean(date));
  const closeDrawer = () => guardedClose(onClose);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  const totalCount = requests.length + scSchedules.length;

  return createPortal(
    <div
      className={`erp-csr-cal-drawer-backdrop${elevated ? " erp-csr-cal-drawer-backdrop--elevated" : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      data-touch-device={isTouchDevice ? "true" : undefined}
    >
      <aside
        className="erp-csr-cal-drawer erp-calendar-side-panel"
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
                        <div className="erp-csr-cal-drawer-card is-sc-schedule">
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
                              <p className="erp-csr-cal-drawer-card-meta">{schedule.participantNames.join(", ")}</p>
                            ) : null}
                          </div>
                        </div>
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
                          onClick={() => onSelectRequest(request.id, date)}
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
      </aside>
    </div>,
    document.body,
  );
}
