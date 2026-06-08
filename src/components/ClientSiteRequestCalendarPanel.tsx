import React, { useCallback, useEffect, useState } from "react";
import { ClientSiteRequestCalendar } from "@/components/ClientSiteRequestCalendar";
import { getCurrentMonthKey, filterClientSiteRequestsForCalendarDay } from "@/utils/clientSiteRequestCalendar";
import {
  isClientSiteRequestVisibleOnPublicCalendar,
  listClientSiteRequests,
  requestCoversWorkDate,
  type ClientSiteRequest,
} from "@/utils/clientSiteRequests";
import { fetchStaffScSchedules, type ScSchedule } from "@/utils/scSchedules";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import type { ClientMasterLike } from "@/utils/clientMaster";

const L = {
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  loadFail: "\uC811\uC218 \uB0B4\uC5ED\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  empty: "\uC774\uB2EC \uC811\uC218 \uB0B4\uC5ED \uB610\uB294 SC \uD655\uC815 \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

type ClientSiteRequestCalendarPanelProps = {
  clientId: number | string;
  active?: boolean;
  workers?: WorkerMasterLike[];
  clients?: ClientMasterLike[];
  drawerElevated?: boolean;
  fullscreen?: boolean;
  className?: string;
  monthKey?: string;
  onMonthKeyChange?: (monthKey: string) => void;
  scAlimtalkEnabled?: boolean;
};

export function ClientSiteRequestCalendarPanel({
  clientId,
  active = true,
  workers = [],
  clients = [],
  drawerElevated = false,
  fullscreen = true,
  className = "",
  monthKey: controlledMonthKey,
  onMonthKeyChange,
  scAlimtalkEnabled = false,
}: ClientSiteRequestCalendarPanelProps) {
  const [internalMonthKey, setInternalMonthKey] = useState(getCurrentMonthKey);
  const monthKey = controlledMonthKey ?? internalMonthKey;
  const setMonthKey = onMonthKeyChange ?? setInternalMonthKey;
  const [requests, setRequests] = useState<ClientSiteRequest[]>([]);
  const [scSchedules, setScSchedules] = useState<ScSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [selectedScScheduleId, setSelectedScScheduleId] = useState("");

  const loadCalendarData = useCallback(async () => {
    if (!active || clientId === "" || clientId == null) return;
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
  }, [active, clientId, monthKey]);

  useEffect(() => {
    if (!active) return;
    if (controlledMonthKey == null) {
      setInternalMonthKey(getCurrentMonthKey());
    }
    setSelectedDate("");
    setSelectedRequestId("");
    setSelectedScScheduleId("");
  }, [active, clientId, controlledMonthKey]);

  useEffect(() => {
    if (!active) return;
    void loadCalendarData();
  }, [active, loadCalendarData]);

  const hasCalendarData =
    requests.some((row) => isClientSiteRequestVisibleOnPublicCalendar(row)) || scSchedules.length > 0;

  return (
    <div className={`erp-client-request-calendar-panel flex min-h-0 flex-1 flex-col ${className}`.trim()}>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{L.loading}</p>
      ) : error ? (
        <p className="py-8 text-center text-sm font-semibold text-red-600">{error}</p>
      ) : (
        <>
          {!hasCalendarData ? (
            <p className="border-b border-slate-200 px-4 py-3 text-center text-sm text-slate-500">{L.empty}</p>
          ) : null}
          <ClientSiteRequestCalendar
            fullscreen={fullscreen}
            requests={requests}
            scSchedules={scSchedules}
            workers={workers}
            clients={clients}
            monthKey={monthKey}
            onMonthKeyChange={setMonthKey}
            selectedDate={selectedDate}
            drawerElevated={drawerElevated}
            scAlimtalkEnabled={scAlimtalkEnabled}
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
            selectedScScheduleId={selectedScScheduleId}
            onSelectScSchedule={setSelectedScScheduleId}
          />
        </>
      )}
    </div>
  );
}
