import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCheck, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { todayISO } from "@/utils/companyLedger";
import { addDaysISO } from "@/utils/receivables";
import {
  fetchNotificationSettings,
  previewProbationEvalNotify,
  sendProbationEvalNotifyNow,
  sendProbationEvalReminderNow,
  type ProbationEvalAlimtalkPreview,
  type ProbationEvalAlimtalkPreviewRow,
} from "@/utils/notificationApi";
import { normalizeNotificationSettings, type NotificationSettings } from "@/utils/notificationSettings";
import type { WorkerAiRules } from "@/utils/workerAiRules";
import { ProbationEvalNotifyRulesSheet } from "@/components/ProbationEvalNotifyRulesSheet";

const L = {
  sectionTitle: "시공자 평가 알림",
  sectionDesc: "당일 SC 일정의 수습 시공자 평가 요청 알림톡 미리보기 및 발송",
  loading: "불러오는 중...",
  loadError: "시공자 평가 미리보기를 불러오지 못했습니다.",
  empty: "해당 날짜에 평가 대상 SC 일정이 없습니다.",
  summary: (date: string, schedules: number, requests: number, pending: number, missing: number) =>
    `대상 일자 ${date} · 일정 ${schedules}건 · 평가 ${requests}건 · 발송 대기 ${pending}건 · 전화 없음 ${missing}명`,
  today: "오늘",
  prevDay: "이전 날",
  nextDay: "다음 날",
  site: "현장",
  probationWorker: "수습 시공",
  evaluator: "평가자",
  phone: "연락처",
  status: "상태",
  noPhone: "전화없음",
  refresh: "새로고침",
  send: "평가 알림 발송",
  sending: "발송 중...",
  sendConfirm: (date: string) => `${date} 시공자 평가 알림톡을 발송합니다. 계속할까요?`,
  sendError: "알림톡 발송에 실패했습니다.",
  sendResult: (created: number, sent: number) => `요청 생성 ${created}건 · 발송 ${sent}건`,
  reminder: "미제출 리마인더",
  reminderSending: "리마인더 발송 중...",
  reminderConfirm: (date: string) => `${date} 미제출 평가에 리마인더를 발송합니다. 계속할까요?`,
  reminderResult: (sent: number) => `리마인더 ${sent}건 발송`,
  templateMissing: "시공자 평가 알림톡 템플릿이 설정되지 않았습니다. (ALIMTALK_PROBATION_EVAL_TEMPLATE)",
  disabled: "시공자 평가 알림이 꺼져 있습니다. 설정 탭에서 켜 주세요.",
  statusPlanned: "발송 예정",
  statusPending: "대기",
  statusSent: "발송됨",
  statusSubmitted: "제출완료",
  statusExpired: "만료",
  lastRun: (date: string, sent: number) => `마지막 발송: ${date} · ${sent}건`,
};

function statusLabel(status: ProbationEvalAlimtalkPreviewRow["status"]) {
  switch (status) {
    case "planned":
      return L.statusPlanned;
    case "pending":
      return L.statusPending;
    case "sent":
      return L.statusSent;
    case "submitted":
      return L.statusSubmitted;
    case "expired":
      return L.statusExpired;
    default:
      return status;
  }
}

