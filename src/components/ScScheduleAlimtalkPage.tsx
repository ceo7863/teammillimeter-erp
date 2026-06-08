import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  previewScScheduleNotify,
  sendScScheduleNotifyOne,
  type ScScheduleNotifyOneResult,
  type ScScheduleNotifyPreview,
} from "@/utils/notificationApi";

const L = {
  pageTitle: "\uC54C\uB9BC\uD1A1",
  pageDesc: "SC \uB0B4\uC77C \uC2DC\uACF5 \uC77C\uC815 \uBBF8\uB9AC\uBCF4\uAE30 \uBC0F \uAC1C\uBCC4 \uBC1C\uC1A1",
  sectionTitle: "SC \uB0B4\uC77C \uC77C\uC815",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  loadError: "\uBBF8\uB9AC\uBCF4\uAE30\uB97C \uBD88\uB7EC\uC624\uC838 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  empty: "\uB0B4\uC77C \uBC1C\uC1A1 \uB300\uC0C1 SC \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  summary: (date: string, count: number, notify: number, missing: number) =>
    `\uB300\uC0C1 \uC77C\uC790 ${date} \u00B7 \uC77C\uC815 ${count}\uAC74 \u00B7 \uBC1C\uC1A1 \uAC00\uB2A5 ${notify}\uBA85 \u00B7 \uC804\uD654 \uC5C6\uC74C ${missing}\uBA85`,
  client: "\uAC70\uB798\uCC98",
  worker: "\uC2DC\uACF5",
  manager: (name: string) => `\uB2F4\uB2F9 ${name}`,
  noManager: "\uB2F4\uB2F9 \uC5C6\uC74C",
  workers: (names: string) => `\uC2DC\uACF5 ${names}`,
  noWorkers: "\uC2DC\uACF5 \uC5C6\uC74C",
  noPhone: "\uC804\uD654\uC5C6\uC74C",
  link: "\uACF5\uC720 \uB9C1\uD06C",
  linkFailed: "\uB9C1\uD06C \uC0DD\uC131 \uC2E4\uD328",
  recipients: "\uBC1C\uC1A1 \uB300\uC0C1",
  send: "\uC774 \uC77C\uC815 \uBC1C\uC1A1",
  sending: "\uBC1C\uC1A1 \uC911...",
  sendConfirm: (label: string) =>
    `${label} \uC77C\uC815 \uC54C\uB9BC\uC744 \uC120\uD0DD\uD55C \uC218\uC2E0\uC790\uC5D0\uAC8C \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?`,
  sendNoneSelected: "\uBC1C\uC1A1\uD560 \uC218\uC2E0\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  sendError: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  sendResult: (sent: number, failed: number) => `${sent}\uAC74 \uBC1C\uC1A1 / ${failed}\uAC74 \uC2E4\uD328`,
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
};

type ScheduleGroup = {
  scheduleId: string;
  clientName: string;
  projectName: string;
  shareUrl: string;
  shareError: string | null;
  variables: Record<string, string>;
  rows: ScScheduleNotifyPreview["rows"];
};

function buildScheduleGroups(preview: ScScheduleNotifyPreview): ScheduleGroup[] {
  const linkMap = new Map((preview.scheduleLinks || []).map((link) => [link.scheduleId, link]));
  const rowMap = new Map<string, ScScheduleNotifyPreview["rows"]>();
  for (const row of preview.rows) {
    const list = rowMap.get(row.scheduleId) || [];
    list.push(row);
    rowMap.set(row.scheduleId, list);
  }

  const scheduleIds = new Set<string>([
    ...(preview.scheduleLinks || []).map((link) => link.scheduleId),
    ...preview.rows.map((row) => row.scheduleId),
  ]);

  return [...scheduleIds].map((scheduleId) => {
    const link = linkMap.get(scheduleId);
    const rows = rowMap.get(scheduleId) || [];
    const sample = rows[0];
    return {
      scheduleId,
      clientName: link?.clientName || sample?.variables?.client || "",
      projectName: link?.projectName || sample?.variables?.site || "",
      shareUrl: link?.shareUrl || sample?.shareUrl || "",
      shareError: link?.error || null,
      variables: sample?.variables || {},
      rows,
    };
  });
}

function recipientKey(
  scheduleId: string,
  phone: string | null,
  participantName: string,
  recipientType?: string,
) {
  return `${scheduleId}:${recipientType || "x"}:${phone || participantName}`;
}

function buildDefaultSelection(preview: ScScheduleNotifyPreview) {
  const next: Record<string, boolean> = {};
  for (const row of preview.rows) {
    if (!row.phone) continue;
    next[recipientKey(row.scheduleId, row.phone, row.participantName, row.recipientType)] = true;
  }
  return next;
}

export function ScScheduleAlimtalkPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ScScheduleNotifyPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sendingScheduleId, setSendingScheduleId] = useState("");
  const [sendResults, setSendResults] = useState<Record<string, ScScheduleNotifyOneResult>>({});

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    setSendResults({});
    try {
      const result = await previewScScheduleNotify();
      setPreview(result);
      setSelected(buildDefaultSelection(result));
    } catch (loadError) {
      console.error(loadError);
      setPreview(null);
      setSelected({});
      setError(L.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const groups = useMemo(() => (preview ? buildScheduleGroups(preview) : []), [preview]);

  const toggleRecipient = (key: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSendSchedule = async (group: ScheduleGroup) => {
    if (sendingScheduleId) return;
    const phones = group.rows
      .filter((row) => {
        if (!row.phone) return false;
        const key = recipientKey(row.scheduleId, row.phone, row.participantName, row.recipientType);
        return selected[key];
      })
      .map((row) => row.phone as string);
    if (!phones.length) {
      window.alert(L.sendNoneSelected);
      return;
    }
    const label = group.clientName || group.projectName || group.scheduleId;
    if (!window.confirm(L.sendConfirm(label))) return;

    setSendingScheduleId(group.scheduleId);
    setError("");
    try {
      const result = await sendScScheduleNotifyOne(group.scheduleId, { skipSync: true, phones });
      setSendResults((prev) => ({ ...prev, [group.scheduleId]: result }));
      if (!result.ok && result.error && !result.skipped) {
        setError(result.error);
      }
    } catch (sendError) {
      console.error(sendError);
      setError(L.sendError);
    } finally {
      setSendingScheduleId("");
    }
  };

  return (
    <div className="erp-page">
      <div className="mb-4">
        <h1 className="erp-text-page-title flex items-center gap-2 text-slate-900">
          <Smartphone className="h-6 w-6" />
          {L.pageTitle}
        </h1>
        <p className="erp-text-caption mt-1 text-slate-500">{L.pageDesc}</p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="erp-text-body font-bold text-slate-900">{L.sectionTitle}</h2>
              {preview ? (
                <p className="erp-text-caption mt-1 text-slate-500">
                  {L.summary(
                    preview.targetDate,
                    preview.scheduleCount,
                    preview.notifyCount,
                    preview.missingPhoneCount,
                  )}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => void loadPreview()}
              disabled={loading}
            >
              <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
              {L.refresh}
            </Button>
          </div>

          {loading && !preview ? <p className="text-sm text-slate-500">{L.loading}</p> : null}
          {error ? <p className="mb-3 text-sm font-semibold text-red-700">{error}</p> : null}

          {!loading && preview && groups.length === 0 ? (
            <p className="text-sm text-slate-500">{L.empty}</p>
          ) : null}

          <div className="space-y-4">
            {groups.map((group) => {
              const manager =
                group.variables.clientManager && group.variables.clientManager !== "-"
                  ? L.manager(group.variables.clientManager)
                  : L.noManager;
              const workers = group.variables.workers ? L.workers(group.variables.workers) : L.noWorkers;
              const sendResult = sendResults[group.scheduleId];
              const isSending = sendingScheduleId === group.scheduleId;

              return (
                <section key={group.scheduleId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {group.clientName || "-"}
                        {group.projectName ? ` \u00B7 ${group.projectName}` : ""}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        {[manager, group.variables.dateTime, workers].filter(Boolean).join(" \u00B7 ")}
                      </p>
                      {group.shareUrl ? (
                        <p className="mt-2 text-xs">
                          {L.link}:{" "}
                          <a
                            href={group.shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-blue-700 underline hover:text-blue-900"
                          >
                            {group.shareUrl}
                          </a>
                        </p>
                      ) : group.shareError ? (
                        <p className="mt-2 text-xs text-red-600">
                          {L.linkFailed}: {group.shareError}
                        </p>
                      ) : null}
                      {sendResult ? (
                        <p
                          className={`mt-2 text-xs font-semibold ${sendResult.ok ? "text-emerald-700" : "text-red-700"}`}
                        >
                          {L.sendResult(sendResult.sentCount ?? 0, sendResult.failedCount ?? 0)}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl"
                      disabled={Boolean(sendingScheduleId)}
                      onClick={() => void handleSendSchedule(group)}
                    >
                      <Send size={14} className="mr-1" />
                      {isSending ? L.sending : L.send}
                    </Button>
                  </div>

                  {group.rows.length ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold text-slate-700">{L.recipients}</p>
                      <ul className="space-y-2">
                        {group.rows.map((row) => {
                          const role = row.recipientType === "client" ? L.client : L.worker;
                          const key = recipientKey(
                            row.scheduleId,
                            row.phone,
                            row.participantName,
                            row.recipientType,
                          );
                          const contact =
                            row.recipientType === "client"
                              ? row.participantName || row.variables.client
                              : row.participantName;
                          const disabled = !row.phone;
                          return (
                            <li key={key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                              <input
                                type="checkbox"
                                checked={Boolean(selected[key])}
                                disabled={disabled}
                                onChange={(event) => toggleRecipient(key, event.target.checked)}
                                aria-label={`${role} ${contact}`}
                              />
                              <span className="font-medium text-slate-800">
                                [{role}] {contact}
                              </span>
                              <span className="text-slate-500">{row.phone || L.noPhone}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
