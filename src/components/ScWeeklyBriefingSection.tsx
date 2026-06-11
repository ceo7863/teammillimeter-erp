import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScAlimtalkClientContactPickerModal } from "@/components/ScAlimtalkClientContactPickerModal";
import type { ClientMasterLike } from "@/utils/clientMaster";
import { todayISO } from "@/utils/companyLedger";
import { weekRangeISO } from "@/utils/bankTransactionPagePeriod";
import { addDaysISO } from "@/utils/receivables";
import {
  previewScWeeklyBriefing,
  sendScWeeklyBriefingGroup,
  type ScWeeklyBriefingPreview,
  type ScWeeklyBriefingSendResult,
} from "@/utils/notificationApi";
import {
  isScScheduleAlimtalkClientContactInPool,
  normalizeScScheduleAlimtalkClientKey,
  resolveScScheduleAlimtalkClientContactSelected,
  saveScScheduleAlimtalkClientContactPref,
  saveScScheduleAlimtalkClientContactPrefs,
  scScheduleAlimtalkContactPrefKey,
} from "@/utils/scScheduleAlimtalkRecipientPrefs";

const L = {
  sectionTitle: "\uC774\uBC88 \uC8FC \uD604\uC7A5 \uBE0C\uB9AC\uD551",
  sectionDesc: "\uC774\uBC88 \uC8FC SC \uC77C\uC815\uC744 \uAC70\uB798\uCC98\uBCC4\uB85C \uBBF8\uB9AC\uBCF4\uAE30 \uBC0F \uC54C\uB9BC\uD1A1 \uBC1C\uC1A1",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  loadError: "\uC8FC\uAC04 \uBE0C\uB9AC\uD551 \uBBF8\uB9AC\uBCF4\uAE30\uB97C \uBD88\uB7EC\uC624\uC838 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  empty: "\uC774\uBC88 \uC8FC \uBC1C\uC1A1 \uB300\uC0C1 SC \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  summary: (label: string, clients: number, sites: number, schedules: number, notify: number, missing: number) =>
    `${label} \u00B7 \uAC70\uB798\uCC98 ${clients}\uAC74 \u00B7 \uD604\uC7A5 ${sites}\uAC74 \u00B7 \uC77C\uC815 ${schedules}\uAC74 \u00B7 \uBC1C\uC1A1 \uAC00\uB2A5 ${notify}\uBA85 \u00B7 \uC804\uD654 \uC5C6\uC74C ${missing}\uBA85`,
  thisWeek: "\uC774\uBC88 \uC8FC",
  prevWeek: "\uC774\uC804 \uC8FC",
  nextWeek: "\uB2E4\uC74C \uC8FC",
  client: "\uAC70\uB798\uCC98",
  site: "\uD604\uC7A5",
  dates: "\uC77C\uC790",
  headcounts: "\uC778\uC6D0",
  manager: (name: string) => `\uB2F4\uB2F9 ${name}`,
  noManager: "\uB2F4\uB2F9 \uC5C6\uC74C",
  noPhone: "\uC804\uD654\uC5C6\uC74C",
  recipients: "\uBC1C\uC1A1 \uB300\uC0C1",
  send: "\uC774 \uAC70\uB798\uCC98 \uBC1C\uC1A1",
  sending: "\uBC1C\uC1A1 \uC911...",
  sendConfirm: (label: string) =>
    `${label} \uC8FC\uAC04 \uBE0C\uB9AC\uD551 \uC54C\uB9BC\uC744 \uC120\uD0DD\uD55C \uC218\uC2E0\uC790\uC5D0\uAC8C \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?`,
  sendNoneSelected: "\uBC1C\uC1A1\uD560 \uC218\uC2E0\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  sendError: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  sendResult: (sent: number, failed: number) => `${sent}\uAC74 \uBC1C\uC1A1 / ${failed}\uAC74 \uC2E4\uD328`,
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
  selectAll: "\uC804\uCCB4 \uC120\uD0DD",
  deselectAll: "\uC804\uCCB4 \uD574\uC81C",
  clientContacts: "\uC5C5\uCCB4\uB2F4\uB2F9",
  pickerEmpty: "\uC5C5\uCCB4\uB2F4\uB2F9\uC5D0\uC11C \uBC1C\uC1A1 \uB300\uC0C1\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  templateMissing:
    "\uC8FC\uAC04 \uBE0C\uB9AC\uD551 \uC54C\uB9BC\uD1A1 \uD15C\uD774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. (ALIMTALK_WEEKLY_BRIEFING_TEMPLATE)",
  noSchedules:
    "\uC774\uBC88 \uC8FC SC \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uD604\uC7A5\uC811\uC218 \u2192 SC \uB3D9\uAE30\uD654\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
  noPhones:
    "\uC77C\uC815\uC740 \uC788\uC9C0\uB9CC \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uC804\uD654\uBC88\uD638\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC70\uB798\uCC98 \uBAA9\uB85D\uC5D0\uC11C \uC5F0\uB77D\uCC98\uB97C \uB4F1\uB85D\uD574 \uC8FC\uC138\uC694.",
  siteCount: (count: number) => `\uD604\uC7A5 ${count}\uAC74`,
};

