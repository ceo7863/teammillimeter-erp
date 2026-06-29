export type WorkTaskBoardId = "ops" | "calwalk";

export type WorkTaskStatus = "todo" | "doing" | "review" | "done" | "blocked";

export type WorkTaskTimelineKind =
  | "created"
  | "status"
  | "assignee"
  | "due"
  | "note"
  | "blocked"
  | "doneCriteria";

export type WorkTaskTimelineEntry = {
  id: string;
  at: string;
  byUserId?: number;
  byUserName?: string;
  kind: WorkTaskTimelineKind;
  from?: string;
  to?: string;
  note?: string;
};

export type WorkTask = {
  id: string;
  boardId: WorkTaskBoardId;
  title: string;
  assigneeUserId?: number | null;
  assigneeName?: string;
  dueDate?: string;
  status: WorkTaskStatus;
  blockedReason?: string;
  doneCriteria?: string;
  meetingNote?: string;
  createdAt: string;
  updatedAt?: string;
  createdByUserId?: number;
  createdByName?: string;
  timeline: WorkTaskTimelineEntry[];
};

export const WORK_TASK_BOARDS: { id: WorkTaskBoardId; label: string; description: string }[] = [
  { id: "ops", label: "팀밀리미터 운영", description: "현장·견적·계약·세금·자재·고객" },
  { id: "calwalk", label: "CalWalk 개발", description: "개발·디자인·버그·마케팅·스토어" },
];

export const WORK_TASK_STATUSES: {
  id: WorkTaskStatus;
  label: string;
  shortLabel: string;
  emoji: string;
  columnClass: string;
  headerClass: string;
}[] = [
  {
    id: "todo",
    label: "해야 함",
    shortLabel: "해야함",
    emoji: "🟡",
    columnClass: "erp-task-col--todo",
    headerClass: "bg-amber-50 text-amber-900 border-amber-200",
  },
  {
    id: "doing",
    label: "진행 중",
    shortLabel: "진행",
    emoji: "🔵",
    columnClass: "erp-task-col--doing",
    headerClass: "bg-sky-50 text-sky-900 border-sky-200",
  },
  {
    id: "review",
    label: "검토 요청",
    shortLabel: "검토",
    emoji: "🟢",
    columnClass: "erp-task-col--review",
    headerClass: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  {
    id: "done",
    label: "완료",
    shortLabel: "완료",
    emoji: "✅",
    columnClass: "erp-task-col--done",
    headerClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  {
    id: "blocked",
    label: "보류",
    shortLabel: "보류",
    emoji: "🔴",
    columnClass: "erp-task-col--blocked",
    headerClass: "bg-rose-50 text-rose-900 border-rose-200",
  },
];

const STATUS_SET = new Set<string>(WORK_TASK_STATUSES.map((s) => s.id));
const BOARD_SET = new Set<string>(WORK_TASK_BOARDS.map((b) => b.id));

export function workTaskStatusLabel(status: WorkTaskStatus) {
  return WORK_TASK_STATUSES.find((s) => s.id === status)?.label ?? status;
}

function normalizeTimelineEntry(raw: Partial<WorkTaskTimelineEntry> & { id: string }): WorkTaskTimelineEntry {
  return {
    id: raw.id,
    at: String(raw.at || new Date().toISOString()),
    byUserId: typeof raw.byUserId === "number" ? raw.byUserId : undefined,
    byUserName: raw.byUserName ? String(raw.byUserName) : undefined,
    kind: (raw.kind as WorkTaskTimelineKind) || "note",
    from: raw.from ? String(raw.from) : undefined,
    to: raw.to ? String(raw.to) : undefined,
    note: raw.note ? String(raw.note) : undefined,
  };
}

export function normalizeWorkTask(raw: Partial<WorkTask> & { id: string }): WorkTask {
  const boardId = BOARD_SET.has(String(raw.boardId)) ? (raw.boardId as WorkTaskBoardId) : "ops";
  const status = STATUS_SET.has(String(raw.status)) ? (raw.status as WorkTaskStatus) : "todo";
  const timeline = Array.isArray(raw.timeline)
    ? raw.timeline
        .filter((row) => row && typeof row === "object" && "id" in row)
        .map((row) => normalizeTimelineEntry(row as Partial<WorkTaskTimelineEntry> & { id: string }))
    : [];

  return {
    id: raw.id,
    boardId,
    title: String(raw.title || ""),
    assigneeUserId:
      typeof raw.assigneeUserId === "number"
        ? raw.assigneeUserId
        : raw.assigneeUserId === null
          ? null
          : undefined,
    assigneeName: raw.assigneeName ? String(raw.assigneeName) : undefined,
    dueDate: raw.dueDate ? String(raw.dueDate).slice(0, 10) : undefined,
    status,
    blockedReason: raw.blockedReason ? String(raw.blockedReason) : undefined,
    doneCriteria: raw.doneCriteria ? String(raw.doneCriteria) : undefined,
    meetingNote: raw.meetingNote ? String(raw.meetingNote) : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    createdByUserId: typeof raw.createdByUserId === "number" ? raw.createdByUserId : undefined,
    createdByName: raw.createdByName ? String(raw.createdByName) : undefined,
    timeline,
  };
}

export function normalizeWorkTasks(rows: unknown[]) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && "id" in row)
    .map((row) => normalizeWorkTask(row as Partial<WorkTask> & { id: string }));
}

