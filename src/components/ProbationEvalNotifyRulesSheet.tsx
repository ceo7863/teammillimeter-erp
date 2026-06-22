import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildProbationEvalNotifyRuleSheet,
  describeProbationEvalEvaluatorResult,
} from "@/utils/probationEvalNotifyRules";
import { saveNotificationSettings } from "@/utils/notificationApi";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
  type NotificationSettings,
} from "@/utils/notificationSettings";
import {
  normalizeWorkerAiRules,
  PROBATION_EVAL_COMPANION_GRADE_OPTIONS,
  PROBATION_EVAL_EVALUATOR_GRADE_OPTIONS,
  PROBATION_EVAL_EVALUATOR_MODE_OPTIONS,
  PROBATION_EVAL_SUBJECT_GRADE_OPTIONS,
  type WorkerAiRules,
} from "@/utils/workerAiRules";

type ProbationEvalNotifyRulesSheetProps = {
  workerAiRules?: WorkerAiRules | null;
  notificationSettings?: NotificationSettings | null;
  templateConfigured?: boolean;
  masterNotifyEnabled?: boolean;
  canEdit?: boolean;
  erpVersion?: number;
  onWorkerAiRulesSaved?: (rules: WorkerAiRules) => Promise<boolean | number | void>;
  onNotificationSettingsSaved?: (settings: NotificationSettings, version: number) => void;
  onRulesSaved?: () => void;
  defaultOpen?: boolean;
};

function toggleGrade(list: string[], grade: string, checked: boolean) {
  const normalized = grade.toUpperCase();
  if (checked) return [...new Set([...list, normalized])];
  return list.filter((row) => row !== normalized);
}

