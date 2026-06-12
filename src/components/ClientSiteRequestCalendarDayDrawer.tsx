import React, { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, Copy, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clientSiteRequestPublicStatusLabel,
  clientSiteRequestPublicStatusTone,
} from "@/utils/clientSiteRequests";
import type { ClientSiteRequest, ClientSiteRequestChangeSource } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestWorkPeriod } from "@/utils/clientSiteRequests";
import { formatClientSiteRequestDayLabel, shiftCalendarDate } from "@/utils/clientSiteRequestCalendar";
import type { ScSchedule } from "@/utils/scSchedules";
import {
  formatClientSiteRequestHeadcount,
  formatScScheduleHeadcount,
  formatScScheduleWorkLogSummary,
  formatScScheduleWorkerCopyText,
  getScScheduleWorkerDetails,
} from "@/utils/scSchedules";
import { isScPersonalVacationSchedule } from "@/utils/scScheduleVacation";
import type { ClientMasterLike } from "@/utils/clientMaster";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import { sendScScheduleNotifyOne } from "@/utils/notificationApi";
import { ClientSiteRequestAlimtalkSendModal } from "@/components/ClientSiteRequestAlimtalkSendModal";
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
  workLog: "\uADFC\uBB34\uAE30\uB85D",
  workerName: "\uC2DC\uACF5\uC790\uBA85",
  workerPhone: "\uC804\uD654\uBC88\uD638",
  workerVehicle: "\uCC28\uB7C9\uBC88\uD638",
  workerCopied: "\uBCF5\uC0AC\uB428",
  workerCopyHint: "\uC2DC\uACF5\uC790 \uC815\uBCF4 \uBCF5\uC0AC",
  registerSchedule: "\uC77C\uC815 \uC811\uC218",
  changeSchedule: "\uC77C\uC815 \uBCC0\uACBD \uC694\uCCAD",
  alimtalkSend: "\uC54C\uB9BC\uD1A1 \uBCF4\uB0B4\uAE30",
  alimtalkSending: "\uBC1C\uC1A1 \uC911...",
  alimtalkSent: "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC5D0\uAC8C \uC54C\uB9BC\uD1A1\uC744 \uBCF4\uB0C4\uC2B5\uB2C8\uB2E4.",
  alimtalkFailed: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  alimtalkError: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
  alimtalkNotConfigured: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  alimtalkNoClientPhone: "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uC804\uD654\uBC88\uD638\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  alimtalkNoWorkers: "\uBC30\uC815\uB41C \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC5B4 \uC54C\uB9BC\uD1A1\uC744 \uBCF4\uB098\uC904 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

type ClientSiteRequestCalendarDayDrawerProps = {
  date: string;
  requests: ClientSiteRequest[];
  scSchedules: ScSchedule[];
  workers?: WorkerMasterLike[];
  clients?: ClientMasterLike[];
  selectedRequestId: string;
  selectedScScheduleId?: string;
  onClose: () => void;
  onShiftDate: (date: string) => void;
  onSelectRequest: (requestId: string, date?: string) => void;
  onSelectScSchedule?: (scheduleId: string, date?: string) => void;
  onRegisterDate?: (date: string) => void;
  onChangeRequest?: (source: ClientSiteRequestChangeSource) => void;
  elevated?: boolean;
  scAlimtalkEnabled?: boolean;
};

function statusTone(request: ClientSiteRequest) {
  return clientSiteRequestPublicStatusTone(request);
}