function recipientKey(groupKey: string, phone: string | null, participantName: string) {
  return `${groupKey}:client:${phone || participantName}`;
}

type BriefingGroup = ScWeeklyBriefingPreview["groups"][number];
type BriefingRecipientRow = BriefingGroup["recipientRows"][number];

function groupClientKey(group: BriefingGroup) {
  return normalizeScScheduleAlimtalkClientKey(group.clientId, group.clientName);
}

function rowContactKey(row: BriefingRecipientRow) {
  return scScheduleAlimtalkContactPrefKey(row.contactId ?? undefined, row.phone, row.participantName);
}

function isBriefingRecipientInPool(group: BriefingGroup, row: BriefingRecipientRow) {
  if (!row.phone) return false;
  return isScScheduleAlimtalkClientContactInPool(groupClientKey(group), rowContactKey(row));
}

function visibleBriefingRecipients(group: BriefingGroup) {
  return group.recipientRows.filter((row) => isBriefingRecipientInPool(group, row));
}

function buildGroupSelectionState(group: BriefingGroup) {
  const next: Record<string, boolean> = {};
  const clientKey = groupClientKey(group);
  for (const row of visibleBriefingRecipients(group)) {
    const key = recipientKey(group.groupKey, row.phone, row.participantName);
    next[key] = resolveScScheduleAlimtalkClientContactSelected(clientKey, rowContactKey(row), true);
  }
  return next;
}

function buildInitialSelection(preview: ScWeeklyBriefingPreview) {
  const next: Record<string, boolean> = {};
  for (const group of preview.groups) {
    Object.assign(next, buildGroupSelectionState(group));
  }
  return next;
}

type ScWeeklyBriefingSectionProps = {
  clients?: ClientMasterLike[];
};

