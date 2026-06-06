import React, { memo, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clientSiteRequestPublicStatusLabel,
  clientSiteRequestPublicStatusTone,
} from "@/utils/clientSiteRequests";
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
  emptyDay: "\uC120\uD0DD\uD55C \uB0A0\uC9DC\uB97C \uD55C \uBC88 \uB354 \uB20C\uB7EC \uC77C\uC815\uC744 \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  mobileHint: "\uB0A0\uC9DC \uC120\uD0DD \u2192 \uAC19\uC740 \uB0A0\uC9DC \uD55C \uBC88 \uB354 \uD074\uB9AD \uC2DC \uC811\uC218",
  workerUnit: "\uBA85",
};

function formatDayPanelLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"][parsed.getDay()];
  return `${parsed.getMonth() + 1}\uC6D4 ${parsed.getDate()}\uC77C (${weekday})`;
}

type ClientSiteRequestCalendarProps = {
  requests: ClientSiteRequest[];
  monthKey: string;
  onMonthKeyChange: (monthKey: string) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  selectedRequestId: string;
  onSelectRequest: (requestId: string, date?: string) => void;
};

function statusTone(request: ClientSiteRequest) {
  return clientSiteRequestPublicStatusTone(request);
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
      <p className="erp-client-request-calendar__mobile-hint">{L.mobileHint}</p>
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
                  <span className="erp-client-request-calendar__count erp-client-request-calendar__count--desktop">
                    {cell.requests.length}
                  </span>
                ) : null}
              </div>
              <div className="erp-calendar-cell-entries erp-client-request-calendar__entries">
                {cell.requests.slice(0, 3).map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className={[
                      "erp-client-request-calendar__entry",
                      `is-${statusTone(request)}`,
                      selectedRequestId === request.id ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRequest(request.id, cell.date);
                    }}
                  >
                    <span className="erp-client-request-calendar__entry-site truncate">{request.siteName}</span>
                    <span className="erp-client-request-calendar__entry-workers shrink-0">
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
            <span className="erp-client-request-calendar__day-title-full">{selectedDate}</span>
            <span className="erp-client-request-calendar__day-title-mobile">{formatDayPanelLabel(selectedDate)}</span>
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
                  onClick={() => onSelectRequest(request.id, selectedDate)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{request.siteName}</span>
                    <span className={`erp-client-request-calendar__status is-${statusTone(request)}`}>
                      {clientSiteRequestPublicStatusLabel(request)}
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