export function ProbationEvalNotifyRulesSheet({
  workerAiRules,
  notificationSettings,
  templateConfigured,
  masterNotifyEnabled,
  canEdit = false,
  erpVersion,
  onWorkerAiRulesSaved,
  onNotificationSettingsSaved,
  onRulesSaved,
  defaultOpen = true,
}: ProbationEvalNotifyRulesSheetProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [rulesDraft, setRulesDraft] = useState(() => normalizeWorkerAiRules(workerAiRules));
  const [notifyDraft, setNotifyDraft] = useState(() =>
    normalizeNotificationSettings(notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setRulesDraft(normalizeWorkerAiRules(workerAiRules));
  }, [workerAiRules]);

  useEffect(() => {
    if (notificationSettings) {
      setNotifyDraft(normalizeNotificationSettings(notificationSettings));
    }
  }, [notificationSettings]);

  const sheet = useMemo(
    () =>
      buildProbationEvalNotifyRuleSheet({
        workerAiRules: rulesDraft,
        notificationSettings: notifyDraft,
        templateConfigured,
        masterNotifyEnabled,
      }),
    [rulesDraft, notifyDraft, templateConfigured, masterNotifyEnabled],
  );

  const previewResult = useMemo(() => describeProbationEvalEvaluatorResult(rulesDraft), [rulesDraft]);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const normalizedRules = normalizeWorkerAiRules(rulesDraft);
      const normalizedNotify = normalizeNotificationSettings(notifyDraft);

      let versionForNotify = erpVersion;
      if (onWorkerAiRulesSaved) {
        const rulesOk = await onWorkerAiRulesSaved(normalizedRules);
        if (rulesOk === false) {
          setError("평가 규칙 저장에 실패했습니다.");
          return;
        }
        if (typeof rulesOk === "number") {
          versionForNotify = rulesOk;
        }
      }

      const notifyResult = await saveNotificationSettings(normalizedNotify, versionForNotify);
      const savedNotify = normalizeNotificationSettings(notifyResult.settings);
      setNotifyDraft(savedNotify);
      onNotificationSettingsSaved?.(savedNotify, notifyResult.version);
      onRulesSaved?.();
      setMessage("발송 규칙을 저장했습니다. 미리보기를 새로고침해 확인하세요.");
    } catch (saveError) {
      console.error(saveError);
      const err = saveError as Error & { status?: number };
      if (err.status === 409) {
        setError("다른 사용자가 먼저 저장했습니다. 새로고침(F5) 후 다시 시도해 주세요.");
      } else if (err.status === 403) {
        setError("규칙 저장 권한이 없습니다. 관리자 계정으로 로그인해 주세요.");
      } else {
        setError(err.message || "규칙 저장에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setSaving(false);
    }
  };

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
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="erp-text-caption font-semibold text-slate-700">평가 대상 최고 등급</span>
              <select
                className="erp-input mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={rulesDraft.probationEvalSubjectMaxGrade}
                disabled={!canEdit}
                onChange={(event) =>
                  setRulesDraft((prev) => ({ ...prev, probationEvalSubjectMaxGrade: event.target.value }))
                }
              >
                {PROBATION_EVAL_SUBJECT_GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="erp-text-caption font-semibold text-slate-700">평가자 선정 방식</span>
              <select
                className="erp-input mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={rulesDraft.probationEvalEvaluatorMode}
                disabled={!canEdit}
                onChange={(event) =>
                  setRulesDraft((prev) => ({
                    ...prev,
                    probationEvalEvaluatorMode: event.target.value as WorkerAiRules["probationEvalEvaluatorMode"],
                  }))
                }
              >
                {PROBATION_EVAL_EVALUATOR_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="erp-text-caption mt-1 text-slate-500">
                {
                  PROBATION_EVAL_EVALUATOR_MODE_OPTIONS.find(
                    (row) => row.value === rulesDraft.probationEvalEvaluatorMode,
                  )?.hint
                }
              </p>
            </label>
          </div>

          <div className="mt-4">
            <p className="erp-text-caption font-semibold text-slate-700">평가자 허용 등급</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {PROBATION_EVAL_EVALUATOR_GRADE_OPTIONS.map((grade) => {
                const checked = rulesDraft.probationEvalGrades.includes(grade);
                return (
                  <label key={grade} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setRulesDraft((prev) => ({
                          ...prev,
                          probationEvalGrades: toggleGrade(prev.probationEvalGrades, grade, event.target.checked),
                        }))
                      }
                    />
                    {grade}
                  </label>
                );
              })}
            </div>
          </div>

          {rulesDraft.probationEvalEvaluatorMode === "s_plus_companion_when_s" ? (
            <div className="mt-4 rounded-xl bg-teal-50/70 px-3 py-3 ring-1 ring-teal-100">
              <p className="erp-text-caption font-semibold text-teal-900">S 현장 시 함께 보낼 등급</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {PROBATION_EVAL_COMPANION_GRADE_OPTIONS.map((grade) => {
                  const checked = rulesDraft.probationEvalSCompanionGrades.includes(grade);
                  return (
                    <label key={grade} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setRulesDraft((prev) => ({
                            ...prev,
                            probationEvalSCompanionGrades: toggleGrade(
                              prev.probationEvalSCompanionGrades,
                              grade,
                              event.target.checked,
                            ),
                          }))
                        }
                      />
                      {grade}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={notifyDraft.enabled}
                disabled={!canEdit}
                onChange={(event) => setNotifyDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              알림톡 전체 사용
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={notifyDraft.probationEvalNotifyEnabled}
                disabled={!canEdit || !notifyDraft.enabled}
                onChange={(event) =>
                  setNotifyDraft((prev) => ({ ...prev, probationEvalNotifyEnabled: event.target.checked }))
                }
              />
              일일 시공자 평가
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={notifyDraft.probationEvalReminderEnabled}
                disabled={!canEdit || !notifyDraft.enabled || !notifyDraft.probationEvalNotifyEnabled}
                onChange={(event) =>
                  setNotifyDraft((prev) => ({ ...prev, probationEvalReminderEnabled: event.target.checked }))
                }
              />
              미제출 리마인더
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="erp-text-caption font-semibold text-slate-700">자동 발송 시각 (시)</span>
              <input
                type="number"
                min={0}
                max={23}
                className="erp-input mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={notifyDraft.probationEvalNotifyHour}
                disabled={!canEdit}
                onChange={(event) =>
                  setNotifyDraft((prev) => ({
                    ...prev,
                    probationEvalNotifyHour: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label className="block">
              <span className="erp-text-caption font-semibold text-slate-700">자동 발송 시각 (분)</span>
              <input
                type="number"
                min={0}
                max={59}
                className="erp-input mt-1 w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={notifyDraft.probationEvalNotifyMinute}
                disabled={!canEdit}
                onChange={(event) =>
                  setNotifyDraft((prev) => ({
                    ...prev,
                    probationEvalNotifyMinute: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <p className="erp-text-caption mt-4 rounded-xl bg-slate-50 px-3 py-2 text-slate-700">
            적용 미리보기: {previewResult}
          </p>

          {canEdit ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
                <Save className="h-4 w-4" />
                {saving ? "저장 중..." : "규칙 저장"}
              </Button>
              {message ? <p className="erp-text-caption text-emerald-700">{message}</p> : null}
              {error ? <p className="erp-text-caption text-red-600">{error}</p> : null}
            </div>
          ) : (
            <p className="erp-text-caption mt-4 text-slate-500">규칙 변경은 관리자만 가능합니다.</p>
          )}

          <div className="mt-5 overflow-x-auto">
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
        </div>
      ) : null}
    </div>
  );
}
