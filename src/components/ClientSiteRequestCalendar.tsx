import React, { memo, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientSiteRequestPublicStatusTone, isClientSiteRequestVisibleOnPublicCalendar } from "@/utils/clientSiteRequests";
import type { ClientSiteRequest, ClientSiteRequestChangeSource } from "@/utils/clientSiteRequests";
import { requestCoversWorkDate } from "@/utils/clientSiteRequests";
import {
  buildClientSiteRequestCalendarCells,
  countClientSiteRequestsInMonth,
  countScSchedulesInMonth,
  filterClientSiteRequestsForCalendarDay,
  formatClientSiteRequestMonthLabel,
  getClientSiteRequestWeekdayLabels,
  getCurrentMonthKey,
  shiftMonthKey,
} from "@/utils/clientSiteRequestCalendar";
import type { ScSchedule } from "@/utils/scSchedules";
import { formatClientSiteRequestHeadcount, formatScScheduleHeadcount } from "@/utils/scSchedules";
import { withoutScPersonalVacationSchedules } from "@/utils/scScheduleVacation";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import type { ClientMasterLike } from "@/utils/clientMaster";
import { ClientSiteRequestCalendarDayDrawer } from "@/components/ClientSiteRequestCalendarDayDrawer";

const L = {
  today: "\uC624\uB298",
  monthCount: (requestCount: number, scCount: number) => {
    if (requestCount > 0 && scCount > 0) return `\uC811\uC218 ${requestCount}\uAC74 \u00B7 SC ${scCount}\uAC74`;
    if (scCount > 0) return `SC \uD655\uC815 ${scCount}\uAC74`;
    return `\uC811\uC218 ${requestCount}\uAC74`;
  },
  scBadge: "\uD655\uC815",
  mobileHint: "\uB0A0\uC9DC\uB97C \uD074\uB9AD\uD558\uBA74 \uC77C\uC815 \uC744 \uC5F4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  workerUnit: "\uBA85",
  prevMonth: "\uC774\uC804 \uB2ec",
  nextMonth: "\uB2E4\uC74C \uB2ec",
};