export function ScWeeklyBriefingSection({ clients = [] }: ScWeeklyBriefingSectionProps) {
  const initialWeek = weekRangeISO(todayISO()).startDate;
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ScWeeklyBriefingPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sendingGroupKey, setSendingGroupKey] = useState("");
  const [sendResults, setSendResults] = useState<Record<string, ScWeeklyBriefingSendResult>>({});
  const [contactPicker, setContactPicker] = useState<{
    clientId?: string | number | null;
    clientName: string;
    groupKey: string;
  } | null>(null);

  const currentWeekRange = useMemo(() => weekRangeISO(weekStart), [weekStart]);
  const isThisWeek = currentWeekRange.startDate === weekRangeISO(todayISO()).startDate;

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    setSendResults({});
    try {
      const result = await previewScWeeklyBriefing(weekStart, { skipSync: true });
      setPreview(result);
      setSelected(buildInitialSelection(result));
    } catch (loadError) {
      console.error(loadError);
      setPreview(null);
      setSelected({});
      setError(L.loadError);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const toggleRecipient = (
    group: ScWeeklyBriefingPreview["groups"][number],
    row: ScWeeklyBriefingPreview["groups"][number]["recipientRows"][number],
    checked: boolean,
  ) => {
    const key = recipientKey(group.groupKey, row.phone, row.participantName);
    setSelected((prev) => ({ ...prev, [key]: checked }));
    const clientKey = normalizeScScheduleAlimtalkClientKey(group.clientId, group.clientName);
    const contactKey = scScheduleAlimtalkContactPrefKey(undefined, row.phone, row.participantName);
    saveScScheduleAlimtalkClientContactPref(clientKey, contactKey, checked);
  };

  const setGroupSelection = (
    group: BriefingGroup,
    checked: boolean,
  ) => {
    setSelected((prev) => {
      const next = { ...prev };
      const clientKey = groupClientKey(group);
      const entries: Array<{ contactKey: string; selected: boolean }> = [];
      for (const row of visibleBriefingRecipients(group)) {
        const key = recipientKey(group.groupKey, row.phone, row.participantName);
        next[key] = checked;
        entries.push({
          contactKey: rowContactKey(row),
          selected: checked,
        });
      }
      saveScScheduleAlimtalkClientContactPrefs(clientKey, entries);
      return next;
    });
  };

  const handleContactPickerSaved = (groupKey: string) => {
    const group = preview?.groups.find((item) => item.groupKey === groupKey);
    if (!group) return;
    setSelected((prev) => ({ ...prev, ...buildGroupSelectionState(group) }));
  };

  const handleSendGroup = async (group: BriefingGroup) => {
    if (sendingGroupKey) return;
    const visibleRecipients = visibleBriefingRecipients(group);
    const phones = visibleRecipients
      .filter((row) => {
        const key = recipientKey(group.groupKey, row.phone, row.participantName);
        return selected[key];
      })
      .map((row) => row.phone as string);
    if (!phones.length) {
      window.alert(L.sendNoneSelected);
      return;
    }
    const label = group.clientName || group.groupKey;
    if (!window.confirm(L.sendConfirm(label))) return;

    const clientKey = groupClientKey(group);
    const entries = visibleRecipients.map((row) => ({
      contactKey: rowContactKey(row),
      selected: Boolean(selected[recipientKey(group.groupKey, row.phone, row.participantName)]),
    }));
    saveScScheduleAlimtalkClientContactPrefs(clientKey, entries);

    setSendingGroupKey(group.groupKey);
    setError("");
    try {
      const result = await sendScWeeklyBriefingGroup(group.groupKey, {
        weekStart: preview?.weekStart || weekStart,
        weekEnd: preview?.weekEnd,
        skipSync: true,
        phones,
      });
      setSendResults((prev) => ({ ...prev, [group.groupKey]: result }));
      if (!result.ok && result.error && !result.skipped) {
        setError(result.error);
      }
    } catch (sendError) {
      console.error(sendError);
      setError(L.sendError);
    } finally {
      setSendingGroupKey("");
    }
  };

  return (
    <Card className="mt-4 rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="erp-text-body font-bold text-slate-900">{L.sectionTitle}</h2>
            <p className="erp-text-caption mt-1 text-slate-500">{L.sectionDesc}</p>
            {preview ? (
              <p className="erp-text-caption mt-1 text-slate-500">
                {L.summary(
                  preview.weekLabel,
                  preview.clientCount ?? preview.groups.length,
                  preview.siteCount,
                  preview.scheduleCount,
                  preview.notifyCount,
                  preview.missingPhoneCount,
                )}
              </p>
            ) : null}
            {preview && !preview.templateConfigured ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">{L.templateMissing}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
              disabled={loading}
            >
              <ChevronLeft size={14} className="mr-1" />
              {L.prevWeek}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setWeekStart(weekRangeISO(todayISO()).startDate)}
              disabled={loading || isThisWeek}
            >
              {L.thisWeek}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
              disabled={loading}
            >
              {L.nextWeek}
              <ChevronRight size={14} className="ml-1" />
            </Button>
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
        </div>

        {loading && !preview ? <p className="text-sm text-slate-500">{L.loading}</p> : null}
        {error ? <p className="mb-3 text-sm font-semibold text-red-700">{error}</p> : null}

        {!loading && preview && preview.groups.length === 0 ? (
          <p className="text-sm text-slate-500">
            {L.empty} {L.noSchedules}
          </p>
        ) : null}

        {!loading && preview && preview.groups.length > 0 && preview.notifyCount === 0 ? (
          <p className="mb-3 text-sm font-semibold text-amber-700">{L.noPhones}</p>
        ) : null}

        <div className="space-y-4">
          {(preview?.groups || []).map((group) => {
            const manager =
              group.clientManager && group.clientManager !== "-"
                ? L.manager(group.clientManager)
                : L.noManager;
            const sites = group.sites?.length
              ? group.sites
              : [
                  {
                    siteKey: group.groupKey,
                    siteName: group.siteName,
                    siteManagerName: group.siteManagerName,
                    dateRange: group.dateRange,
                    headcounts: group.headcounts,
                    dayEntries: group.dayEntries,
                    scheduleIds: group.scheduleIds,
                    scheduleCount: group.scheduleCount,
                  },
                ];
            const sendResult = sendResults[group.groupKey];
            const isSending = sendingGroupKey === group.groupKey;
            const canSend = Boolean(preview?.templateConfigured);
            const visibleRecipients = visibleBriefingRecipients(group);

            return (
              <section key={group.groupKey} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {group.clientName || "-"}
                      {sites.length > 1 ? ` \u00B7 ${L.siteCount(sites.length)}` : ""}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">{manager}</p>
                    <div className="mt-2 space-y-2">
                      {sites.map((site) => (
                          <dl
                            key={site.siteKey}
                            className="grid gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:grid-cols-[auto_1fr] sm:gap-x-3"
                          >
                            <dt className="font-semibold text-slate-500">{L.site}</dt>
                            <dd className="font-bold text-slate-900">{site.siteName || "-"}</dd>
                            <dt className="font-semibold text-slate-500">{L.dates}</dt>
                            <dd>{site.dateRange || "-"}</dd>
                            <dt className="font-semibold text-slate-500">{L.headcounts}</dt>
                            <dd>{site.headcounts || "-"}</dd>
                          </dl>
                      ))}
                    </div>
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
                    disabled={Boolean(sendingGroupKey) || !canSend}
                    onClick={() => void handleSendGroup(group)}
                  >
                    <Send size={14} className="mr-1" />
                    {isSending ? L.sending : L.send}
                  </Button>
                </div>

                {group.recipientRows.length ? (
                  <div className="mt-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-slate-700">{L.recipients}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-lg px-2 text-xs"
                          onClick={() =>
                            setContactPicker({
                              clientId: group.clientId,
                              clientName: group.clientName || "",
                              groupKey: group.groupKey,
                            })
                          }
                        >
                          <Users size={12} className="mr-1" />
                          {L.clientContacts}
                        </Button>
                      </div>
                      {visibleRecipients.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                            onClick={() => setGroupSelection(group, true)}
                          >
                            {L.selectAll}
                          </button>
                          <span className="text-xs text-slate-300">|</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                            onClick={() => setGroupSelection(group, false)}
                          >
                            {L.deselectAll}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {visibleRecipients.length > 0 ? (
                      <ul className="space-y-2">
                        {visibleRecipients.map((row) => {
                          const key = recipientKey(group.groupKey, row.phone, row.participantName);
                          return (
                            <li key={key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                              <input
                                type="checkbox"
                                checked={Boolean(selected[key])}
                                onChange={(event) => toggleRecipient(group, row, event.target.checked)}
                                aria-label={`${L.client} ${row.participantName}`}
                              />
                              <span className="font-medium text-slate-800">
                                [{L.client}] {row.participantName}
                              </span>
                              <span className="text-slate-500">{row.phone}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        {L.pickerEmpty}
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </CardContent>
      <ScAlimtalkClientContactPickerModal
        open={Boolean(contactPicker)}
        clientId={contactPicker?.clientId}
        clientName={contactPicker?.clientName || ""}
        clients={clients}
        onClose={() => setContactPicker(null)}
        onSaved={() => {
          if (contactPicker?.groupKey) handleContactPickerSaved(contactPicker.groupKey);
        }}
      />
    </Card>
  );
}
