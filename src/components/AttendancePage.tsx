import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogIn,
  LogOut,
  Timer,
  UserCheck,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import {
  buildAttendanceStatusLabel,
  checkInAttendance,
  checkOutAttendance,
  filterAttendanceRecords,
  formatAttendanceTime,
  formatWorkDuration,
  findTodayAttendance,
  todayAttendanceDate,
  canCheckIn,
  canCheckOut,
  type AttendanceRecord,
} from "@/utils/attendance";
import {
  canBrowseTeamAttendance,
  type AttendanceViewUser,
} from "@/utils/attendanceAccess";
import { fetchAttendanceViewableUsers, type ErpUser } from "@/utils/erpApi";
import { formatMonthLabel, shiftMonthKey } from "@/utils/workerMonthlyPayments";
import { useAudit } from "@/context/AuditContext";
import { ATTENDANCE_AUDIT_FIELDS, snapshotAttendanceForAudit } from "@/utils/auditLog";

type AttendancePageProps = {
  attendanceRecords: AttendanceRecord[];
  setAttendanceRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
  currentUser?: ErpUser | null;
};

type AttendanceStatusKind = "absent" | "working" | "done";

const L = {
  pageTitle: "\uADFC\uD0DC \uAD00\uB9AC",
  pageDesc: "\uCD9C\uADFC\uACFC \uD1F4\uADFC \uC2DC\uAC04\uC744 \uAE30\uB85D\uD569\uB2C8\uB2E4.",
  today: "\uC624\uB298",
  checkIn: "\uCD9C\uADFC",
  checkOut: "\uD1F4\uADFC",
  myHistory: "\uB0B4 \uADFC\uD0DC \uC774\uB825",
  teamToday: "\uC624\uB298 \uD300 \uADFC\uD0DC",
  teamHistory: "\uADFC\uD0DC \uC774\uB825 \uC870\uD68C",
  teamHistoryDesc: "\uC9C1\uC6D0\uACFC \uC6D4\uC744 \uC120\uD0DD\uD574 \uC804\uCCB4 \uADFC\uD0DC \uC774\uB825\uC744 \uBCF4\uC785\uB2C8\uB2E4.",
  allUsers: "\uC804\uCCB4",
  prevMonth: "\uC774\uC804 \uB2EC",
  nextMonth: "\uB2E4\uC74C \uB2EC",
  thisMonth: "\uC774\uBC88 \uB2EC",
  emptyBrowse: "\uC120\uD0DD\uD55C \uC870\uAC74\uC758 \uADFC\uD0DC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  date: "\uB0A0\uC9DC",
  status: "\uC0C1\uD0DC",
  checkInTime: "\uCD9C\uADFC",
  checkOutTime: "\uD1F4\uADFC",
  duration: "\uADFC\uBB34 \uC2DC\uAC04",
  name: "\uC774\uB984",
  emptyHistory: "\uC120\uD0DD\uD55C \uB2EC\uC758 \uADFC\uD0DC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyTeam: "\uC624\uB298 \uADFC\uD0DC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  notCheckedIn: "\uBBF8\uCD9C\uADFC",
  loginRequired: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
  recordCount: "\uAC74",
  teamTotal: "\uC804\uCCB4",
  teamCheckedIn: "\uCD9C\uADFC",
  teamWorking: "\uADFC\uBB34 \uC911",
  teamDone: "\uD1F4\uADFC \uC644\uB8CC",
  teamAbsent: "\uBBF8\uCD9C\uADFC",
};

function getAttendanceStatusKind(record: AttendanceRecord | undefined): AttendanceStatusKind {
  if (!record?.checkInAt) return "absent";
  if (!record.checkOutAt) return "working";
  return "done";
}

function formatTodayLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(parsed);
}

function useKstClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
}

function AttendanceStatusBadge({ record }: { record?: AttendanceRecord }) {
  const kind = getAttendanceStatusKind(record);
  return (
    <span className={`erp-attendance-status-badge erp-attendance-status-badge--${kind}`}>
      {buildAttendanceStatusLabel(record)}
    </span>
  );
}

