import React, { memo, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientSiteRequestStatusLabel } from "@/utils/clientSiteRequests";
import type { ClientSiteRequest } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestWorkPeriod, requestCoversWorkDate } from "@/utils/clientSiteRequests";
import {
  buildClientSiteRequestCalendarCells,
  countClientSiteRequestsInMonth,
  formatClientSiteRequestMonthLabel,
  getClientSiteRequestWeekdayLabels,
  getCurrentMonthKey,
  shiftMonthKey,
} from "@/utils/clientSiteRequestCalendar";

const L = {
  today: "\uC624\uB298",
  monthCount: (count: number) => `\uC774\uB2EC ${count}\uAC74`,
  emptyDay: "\uC811\uC218 \uB0B4\uC5ED \uC5C6\uC2B5\uB2C8\uB2E4.",
  workerUnit: "\uBA85",
};

type ClientSiteRequestCalendarProps = {
  requests: ClientSiteRequest[];
  monthKey: string;
  onMonthKeyChange: (monthKey: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  selectedRequestId: string;
  onSelectRequest: (requestId: string) => void;
};

function statusTone(status: ClientSiteRequest["status"]) {
  if (status === "confirmed") return "confirmed";
  if (status === "rejected") return "rejected";
  return "pending";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const ClientSiteRequestCalendar = memo(function ClientSiteRequestCalendar({
  requests,
  monthKey,
  onMonthKeyChange,
  selectedDate,
  onSelectDate,
  selectedRequestId,
  onSelectRequest,
}: ClientSiteRequestCalendarProps) {
  const cells = useMemo(
    () => buildClientSiteRequestCalendarCells(monthKey, requests),
    [monthKey, requests],
  );
  const monthCount = useMemo(() => countClientSiteRequestsInMonth(monthKey, requests), [monthKey, requests]);
  const selectedDayRequests = useMemo(() => {
    if (!selectedDate) return [];
    return requests.filter((row) => requestCoversWorkDate(row, selectedDate));
  }, [requests, selectedDate]);

  return (
    <div className="erp-client-request-calendar">
      <div className="erp-calendar-toolbar">
        <div className="erp-calendar-toolbar-main">
          <button
            type="button"
            className="erp-calendar-nav-btn"
            aria-label="\uC774\uC804 \uB2EC"
            onClick={() => onMonthKeyChange(shiftMonthKey(monthKey, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="erp-calendar-month-label">
            <h2>{formatClientSiteRequestMonthLabel(monthKey)}</h2>
          </div>
          <button
            type="button"
            className="erp-calendar-nav-btn"
            aria-label="\uB2E4\uC74C \uB2EC"
            onClick={() => onMonthKeyChange(shiftMonthKey(monthKey, 1))}
          >
            <ChevronRight size={18} />
          </button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="erp-calendar-today-btn rounded-xl"
            onClick={() => {
              const current = getCurrentMonthKey();
              onMonthKeyChange(current);
              onSelectDate(todayISO());
            }}
          >
            {L.today}
          </Button>
        </div>
        <div className="text-xs font-bold text-slate-500">{L.monthCount(monthCount)}</div>
      </div>

      <div className="erp-calendar-weekdays">
        {getClientSiteRequestWeekdayLabels().map((label, index) => (
          <div
            key={label}
            className={`erp-calendar-weekday ${index === 0 ? "is-sun" : index === 6 ? "is-sat" : ""}`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="erp-calendar-grid erp-calendar-grid--entries erp-client-request-calendar__grid">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} className="erp-calendar-cell is-placeholder" aria-hidden="true" />;
          }

          const weekday = new Date(`${cell.date}T12:00:00`).getDay();
          const weekendTone = weekday === 0 ? "sun" : weekday === 6 ? "sat" : "default";
          const isToday = cell.date === todayISO();
          const hasData = cell.requests.length > 0;
          const isSelected = selectedDate === cell.date;

          return (
            <div
              key={cell.date}
              role="button"
              tabIndex={0}
              className={[
                "erp-calendar-cell",
                "erp-calendar-cell--entries",
                `is-${weekendTone}`,
                hasData ? "has-data" : "is-empty",
                isToday ? "is-today" : "",
                isSelected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate(cell.date)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectDate(cell.date);
                }
              }}
            >
              <div className="erp-calendar-cell-head">
                <span className="erp-calendar-cell-day">{cell.day}</span>
                {hasData ? (
                  <span className="erp-client-request-calendar__count">{cell.requests.length}</span>
                ) : null}
              </div>
              <div className="erp-calendar-cell-entries">
                {cell.requests.slice(0, 3).map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className={[
                      "erp-client-request-calendar__entry",
                      `is-${statusTone(request.status)}`,
                      selectedRequestId === request.id ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectDate(cell.date);
                      onSelectRequest(request.id);
                    }}
                  >
                    <span className="truncate">{request.siteName}</span>
                    <span className="shrink-0">
                      {request.workerCount}
                      {L.workerUnit}
                    </span>
                  </button>
                ))}
                {cell.requests.length > 3 ? (
                  <div className="erp-client-request-calendar__more">+{cell.requests.length - 3}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDate ? (
        <div className="erp-client-request-calendar__day-panel">
          <div className="erp-client-request-calendar__day-title">
            {selectedDate}
            {" \u00B7 "}
            {selectedDayRequests.length}
            {"\uAC74"}
          </div>
          {!selectedDayRequests.length ? (
            <p className="text-sm text-slate-500">{L.emptyDay}</p>
          ) : (
            <div className="space-y-2">
              {selectedDayRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className={`erp-client-request-calendar__day-item ${
                    selectedRequestId === request.id ? "is-active" : ""
                  }`}
                  onClick={() => onSelectRequest(request.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{request.siteName}</span>
                    <span className={`erp-client-request-calendar__status is-${statusTone(request.status)}`}>
                      {clientSiteRequestStatusLabel(request.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {request.workerCount}
                    {L.workerUnit}
                    {request.contactName ? ` \u00B7 ${request.contactName}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
});
