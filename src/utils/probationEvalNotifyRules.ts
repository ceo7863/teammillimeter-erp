import type { NotificationSettings } from "@/utils/notificationSettings";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/utils/notificationSettings";
import { WORKER_GRADE_RANK } from "@/utils/probationEvalTypes";
import { normalizeWorkerAiRules, type WorkerAiRules } from "@/utils/workerAiRules";

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
  };
};

const GRADE_ORDER = Object.entries(WORKER_GRADE_RANK)
  .sort((a, b) => b[1] - a[1])
  .map(([grade]) => grade)
  .join(" > ");

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
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
      result: "수습·일일 평가 요청 1건씩 생성",
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
      id: "evaluator-sa",
      section: "평가자",
      condition: "같은 일정에 S등급 평가 가능 참여자 있음 (피평가자보다 높은 등급)",
      result: "S등급·A등급 평가자 각각 알림톡 (둘 다)",
      active: true,
    },
    {
      id: "evaluator-single",
      section: "평가자",
      condition: "S등급 없음 + 평가자 등급 설정 있음",
      result: `설정 등급(${evaluatorGrades}) 중 현장 최고 등급 1명`,
      active: true,
    },
    {
      id: "evaluator-fallback",
      section: "평가자",
      condition: "설정 등급에 맞는 평가자 없음 + 더 높은 등급 참여자 있음",
      result: "현장 참여자 중 최고 등급 1명(fallback)",
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
    subtitle: "아래 조건을 모두 만족할 때만 알림톡이 발송됩니다. 미리보기 표와 대조해 확인하세요.",
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
    },
  };
}
