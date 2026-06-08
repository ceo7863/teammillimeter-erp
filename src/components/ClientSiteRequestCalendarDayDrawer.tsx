import React, { useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendScScheduleNotifyOne, type ScScheduleNotifyOneResult } from "@/utils/notificationApi";
import {
  clientSiteRequestPublicStatusLabel,
  clientSiteRequestPublicStatusTone,
} from "@/utils/clientSiteRequests";
import type { ClientSiteRequest, ClientSiteRequestChangeSource } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestWorkPeriod } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestDayLabel, shiftCalendarDate } from "@/utils/clientSiteRequestCalendar";
import type { ScSchedule } from "@/utils/scSchedules";
import { formatScScheduleHeadcount, formatScScheduleTimeRange } from "@/utils/scSchedules";
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
  registerSchedule: "\uC77C\uC815 \uC811\uC218",
  changeSchedule: "\uC77C\uC815 \uBCC0\uACBD \uC694\uCCAD",
  sendAlimtalk: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1",
  sendAlimtalkConfirm:
    "\uC120\uD0DD\uD55C SC \uC77C\uC815 \uC54C\uB9BC\uC744 \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC640 \uCC38\uC5EC \uC2DC\uACF5\uC790 \uC804\uD654\uB85C \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  sendAlimtalkSending: "\uBC1C\uC1A1 \uC911...",
  sendAlimtalkError: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  sendAlimtalkResultTitle: "SC \uC77C\uC815 \uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uACB0\uACFC",
  sendAlimtalkSkipped: "\uBC1C\uC1A1\uC774 \uAC74\uB108\uB701\uC5B4\uC84C\uC2B5\uB2C8\uB2E4",
  recipientClient: "\uAC70\uB798\uCC98",
  recipientWorker: "\uC2DC\uACF5",
  noPhone: "\uC804\uD654\uC5C6\uC74C",
  sentOk: "\uBC1C\uC1A1",
  sentFail: "\uC2E4\uD328",
};

type ClientSiteRequestCalendarDayDrawerProps = {
  date: string;
  requests: ClientSiteRequest[];
  scSchedules: ScSchedule[];
  selectedRequestId: string;
  selectedScScheduleId?: string;
  onClose: () => void;
  onShiftDate: (date: string) => void;
  onSelectRequest: (requestId: string, date?: string) => void;
  onSelectScSchedule?: (scheduleId: string, date?: string) => void;
  onRegisterDate?: (date: string) => void;
  onChangeRequest?: (source: ClientSiteRequestChangeSource) => void;
  canSendScAlimtalk?: boolean;
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
  selectedScScheduleId = "",
  onClose,
  onShiftDate,
  onSelectRequest,
  onSelectScSchedule,
  onRegisterDate,
  onChangeRequest,
  canSendScAlimtalk = false,
  elevated = false,
}: ClientSiteRequestCalendarDayDrawerProps) {
  const { onPointerDown, onPointerUp, isTouchDevice } = useBackdropPointerDismiss(Boolean(date), onClose);
  const { guardedClose } = useModalDismissGuard(Boolean(date));
  const closeDrawer = () => guardedClose(onClose);
  const [sendingAlimtalk, setSendingAlimtalk] = useState(false);
  const [alimtalkError, setAlimtalkError] = useState("");
  const [alimtalkResult, setAlimtalkResult] = useState<ScScheduleNotifyOneResult | null>(null);

  useBodyScrollLock(Boolean(date));

  if (typeof document === "undefined") return null;

  const totalCount = requests.length + scSchedules.length;
  const selectedRequest = requests.find((row) => row.id === selectedRequestId) || null;
  const selectedScSchedule = scSchedules.find((row) => row.id === selectedScScheduleId) || null;
  const canChangeRequest = Boolean(onChangeRequest && (selectedRequest || selectedScSchedule));
  const canSendAlimtalk = Boolean(canSendScAlimtalk && selectedScSchedule);

  const formatAlimtalkResultMessage = (result: ScScheduleNotifyOneResult) => {
    const lines = [
      `${result.clientName || result.projectName || result.scheduleId || "-"}`,
      `${result.workDate || "-"} / ${result.sentCount ?? 0}\uAC74 \uBC1C\uC1A1 / ${result.failedCount ?? 0}\uAC74 \uC2E4\uD328`,
    ];
    if (result.shareUrl) {
      lines.push(`\uACF5\uC720 \uB9C1\uD06C: ${result.shareUrl}`);
    } else if (result.shareError) {
      lines.push(`\uACF5\uC720 \uB9C1\uD06C \uC0DD\uC131 \uC2E4\uD328: ${result.shareError}`);
    }
    if (result.results?.length) {
      lines.push("", "=== \uBC1C\uC1A1 \uB300\uC0C1 ===");
      for (const row of result.results) {
        const role = row.recipientType === "client" ? L.recipientClient : L.recipientWorker;
        const status = row.ok ? L.sentOk : L.sentFail;
        lines.push(`[${role} ${row.phone || L.noPhone}] ${row.participantName} - ${status}${row.reason ? ` (${row.reason})` : ""}`);
      }
    }
    return lines.join("\n");
  };

  const handleSendAlimtalk = async () => {
    if (!selectedScSchedule || sendingAlimtalk) return;
    if (!window.confirm(L.sendAlimtalkConfirm)) return;
    setSendingAlimtalk(true);
    setAlimtalkError("");
    try {
      const result = await sendScScheduleNotifyOne(selectedScSchedule.id, { skipSync: true });
      if (result.skipped) {
        setAlimtalkResult({
          ...result,
          error: `${L.sendAlimtalkSkipped}: ${result.reason || "-"}`,
        });
        return;
      }
      if (!result.ok && result.error) {
        setAlimtalkError(result.error);
        return;
      }
      setAlimtalkResult(result);
    } catch (error) {
      console.error(error);
      setAlimtalkError(L.sendAlimtalkError);
    } finally {
      setSendingAlimtalk(false);
    }
  };

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
                              <p className="erp-csr-cal-drawer-card-meta">{schedule.participantNames.join(", ")}</p>
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

        {onRegisterDate || canChangeRequest || canSendAlimtalk ? (
          <div className="erp-csr-cal-drawer-foot">
            {canSendAlimtalk ? (
              <Button
                type="button"
                variant="outline"
                className="erp-touch-target erp-csr-cal-drawer-register-btn w-full rounded-xl"
                disabled={sendingAlimtalk}
                onClick={() => void handleSendAlimtalk()}
              >
                <Send size={16} className="mr-1.5" />
                {sendingAlimtalk ? L.sendAlimtalkSending : L.sendAlimtalk}
              </Button>
            ) : null}
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
                variant={canChangeRequest || canSendAlimtalk ? "outline" : "default"}
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

      {alimtalkError ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-red-700">{alimtalkError}</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setAlimtalkError("")}>
                {L.close}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {alimtalkResult ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="erp-text-body mb-3 font-bold text-slate-900">{L.sendAlimtalkResultTitle}</h3>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-800">
              {alimtalkResult.error || formatAlimtalkResultMessage(alimtalkResult)}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setAlimtalkResult(null)}>
                {L.close}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