function statusClass(status: ProbationEvalAlimtalkPreviewRow["status"]) {
  switch (status) {
    case "planned":
      return "bg-sky-100 text-sky-800";
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "sent":
      return "bg-blue-100 text-blue-800";
    case "submitted":
      return "bg-emerald-100 text-emerald-800";
    case "expired":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ProbationEvalAlimtalkSection({
  workerAiRules,
  canEdit = false,
  erpVersion,
  onSaveWorkerAiRules,
  onErpVersionChange,
}: {
  workerAiRules?: import("@/utils/workerAiRules").WorkerAiRules | null;
  canEdit?: boolean;
  erpVersion?: number;
  onSaveWorkerAiRules?: (rules: import("@/utils/workerAiRules").WorkerAiRules) => Promise<boolean | number | void>;
  onErpVersionChange?: (version: number) => void;
}) {
  const [targetDate, setTargetDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ProbationEvalAlimtalkPreview | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [settingsVersion, setSettingsVersion] = useState<number | undefined>(erpVersion);
  const [sending, setSending] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");

  const isToday = targetDate === todayISO();
  const reminderDate = useMemo(() => addDaysISO(targetDate, -1), [targetDate]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    setSendMessage("");
    setReminderMessage("");
    try {
      const [result, settingsResult] = await Promise.all([
        previewProbationEvalNotify(targetDate),
        fetchNotificationSettings(),
      ]);
      setPreview(result);
      setNotificationSettings(normalizeNotificationSettings(settingsResult.settings));
      if (typeof settingsResult.version === "number") {
        // Settings-local version only — do not publish GET versions to global erpVersion.
        setSettingsVersion(settingsResult.version);
      }
    } catch (loadError) {
      console.error(loadError);
      setPreview(null);
      setError(L.loadError);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleSend = async () => {
    if (!window.confirm(L.sendConfirm(targetDate))) return;
    setSending(true);
    setError("");
    setSendMessage("");
    try {
      const result = await sendProbationEvalNotifyNow({ targetDate });
      if (!result.ok && result.reason && !result.skipped) {
        setError(result.reason);
      } else {
        setSendMessage(L.sendResult(result.created ?? 0, result.sent ?? 0));
      }
      await loadPreview();
    } catch (sendError) {
      console.error(sendError);
      setError(L.sendError);
    } finally {
      setSending(false);
    }
  };

  const handleReminder = async () => {
    if (!window.confirm(L.reminderConfirm(reminderDate))) return;
    setReminding(true);
    setError("");
    setReminderMessage("");
    try {
      const result = await sendProbationEvalReminderNow({ targetDate: reminderDate });
      if (!result.ok && result.reason && !result.skipped) {
        setError(result.reason);
      } else {
        setReminderMessage(L.reminderResult(result.sent ?? 0));
      }
      await loadPreview();
    } catch (reminderError) {
      console.error(reminderError);
      setError(L.sendError);
    } finally {
      setReminding(false);
    }
  };

  return (
    <Card className="mt-4 rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <ProbationEvalNotifyRulesSheet
          workerAiRules={workerAiRules}
          notificationSettings={notificationSettings}
          templateConfigured={preview?.templateConfigured}
          masterNotifyEnabled={notificationSettings?.enabled}
          canEdit={canEdit}
          erpVersion={settingsVersion}
          onWorkerAiRulesSaved={onSaveWorkerAiRules}
          onNotificationSettingsSaved={(settings, version) => {
            setNotificationSettings(settings);
            setSettingsVersion(version);
            onErpVersionChange?.(version);
          }}
          onRulesSaved={() => void loadPreview()}
        />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="erp-text-body flex items-center gap-2 font-bold text-slate-900">
              <ClipboardCheck className="h-5 w-5" />
              {L.sectionTitle}
            </h2>
            <p className="erp-text-caption mt-1 text-slate-500">{L.sectionDesc}</p>
            {preview ? (
              <p className="erp-text-caption mt-1 text-slate-500">
                {L.summary(
                  preview.targetDate,
                  preview.scheduleCount,
                  preview.requestCount,
                  preview.pendingCount,
                  preview.missingPhoneCount,
                )}
              </p>
            ) : null}
            {preview?.meta?.lastTargetDate && preview.meta.lastSentCount != null ? (
              <p className="erp-text-caption mt-1 text-slate-400">
                {L.lastRun(preview.meta.lastTargetDate, preview.meta.lastSentCount)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setTargetDate(addDaysISO(targetDate, -1))}>
              <ChevronLeft className="h-4 w-4" />
              {L.prevDay}
            </Button>
            <Button
              type="button"
              variant={isToday ? "default" : "outline"}
              size="sm"
              onClick={() => setTargetDate(todayISO())}
            >
              {L.today}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setTargetDate(addDaysISO(targetDate, 1))}>
              {L.nextDay}
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadPreview()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {L.refresh}
            </Button>
            <Button type="button" size="sm" onClick={() => void handleSend()} disabled={sending || loading}>
              <Send className="h-4 w-4" />
              {sending ? L.sending : L.send}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleReminder()} disabled={reminding || loading}>
              {reminding ? L.reminderSending : L.reminder}
            </Button>
          </div>
        </div>

        {error ? <p className="erp-text-caption mb-3 text-red-600">{error}</p> : null}
        {sendMessage ? <p className="erp-text-caption mb-3 text-emerald-700">{sendMessage}</p> : null}
        {reminderMessage ? <p className="erp-text-caption mb-3 text-emerald-700">{reminderMessage}</p> : null}

        {preview && !preview.templateConfigured ? (
          <p className="erp-text-caption rounded-xl bg-amber-50 px-3 py-2 text-amber-800">{L.templateMissing}</p>
        ) : null}
        {preview && preview.templateConfigured && !preview.enabled ? (
          <p className="erp-text-caption rounded-xl bg-slate-100 px-3 py-2 text-slate-600">{L.disabled}</p>
        ) : null}

        {loading && !preview ? (
          <p className="erp-text-caption text-slate-500">{L.loading}</p>
        ) : preview && preview.rows.length === 0 ? (
          <p className="erp-text-caption text-slate-500">{L.empty}</p>
        ) : preview ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-2 font-medium">{L.site}</th>
                  <th className="px-2 py-2 font-medium">{L.probationWorker}</th>
                  <th className="px-2 py-2 font-medium">{L.evaluator}</th>
                  <th className="px-2 py-2 font-medium">{L.phone}</th>
                  <th className="px-2 py-2 font-medium">{L.status}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.id || `${row.scheduleId}:${row.probationWorkerName}:${row.evaluatorName}`} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-900">{row.siteName || "-"}</td>
                    <td className="px-2 py-2 text-slate-800">{row.probationWorkerName || "-"}</td>
                    <td className="px-2 py-2 text-slate-800">{row.evaluatorName || "-"}</td>
                    <td className="px-2 py-2 text-slate-600">{row.evaluatorPhone || L.noPhone}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