export function makeWorkTaskId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeTimelineEntryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `tl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWorkTaskOverdue(task: WorkTask, today = todayIsoDate()) {
  if (!task.dueDate || task.status === "done") return false;
  return task.dueDate < today;
}

export function filterWorkTasksByBoard(tasks: WorkTask[], boardId: WorkTaskBoardId) {
  return tasks.filter((task) => task.boardId === boardId);
}

export function sortWorkTasksForColumn(a: WorkTask, b: WorkTask) {
  const aOver = isWorkTaskOverdue(a) ? 0 : 1;
  const bOver = isWorkTaskOverdue(b) ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;
  const aDue = a.dueDate || "9999-12-31";
  const bDue = b.dueDate || "9999-12-31";
  if (aDue !== bDue) return aDue.localeCompare(bDue);
  return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
}

export function groupWorkTasksByStatus(tasks: WorkTask[]) {
  const map = new Map<WorkTaskStatus, WorkTask[]>();
  for (const status of WORK_TASK_STATUSES) map.set(status.id, []);
  for (const task of tasks) {
    const list = map.get(task.status);
    if (list) list.push(task);
  }
  for (const status of WORK_TASK_STATUSES) {
    map.set(status.id, [...(map.get(status.id) ?? [])].sort(sortWorkTasksForColumn));
  }
  return map;
}

export type WorkTaskBoardSummary = {
  todo: number;
  doing: number;
  review: number;
  done: number;
  blocked: number;
  overdue: number;
  totalOpen: number;
  total: number;
  dueToday: number;
};

export type TaskBoardDashboardFilter =
  | "all"
  | "doing"
  | "review"
  | "done"
  | "overdue"
  | "dueToday"
  | "mine";

export type TaskActivityItem = {
  taskId: string;
  taskTitle: string;
  at: string;
  byUserName?: string;
  label: string;
};

export function isWorkTaskDueToday(task: WorkTask, today = todayIsoDate()) {
  if (!task.dueDate || task.status === "done") return false;
  return task.dueDate === today;
}

export function matchesTaskBoardFilter(
  task: WorkTask,
  filter: TaskBoardDashboardFilter,
  viewerUserId?: number,
  today = todayIsoDate(),
) {
  switch (filter) {
    case "all":
      return true;
    case "doing":
      return task.status === "doing";
    case "review":
      return task.status === "review";
    case "done":
      return task.status === "done";
    case "overdue":
      return isWorkTaskOverdue(task, today);
    case "dueToday":
      return isWorkTaskDueToday(task, today);
    case "mine":
      return (
        typeof viewerUserId === "number" &&
        task.assigneeUserId === viewerUserId &&
        task.status !== "done"
      );
    default:
      return true;
  }
}

export function listMyOpenTasks(tasks: WorkTask[], userId?: number) {
  if (typeof userId !== "number") return [];
  return tasks
    .filter((task) => task.assigneeUserId === userId && task.status !== "done")
    .sort(sortWorkTasksForColumn);
}

export function listTasksDueToday(tasks: WorkTask[], today = todayIsoDate()) {
  return tasks.filter((task) => isWorkTaskDueToday(task, today)).sort(sortWorkTasksForColumn);
}

export function listRecentTaskActivity(tasks: WorkTask[], limit = 12): TaskActivityItem[] {
  const items: TaskActivityItem[] = [];
  for (const task of tasks) {
    if (task.timeline.length === 0) {
      items.push({
        taskId: task.id,
        taskTitle: task.title,
        at: task.createdAt,
        byUserName: task.createdByName,
        label: "업무 등록",
      });
      continue;
    }
    for (const entry of task.timeline) {
      items.push({
        taskId: task.id,
        taskTitle: task.title,
        at: entry.at,
        byUserName: entry.byUserName,
        label: timelineEntryLabel(entry),
      });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function taskBoardFilterLabel(filter: TaskBoardDashboardFilter) {
  switch (filter) {
    case "doing":
      return "진행 중";
    case "review":
      return "검토 요청";
    case "done":
      return "완료";
    case "overdue":
      return "지연";
    case "dueToday":
      return "오늘 마감";
    case "mine":
      return "내 업무";
    default:
      return "전체";
  }
}

export function summarizeWorkTaskBoard(tasks: WorkTask[], boardId: WorkTaskBoardId): WorkTaskBoardSummary {
  const scoped = filterWorkTasksByBoard(tasks, boardId);
  const summary: WorkTaskBoardSummary = {
    todo: 0,
    doing: 0,
    review: 0,
    done: 0,
    blocked: 0,
    overdue: 0,
    totalOpen: 0,
    total: scoped.length,
    dueToday: 0,
  };
  for (const task of scoped) {
    summary[task.status] += 1;
    if (task.status !== "done" && isWorkTaskOverdue(task)) summary.overdue += 1;
    if (isWorkTaskDueToday(task)) summary.dueToday += 1;
  }
  summary.totalOpen = summary.todo + summary.doing + summary.review + summary.blocked;
  return summary;
}

export function validateWorkTaskInput(input: {
  title: string;
  dueDate?: string;
  status: WorkTaskStatus;
  blockedReason?: string;
}) {
  if (!input.title.trim()) return "제목을 입력해 주세요.";
  if (input.status === "blocked" && !input.blockedReason?.trim()) {
    return "보류 상태에는 막힌 이유를 입력해 주세요.";
  }
  return null;
}

export function canManageWorkTask(user: { role?: string } | null | undefined) {
  return user?.role === "admin" || user?.role === "staff";
}

export function canMarkWorkTaskDone(user: { role?: string } | null | undefined) {
  return user?.role === "admin";
}

export function appendTimeline(
  task: WorkTask,
  entry: Omit<WorkTaskTimelineEntry, "id" | "at"> & { at?: string },
): WorkTask {
  const next: WorkTaskTimelineEntry = {
    id: makeTimelineEntryId(),
    at: entry.at || new Date().toISOString(),
    ...entry,
  };
  return {
    ...task,
    timeline: [...task.timeline, next],
    updatedAt: next.at,
  };
}

export function formatTaskDate(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short" });
}

export function formatTaskDateTime(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace("T", " ");
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timelineEntryLabel(entry: WorkTaskTimelineEntry) {
  switch (entry.kind) {
    case "created":
      return "업무 등록";
    case "status":
      return `상태 ${entry.from ? workTaskStatusLabel(entry.from as WorkTaskStatus) : ""} → ${entry.to ? workTaskStatusLabel(entry.to as WorkTaskStatus) : ""}`.trim();
    case "assignee":
      return `담당 ${entry.from || "미지정"} → ${entry.to || "미지정"}`;
    case "due":
      return `마감 ${entry.from || "-"} → ${entry.to || "-"}`;
    case "blocked":
      return entry.note ? `막힌 이유: ${entry.note}` : "막힌 이유 변경";
    case "doneCriteria":
      return "완료 기준 변경";
    default:
      return entry.note || "메모";
  }
}
