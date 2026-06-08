import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientSiteRequestCalendar } from "@/components/ClientSiteRequestCalendar";
import { getCurrentMonthKey, filterClientSiteRequestsForCalendarDay } from "@/utils/clientSiteRequestCalendar";
import {
  isClientSiteRequestVisibleOnPublicCalendar,
  listClientSiteRequests,
  openClientSiteRequestLink,
  requestCoversWorkDate,
  resolveClientSiteRequestLinkUrl,
  type ClientSiteRequest,
  type ClientSiteRequestLink,
} from "@/utils/clientSiteRequests";
import { fetchStaffScSchedules, type ScSchedule } from "@/utils/scSchedules";
import { useBackdropCloseGuard } from "@/utils/modalBackdrop";

const L = {
  title: "\uC811\uC218 \uCE98\uB9B0\uB354",
  closeAria: "\uC811\uC218 \uCE98\uB9B0\uB354 \uB2EB\uAE30",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  loadFail: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  empty: "\uC774\uB2EC \uC811\uC218 \uB0B4\uC5ED \uB610\uB294 SC \uD655\uC815 \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  openLink: "\uACF5\uAC1C \uD398\uC774\uC815 \uC5F4\uAE30",
};

type ClientSiteRequestCalendarModalProps = {
  open: boolean;
  clientId: number | string;
  clientName: string;
  link: ClientSiteRequestLink | null;
  onClose: () => void;
};

export function ClientSiteRequestCalendarModal({
  open,
  clientId,
  clientName,
  link,
  onClose,
}: ClientSiteRequestCalendarModalProps) {
  const [requests, setRequests] = useState<ClientSiteRequest[]>([]);
  const [scSchedules, setScSchedules] = useState<ScSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const handleBackdropClose = useBackdropCloseGuard(open);

  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, schedules] = await Promise.all([
        listClientSiteRequests({ status: "all", clientId }),
        fetchStaffScSchedules(clientId, monthKey),
      ]);
      setRequests(rows);
      setScSchedules(schedules);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : L.loadFail);
      setRequests([]);
      setScSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, monthKey]);

  useEffect(() => {
    if (!open) return;
    setMonthKey(getCurrentMonthKey());
    setSelectedDate("");
    setSelectedRequestId("");
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return;
    void loadCalendarData();
  }, [open, loadCalendarData]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const publicUrl = link ? resolveClientSiteRequestLinkUrl(link) : "";
  const hasCalendarData =
    requests.some((row) => isClientSiteRequestVisibleOnPublicCalendar(row)) || scSchedules.length > 0;

  const modal = (
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated erp-client-request-calendar-modal-backdrop"
      onClick={(event) => handleBackdropClose(event, onClose)}
    >
      <div
        className="erp-ledger-modal erp-client-request-calendar-modal"
        style={{ width: "min(100%, 48rem)", padding: 0 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-site-request-calendar-title"
      >
        <div className="erp-client-request-calendar-modal__head flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="client-site-request-calendar-title" className="text-base font-bold text-slate-900 md:text-lg">
              {L.title}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-700">{clientName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {publicUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl"
                noFeedback
                onClick={() => openClientSiteRequestLink(publicUrl)}
              >
                <Link2 size={14} className="mr-1" />
                {L.openLink}
              </Button>
            ) : null}
            <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label={L.closeAria}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="erp-client-request-calendar-modal__body">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.loading}</p>
          ) : error ? (
            <p className="py-8 text-center text-sm font-semibold text-red-600">{error}</p>
          ) : !hasCalendarData ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.empty}</p>
          ) : (
            <ClientSiteRequestCalendar
              requests={requests}
              scSchedules={scSchedules}
              monthKey={monthKey}
              onMonthKeyChange={setMonthKey}
              selectedDate={selectedDate}
              drawerElevated
              onSelectDate={(date) => {
                setSelectedDate(date);
                const scOnDate = scSchedules.filter((row) => String(row.workDate || "").slice(0, 10) === date);
                const dayRequests = filterClientSiteRequestsForCalendarDay(
                  requests.filter(
                    (row) =>
                      isClientSiteRequestVisibleOnPublicCalendar(row) && requestCoversWorkDate(row, date),
                  ),
                  date,
                  scOnDate,
                );
                if (dayRequests.length === 1) {
                  setSelectedRequestId(dayRequests[0].id);
                } else if (selectedRequestId && !dayRequests.some((row) => row.id === selectedRequestId)) {
                  setSelectedRequestId(dayRequests[0]?.id || "");
                }
              }}
              selectedRequestId={selectedRequestId}
              onSelectRequest={setSelectedRequestId}
            />
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
