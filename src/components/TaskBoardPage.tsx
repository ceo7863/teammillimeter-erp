import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LayoutGrid,
  ListTodo,
  MessageCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TaskCommentThread } from "@/components/TaskCommentThread";
import type { ErpUser } from "@/utils/erpApi";
import { fetchUsers, isApiModeEnabled, type ErpUserRecord } from "@/utils/erpApi";
import { fetchTaskCommentCounts } from "@/utils/taskComments";
import { confirmDelete } from "@/utils/confirmDelete";
import {
  WORK_TASK_BOARDS,
  WORK_TASK_STATUSES,
  appendTimeline,
  canManageWorkTask,
  canMarkWorkTaskDone,
  filterWorkTasksByBoard,
  formatTaskDate,
  formatTaskDateTime,
  groupWorkTasksByStatus,
  isWorkTaskDueToday,
  isWorkTaskOverdue,
  listMyOpenTasks,
  listRecentTaskActivity,
  listTasksDueToday,
  makeWorkTaskId,
  matchesTaskBoardFilter,
  summarizeWorkTaskBoard,
  taskBoardFilterLabel,
  timelineEntryLabel,
  todayIsoDate,
  validateWorkTaskInput,
  workTaskStatusLabel,
  type TaskBoardDashboardFilter,
  type WorkTask,
  type WorkTaskBoardId,
  type WorkTaskStatus,
} from "@/utils/taskBoard";

type TaskModalState =
  | { mode: "create"; status: WorkTaskStatus }
  | { mode: "edit"; task: WorkTask };

type TaskBoardPageProps = {
  workTasks: WorkTask[];
  setWorkTasks: React.Dispatch<React.SetStateAction<WorkTask[]>>;
  currentUser: ErpUser | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SummaryChip({
  label,
  value,
  tone = "slate",
  active = false,
  onClick,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone?: "slate" | "amber" | "sky" | "emerald" | "rose" | "violet";
  active?: boolean;
  onClick?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50 text-rose-900"
            : tone === "violet"
              ? "border-violet-200 bg-violet-50 text-violet-900"
              : "border-slate-200 bg-white text-slate-700";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`erp-task-metric-card rounded-2xl border px-4 py-3 text-left shadow-sm ${toneClass} ${
        onClick ? "transition hover:brightness-[0.98]" : ""
      } ${active ? "ring-2 ring-teal-400 ring-offset-1" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold opacity-80">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          <p className="mt-0.5 text-[10px] opacity-70">건</p>
        </div>
        {Icon ? (
          <div className="rounded-xl bg-white/70 p-2 shadow-sm">
            <Icon className="h-5 w-5 opacity-80" />
          </div>
        ) : null}
      </div>
    </Tag>
  );
}

function AssigneeAvatar({ name }: { name: string }) {
  const initial = (name.trim() || "?").slice(0, 1);
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
      {initial}
    </span>
  );
}

function TaskCardButton({
  task,
  assigneeLabel,
  commentCount = 0,
  onOpen,
}: {
  task: WorkTask;
  assigneeLabel: string;
  commentCount?: number;
  onOpen: () => void;
}) {
  const overdue = isWorkTaskOverdue(task);
  const dueToday = isWorkTaskDueToday(task);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-teal-200 ${
        overdue ? "border-rose-300 ring-1 ring-rose-100" : "border-slate-200"
      }`}
    >
      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{task.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
          <AssigneeAvatar name={assigneeLabel} />
          <span className="truncate">{assigneeLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {commentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              <MessageCircle className="h-3 w-3" />
              {commentCount}
            </span>
          ) : null}
          {task.dueDate ? (
            <span
              className={`text-[10px] font-semibold ${
                overdue ? "text-rose-700" : dueToday ? "text-violet-700" : "text-slate-500"
              }`}
            >
              {formatTaskDate(task.dueDate)}
            </span>
          ) : null}
        </div>
      </div>
      {task.blockedReason ? (
        <p className="mt-2 line-clamp-2 rounded-md bg-rose-50 px-2 py-1 text-[10px] text-rose-800">
          {task.blockedReason}
        </p>
      ) : null}
    </button>
  );
}

function WidgetCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        {action}
      </header>
      <div className="max-h-56 overflow-y-auto px-3 py-2">{children}</div>
    </section>
  );
}

