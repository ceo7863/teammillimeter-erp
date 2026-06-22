import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildProbationEvalNotifyRuleSheet } from "@/utils/probationEvalNotifyRules";
import type { NotificationSettings } from "@/utils/notificationSettings";
import type { WorkerAiRules } from "@/utils/workerAiRules";

type ProbationEvalNotifyRulesSheetProps = {
  workerAiRules?: WorkerAiRules | null;
  notificationSettings?: NotificationSettings | null;
  templateConfigured?: boolean;
  masterNotifyEnabled?: boolean;
  defaultOpen?: boolean;
};

export function ProbationEvalNotifyRulesSheet({
  workerAiRules,
  notificationSettings,
  templateConfigured,
  masterNotifyEnabled,
  defaultOpen = false,
}: ProbationEvalNotifyRulesSheetProps) {
  const [open, setOpen] = useState(defaultOpen);

  const sheet = useMemo(
    () =>
      buildProbationEvalNotifyRuleSheet({
        workerAiRules,
        notificationSettings,
        templateConfigured,
        masterNotifyEnabled,
      }),
    [workerAiRules, notificationSettings, templateConfigured, masterNotifyEnabled],
  );

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="erp-text-body flex items-center gap-2 font-bold text-slate-900">
            <ClipboardList className="h-4 w-4 shrink-0 text-teal-700" />
            {sheet.title}
          </h3>
          <p className="erp-text-caption mt-1 text-slate-600">{sheet.subtitle}</p>
          <p className="erp-text-caption mt-2 text-slate-500">
            등급 순위: <span className="font-semibold text-slate-700">{sheet.gradeOrderLabel}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              평가 대상 ≤ {sheet.settingsSummary.subjectMaxGrade}
            </span>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              평가자 등급 {sheet.settingsSummary.evaluatorGrades}
            </span>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              자동 {sheet.settingsSummary.notifyTime}
            </span>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((prev) => !prev)}>
          {open ? (
            <>
              <ChevronUp className="h-4 w-4" />
              접기
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              규칙 펼치기
            </>
          )}
        </Button>
      </div>

      {open ? (
        <div className="border-t border-slate-200 bg-white px-2 pb-3 pt-2 md:px-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-2 font-medium">구분</th>
                  <th className="px-2 py-2 font-medium">조건</th>
                  <th className="px-2 py-2 font-medium">결과</th>
                  <th className="px-2 py-2 font-medium">현재</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2 font-medium text-slate-800">{row.section}</td>
                    <td className="px-2 py-2 text-slate-700">{row.condition}</td>
                    <td className="px-2 py-2 text-slate-600">{row.result}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.active ? "충족" : "미충족"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="erp-text-caption mt-3 px-2 text-slate-500">
            평가 대상·평가자 등급은 「신입 AI 규칙 → 일일 시공 평가」에서, 발송 시각·ON/OFF는 「설정」 탭에서
            변경합니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