type ClientSiteRequestCalendarProps = {
  requests: ClientSiteRequest[];
  scSchedules?: ScSchedule[];
  workers?: WorkerMasterLike[];
  clients?: ClientMasterLike[];
  monthKey: string;
  onMonthKeyChange: (monthKey: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  selectedRequestId: string;
  onSelectRequest: (requestId: string, date?: string) => void;
  selectedScScheduleId?: string;
  onSelectScSchedule?: (scheduleId: string, date?: string) => void;
  onRegisterDate?: (date: string) => void;
  onChangeRequest?: (source: ClientSiteRequestChangeSource) => void;
  drawerElevated?: boolean;
  fullscreen?: boolean;
  scAlimtalkEnabled?: boolean;
};

function statusTone(request: ClientSiteRequest) {
  return clientSiteRequestPublicStatusTone(request);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const ClientSiteRequestCalendar = memo(function ClientSiteRequestCalendar({
  requests,
  scSchedules = [],
  workers = [],
  clients = [],
  monthKey,
  onMonthKeyChange,
  selectedDate,
  onSelectDate,
  selectedRequestId,
  onSelectRequest,
  selectedScScheduleId = "",
  onSelectScSchedule,
  onRegisterDate,
  onChangeRequest,
  drawerElevated = false,
  fullscreen = false,
  scAlimtalkEnabled = false,
}: ClientSiteRequestCalendarProps) {
  const [drawerDate, setDrawerDate] = useState<string | null>(null);

  const calendarRequests = useMemo(
    () => requests.filter((row) => isClientSiteRequestVisibleOnPublicCalendar(row)),
    [requests],
  );
  const visibleScSchedules = useMemo(
    () => withoutScPersonalVacationSchedules(scSchedules),
    [scSchedules],
  );
  const cells = useMemo(
    () => buildClientSiteRequestCalendarCells(monthKey, calendarRequests, visibleScSchedules),
    [monthKey, calendarRequests, visibleScSchedules],
  );
  const monthCountLabel = useMemo(() => {
    const requestCount = countClientSiteRequestsInMonth(monthKey, calendarRequests, visibleScSchedules);
    const scCount = countScSchedulesInMonth(monthKey, visibleScSchedules);
    return L.monthCount(requestCount, scCount);
  }, [monthKey, calendarRequests, visibleScSchedules]);

  const drawerScSchedules = useMemo(() => {
    if (!drawerDate) return [];
    return visibleScSchedules.filter((row) => String(row.workDate || "").slice(0, 10) === drawerDate);
  }, [visibleScSchedules, drawerDate]);

  const drawerRequests = useMemo(() => {
    if (!drawerDate) return [];
    const dayRequests = calendarRequests.filter((row) => requestCoversWorkDate(row, drawerDate));
    return filterClientSiteRequestsForCalendarDay(dayRequests, drawerDate, drawerScSchedules);
  }, [calendarRequests, drawerDate, drawerScSchedules]);

  const rowCount = Math.ceil(cells.length / 7);

  const openDrawer = (date: string) => {
    setDrawerDate(date);
    onSelectDate(date);
  };

  const closeDrawer = () => {
    setDrawerDate(null);
  };

  const handleShiftDrawerDate = (date: string) => {
    setDrawerDate(date);
    onSelectDate(date);
    const [year, month] = date.split("-");
    const monthKeyFromDate = `${year}-${month}`;
    if (monthKeyFromDate !== monthKey) {
      onMonthKeyChange(monthKeyFromDate);
    }
  };

  const handleRegisterDate = (date: string) => {
    onRegisterDate?.(date);
    closeDrawer();
  };

  const handleChangeRequest = (source: ClientSiteRequestChangeSource) => {
    onChangeRequest?.(source);
    closeDrawer();
  };

  const handleSelectRequest = (requestId: string, date?: string) => {
    onSelectScSchedule?.("");
    onSelectRequest(requestId, date);
  };

  const handleSelectScSchedule = (scheduleId: string, date?: string) => {
    if (scheduleId) {
      onSelectRequest("", date);
    }
    onSelectScSchedule?.(scheduleId, date);
  };

  return (
    <div
      className={`erp-client-request-calendar erp-client-request-calendar--sc${fullscreen ? " erp-client-request-calendar--fullscreen" : ""}`}
    >
      <p className="erp-csr-cal-mobile-hint">{L.mobileHint}</p>

      <div className="erp-csr-cal-nav">
        <div className="erp-csr-cal-nav-main">
          <button
            type="button"
            className="erp-calendar-nav-btn"
            aria-label={L.prevMonth}
            onClick={() => onMonthKeyChange(shiftMonthKey(monthKey, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="erp-csr-cal-month">
            <h2>{formatClientSiteRequestMonthLabel(monthKey)}</h2>
            <span className="erp-csr-cal-month-meta">{monthCountLabel}</span>
          </div>
          <button
            type="button"
            className="erp-calendar-nav-btn"
            aria-label={L.nextMonth}
            onClick={() => onMonthKeyChange(shiftMonthKey(monthKey, 1))}
          >
            <ChevronRight size={18} />
          </button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="erp-csr-cal-today-btn rounded-lg"
            onClick={() => {
              const current = getCurrentMonthKey();
              onMonthKeyChange(current);
              openDrawer(todayISO());
            }}
          >
            {L.today}
          </Button>
        </div>
      </div>

      <div className="erp-csr-cal-board">
        <div className="erp-csr-cal-weekdays">
          {getClientSiteRequestWeekdayLabels().map((label, index) => (
            <div
              key={label}
              className={`erp-csr-cal-weekday ${index === 0 ? "is-sun" : index === 6 ? "is-sat" : ""}`}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className="erp-csr-cal-grid"
          style={{
            gridTemplateRows: `repeat(${rowCount}, minmax(${fullscreen ? "0, 1fr" : "4.5rem, 1fr"}))`,
          }}
        >
          {cells.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="erp-csr-cal-cell is-placeholder" aria-hidden="true" />;
            }

            const weekday = new Date(`${cell.date}T12:00:00`).getDay();
            const isToday = cell.date === todayISO();
            const isActive = drawerDate === cell.date || selectedDate === cell.date;
            const entryCount = cell.requests.length + cell.scSchedules.length;
            const visibleRequests = cell.requests.slice(0, 3);
            const scSlots = Math.max(0, 3 - visibleRequests.length);
            const visibleSc = cell.scSchedules.slice(0, scSlots);

            return (
              <div
                key={cell.date}
                role="button"
                tabIndex={0}
                className={[
                  "erp-csr-cal-cell",
                  weekday === 0 ? "is-sun" : weekday === 6 ? "is-sat" : "",
                  isToday ? "is-today" : "",
                  isActive ? "is-active" : "",
                  entryCount > 0 ? "has-data" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => openDrawer(cell.date)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDrawer(cell.date);
                  }
                }}
              >
                <div className="erp-csr-cal-cell-head">
                  <span className="erp-csr-cal-day">{cell.day}</span>
                </div>
                <div className="erp-csr-cal-chips">
                  {visibleRequests.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      className={[
                        "erp-csr-cal-chip",
                        `is-${statusTone(request)}`,
                        selectedRequestId === request.id ? "is-selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDrawer(cell.date);
                        handleSelectRequest(request.id, cell.date);
                      }}
                    >
                      <span className="erp-csr-cal-chip-label">{request.siteName}</span>
                      <span className="erp-csr-cal-chip-meta">
                        {formatClientSiteRequestHeadcount(request, cell.scSchedules, cell.date)}
                      </span>
                    </button>
                  ))}
                  {visibleSc.map((schedule) => (
                    <div key={`sc-${schedule.id}`} className="erp-csr-cal-chip is-sc-schedule" title={L.scBadge}>
                      <span className="erp-csr-cal-chip-label">{schedule.workType}</span>
                      <span className="erp-csr-cal-chip-meta">{formatScScheduleHeadcount(schedule)}</span>
                    </div>
                  ))}
                  {entryCount > 3 ? <span className="erp-csr-cal-more">+{entryCount - 3}{"\uAC74"}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {drawerDate ? (
        <ClientSiteRequestCalendarDayDrawer
          date={drawerDate}
          requests={drawerRequests}
          scSchedules={drawerScSchedules}
          workers={workers}
          clients={clients}
          selectedRequestId={selectedRequestId}
          selectedScScheduleId={selectedScScheduleId}
          onClose={closeDrawer}
          onShiftDate={handleShiftDrawerDate}
          onSelectRequest={handleSelectRequest}
          onSelectScSchedule={onSelectScSchedule ? handleSelectScSchedule : undefined}
          onRegisterDate={onRegisterDate ? handleRegisterDate : undefined}
          onChangeRequest={onChangeRequest ? handleChangeRequest : undefined}
          elevated={drawerElevated}
          scAlimtalkEnabled={scAlimtalkEnabled}
        />
      ) : null}
    </div>
  );
});