export function ClientSiteRequestCalendarDayDrawer({
  date,
  requests,
  scSchedules,
  workers = [],
  clients = [],
  selectedRequestId,
  selectedScScheduleId = "",
  onClose,
  onShiftDate,
  onSelectRequest,
  onSelectScSchedule,
  onRegisterDate,
  onChangeRequest,
  elevated = false,
  scAlimtalkEnabled = false,
}: ClientSiteRequestCalendarDayDrawerProps) {
  const { onPointerDown, onPointerUp, isTouchDevice } = useBackdropPointerDismiss(Boolean(date), onClose);
  const { guardedClose } = useModalDismissGuard(Boolean(date));
  const closeDrawer = () => guardedClose(onClose);
  const [copiedWorkerKey, setCopiedWorkerKey] = useState("");
  const [sendingAlimtalkId, setSendingAlimtalkId] = useState("");
  const [alimtalkMessages, setAlimtalkMessages] = useState<Record<string, string>>({});
  const [alimtalkTargetSchedule, setAlimtalkTargetSchedule] = useState<ScSchedule | null>(null);
  const drawerBodyRef = useRef<HTMLDivElement>(null);

  const onDrawerBodyWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const el = drawerBodyRef.current;
    if (!el) return;
    el.scrollTop += event.deltaY;
  }, []);

  const copyWorkerText = useCallback(async (workerKey: string, worker: Parameters<typeof formatScScheduleWorkerCopyText>[0]) => {
    const text = formatScScheduleWorkerCopyText(worker);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopiedWorkerKey(workerKey);
    window.setTimeout(() => {
      setCopiedWorkerKey((current) => (current === workerKey ? "" : current));
    }, 1500);
  }, []);

  const handleSendAlimtalk = useCallback((schedule: ScSchedule) => {
    const scheduleId = String(schedule.id || "").trim();
    if (!scheduleId || sendingAlimtalkId) return;
    setAlimtalkTargetSchedule(schedule);
  }, [sendingAlimtalkId]);

  const handleConfirmAlimtalk = useCallback(async (phones: string[]) => {
    const schedule = alimtalkTargetSchedule;
    const scheduleId = String(schedule?.id || "").trim();
    if (!scheduleId || !phones.length) return;

    setSendingAlimtalkId(scheduleId);
    setAlimtalkMessages((current) => ({ ...current, [scheduleId]: "" }));
    try {
      const result = await sendScScheduleNotifyOne(scheduleId, {
        skipSync: true,
        recipientTypes: ["client"],
        phones,
      });

      if (result.skipped && result.reason === "not-configured") {
        setAlimtalkMessages((current) => ({ ...current, [scheduleId]: L.alimtalkNotConfigured }));
        return;
      }
      if (result.skippedNoParticipants) {
        setAlimtalkMessages((current) => ({ ...current, [scheduleId]: L.alimtalkNoWorkers }));
        return;
      }
      if (result.error && !result.skipped) {
        setAlimtalkMessages((current) => ({ ...current, [scheduleId]: result.error || L.alimtalkFailed }));
        return;
      }

      const clientResults = (result.results || []).filter((row) => row.recipientType === "client");
      if (!clientResults.some((row) => row.ok) && clientResults.some((row) => row.reason === "no-client-phone")) {
        setAlimtalkMessages((current) => ({ ...current, [scheduleId]: L.alimtalkNoClientPhone }));
        return;
      }
      if ((result.sentCount || 0) > 0) {
        setAlimtalkMessages((current) => ({ ...current, [scheduleId]: L.alimtalkSent }));
        setAlimtalkTargetSchedule(null);
        return;
      }

      setAlimtalkMessages((current) => ({
        ...current,
        [scheduleId]: L.alimtalkFailed,
      }));
    } catch {
      setAlimtalkMessages((current) => ({ ...current, [scheduleId]: L.alimtalkError }));
    } finally {
      setSendingAlimtalkId("");
    }
  }, [alimtalkTargetSchedule]);

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
        className="erp-csr-cal-drawer erp-csr-cal-drawer--with-foot"
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

        <div
          ref={drawerBodyRef}
          className="erp-csr-cal-drawer-body"
          onWheel={onDrawerBodyWheel}
        >
          {totalCount === 0 ? (
            <p className="erp-calendar-side-empty">{L.empty}</p>
          ) : (
            <div className="erp-csr-cal-drawer-sections">
              {scSchedules.length > 0 ? (
                <section className="erp-csr-cal-drawer-section">
                  <h3 className="erp-csr-cal-drawer-section-title">{L.sectionSc}</h3>
                  <ul className="erp-csr-cal-drawer-list">
                    {scSchedules.map((schedule) => {
                      const scheduleWorkers = getScScheduleWorkerDetails(schedule, workers);
                      const scheduleId = String(schedule.id || "");
                      const alimtalkMessage = alimtalkMessages[scheduleId] || "";
                      const workLogSummary = formatScScheduleWorkLogSummary(schedule);
                      return (
                      <li key={`sc-${schedule.id}`}>
                        <div
                          className={[
                            "erp-csr-cal-drawer-card is-sc-schedule",
                            selectedScScheduleId === schedule.id ? "is-active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div className="erp-csr-cal-drawer-card-title-row">
                            <p className="erp-csr-cal-drawer-card-title">{schedule.workType}</p>
                            {scAlimtalkEnabled && !isScPersonalVacationSchedule(schedule) ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="erp-csr-cal-drawer-alimtalk-btn h-8 shrink-0 rounded-lg px-2.5 text-xs"
                                disabled={Boolean(sendingAlimtalkId)}
                                onClick={() => handleSendAlimtalk(schedule)}
                              >
                                <Smartphone size={13} className="mr-1" />
                                {sendingAlimtalkId === scheduleId ? L.alimtalkSending : L.alimtalkSend}
                              </Button>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="erp-csr-cal-drawer-card-select is-clickable"
                            onClick={() => {
                              onSelectScSchedule?.(schedule.id, date);
                              if (schedule.id !== selectedScScheduleId) {
                                onSelectRequest("", date);
                              }
                            }}
                          >
                            <span className="erp-csr-cal-drawer-dot is-sc-schedule" aria-hidden="true" />
                            <div className="erp-csr-cal-drawer-card-main">
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
                              </div>
                            </div>
                          </button>
                          {alimtalkMessage ? (
                            <p
                              className={`erp-csr-cal-drawer-alimtalk-msg${
                                alimtalkMessage === L.alimtalkSent ? " is-success" : " is-error"
                              }`}
                            >
                              {alimtalkMessage}
                            </p>
                          ) : null}
                            {scheduleWorkers.length ? (
                                <div className="erp-csr-cal-drawer-sc-workers">
                                  {scheduleWorkers.map((worker) => {
                                    const workerKey = `${schedule.id}-${worker.participantName}`;
                                    const copied = copiedWorkerKey === workerKey;
                                    return (
                                    <div
                                      key={workerKey}
                                      className={`erp-csr-cal-drawer-sc-worker${copied ? " is-copied" : ""}`}
                                    >
                                      <button
                                        type="button"
                                        className="erp-csr-cal-drawer-sc-worker-copy"
                                        title={copied ? L.workerCopied : L.workerCopyHint}
                                        aria-label={copied ? L.workerCopied : L.workerCopyHint}
                                        onClick={() => void copyWorkerText(workerKey, worker)}
                                      >
                                        {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2.25} />}
                                      </button>
                                      <div className="erp-csr-cal-drawer-sc-worker-body">
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
                                    </div>
                                  );})}
                                </div>
                              ) : schedule.participantNames?.length ? (
                                <p className="erp-csr-cal-drawer-card-meta erp-csr-cal-drawer-sc-fallback-names">
                                  {schedule.participantNames.join(", ")}
                                </p>
                              ) : null}
                        </div>
                      </li>
                    );})}
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
                                {formatClientSiteRequestHeadcount(request, scSchedules, date)}
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
      <ClientSiteRequestAlimtalkSendModal
        open={Boolean(alimtalkTargetSchedule)}
        schedule={alimtalkTargetSchedule}
        clients={clients}
        sending={Boolean(sendingAlimtalkId)}
        onClose={() => {
          if (sendingAlimtalkId) return;
          setAlimtalkTargetSchedule(null);
        }}
        onConfirm={(phones) => void handleConfirmAlimtalk(phones)}
      />
    </div>,
    document.body,
  );
}
