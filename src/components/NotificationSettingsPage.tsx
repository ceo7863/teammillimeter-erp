import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Eye, RefreshCw, Send, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { fetchUsers, type ErpUserRecord } from "@/utils/erpApi";
import {
  fetchNotificationSettings,
  fetchNotificationStatus,
  previewDailyReport,
  previewScScheduleNotify,
  saveNotificationSettings,
  sendCommentNotifyTest,
  sendDailyReportNow,
  sendScScheduleNotifyNow,
  type AlimtalkStatus,
  type ScScheduleNotifyStatus,
} from "@/utils/notificationApi";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
  normalizePhoneList,
  type NotificationRecipient,
  type NotificationSettings,
  type ScScheduleNotifyMode,
} from "@/utils/notificationSettings";

const L = {
  pageTitle: "\uC54C\uB9BC\uD1A1 \uC124\uC815",
  pageDesc:
    "\uC77C\uC77C \uBCF4\uACE0, \uB9E4\uCD9C \uB313\uAE00, \uB0B4\uC77C SC \uC77C\uC815 \uC54C\uB9BC\uC744 \uCE74\uCE74\uC624 \uC54C\uB9BC\uD1A1\uC73C\uB85C \uBC1C\uC1A1\uD569\uB2C8\uB2E4.",
  loading: "\uC124\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911...",
  loadError: "\uC54C\uB9BC \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  saveSuccess: "\uC54C\uB9BC \uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  saveError: "\uC54C\uB9BC \uC124\uC815 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  conflictError:
    "\uB2E4\uB978 \uC0AC\uC6A9\uC790\uAC00 \uBA38\uC800 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
  save: "\uC800\uC7A5",
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
  masterEnable: "\uC54C\uB9BC\uD1A1 \uC0AC\uC6A9",
  masterEnableHint: "\uCF1C\uC57C \uC77C\uC77C \uBCF4\uACE0\uB7C9\uAE00 \uC54C\uB9BC\uC774 \uBC1C\uC1A1\uB429\uB2C8\uB2E4.",
  dailyReportFeature: "\uC77C\uC77C \uBCF4\uACE0",
  dailyReportFeatureHint:
    "\uC804\uC77C \uC2E4\uC801 \uC694\uC57D\uC744 \uC124\uC815 \uC2DC\uAC01(KST)\uC5D0 \uBC1C\uC1A1\uD569\uB2C8\uB2E4.",
  commentFeature: "\uB313\uAE00 \uC54C\uB9BC",
  commentFeatureHint: "\uB9E4\uCD9C \uB313\uAE00\uC774 \uC800\uC7A5\uB418\uBA74 \uC989\uC2DC \uBC1C\uC1A1\uD569\uB2C8\uB2E4.",
  scScheduleFeature: "SC \uB0B4\uC77C \uC77C\uC815 \uC54C\uB9BC",
  scScheduleFeatureHint:
    "\uB9E4\uC77C \uC124\uC815 \uC2DC\uAC01(KST)\uC5D0 \uB0B4\uC77C SC \uC77C\uC815\uC744 \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC640 \uCC38\uC5EC \uC2DC\uACF5\uC790 \uC804\uD654\uB85C \uBC1C\uC1A1\uD569\uB2C8\uB2E4.",
  scScheduleTimeLabel: "SC \uC77C\uC815 \uBC1C\uC1A1 \uC2DC\uAC01",
  scheduleLabel: "\uBC1C\uC1A1 \uC2DC\uAC01 (KST)",
  scheduleHintDaily: "\uC804\uC77C \uAE30\uC900 \uC694\uC57D",
  scheduleHintSc: "\uB0B4\uC77C \uC77C\uC815 \uAE30\uC900",
  commentSendTest: "\uB313\uAE00 \uC54C\uB9BC \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1",
  commentSendTestConfirm:
    "\uB4F1\uB85D\uB41C \uB313\uAE00 \uC218\uC2E0\uC790\uC5D0\uAC8C \uC0D8\uD50C \uB313\uAE00 \uC54C\uB9BC\uD1A1\uC744 \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  commentSendTestSuccess: "\uB313\uAE00 \uC54C\uB9BC \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4.",
  commentSendTestError: "\uB313\uAE00 \uC54C\uB9BC \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  scheduleValue: "\uB9E4\uC77C 08:00 (KST, \uC804\uC77C \uAE30\uC900)",
  alimtalkStatus: "\uC54C\uB9BC\uD1A1 \uC5F0\uB3D9 \uC0C1\uD0DC",
  scheduleTemplate: "SC \uC77C\uC815 \uD15C\uD074\uB9BF",
  alimtalkEnabled: "API \uC5F0\uB3D9",
  alimtalkDisabled: "\uBBF8\uC5F0\uB3D9 (dry-run)",
  provider: "\uC81C\uACF5\uC790",
  dailyTemplate: "\uC77C\uC77C \uBCF4\uACE0 \uD15C\uD074\uB9BF",
  commentTemplate: "\uB313\uAE00 \uC54C\uB9BC \uD15C\uD074\uB9BF",
  templateMissing: "\uBBF8\uC124\uC815",
  recipientsTitle: "\uC218\uC2E0\uC790",
  recipientsDesc:
    "\uC804\uD654\uBC88\uD638\uAC00 \uB4F1\uB85D\uB41C \uC0AC\uC6A9\uC790\uB9CC \uC218\uC2E0 \uB300\uC0C1\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4.",
  colName: "\uC774\uB984",
  colPhone: "\uC804\uD654\uBC88\uD638",
  colDaily: "\uC77C\uC77C \uBCF4\uACE0",
  colComment: "\uB313\uAE00 \uC54C\uB9BC",
  noPhoneUsers:
    "\uC804\uD654\uBC88\uD638\uAC00 \uB4F1\uB85D\uB41C \uC0AC\uC6A9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC0AC\uC6A9\uC790 \uAD00\uB9AC\uC5D0\uC11C \uBC88\uD638\uB97C \uB4F1\uB85D\uD574 \uC8FC\uC138\uC694.",
  preview: "\uC77C\uC77C \uBCF4\uACE0 \uBBF8\uB9AC\uBCF4\uAE30",
  previewTitle: "\uC77C\uC77C \uBCF4\uACE0 \uBBF8\uB9AC\uBCF4\uAE30 (\uC804\uC77C \uAE30\uC900)",
  sendTest: "\uC77C\uC77C \uBCF4\uACE0 \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1",
  sendTestConfirm:
    "\uB4F1\uB85D\uB41C \uC77C\uC77C \uBCF4\uACE0 \uC218\uC2E0\uC790\uC5D0\uAC8C \uC54C\uB9BC\uD1A1\uC744 \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  sendTestSuccess: "\uC77C\uC77C \uBCF4\uACE0 \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4.",
  sendTestSkipped: "\uBC1C\uC1A1\uC774 \uAC74\uB108\uB701\uC5B4\uC84C\uC2B5\uB2C8\uB2E4",
  sendTestSkippedNoRecipients: "\uC218\uC2E0\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC544\uB798 \uC218\uC2E0\uC790 \uD45C\uC5D0\uC11C \uBC1C\uC1A1 \uB300\uC0C1\uC744 \uCCB4\uD06C\uD558\uACE0 \uC800\uC7A5\uD574 \uC8FC\uC138\uC694.",
  sendTestError: "\uC77C\uC77C \uBCF4\uACE0 \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  scPreview: "SC \uC77C\uC815 \uBBF8\uB9AC\uBCF4\uAE30",
  scPreviewTitle: "SC \uB0B4\uC77C \uC77C\uC815 \uC54C\uB9BC \uBBF8\uB9AC\uBCF4\uAE30",
  scSendTest: "SC \uC77C\uC815 \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1",
  scSendTestConfirm:
    "\uB0B4\uC77C SC \uC77C\uC815 \uC54C\uB9BC\uC744 \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC640 \uCC38\uC5EC \uC2DC\uACF5\uC790 \uC804\uD654\uB85C \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  scSendTestSuccess: "SC \uC77C\uC815 \uC54C\uB9BC \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4.",
  scSendTestError: "SC \uC77C\uC815 \uC54C\uB9BC \uD14C\uC2A4\uD2B8 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  previewError: "\uBBF8\uB9AC\uBCF4\uAE30\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  close: "\uB2EB\uAE30",
  configured: "\uC124\uC815\uB428",
  recipientSummaryDaily: "\uC77C\uC77C",
  recipientSummaryComment: "\uB313\uAE00",
  recipientSummarySuffix: "\uBA85",
  dailyRecipientsTitle: "\uC218\uC2E0 \uC804\uD654\uBC88\uD638",
  dailyRecipientsHint:
    "\uC0AC\uC6A9\uC790 \uBAA9\uB85D\uC5D0\uC11C \uC120\uD0DD\uD558\uAC70\uB098 \uC544\uB798\uC5D0 \uCD94\uAC00 \uBC88\uD638\uB97C \uC785\uB825\uD558\uC138\uC694.",
  dailyExtraPhonesLabel: "\uCD94\uAC00 \uC804\uD654\uBC88\uD638",
  dailyExtraPhonesHint: "\uC0AC\uC6A9\uC790 \uB4F1\uB85D \uC5C6\uC774 \uBC1B\uC744 \uBC88\uD638\uB97C \uC9C1\uC811 \uC785\uB825\uD569\uB2C8\uB2E4.",
  addPhone: "\uBC88\uD638 \uCD94\uAC00",
  removePhone: "\uC0AD\uC81C",
  phonePlaceholder: "01012345678",
  invalidPhone: "\uC720\uD6A8\uD55C \uC804\uD654\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  commentRecipientsTitle: "\uC218\uC2E0 \uC0AC\uC6A9\uC790",
  commentRecipientsHint: "\uC804\uD654\uBC88\uD638\uAC00 \uB4F1\uB85D\uB41C \uC0AC\uC6A9\uC790 \uC911 \uBC1C\uC1A1 \uB300\uC0C1\uC744 \uC120\uD0DD\uD569\uB2C8\uB2E4.",
  scRecipientModeLabel: "\uC218\uC2E0 \uB300\uC0C1",
  scRecipientModeHint: "\uB0B4\uC77C SC \uC77C\uC815 \uC54C\uB9BC\uD1A1\uC744 \uBC1B\uC744 \uB300\uC0C1\uC744 \uC120\uD0DD\uD569\uB2C8\uB2E4.",
  scModeBoth: "\uAC70\uB798\uCC98 + \uC2DC\uACF5\uC790",
  scModeClient: "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uB9CC",
  scModeWorker: "\uCC38\uC5EC \uC2DC\uACF5\uC790\uB9CC",
  scSendTestConfirmBoth:
    "\uB0B4\uC77C SC \uC77C\uC815 \uC54C\uB9BC\uC744 \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC640 \uCC38\uC5EC \uC2DC\uACF5\uC790 \uC804\uD654\uB85C \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  scSendTestConfirmClient:
    "\uB0B4\uC77C SC \uC77C\uC815 \uC54C\uB9BC\uC744 \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uC804\uD654\uB85C\uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  scSendTestConfirmWorker:
    "\uB0B4\uC77C SC \uC77C\uC815 \uC54C\uB9BC\uC744 \uCC38\uC5EC \uC2DC\uACF5\uC790 \uC804\uD654\uB85C \uBC1C\uC1A1\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?",
  sendTestDryRun: "\uC54C\uB9BC\uD1A1 API\uAC00 \uBBF8\uC5F0\uB3D9\uC774\uB77C \uC2E4\uC81C \uBC1C\uC1A1 \uC5C6\uC774 \uBAA8\uC758 \uC131\uACF5\uC73C\uB85C \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
  sendTestSkippedNotConfigured: "SC \uC77C\uC815 \uC54C\uB9BC \uD15C\uD7C8\uB9BF \uB610\uB294 \uC54C\uB9BC\uD1A1 \uC5F0\uB3D9\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
  sendTestSkippedNoTemplate: "\uC54C\uB9BC\uD1A1 \uD15C\uD7C8\uB9BF \uCF54\uB4DC\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
  sendTestSkippedNoSchedules: "\uB0B4\uC77C SC \uC77C\uC815\uC774 \uC5C6\uC744 \uB610\uB294 \uBC1C\uC1A1 \uB300\uC0C1 \uC804\uD654\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

function formatTestSkipReason(reason?: string) {
  switch (reason) {
    case "no-recipients":
      return L.sendTestSkippedNoRecipients;
    case "not-configured":
    case "sc-share-not-configured":
      return L.sendTestSkippedNotConfigured;
    case "no-template":
      return L.sendTestSkippedNoTemplate;
    case "disabled":
    case "settings-disabled":
      return L.sendTestSkipped + ": " + reason + " (\uC11C\uBC84 \uC5C5\uB370\uC774\uD2B8 \uD6C4 \uC7AC\uC2DC\uB3C4)";
    case "already-ran-today":
      return L.sendTestSkipped + ": \uC624\uB298 \uC774\uBBF8 \uBC1C\uC1A1\uD588\uC2B5\uB2C8\uB2E4.";
    default:
      return reason ? L.sendTestSkipped + ": " + reason : L.sendTestSkipped;
  }
}

function formatTestSuccessMessage(base: string, result: { message?: string; dryRun?: boolean; sentCount?: number; targetDate?: string }) {
  if (result.dryRun) return base + "\n" + L.sendTestDryRun;
  if (result.message) return base + "\n" + result.message;
  return base;
}

type NotifyBusyKey = "daily-preview" | "daily-send" | "comment-send" | "sc-preview" | "sc-send" | null;

type RecipientRow = NotificationRecipient & {
  loginId?: string;
  isActive?: boolean;
};

function normalizePhone(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneDisplay(phone: string) {
  const digits = normalizePhone(phone);
  if (digits.length === 11) {
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
  }
  if (digits.length === 10) {
    return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
  }
  return phone || "-";
}

function formatScheduleTimeLabel(hour: number, minute: number) {
  return `\uB9E4\uC77C ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (KST)`;
}

function toTimeInputValue(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeInputValue(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function NotificationFeatureCard({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
  scheduleLabel,
  scheduleHint,
  scheduleValue,
  onScheduleChange,
  scheduleDisabled,
  sendTestDisabled,
  onPreview,
  onSendTest,
  previewLabel,
  sendTestLabel,
  previewing,
  sending,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  scheduleLabel?: string;
  scheduleHint?: string;
  scheduleValue?: string;
  onScheduleChange?: (value: string) => void;
  scheduleDisabled?: boolean;
  sendTestDisabled?: boolean;
  onPreview?: () => void;
  onSendTest?: () => void;
  previewLabel: string;
  sendTestLabel: string;
  previewing?: boolean;
  sending?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="erp-text-body block font-bold text-slate-900">{label}</span>
          {hint ? <span className="erp-text-caption mt-0.5 block text-slate-500">{hint}</span> : null}
        </span>
      </label>

      {scheduleLabel && scheduleValue != null && onScheduleChange ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="erp-text-caption font-bold text-slate-500">{scheduleLabel}</span>
          <input
            type="time"
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-900"
            value={scheduleValue}
            disabled={scheduleDisabled}
            onChange={(event) => onScheduleChange(event.target.value)}
          />
          {scheduleHint ? <span className="erp-text-caption text-slate-400">{scheduleHint}</span> : null}
        </div>
      ) : null}

      {children ? <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">{children}</div> : null}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {onPreview ? (
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onPreview} disabled={previewing || sending}>
            <Eye className="mr-2 h-4 w-4" />
            {previewLabel}
          </Button>
        ) : null}
        {onSendTest ? (
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onSendTest} disabled={previewing || sending || sendTestDisabled}>
            <Send className="mr-2 h-4 w-4" />
            {sendTestLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="erp-text-body block font-bold text-slate-900">{label}</span>
        {hint ? <span className="erp-text-caption mt-0.5 block text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function ExtraPhoneListEditor({
  phones,
  disabled,
  onChange,
}: {
  phones: string[];
  disabled?: boolean;
  onChange: (phones: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const addPhone = () => {
    const normalized = normalizePhone(draft);
    if (normalized.length < 10) {
      setError(L.invalidPhone);
      return;
    }
    if (phones.includes(normalized)) {
      setDraft("");
      setError("");
      return;
    }
    onChange([...phones, normalized]);
    setDraft("");
    setError("");
  };

  return (
    <div>
      <div className="erp-text-caption font-bold text-slate-500">{L.dailyExtraPhonesLabel}</div>
      <p className="erp-text-caption mt-0.5 text-slate-400">{L.dailyExtraPhonesHint}</p>
      {phones.length ? (
        <ul className="mt-2 space-y-1">
          {phones.map((phone) => (
            <li key={phone} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <span className="font-semibold text-slate-900">{formatPhoneDisplay(phone)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                disabled={disabled}
                onClick={() => onChange(phones.filter((row) => row !== phone))}
              >
                {L.removePhone}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="tel"
          className="min-w-[180px] flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-900"
          placeholder={L.phonePlaceholder}
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addPhone();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={disabled} onClick={addPhone}>
          {L.addPhone}
        </Button>
      </div>
      {error ? <p className="erp-text-caption mt-1 text-red-600">{error}</p> : null}
    </div>
  );
}

function RecipientUserTable({
  rows,
  column,
  columnLabel,
  disabled,
  onToggle,
}: {
  rows: RecipientRow[];
  column: "dailyReport" | "commentNotify";
  columnLabel: string;
  disabled?: boolean;
  onToggle: (userId: number, checked: boolean) => void;
}) {
  if (!rows.length) {
    return <p className="erp-text-caption rounded-2xl bg-slate-50 px-4 py-3 text-slate-500">{L.noPhoneUsers}</p>;
  }
  return (
    <DesktopTableWrap>
      <table className="erp-table w-full min-w-[480px]">
        <thead>
          <tr>
            <th>{L.colName}</th>
            <th>{L.colPhone}</th>
            <th className="text-center">{columnLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className={row.isActive === false ? "opacity-50" : ""}>
              <td>
                <div className="font-bold text-slate-900">{row.name}</div>
                {row.loginId ? <div className="text-xs text-slate-400">{row.loginId}</div> : null}
              </td>
              <td>{formatPhoneDisplay(row.phone)}</td>
              <td className="text-center">
                <input
                  type="checkbox"
                  checked={row[column]}
                  disabled={disabled}
                  onChange={(event) => onToggle(row.userId, event.target.checked)}
                  aria-label={row.name + " " + columnLabel}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DesktopTableWrap>
  );
}

function ScRecipientModeSelect({
  value,
  disabled,
  onChange,
}: {
  value: ScScheduleNotifyMode;
  disabled?: boolean;
  onChange: (mode: ScScheduleNotifyMode) => void;
}) {
  const options: Array<{ value: ScScheduleNotifyMode; label: string }> = [
    { value: "both", label: L.scModeBoth },
    { value: "client", label: L.scModeClient },
    { value: "worker", label: L.scModeWorker },
  ];
  return (
    <div>
      <div className="erp-text-caption font-bold text-slate-500">{L.scRecipientModeLabel}</div>
      <p className="erp-text-caption mt-0.5 text-slate-400">{L.scRecipientModeHint}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {options.map((option) => (
          <label
            key={option.value}
            className={
              "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 " +
              (value === option.value ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white")
            }
          >
            <input
              type="radio"
              name="sc-recipient-mode"
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="text-sm font-semibold text-slate-900">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ ok, labelOk, labelNg }: { ok: boolean; labelOk: string; labelNg: string }) {
  return (
    <span
      className={"inline-flex rounded-full px-2.5 py-1 text-xs font-bold " + (ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600")}
    >
      {ok ? labelOk : labelNg}
    </span>
  );
}

function buildRecipientRows(users: ErpUserRecord[], settings: NotificationSettings): RecipientRow[] {
  const byUserId = new Map(settings.recipients.map((row) => [row.userId, row]));
  return users
    .filter((user) => normalizePhone(user.phone))
    .map((user) => {
      const existing = byUserId.get(user.id);
      return {
        userId: user.id,
        name: user.name,
        loginId: user.loginId,
        isActive: user.isActive !== false,
        phone: normalizePhone(user.phone),
        dailyReport: existing?.dailyReport === true,
        commentNotify: existing?.commentNotify === true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function recipientsFromRows(rows: RecipientRow[]): NotificationRecipient[] {
  return rows
    .filter((row) => row.dailyReport || row.commentNotify)
    .map((row) => ({
      userId: row.userId,
      phone: row.phone,
      name: row.name,
      dailyReport: row.dailyReport,
      commentNotify: row.commentNotify,
    }));
}

type NotificationSettingsPageProps = {
  erpVersion?: number;
  onErpVersionChange?: (version: number) => void;
};

export function NotificationSettingsPage({ erpVersion, onErpVersionChange }: NotificationSettingsPageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<NotifyBusyKey>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [recipientRows, setRecipientRows] = useState<RecipientRow[]>([]);
  const [alimtalkStatus, setAlimtalkStatus] = useState<AlimtalkStatus | null>(null);
  const [scScheduleStatus, setScScheduleStatus] = useState<ScScheduleNotifyStatus | null>(null);
  const [version, setVersion] = useState<number | undefined>(erpVersion);
  const [previewMessage, setPreviewMessage] = useState("");
  const [previewTitle, setPreviewTitle] = useState(L.previewTitle);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [users, settingsResult, statusResult] = await Promise.all([
        fetchUsers(),
        fetchNotificationSettings(),
        fetchNotificationStatus(),
      ]);
      const nextSettings = normalizeNotificationSettings(settingsResult.settings);
      setSettings(nextSettings);
      setRecipientRows(buildRecipientRows(users, nextSettings));
      setAlimtalkStatus(statusResult.alimtalk);
      setScScheduleStatus(statusResult.scScheduleNotify || null);
    } catch (err) {
      console.error(err);
      setError(L.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (typeof erpVersion === "number") setVersion(erpVersion);
  }, [erpVersion]);

  const buildTestSettingsPayload = (): NotificationSettings => ({
    ...settings,
    recipients: recipientsFromRows(recipientRows),
  });

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    const payload: NotificationSettings = {
      ...settings,
      recipients: recipientsFromRows(recipientRows),
    };
    try {
      const result = await saveNotificationSettings(payload, version);
      const nextSettings = normalizeNotificationSettings(result.settings);
      setSettings(nextSettings);
      setVersion(result.version);
      onErpVersionChange?.(result.version);
      setMessage(L.saveSuccess);
    } catch (err) {
      console.error(err);
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        setError(L.conflictError);
        await loadAll();
      } else {
        setError(L.saveError);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setBusy("daily-preview");
    setError("");
    try {
      const result = await previewDailyReport();
      setPreviewTitle(L.previewTitle);
      setPreviewMessage(result.message || "");
      setPreviewOpen(true);
    } catch (err) {
      console.error(err);
      setError(L.previewError);
    } finally {
      setBusy(null);
    }
  };

  const handleSendTest = async () => {
    if (!window.confirm(L.sendTestConfirm)) return;
    setBusy("daily-send");
    setError("");
    setMessage("");
    try {
      const result = await sendDailyReportNow({ skipSync: true, settings: buildTestSettingsPayload() });
      if (result.skipped) {
        setMessage(formatTestSkipReason(result.reason));
      } else {
        setMessage(formatTestSuccessMessage(L.sendTestSuccess, result));
      }
    } catch (err) {
      console.error(err);
      setError(L.sendTestError);
    } finally {
      setBusy(null);
    }
  };

  const handleCommentSendTest = async () => {
    if (!window.confirm(L.commentSendTestConfirm)) return;
    setBusy("comment-send");
    setError("");
    setMessage("");
    try {
      const result = await sendCommentNotifyTest(buildTestSettingsPayload());
      if (result.skipped) {
        setMessage(formatTestSkipReason(result.reason));
      } else {
        setMessage(formatTestSuccessMessage(L.commentSendTestSuccess, result));
      }
    } catch (err) {
      console.error(err);
      setError(L.commentSendTestError);
    } finally {
      setBusy(null);
    }
  };

  const handleScPreview = async () => {
    setBusy("sc-preview");
    setError("");
    try {
      const result = await previewScScheduleNotify();
      const modeLabel =
        result.scScheduleNotifyMode === "client"
          ? L.scModeClient
          : result.scScheduleNotifyMode === "worker"
            ? L.scModeWorker
            : L.scModeBoth;
      const lines = [
        `\uB300\uC0C1 \uC77C\uC790: ${result.targetDate}`,
        `\uC218\uC2E0 \uB300\uC0C1: ${modeLabel}`,
        `\uC77C\uC815 ${result.scheduleCount}\uAC74 / \uBC1C\uC1A1 \uAC00\uB2A5 ${result.notifyCount}\uBA85 (\uAC70\uB798\uCC98 ${result.clientNotifyCount ?? 0}\uBA85 \u00B7 \uC2DC\uACF5 ${result.workerNotifyCount ?? 0}\uBA85) / \uC804\uD654 \uC5C6\uC74C ${result.missingPhoneCount}\uBA85`,
      ];
      if (result.scheduleLinks?.length) {
        lines.push("", "=== \uC77C\uC815 \uB9C1\uD06C ===");
        for (const link of result.scheduleLinks) {
          const label = link.clientName || link.projectName || link.scheduleId;
          lines.push(`${label}: ${link.shareUrl || `(\uB9C1\uD06C \uC0DD\uC131 \uC2E4\uD328${link.error ? `: ${link.error}` : ""})`}`);
        }
      }
      lines.push(
        "",
        "=== \uBC1C\uC1A1 \uB300\uC0C1 ===",
        ...result.rows.map((row) => {
          const role = row.recipientType === "client" ? "\uAC70\uB798\uCC98" : "\uC2DC\uACF5";
          const manager =
            row.variables?.clientManager && row.variables.clientManager !== "-"
              ? `\uB2F4\uB2F9 ${row.variables.clientManager}`
              : "\uB2F4\uB2F9 \uC5C6\uC74C";
          const contact =
            row.recipientType === "client"
              ? row.participantName || row.variables.client
              : row.participantName;
          const workers =
            row.variables?.workers
              ? `\uC2DC\uACF5 ${row.variables.workers}`
              : "\uC2DC\uACF5 \uC5C6\uC74C";
          const parts = [contact, row.variables.client, manager, row.variables.dateTime];
          if (row.recipientType === "client") parts.push(workers);
          return `[${role} ${row.phone || "\uC804\uD654\uC5C6\uC74C"}] ${parts.join(" \u00B7 ")}`;
        }),
      );
      setPreviewTitle(L.scPreviewTitle);
      setPreviewMessage(lines.join("\n"));
      setPreviewOpen(true);
    } catch (err) {
      console.error(err);
      setError(L.previewError);
    } finally {
      setBusy(null);
    }
  };

  const scSendTestConfirmMessage = useMemo(() => {
    if (settings.scScheduleNotifyMode === "client") return L.scSendTestConfirmClient;
    if (settings.scScheduleNotifyMode === "worker") return L.scSendTestConfirmWorker;
    return L.scSendTestConfirmBoth;
  }, [settings.scScheduleNotifyMode]);

  const handleScSendTest = async () => {
    if (!window.confirm(scSendTestConfirmMessage)) return;
    setBusy("sc-send");
    setError("");
    setMessage("");
    try {
      const result = await sendScScheduleNotifyNow({
        force: true,
        skipSync: true,
        settings: buildTestSettingsPayload(),
      });
      if (result.skipped) {
        setMessage(formatTestSkipReason(result.reason));
      } else if ((result.sentCount ?? 0) === 0) {
        setMessage(L.sendTestSkippedNoSchedules);
      } else {
        setMessage(`${L.scSendTestSuccess} (${result.targetDate || "-"}, ${result.sentCount ?? 0}\uAC74 \uBC1C\uC1A1)`);
      }
      const statusResult = await fetchNotificationStatus();
      setScScheduleStatus(statusResult.scScheduleNotify || null);
    } catch (err) {
      console.error(err);
      setError(L.scSendTestError);
    } finally {
      setBusy(null);
    }
  };

  const updateDailySchedule = (value: string) => {
    const parsed = parseTimeInputValue(value);
    if (!parsed) return;
    setSettings((prev) => ({ ...prev, dailyReportHour: parsed.hour, dailyReportMinute: parsed.minute }));
  };

  const updateScSchedule = (value: string) => {
    const parsed = parseTimeInputValue(value);
    if (!parsed) return;
    setSettings((prev) => ({ ...prev, scScheduleNotifyHour: parsed.hour, scScheduleNotifyMinute: parsed.minute }));
  };

  const updateRecipient = (userId: number, patch: Partial<Pick<RecipientRow, "dailyReport" | "commentNotify">>) => {
    setRecipientRows((prev) => prev.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
  };

  const dailyRecipientCount =
    recipientRows.filter((row) => row.dailyReport).length + settings.dailyReportExtraPhones.length;
  const commentRecipientCount = recipientRows.filter((row) => row.commentNotify).length;
  const featureDisabled = !settings.enabled;
  const dailyScheduleValue = toTimeInputValue(settings.dailyReportHour, settings.dailyReportMinute);
  const scScheduleValue = toTimeInputValue(settings.scScheduleNotifyHour, settings.scScheduleNotifyMinute);

  return (
    <div className="erp-page erp-notification-settings-page">
      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="erp-text-page-title flex items-center gap-2 text-slate-900">
                <Bell className="h-5 w-5" />
                {L.pageTitle}
              </h2>
              <p className="mt-1 erp-text-body text-slate-600">{L.pageDesc}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => void loadAll()} disabled={loading || saving}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {L.refresh}
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleSave()} disabled={loading || saving}>
                {L.save}
              </Button>
            </div>
          </div>

          {message ? (
            <div className="mb-3 whitespace-pre-wrap rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {message}
            </div>
          ) : null}
          {error ? <div className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

          {loading ? (
            <p className="erp-text-body text-slate-500">{L.loading}</p>
          ) : (
            <div className="space-y-4">
              <ToggleRow
                label={L.masterEnable}
                hint={L.masterEnableHint}
                checked={settings.enabled}
                onChange={(checked) => setSettings((prev) => ({ ...prev, enabled: checked }))}
              />

              <div className="space-y-3">
                <NotificationFeatureCard
                  label={L.dailyReportFeature}
                  hint={`${L.dailyReportFeatureHint} (${formatScheduleTimeLabel(settings.dailyReportHour, settings.dailyReportMinute)})`}
                  checked={settings.dailyReportEnabled}
                  disabled={featureDisabled}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, dailyReportEnabled: checked }))}
                  scheduleLabel={L.scheduleLabel}
                  scheduleHint={L.scheduleHintDaily}
                  scheduleValue={dailyScheduleValue}
                  onScheduleChange={updateDailySchedule}
                  scheduleDisabled={featureDisabled || !settings.dailyReportEnabled}
                  onPreview={() => void handlePreview()}
                  onSendTest={() => void handleSendTest()}
                  previewLabel={L.preview}
                  sendTestLabel={L.sendTest}
                  previewing={busy === "daily-preview"}
                  sending={busy === "daily-send"}
                  sendTestDisabled={dailyRecipientCount === 0}
                >
                  <div>
                    <div className="erp-text-caption font-bold text-slate-500">{L.dailyRecipientsTitle}</div>
                    <p className="erp-text-caption mt-0.5 text-slate-400">
                      {L.dailyRecipientsHint} ({dailyRecipientCount}
                      {L.recipientSummarySuffix})
                    </p>
                    <div className="mt-2">
                      <RecipientUserTable
                        rows={recipientRows}
                        column="dailyReport"
                        columnLabel={L.colDaily}
                        disabled={featureDisabled || !settings.dailyReportEnabled}
                        onToggle={(userId, checked) => updateRecipient(userId, { dailyReport: checked })}
                      />
                    </div>
                  </div>
                  <ExtraPhoneListEditor
                    phones={settings.dailyReportExtraPhones}
                    disabled={featureDisabled || !settings.dailyReportEnabled}
                    onChange={(phones) =>
                      setSettings((prev) => ({ ...prev, dailyReportExtraPhones: normalizePhoneList(phones) }))
                    }
                  />
                </NotificationFeatureCard>

                <NotificationFeatureCard
                  label={L.scScheduleFeature}
                  hint={`${L.scScheduleFeatureHint} (${formatScheduleTimeLabel(settings.scScheduleNotifyHour, settings.scScheduleNotifyMinute)})`}
                  checked={settings.scScheduleNotifyEnabled}
                  disabled={featureDisabled}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, scScheduleNotifyEnabled: checked }))}
                  scheduleLabel={L.scScheduleTimeLabel}
                  scheduleHint={L.scheduleHintSc}
                  scheduleValue={scScheduleValue}
                  onScheduleChange={updateScSchedule}
                  scheduleDisabled={featureDisabled || !settings.scScheduleNotifyEnabled}
                  onPreview={() => void handleScPreview()}
                  onSendTest={() => void handleScSendTest()}
                  previewLabel={L.scPreview}
                  sendTestLabel={L.scSendTest}
                  previewing={busy === "sc-preview"}
                  sending={busy === "sc-send"}
                >
                  <ScRecipientModeSelect
                    value={settings.scScheduleNotifyMode}
                    disabled={featureDisabled || !settings.scScheduleNotifyEnabled}
                    onChange={(mode) => setSettings((prev) => ({ ...prev, scScheduleNotifyMode: mode }))}
                  />
                </NotificationFeatureCard>

                <NotificationFeatureCard
                  label={L.commentFeature}
                  hint={L.commentFeatureHint}
                  checked={settings.commentNotifyEnabled}
                  disabled={featureDisabled}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, commentNotifyEnabled: checked }))}
                  onSendTest={() => void handleCommentSendTest()}
                  previewLabel={L.preview}
                  sendTestLabel={L.commentSendTest}
                  sending={busy === "comment-send"}
                  sendTestDisabled={commentRecipientCount === 0}
                >
                  <div>
                    <div className="erp-text-caption font-bold text-slate-500">{L.commentRecipientsTitle}</div>
                    <p className="erp-text-caption mt-0.5 text-slate-400">
                      {L.commentRecipientsHint} ({commentRecipientCount}
                      {L.recipientSummarySuffix})
                    </p>
                    <div className="mt-2">
                      <RecipientUserTable
                        rows={recipientRows}
                        column="commentNotify"
                        columnLabel={L.colComment}
                        disabled={featureDisabled || !settings.commentNotifyEnabled}
                        onToggle={(userId, checked) => updateRecipient(userId, { commentNotify: checked })}
                      />
                    </div>
                  </div>
                </NotificationFeatureCard>
              </div>

              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-slate-500" />
                    <h3 className="erp-text-body font-bold text-slate-900">{L.alimtalkStatus}</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="erp-text-caption text-slate-500">{L.alimtalkEnabled}</div>
                      <div className="mt-1">
                        <StatusBadge ok={Boolean(alimtalkStatus?.enabled)} labelOk={L.configured} labelNg={L.alimtalkDisabled} />
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="erp-text-caption text-slate-500">{L.provider}</div>
                      <div className="erp-text-body mt-1 font-bold text-slate-900">{alimtalkStatus?.provider || "-"}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="erp-text-caption text-slate-500">{L.dailyTemplate}</div>
                      <div className="erp-text-body mt-1 font-bold text-slate-900">{alimtalkStatus?.dailyTemplate || L.templateMissing}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="erp-text-caption text-slate-500">{L.commentTemplate}</div>
                      <div className="erp-text-body mt-1 font-bold text-slate-900">{alimtalkStatus?.commentTemplate || L.templateMissing}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="erp-text-caption text-slate-500">{L.scheduleTemplate}</div>
                      <div className="erp-text-body mt-1 font-bold text-slate-900">
                        {alimtalkStatus?.scheduleTemplate || scScheduleStatus?.template || L.templateMissing}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}
        </CardContent>
      </Card>

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="erp-text-body mb-3 font-bold text-slate-900">{previewTitle}</h3>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-800">
              {previewMessage}
            </pre>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPreviewOpen(false)}>
                {L.close}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