export function TaskBoardPage({ workTasks, setWorkTasks, currentUser }: TaskBoardPageProps) {
  const [boardId, setBoardId] = useState<WorkTaskBoardId>("ops");
  const [users, setUsers] = useState<ErpUserRecord[]>([]);
  const [modal, setModal] = useState<TaskModalState | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<TaskBoardDashboardFilter>("all");
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    title: "",
    assigneeUserId: "" as string,
    dueDate: "",
    status: "todo" as WorkTaskStatus,
    blockedReason: "",
    doneCriteria: "",
    meetingNote: "",
  });

  const isAdmin = currentUser?.role === "admin";
  const canEdit = canManageWorkTask(currentUser);

  useEffect(() => {
    void fetchUsers()
      .then((rows) => setUsers(rows.filter((u) => u.isActive !== false)))
      .catch(() => setUsers([]));
  }, []);

  const boardTasks = useMemo(() => filterWorkTasksByBoard(workTasks, boardId), [workTasks, boardId]);
  const summary = useMemo(() => summarizeWorkTaskBoard(workTasks, boardId), [workTasks, boardId]);
  const grouped = useMemo(() => groupWorkTasksByStatus(boardTasks), [boardTasks]);
  const myOpenTasks = useMemo(
    () => listMyOpenTasks(boardTasks, currentUser?.id),
    [boardTasks, currentUser?.id],
  );
  const dueTodayTasks = useMemo(() => listTasksDueToday(boardTasks), [boardTasks]);
  const recentActivity = useMemo(() => listRecentTaskActivity(boardTasks, 14), [boardTasks]);

  useEffect(() => {
    if (!isApiModeEnabled()) return;
    const refreshCounts = () => {
      const taskIds = boardTasks.map((task) => task.id);
      if (!taskIds.length) {
        setCommentCounts({});
        return;
      }
      void fetchTaskCommentCounts(taskIds)
        .then((counts) => setCommentCounts(counts))
        .catch(() => {});
    };
    refreshCounts();
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      refreshCounts();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [boardTasks]);

  const headerDateLabel = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
    [],
  );
  const detailTask = useMemo(
    () => (detailTaskId ? workTasks.find((task) => task.id === detailTaskId) ?? null : null),
    [detailTaskId, workTasks],
  );

  const handleDetailCommentCountChange = useCallback((count: number) => {
    if (!detailTaskId) return;
    setCommentCounts((prev) => {
      if (prev[detailTaskId] === count) return prev;
      return { ...prev, [detailTaskId]: count };
    });
  }, [detailTaskId]);

  const userNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const user of users) map.set(user.id, user.name || user.loginId);
    if (currentUser?.id) map.set(currentUser.id, currentUser.name || currentUser.loginId);
    return map;
  }, [users, currentUser]);

  function taskPassesFilter(task: WorkTask) {
    return matchesTaskBoardFilter(task, activeFilter, currentUser?.id);
  }

  function toggleFilter(filter: TaskBoardDashboardFilter) {
    setActiveFilter((prev) => (prev === filter ? "all" : filter));
  }

  function openTask(taskId: string) {
    setDetailTaskId(taskId);
  }

  function resolveAssigneeName(userId?: number | null) {
    if (typeof userId !== "number") return "미지정";
    return userNameById.get(userId) || `사용자 #${userId}`;
  }

  function openCreate(status: WorkTaskStatus) {
    setForm({
      title: "",
      assigneeUserId: currentUser?.id ? String(currentUser.id) : "",
      dueDate: "",
      status,
      blockedReason: "",
      doneCriteria: "",
      meetingNote: "",
    });
    setModal({ mode: "create", status });
  }

  function openEdit(task: WorkTask) {
    setForm({
      title: task.title,
      assigneeUserId: typeof task.assigneeUserId === "number" ? String(task.assigneeUserId) : "",
      dueDate: task.dueDate || "",
      status: task.status,
      blockedReason: task.blockedReason || "",
      doneCriteria: task.doneCriteria || "",
      meetingNote: task.meetingNote || "",
    });
    setModal({ mode: "edit", task });
  }

  function upsertTask() {
    if (!canEdit || !currentUser) return;
    const assigneeUserId = form.assigneeUserId ? Number(form.assigneeUserId) : null;
    const assigneeName = assigneeUserId ? resolveAssigneeName(assigneeUserId) : undefined;
    const validation = validateWorkTaskInput({
      title: form.title,
      dueDate: form.dueDate,
      status: form.status,
      blockedReason: form.blockedReason,
    });
    if (validation) {
      window.alert(validation);
      return;
    }
    if (form.status === "done" && !canMarkWorkTaskDone(currentUser)) {
      window.alert("완료 처리는 관리자만 할 수 있습니다. 검토 요청까지 이동해 주세요.");
      return;
    }

    const now = new Date().toISOString();
    if (modal?.mode === "create") {
      let task: WorkTask = {
        id: makeWorkTaskId(),
        boardId,
        title: form.title.trim(),
        assigneeUserId,
        assigneeName,
        dueDate: form.dueDate || undefined,
        status: form.status,
        blockedReason: form.blockedReason.trim() || undefined,
        doneCriteria: form.doneCriteria.trim() || undefined,
        meetingNote: form.meetingNote.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        createdByUserId: currentUser.id,
        createdByName: currentUser.name || currentUser.loginId,
        timeline: [],
      };
      task = appendTimeline(task, {
        kind: "created",
        byUserId: currentUser.id,
        byUserName: currentUser.name || currentUser.loginId,
        note: form.meetingNote.trim() || undefined,
      });
      if (form.status !== "todo") {
        task = appendTimeline(task, {
          kind: "status",
          byUserId: currentUser.id,
          byUserName: currentUser.name || currentUser.loginId,
          from: "todo",
          to: form.status,
        });
      }
      setWorkTasks((prev) => [...prev, task]);
      setModal(null);
      return;
    }

    if (modal?.mode !== "edit") return;
    const prev = modal.task;
    let next: WorkTask = {
      ...prev,
      title: form.title.trim(),
      assigneeUserId,
      assigneeName,
      dueDate: form.dueDate || undefined,
      status: form.status,
      blockedReason: form.blockedReason.trim() || undefined,
      doneCriteria: form.doneCriteria.trim() || undefined,
      meetingNote: form.meetingNote.trim() || undefined,
      updatedAt: now,
    };
    if (prev.status !== form.status) {
      next = appendTimeline(next, {
        kind: "status",
        byUserId: currentUser.id,
        byUserName: currentUser.name || currentUser.loginId,
        from: prev.status,
        to: form.status,
      });
    }
    if ((prev.assigneeUserId ?? null) !== assigneeUserId) {
      next = appendTimeline(next, {
        kind: "assignee",
        byUserId: currentUser.id,
        byUserName: currentUser.name || currentUser.loginId,
        from: resolveAssigneeName(prev.assigneeUserId),
        to: resolveAssigneeName(assigneeUserId),
      });
    }
    if ((prev.dueDate || "") !== (form.dueDate || "")) {
      next = appendTimeline(next, {
        kind: "due",
        byUserId: currentUser.id,
        byUserName: currentUser.name || currentUser.loginId,
        from: prev.dueDate || "-",
        to: form.dueDate || "-",
      });
    }
    if ((prev.blockedReason || "") !== (form.blockedReason || "")) {
      next = appendTimeline(next, {
        kind: "blocked",
        byUserId: currentUser.id,
        byUserName: currentUser.name || currentUser.loginId,
        note: form.blockedReason.trim() || undefined,
      });
    }
    setWorkTasks((rows) => rows.map((row) => (row.id === next.id ? next : row)));
    setModal(null);
  }

  function moveTaskStatus(task: WorkTask, nextStatus: WorkTaskStatus) {
    if (!canEdit || !currentUser || task.status === nextStatus) return;
    if (nextStatus === "done" && !canMarkWorkTaskDone(currentUser)) {
      window.alert("완료 처리는 관리자만 할 수 있습니다.");
      return;
    }
    if (nextStatus === "blocked") {
      const reason = window.prompt("막힌 이유를 입력해 주세요.", task.blockedReason || "");
      if (reason === null) return;
      if (!reason.trim()) {
        window.alert("보류 상태에는 막힌 이유가 필요합니다.");
        return;
      }
      setWorkTasks((rows) =>
        rows.map((row) => {
          if (row.id !== task.id) return row;
          let next = { ...row, status: nextStatus, blockedReason: reason.trim(), updatedAt: new Date().toISOString() };
          next = appendTimeline(next, {
            kind: "status",
            byUserId: currentUser.id,
            byUserName: currentUser.name || currentUser.loginId,
            from: task.status,
            to: nextStatus,
          });
          next = appendTimeline(next, {
            kind: "blocked",
            byUserId: currentUser.id,
            byUserName: currentUser.name || currentUser.loginId,
            note: reason.trim(),
          });
          return next;
        }),
      );
      return;
    }
    setWorkTasks((rows) =>
      rows.map((row) => {
        if (row.id !== task.id) return row;
        let next = { ...row, status: nextStatus, updatedAt: new Date().toISOString() };
        next = appendTimeline(next, {
          kind: "status",
          byUserId: currentUser.id,
          byUserName: currentUser.name || currentUser.loginId,
          from: task.status,
          to: nextStatus,
        });
        return next;
      }),
    );
  }

  function deleteTask(task: WorkTask) {
    if (!canEdit) return;
    if (!confirmDelete(`「${task.title}」 업무를 삭제할까요?`)) return;
    setWorkTasks((rows) => rows.filter((row) => row.id !== task.id));
    if (detailTaskId === task.id) setDetailTaskId(null);
  }

  return (
    <div className="erp-page erp-task-board-page">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="erp-text-page-title flex items-center gap-2 text-slate-900">
            <LayoutGrid className="h-6 w-6 text-teal-600" />
            업무보드
          </h1>
          <p className="mt-1 erp-text-body text-slate-600">
            {WORK_TASK_BOARDS.find((b) => b.id === boardId)?.label} · {headerDateLabel}
          </p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={() => openCreate("todo")} className="gap-1.5">
            <Plus className="h-4 w-4" />
            새 업무
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {WORK_TASK_BOARDS.map((board) => (
          <button
            key={board.id}
            type="button"
            onClick={() => {
              setBoardId(board.id);
              setActiveFilter("all");
            }}
            className={`rounded-xl border px-4 py-2 text-left transition ${
              boardId === board.id
                ? "border-teal-300 bg-teal-50 text-teal-900 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"
            }`}
          >
            <p className="text-sm font-bold">{board.label}</p>
            <p className="text-[11px] text-slate-500">{board.description}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryChip
          label="전체 업무"
          value={summary.total}
          tone="slate"
          icon={Briefcase}
          active={activeFilter === "all"}
          onClick={() => setActiveFilter("all")}
        />
        <SummaryChip
          label="진행 중"
          value={summary.doing}
          tone="sky"
          icon={Clock3}
          active={activeFilter === "doing"}
          onClick={() => toggleFilter("doing")}
        />
        <SummaryChip
          label="완료"
          value={summary.done}
          tone="emerald"
          icon={CheckCircle2}
          active={activeFilter === "done"}
          onClick={() => toggleFilter("done")}
        />
        <SummaryChip
          label="지연"
          value={summary.overdue}
          tone="rose"
          icon={AlertTriangle}
          active={activeFilter === "overdue"}
          onClick={() => toggleFilter("overdue")}
        />
        <SummaryChip
          label="오늘 마감"
          value={summary.dueToday}
          tone="violet"
          icon={CalendarClock}
          active={activeFilter === "dueToday"}
          onClick={() => toggleFilter("dueToday")}
        />
      </div>

      {activeFilter !== "all" ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          <Sparkles className="h-4 w-4 shrink-0" />
          {taskBoardFilterLabel(activeFilter)} 업무만 표시 중
          <button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => setActiveFilter("all")}>
            전체 보기
          </button>
        </div>
      ) : null}

      <div className="erp-task-kanban-scroll mb-4 overflow-x-auto pb-2">
        <div className="erp-task-kanban-grid flex min-w-[980px] gap-3">
          {WORK_TASK_STATUSES.map((column) => {
            const tasks = (grouped.get(column.id) ?? []).filter(taskPassesFilter);
            return (
              <section key={column.id} className={`erp-task-kanban-col min-w-[190px] flex-1 ${column.columnClass}`}>
                <header className={`mb-2 flex items-center justify-between rounded-xl border px-3 py-2 ${column.headerClass}`}>
                  <div>
                    <p className="text-xs font-bold">
                      {column.emoji} {column.label}
                    </p>
                    <p className="text-[10px] opacity-70">{tasks.length}건</p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      aria-label={`${column.label} 업무 추가`}
                      className="rounded-lg p-1 hover:bg-black/5"
                      onClick={() => openCreate(column.id)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </header>
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <TaskCardButton
                        task={task}
                        assigneeLabel={task.assigneeName || resolveAssigneeName(task.assigneeUserId)}
                        commentCount={commentCounts[task.id] ?? 0}
                        onOpen={() => openTask(task.id)}
                      />
                    </li>
                  ))}
                  {tasks.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                      없음
                    </li>
                  ) : null}
                  {canEdit ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => openCreate(column.id)}
                        className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 py-2 text-xs font-semibold text-slate-500 hover:border-teal-200 hover:text-teal-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        업무 추가
                      </button>
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <WidgetCard
          title="My To Do"
          icon={ListTodo}
          action={
            currentUser ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-teal-700"
                onClick={() => toggleFilter("mine")}
              >
                {activeFilter === "mine" ? "전체" : "필터"}
              </button>
            ) : null
          }
        >
          {myOpenTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">배정된 미완료 업무가 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {myOpenTasks.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="text-xs">{WORK_TASK_STATUSES.find((s) => s.id === task.status)?.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{task.title}</span>
                    {task.dueDate ? (
                      <span className="shrink-0 text-[10px] text-slate-500">{formatTaskDate(task.dueDate)}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard title="오늘 마감" icon={Calendar}>
          {dueTodayTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">오늘 마감 업무가 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {dueTodayTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/50 px-2 py-2 text-left hover:bg-violet-50"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{task.title}</span>
                    <span className="shrink-0 text-[10px] font-semibold text-violet-700">
                      {task.assigneeName || resolveAssigneeName(task.assigneeUserId)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard title="최근 업데이트" icon={Sparkles}>
          {recentActivity.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">활동 기록이 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((item, index) => (
                <li key={`${item.taskId}-${item.at}-${index}`}>
                  <button
                    type="button"
                    onClick={() => openTask(item.taskId)}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <p className="text-xs font-medium text-slate-800">
                      {item.byUserName ? `${item.byUserName} · ` : ""}
                      {item.label}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.taskTitle}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{formatTaskDateTime(item.at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
      </div>

      {detailTask ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[92vh] w-full max-w-2xl overflow-hidden sm:rounded-2xl">
            <CardContent className="flex max-h-[92vh] flex-col p-0">
              <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
                <div className="min-w-0 pr-3">
                  <p className="text-xs font-semibold text-teal-700">
                    {WORK_TASK_BOARDS.find((b) => b.id === detailTask.boardId)?.label}
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold text-slate-900">{detailTask.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {workTaskStatusLabel(detailTask.status)} · {detailTask.assigneeName || "미지정"}
                    {(commentCounts[detailTask.id] ?? 0) > 0 ? (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-slate-600">
                        · <MessageCircle className="h-3 w-3" /> {commentCounts[detailTask.id]}
                      </span>
                    ) : null}
                  </p>
                </div>
                <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => setDetailTaskId(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {detailTask.meetingNote ? (
                  <p className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-950">
                    회의 메모: {detailTask.meetingNote}
                  </p>
                ) : null}
                {detailTask.doneCriteria ? (
                  <p className="mb-3 text-sm text-slate-700">
                    <span className="font-semibold">완료 기준</span> · {detailTask.doneCriteria}
                  </p>
                ) : null}
                {detailTask.blockedReason ? (
                  <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    막힌 이유: {detailTask.blockedReason}
                  </p>
                ) : null}

                {canEdit ? (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold text-slate-500">상태 이동</p>
                    <div className="flex flex-wrap gap-1.5">
                      {WORK_TASK_STATUSES.filter((s) => s.id !== detailTask.status).map((status) => (
                        <button
                          key={status.id}
                          type="button"
                          onClick={() => moveTaskStatus(detailTask, status.id)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-200"
                        >
                          {status.emoji} {status.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <TaskCommentThread
                  taskId={detailTask.id}
                  currentUser={currentUser}
                  className="mb-4"
                  onMessagesChange={handleDetailCommentCountChange}
                />

                <details className="group rounded-xl border border-slate-100 bg-slate-50/50">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-500">
                    타임라인 ({detailTask.timeline.length})
                  </summary>
                  <ul className="space-y-2 px-3 pb-3 pt-1">
                    {[...detailTask.timeline].reverse().map((entry) => (
                      <li key={entry.id} className="flex gap-2 text-xs text-slate-600">
                        <span className="shrink-0 tabular-nums text-slate-400">{formatTaskDateTime(entry.at)}</span>
                        <span>
                          {timelineEntryLabel(entry)}
                          {entry.byUserName ? ` · ${entry.byUserName}` : ""}
                        </span>
                      </li>
                    ))}
                    {detailTask.timeline.length === 0 ? (
                      <li className="text-xs text-slate-400">기록 없음</li>
                    ) : null}
                  </ul>
                </details>
              </div>
              {canEdit ? (
                <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
                  <Button type="button" variant="secondary" className="gap-1.5" onClick={() => openEdit(detailTask)}>
                    <Pencil className="h-4 w-4" />
                    수정
                  </Button>
                  <Button type="button" variant="secondary" className="gap-1.5 text-rose-700" onClick={() => deleteTask(detailTask)}>
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {modal ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[92vh] w-full max-w-lg overflow-hidden sm:rounded-2xl">
            <CardContent className="flex max-h-[92vh] flex-col p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {modal.mode === "create" ? "업무 추가" : "업무 수정"}
                </h2>
                <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" onClick={() => setModal(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 overflow-y-auto px-4 py-4">
                <Field label="제목 *">
                  <input
                    className="erp-input w-full"
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="예: 플레이스토어 등록"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="담당">
                    <select
                      className="erp-input w-full"
                      value={form.assigneeUserId}
                      onChange={(e) => setForm((prev) => ({ ...prev, assigneeUserId: e.target.value }))}
                    >
                      <option value="">미지정</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name || user.loginId}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="마감일">
                    <input
                      type="date"
                      className="erp-input w-full"
                      value={form.dueDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="상태">
                  <select
                    className="erp-input w-full"
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as WorkTaskStatus }))}
                  >
                    {WORK_TASK_STATUSES.map((status) => (
                      <option key={status.id} value={status.id} disabled={status.id === "done" && !isAdmin}>
                        {status.emoji} {status.label}
                        {status.id === "done" && !isAdmin ? " (관리자)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="완료 기준">
                  <input
                    className="erp-input w-full"
                    value={form.doneCriteria}
                    onChange={(e) => setForm((prev) => ({ ...prev, doneCriteria: e.target.value }))}
                    placeholder="예: Git 반영 + 테스트 완료"
                  />
                </Field>
                <Field label="회의 메모">
                  <textarea
                    className="erp-input min-h-20 w-full"
                    value={form.meetingNote}
                    onChange={(e) => setForm((prev) => ({ ...prev, meetingNote: e.target.value }))}
                    placeholder="회의에서 나온 배경·결정 사항"
                  />
                </Field>
                {(form.status === "blocked" || form.blockedReason) && (
                  <Field label="막힌 이유 *">
                    <textarea
                      className="erp-input min-h-16 w-full"
                      value={form.blockedReason}
                      onChange={(e) => setForm((prev) => ({ ...prev, blockedReason: e.target.value }))}
                      placeholder="예: 애플 로그인 심사 대기"
                    />
                  </Field>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
                <Button type="button" variant="secondary" onClick={() => setModal(null)}>
                  취소
                </Button>
                <Button type="button" onClick={upsertTask}>
                  저장
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!isAdmin ? (
        <p className="mt-4 text-xs text-slate-500">
          완료(✅) 처리는 관리자만 할 수 있습니다. 작업이 끝나면 「검토 요청」으로 옮겨 주세요.
        </p>
      ) : null}
    </div>
  );
}
