import React, { useCallback, useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientSiteRequestCalendar } from "@/components/ClientSiteRequestCalendar";
import { getCurrentMonthKey } from "@/utils/clientSiteRequestCalendar";
import {
  isClientSiteRequestVisibleOnPublicCalendar,
  listClientSiteRequests,
  openClientSiteRequestLink,
  requestCoversWorkDate,
  resolveClientSiteRequestLinkUrl,
  type ClientSiteRequest,
  type ClientSiteRequestLink,
} from "@/utils/clientSiteRequests";

const L = {
  title: "\uC811\uC218 \uCE98\uB9B0\uB354",
  closeAria: "\uC811\uC218 \uCE98\uB9B0\uB354 \uB2EB\uAE30",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  loadFail: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  empty: "\uC811\uC218 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  openLink: "\uACF5\uAC1C \uD398\uC774\uC785 \uC5F4\uAE30",
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedRequestId, setSelectedRequestId] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listClientSiteRequests({ status: "all", clientId });
      setRequests(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : L.loadFail);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!open) return;
    setMonthKey(getCurrentMonthKey());
    setSelectedDate(new Date().toISOString().slice(0, 10));
    setSelectedRequestId("");
    void loadRequests();
  }, [open, clientId, loadRequests]);

  if (!open) return null;

  const publicUrl = link ? resolveClientSiteRequestLinkUrl(link) : "";

  return (
    <div className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated" onClick={onClose}>
      <div
        className="erp-ledger-modal"
        style={{ width: "min(100%, 64rem)" }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-site-request-calendar-title"
      >
        <div className="flex items-start justify-between gap-3">
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

        <div className="mt-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.loading}</p>
          ) : error ? (
            <p className="py-8 text-center text-sm font-semibold text-red-600">{error}</p>
          ) : !requests.length ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.empty}</p>
          ) : (
            <ClientSiteRequestCalendar
              requests={requests}
              monthKey={monthKey}
              onMonthKeyChange={setMonthKey}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                const dayRequests = requests.filter(
                  (row) =>
                    isClientSiteRequestVisibleOnPublicCalendar(row) && requestCoversWorkDate(row, date),
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
}