function AttendanceMonthBar({
  monthKey,
  currentMonthKey,
  onChange,
}: {
  monthKey: string;
  currentMonthKey: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="erp-attendance-month-bar">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={() => onChange(shiftMonthKey(monthKey, -1))}
        aria-label={L.prevMonth}
      >
        <ChevronLeft size={16} />
      </Button>
      <span className="erp-attendance-month-bar-label">{formatMonthLabel(monthKey)}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={() => onChange(shiftMonthKey(monthKey, 1))}
        aria-label={L.nextMonth}
      >
        <ChevronRight size={16} />
      </Button>
      {monthKey !== currentMonthKey ? (
        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => onChange(currentMonthKey)}>
          {L.thisMonth}
        </Button>
      ) : null}
    </div>
  );
}

function AttendanceSection({
  title,
  desc,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  desc?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="erp-attendance-section">
      <div className="erp-attendance-section-head">
        <div className="min-w-0">
          <h2 className="erp-attendance-section-title">
            {Icon ? (
              <span className="erp-attendance-section-icon">
                <Icon size={18} />
              </span>
            ) : null}
            {title}
          </h2>
          {desc ? <p className="erp-attendance-section-desc">{desc}</p> : null}
        </div>
        {action ? <div className="erp-attendance-section-action">{action}</div> : null}
      </div>
      <Card className="erp-attendance-section-card rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </section>
  );
}

