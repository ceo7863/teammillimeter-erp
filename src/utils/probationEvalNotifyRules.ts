import type { NotificationSettings } from "@/utils/notificationSettings";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/utils/notificationSettings";
import { WORKER_GRADE_RANK } from "@/utils/probationEvalTypes";
import {
  PROBATION_EVAL_EVALUATOR_MODE_OPTIONS,
  normalizeWorkerAiRules,
  type ProbationEvalEvaluatorMode,
  type WorkerAiRules,
} from "@/utils/workerAiRules";

export type ProbationEvalNotifyRuleRow = {
  id: string;
  section: string;
  condition: string;
  result: string;
  active: boolean;
};

export type ProbationEvalNotifyRuleSheet = {
  title: string;
  subtitle: string;
  gradeOrderLabel: string;
  rows: ProbationEvalNotifyRuleRow[];
  settingsSummary: {
    notifyEnabled: boolean;
    masterEnabled: boolean;
    templateConfigured: boolean;
    notifyTime: string;
    reminderEnabled: boolean;
    subjectMaxGrade: string;
    evaluatorGrades: string;
    evaluatorModeLabel: string;
    companionGrades: string;
  };
};

const GRADE_ORDER = Object.entries(WORKER_GRADE_RANK)
  .sort((a, b) => b[1] - a[1])
  .map(([grade]) => grade)
  .join(" > ");

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

export function describeProbationEvalEvaluatorMode(mode: ProbationEvalEvaluatorMode) {
  return PROBATION_EVAL_EVALUATOR_MODE_OPTIONS.find((row) => row.value === mode)?.label ?? mode;
}

export function describeProbationEvalEvaluatorResult(rules: WorkerAiRules) {
  const normalized = normalizeWorkerAiRules(rules);
  const grades =
    normalized.probationEvalGrades.length > 0
      ? normalized.probationEvalGrades.join(", ")
      : "제한 없음";

  switch (normalized.probationEvalEvaluatorMode) {
    case "all_matching":
      return `설정 등급(${grades})에 해당하는 참여자 전원에게 각각 발송`;
    case "s_plus_companion_when_s": {
      const companions =
        normalized.probationEvalSCompanionGrades.length > 0
          ? normalized.probationEvalSCompanionGrades.join(", ")
          : "없음";
      return `S등급 참여 시 S + ${companions} 각각 발송 · S 없으면 설정 등급 중 최고 1명`;
    }
    default:
      return `설정 등급(${grades}) 중 현장 최고 등급 1명에게 발송`;
  }
}

export function buildProbationEvalNotifyRuleSheet(input?: {
  workerAiRules?: WorkerAiRules | null;
  notificationSettings?: NotificationSettings | null;
  templateConfigured?: boolean;
  masterNotifyEnabled?: boolean;
}): ProbationEvalNotifyRuleSheet {
  const rules = normalizeWorkerAiRules(input?.workerAiRules);
  const settings = input?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
  const templateConfigured = input?.templateConfigured !== false;
  const masterEnabled = input?.masterNotifyEnabled ?? settings.enabled;
  const notifyEnabled = masterEnabled && settings.probationEvalNotifyEnabled;
  const evaluatorGrades =
    rules.probationEvalGrades.length > 0 ? rules.probationEvalGrades.join(", ") : "제한 없음(현장 최고 등급)";
  const companionGrades =
    rules.probationEvalSCompanionGrades.length > 0
      ? rules.probationEvalSCompanionGrades.join(", ")
      : "없음";
  const evaluatorResult = describeProbationEvalEvaluatorResult(rules);

  const rows: ProbationEvalNotifyRuleRow[] = [
    {
      id: "master-on",
      section: "발송 전제",
      condition: "알림톡 전체 사용 ON",
      result: "자동·수동 발송 가능",
      active: masterEnabled,
    },
    {
      id: "eval-on",
      section: "발송 전제",
      condition: "일일 시공자 평가 ON",
      result: "평가 알림 job 실행",
      active: notifyEnabled,
    },
    {
      id: "template",
      section: "발송 전제",
      condition: "시공자 평가 알림톡 템플릿 등록 (ALIMTALK_PROBATION_EVAL_TEMPLATE)",
      result: "카카오 알림톡 발송",
      active: templateConfigured,
    },
    {
      id: "schedule-day",
      section: "대상 일정",
      condition: "SC 일정 workDate = 발송 기준일(KST), 개인 휴가 일정 제외",
      result: "해당 일정만 평가 대상 검색",
      active: true,
    },
    {
      id: "schedule-participants",
      section: "대상 일정",
      condition: "일정 participantNames(참여자) 존재 + ERP 시공자 마스터 이름 매칭",
      result: "참여자·등급·전화번호 확인",
      active: true,
    },
    {
      id: "subject-grade",
      section: "피평가자",
      condition: `참여자 등급 ≤ 평가 대상 최고 등급 (${rules.probationEvalSubjectMaxGrade})`,
      result: "피평가자별 평가 요청 생성",
      active: true,
    },
    {
      id: "subject-dedupe",
      section: "피평가자",
      condition: "같은 날짜·일정·피평가자·평가자 조합이 없음",
      result: "중복 요청 생성 안 함",
      active: true,
    },
    {
      id: "evaluator-mode",
      section: "평가자",
      condition: `선정 방식: ${describeProbationEvalEvaluatorMode(rules.probationEvalEvaluatorMode)}`,
      result: evaluatorResult,
      active: true,
    },
    {
      id: "evaluator-rank",
      section: "평가자",
      condition: "평가자 등급 > 피평가자 등급",
      result: "본인·동급·하급은 평가자 불가",
      active: true,
    },
    {
      id: "phone",
      section: "발송",
      condition: "선정된 평가자 ERP 휴대폰 번호 있음",
      result: "pending 요청 생성 후 알림톡 발송",
      active: true,
    },
    {
      id: "auto-time",
      section: "자동 발송",
      condition: `KST ${padTimePart(settings.probationEvalNotifyHour)}:${padTimePart(settings.probationEvalNotifyMinute)}, 당일 1회`,
      result: "미리보기 planned → pending → sent",
      active: notifyEnabled && templateConfigured,
    },
    {
      id: "reminder",
      section: "리마인더",
      condition: "전일 sent + 미제출 + 리마인더 ON",
      result: "다음날 KST 09:00 재발송",
      active: notifyEnabled && settings.probationEvalReminderEnabled,
    },
  ];

  return {
    title: "시공자 평가 알림톡 발송 규칙",
    subtitle: "아래에서 규칙을 조절하고 저장하면 미리보기·자동 발송에 바로 반영됩니다.",
    gradeOrderLabel: GRADE_ORDER,
    rows,
    settingsSummary: {
      notifyEnabled,
      masterEnabled,
      templateConfigured,
      notifyTime: `${padTimePart(settings.probationEvalNotifyHour)}:${padTimePart(settings.probationEvalNotifyMinute)} (KST)`,
      reminderEnabled: settings.probationEvalReminderEnabled,
      subjectMaxGrade: rules.probationEvalSubjectMaxGrade,
      evaluatorGrades,
      evaluatorModeLabel: describeProbationEvalEvaluatorMode(rules.probationEvalEvaluatorMode),
      companionGrades,
    },
  };
}