function AttendanceRecordsTable({
  records,
  showName = false,
  emptyLabel,
}: {
  records: AttendanceRecord[];
  showName?: boolean;
  emptyLabel: string;
}) {
  return (
    <>
      <MobileRecordList className="lg:hidden erp-attendance-mobile-list">
        {records.length ? (
          records.map((record) => (
            <MobileRecordCard
              key={record.id}
              title={showName ? record.userName : record.date}
              subtitle={showName ? record.date : undefined}
              badge={<AttendanceStatusBadge record={record} />}
              fields={[
                ...(showName ? [{ label: L.name, value: record.userName, tone: "muted" as const }] : []),
                { label: L.checkInTime, value: formatAttendanceTime(record.checkInAt) },
                { label: L.checkOutTime, value: formatAttendanceTime(record.checkOutAt) },
                {
                  label: L.duration,
                  value: formatWorkDuration(record.checkInAt, record.checkOutAt),
                  tone: "success" as const,
                },
              ]}
            />
          ))
        ) : (
          <MobileRecordCard empty emptyLabel={emptyLabel} />
        )}
      </MobileRecordList>

      <DesktopTableWrap className="hidden lg:block erp-attendance-table-wrap">
        <table className="erp-attendance-table w-full text-sm">
          <thead>
            <tr>
              {showName ? <th>{L.name}</th> : null}
              <th>{L.date}</th>
              <th>{L.status}</th>
              <th>{L.checkInTime}</th>
              <th>{L.checkOutTime}</th>
              <th className="text-right">{L.duration}</th>
            </tr>
          </thead>
          <tbody>
            {records.length ? (
              records.map((record) => (
                <tr key={record.id}>
                  {showName ? <td className="font-medium text-slate-800">{record.userName}</td> : null}
                  <td>{record.date}</td>
                  <td>
                    <AttendanceStatusBadge record={record} />
                  </td>
                  <td className="erp-attendance-time-cell">{formatAttendanceTime(record.checkInAt)}</td>
                  <td className="erp-attendance-time-cell">{formatAttendanceTime(record.checkOutAt)}</td>
                  <td className="text-right font-semibold text-sky-700">
                    {formatWorkDuration(record.checkInAt, record.checkOutAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={showName ? 6 : 5} className="erp-attendance-empty">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DesktopTableWrap>
    </>
  );
}

function TeamTodayTable({
  rows,
  emptyLabel,
}: {
  rows: Array<{ userId: number; userName: string; record?: AttendanceRecord }>;
  emptyLabel: string;
}) {
  return (
    <>
      <MobileRecordList className="lg:hidden erp-attendance-mobile-list">
        {rows.length ? (
          rows.map((row) => (
            <MobileRecordCard
              key={row.userId}
              title={row.userName}
              badge={<AttendanceStatusBadge record={row.record} />}
              fields={[
                {
                  label: L.checkInTime,
                  value: row.record?.checkInAt ? formatAttendanceTime(row.record.checkInAt) : L.notCheckedIn,
                  tone: row.record?.checkInAt ? "default" : "muted",
                },
                { label: L.checkOutTime, value: formatAttendanceTime(row.record?.checkOutAt) },
                {
                  label: L.duration,
                  value: formatWorkDuration(row.record?.checkInAt, row.record?.checkOutAt),
                  tone: "success",
                },
              ]}
            />
          ))
        ) : (
          <MobileRecordCard empty emptyLabel={emptyLabel} />
        )}
      </MobileRecordList>

      <DesktopTableWrap className="hidden lg:block erp-attendance-table-wrap">
        <table className="erp-attendance-table w-full text-sm">
          <thead>
            <tr>
              <th>{L.name}</th>
              <th>{L.status}</th>
              <th>{L.checkInTime}</th>
              <th>{L.checkOutTime}</th>
              <th className="text-right">{L.duration}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.userId}>
                  <td className="font-medium text-slate-800">{row.userName}</td>
                  <td>
                    <AttendanceStatusBadge record={row.record} />
                  </td>
                  <td className="erp-attendance-time-cell">
                    {row.record?.checkInAt ? formatAttendanceTime(row.record.checkInAt) : L.notCheckedIn}
                  </td>
                  <td className="erp-attendance-time-cell">{formatAttendanceTime(row.record?.checkOutAt)}</td>
                  <td className="text-right font-semibold text-sky-700">
                    {formatWorkDuration(row.record?.checkInAt, row.record?.checkOutAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="erp-attendance-empty">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DesktopTableWrap>
    </>
  );
}

function TeamStatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "info" | "muted" | "warning";
}) {
  return (
    <div className={`erp-attendance-team-stat erp-attendance-team-stat--${tone}`}>
      <span className="erp-attendance-team-stat-value">{value}</span>
      <span className="erp-attendance-team-stat-label">{label}</span>
    </div>
  );
}

export function AttendancePage({
  attendanceRecords,
  setAttendanceRecords,
  currentUser,
}: AttendancePageProps) {
  const { recordAudit } = useAudit();
  const [feedback, setFeedback] = useState("");
  const [viewableUsers, setViewableUsers] = useState<AttendanceViewUser[]>([]);
  const [browseMonthKey, setBrowseMonthKey] = useState(() => todayAttendanceDate().slice(0, 7));
  const [myMonthKey, setMyMonthKey] = useState(() => todayAttendanceDate().slice(0, 7));
  const [browseUserId, setBrowseUserId] = useState<number | "all">("all");
  const liveClock = useKstClock();
  const canBrowseTeam = canBrowseTeamAttendance(currentUser);
  const today = todayAttendanceDate();
  const monthKey = today.slice(0, 7);

  useEffect(() => {
    if (!canBrowseTeam) {
      setViewableUsers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchAttendanceViewableUsers();
        if (!cancelled) setViewableUsers(next);
      } catch {
        if (!cancelled) setViewableUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canBrowseTeam, currentUser?.id]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const todayRecord = useMemo(() => {
    if (!currentUser?.id) return undefined;
    return findTodayAttendance(attendanceRecords, currentUser.id, today);
  }, [attendanceRecords, currentUser?.id, today]);

  const myMonthRecords = useMemo(() => {
    if (!currentUser?.id) return [];
    return filterAttendanceRecords(attendanceRecords, { userId: currentUser.id, monthKey: myMonthKey }).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }, [attendanceRecords, currentUser?.id, myMonthKey]);

  const teamTodayRows = useMemo(() => {
    if (!canBrowseTeam) return [];
    const todayRecords = filterAttendanceRecords(attendanceRecords, { date: today });
    const recordByUserId = new Map(todayRecords.map((record) => [record.userId, record]));

    if (viewableUsers.length) {
      return viewableUsers
        .map((user) => ({
          userId: user.id,
          userName: user.name,
          record: recordByUserId.get(user.id),
        }))
        .sort((a, b) => a.userName.localeCompare(b.userName, "ko"));
    }

    return todayRecords
      .map((record) => ({
        userId: record.userId,
        userName: record.userName,
        record,
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName, "ko"));
  }, [attendanceRecords, viewableUsers, today, canBrowseTeam]);

  const teamStats = useMemo(() => {
    let working = 0;
    let done = 0;
    let absent = 0;
    for (const row of teamTodayRows) {
      const kind = getAttendanceStatusKind(row.record);
      if (kind === "absent") absent += 1;
      else if (kind === "working") working += 1;
      else done += 1;
    }
    return {
      total: teamTodayRows.length,
      checkedIn: working + done,
      working,
      done,
      absent,
    };
  }, [teamTodayRows]);

  const browseRecords = useMemo(() => {
    if (!canBrowseTeam) return [];
    const allowedIds = new Set(viewableUsers.map((user) => user.id));
    return filterAttendanceRecords(attendanceRecords, { monthKey: browseMonthKey })
      .filter((record) => {
        if (!allowedIds.has(record.userId)) return false;
        if (browseUserId === "all") return true;
        return record.userId === browseUserId;
      })
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return a.userName.localeCompare(b.userName, "ko");
      });
  }, [attendanceRecords, browseMonthKey, browseUserId, viewableUsers, canBrowseTeam]);

  const handleCheckIn = () => {
    if (!currentUser?.id) return;
    const beforeCheckIn = findTodayAttendance(attendanceRecords, currentUser.id);
    const result = checkInAttendance(attendanceRecords, { id: currentUser.id, name: currentUser.name });
    if (!result.ok) {
      setFeedback(result.message);
      return;
    }
    setAttendanceRecords(result.records);
    recordAudit({
      entityType: "attendance",
      entityId: result.record.id,
      entityLabel: `${result.record.userName} \u00B7 ${result.record.date}`,
      screen: L.pageTitle,
      action: beforeCheckIn ? "update" : "create",
      before: beforeCheckIn ? snapshotAttendanceForAudit(beforeCheckIn) : undefined,
      after: snapshotAttendanceForAudit(result.record),
      fields: ATTENDANCE_AUDIT_FIELDS,
      user: currentUser,
    });
    setFeedback(`\uCD9C\uADFC \uC644\uB8CC (${formatAttendanceTime(result.record.checkInAt)})`);
  };

  const handleCheckOut = () => {
    if (!currentUser?.id) return;
    const beforeRecord = findTodayAttendance(attendanceRecords, currentUser.id);
    const result = checkOutAttendance(attendanceRecords, { id: currentUser.id, name: currentUser.name });
    if (!result.ok) {
      setFeedback(result.message);
      return;
    }
    setAttendanceRecords(result.records);
    recordAudit({
      entityType: "attendance",
      entityId: result.record.id,
      entityLabel: `${result.record.userName} \u00B7 ${result.record.date}`,
      screen: L.pageTitle,
      action: "update",
      before: beforeRecord ? snapshotAttendanceForAudit(beforeRecord) : undefined,
      after: snapshotAttendanceForAudit(result.record),
      fields: ATTENDANCE_AUDIT_FIELDS,
      user: currentUser,
    });
    setFeedback(`\uD1F4\uADFC \uC644\uB8CC (${formatAttendanceTime(result.record.checkOutAt)})`);
  };

  if (!currentUser) {
    return (
      <div className="erp-attendance-page erp-page space-y-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-6 text-slate-500">{L.loginRequired}</CardContent>
        </Card>
      </div>
    );
  }

  const statusKind = getAttendanceStatusKind(todayRecord);
  const checkInEnabled = canCheckIn(todayRecord);
  const checkOutEnabled = canCheckOut(todayRecord);
  const feedbackIsError = Boolean(feedback && (feedback.includes("\uC774\uBBF8") || feedback.includes("\uBD88\uAC00")));

  return (
    <div className="erp-attendance-page erp-page space-y-6">
      <div>
        <h1 className="erp-text-page-title">{L.pageTitle}</h1>
        <p className="erp-text-body mt-1 text-slate-500 md:mt-2">{L.pageDesc}</p>
      </div>

      <Card className={`erp-attendance-hero rounded-2xl border-slate-200 shadow-sm erp-attendance-hero--${statusKind}`}>
        <CardContent className="p-5 md:p-6">
          <div className="erp-attendance-hero-grid">
            <div className="erp-attendance-hero-main">
              <div className="erp-attendance-hero-kicker">
                <Clock className="h-4 w-4" />
                <span>{L.today}</span>
                <span className="erp-attendance-live-clock">{liveClock}</span>
              </div>
              <div className="erp-attendance-hero-date">{formatTodayLabel(today)}</div>
              <div className="erp-attendance-hero-user">{currentUser.name}</div>
              <div className="erp-attendance-hero-status-row">
                <AttendanceStatusBadge record={todayRecord} />
              </div>
              {feedback ? (
                <p className={`erp-attendance-feedback ${feedbackIsError ? "is-error" : "is-success"}`}>{feedback}</p>
              ) : null}
            </div>

            <div className="erp-attendance-hero-stats">
              <div className="erp-attendance-mini-stat">
                <span className="erp-attendance-mini-stat-label">{L.checkInTime}</span>
                <span className="erp-attendance-mini-stat-value">
                  {todayRecord?.checkInAt ? formatAttendanceTime(todayRecord.checkInAt) : "-"}
                </span>
              </div>
              <div className="erp-attendance-mini-stat">
                <span className="erp-attendance-mini-stat-label">{L.checkOutTime}</span>
                <span className="erp-attendance-mini-stat-value">
                  {todayRecord?.checkOutAt ? formatAttendanceTime(todayRecord.checkOutAt) : "-"}
                </span>
              </div>
              <div className="erp-attendance-mini-stat erp-attendance-mini-stat--accent">
                <span className="erp-attendance-mini-stat-label">{L.duration}</span>
                <span className="erp-attendance-mini-stat-value">
                  {todayRecord?.checkInAt && todayRecord?.checkOutAt
                    ? formatWorkDuration(todayRecord.checkInAt, todayRecord.checkOutAt)
                    : todayRecord?.checkInAt
                      ? "\uAE30\uB85D \uC911"
                      : "-"}
                </span>
              </div>
            </div>

            <div className="erp-attendance-hero-actions">
              <Button
                type="button"
                className="erp-attendance-clock-btn erp-attendance-clock-btn--in h-14 min-w-[9.5rem] rounded-2xl text-base font-bold"
                disabled={!checkInEnabled}
                onClick={handleCheckIn}
              >
                <LogIn className="mr-2 h-5 w-5" />
                {L.checkIn}
              </Button>
              <Button
                type="button"
                className="erp-attendance-clock-btn erp-attendance-clock-btn--out h-14 min-w-[9.5rem] rounded-2xl text-base font-bold"
                disabled={!checkOutEnabled}
                onClick={handleCheckOut}
              >
                <LogOut className="mr-2 h-5 w-5" />
                {L.checkOut}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {canBrowseTeam ? (
        <AttendanceSection title={L.teamToday} icon={Users}>
          <div className="erp-attendance-team-summary">
            <TeamStatChip label={L.teamTotal} value={teamStats.total} tone="default" />
            <TeamStatChip label={L.teamCheckedIn} value={teamStats.checkedIn} tone="success" />
            <TeamStatChip label={L.teamWorking} value={teamStats.working} tone="info" />
            <TeamStatChip label={L.teamDone} value={teamStats.done} tone="warning" />
            <TeamStatChip label={L.teamAbsent} value={teamStats.absent} tone="muted" />
          </div>
          <TeamTodayTable rows={teamTodayRows} emptyLabel={L.emptyTeam} />
        </AttendanceSection>
      ) : null}

      <AttendanceSection
        title={L.myHistory}
        icon={CalendarDays}
        action={<AttendanceMonthBar monthKey={myMonthKey} currentMonthKey={monthKey} onChange={setMyMonthKey} />}
      >
        <AttendanceRecordsTable records={myMonthRecords} emptyLabel={L.emptyHistory} />
      </AttendanceSection>

      {canBrowseTeam ? (
        <AttendanceSection title={L.teamHistory} desc={L.teamHistoryDesc} icon={UserCheck}>
          <div className="erp-attendance-browse-toolbar">
            <AttendanceMonthBar monthKey={browseMonthKey} currentMonthKey={monthKey} onChange={setBrowseMonthKey} />
            <label className="erp-attendance-browse-user">
              <span className="erp-attendance-browse-user-label">{L.name}</span>
              <select
                className="erp-input w-full rounded-xl"
                value={browseUserId === "all" ? "all" : String(browseUserId)}
                onChange={(event) => {
                  const value = event.target.value;
                  setBrowseUserId(value === "all" ? "all" : Number(value));
                }}
              >
                <option value="all">{L.allUsers}</option>
                {viewableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="erp-attendance-record-count">
              <Timer size={14} />
              {browseRecords.length}
              {L.recordCount}
            </span>
          </div>
          <AttendanceRecordsTable records={browseRecords} showName emptyLabel={L.emptyBrowse} />
        </AttendanceSection>
      ) : null}
    </div>
  );
}
