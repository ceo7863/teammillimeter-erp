import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, LogIn, LogOut } from "lucide-react";
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
  month: "\uC6D4",
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
  emptyHistory: "\uC774\uBC88 \uB2EC \uADFC\uD0DC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyTeam: "\uC624\uB298 \uADFC\uD0DC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  notCheckedIn: "\uBBF8\uCD9C\uADFC",
  loginRequired: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.",
};

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
      <MobileRecordList className="lg:hidden">
        {records.length ? (
          records.map((record) => (
            <MobileRecordCard
              key={record.id}
              title={showName ? record.userName : record.date}
              subtitle={showName ? record.date : undefined}
              badge={
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {buildAttendanceStatusLabel(record)}
                </span>
              }
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

      <DesktopTableWrap className="hidden lg:block">
        <table className="erp-ledger-table w-full text-sm">
          <thead>
            <tr>
              {showName ? <th>{L.name}</th> : null}
              <th>{L.date}</th>
              <th>{L.status}</th>
              <th>{L.checkInTime}</th>
              <th>{L.checkOutTime}</th>
              <th>{L.duration}</th>
            </tr>
          </thead>
          <tbody>
            {records.length ? (
              records.map((record) => (
                <tr key={record.id}>
                  {showName ? <td>{record.userName}</td> : null}
                  <td>{record.date}</td>
                  <td>{buildAttendanceStatusLabel(record)}</td>
                  <td>{formatAttendanceTime(record.checkInAt)}</td>
                  <td>{formatAttendanceTime(record.checkOutAt)}</td>
                  <td>{formatWorkDuration(record.checkInAt, record.checkOutAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={showName ? 6 : 5} className="erp-ledger-empty text-center text-slate-500">
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
      <MobileRecordList className="lg:hidden">
        {rows.length ? (
          rows.map((row) => (
            <MobileRecordCard
              key={row.userId}
              title={row.userName}
              badge={
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {buildAttendanceStatusLabel(row.record)}
                </span>
              }
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

      <DesktopTableWrap className="hidden lg:block">
        <table className="erp-ledger-table w-full text-sm">
          <thead>
            <tr>
              <th>{L.name}</th>
              <th>{L.status}</th>
              <th>{L.checkInTime}</th>
              <th>{L.checkOutTime}</th>
              <th>{L.duration}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.userId}>
                  <td>{row.userName}</td>
                  <td>{buildAttendanceStatusLabel(row.record)}</td>
                  <td>{row.record?.checkInAt ? formatAttendanceTime(row.record.checkInAt) : L.notCheckedIn}</td>
                  <td>{formatAttendanceTime(row.record?.checkOutAt)}</td>
                  <td>{formatWorkDuration(row.record?.checkInAt, row.record?.checkOutAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="erp-ledger-empty text-center text-slate-500">
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

export function AttendancePage({
  attendanceRecords,
  setAttendanceRecords,
  currentUser,
}: AttendancePageProps) {
  const { recordAudit } = useAudit();
  const [feedback, setFeedback] = useState("");
  const [viewableUsers, setViewableUsers] = useState<AttendanceViewUser[]>([]);
  const [browseMonthKey, setBrowseMonthKey] = useState(() => todayAttendanceDate().slice(0, 7));
  const [browseUserId, setBrowseUserId] = useState<number | "all">("all");
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
    return filterAttendanceRecords(attendanceRecords, { userId: currentUser.id, monthKey }).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }, [attendanceRecords, currentUser?.id, monthKey]);

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
      <div className="erp-attendance-page space-y-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-6 text-slate-500">{L.loginRequired}</CardContent>
        </Card>
      </div>
    );
  }

  const statusLabel = buildAttendanceStatusLabel(todayRecord);
  const checkInEnabled = canCheckIn(todayRecord);
  const checkOutEnabled = canCheckOut(todayRecord);

  return (
    <div className="erp-attendance-page space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{L.pageTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{L.pageDesc}</p>
      </div>

      <Card className="erp-attendance-status-card rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Clock className="h-4 w-4" />
                <span>{L.today}</span>
              </div>
              <div className="text-xl font-bold text-slate-900">{formatTodayLabel(today)}</div>
              <div className="text-lg font-semibold text-slate-800">{currentUser.name}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{statusLabel}</span>
                {todayRecord?.checkInAt ? (
                  <span className="text-slate-500">
                    {L.checkInTime} {formatAttendanceTime(todayRecord.checkInAt)}
                  </span>
                ) : null}
                {todayRecord?.checkOutAt ? (
                  <span className="text-slate-500">
                    {L.checkOutTime} {formatAttendanceTime(todayRecord.checkOutAt)}
                  </span>
                ) : null}
                {todayRecord?.checkInAt && todayRecord?.checkOutAt ? (
                  <span className="font-medium text-sky-700">
                    {formatWorkDuration(todayRecord.checkInAt, todayRecord.checkOutAt)}
                  </span>
                ) : null}
              </div>
              {feedback ? <p className="text-sm font-medium text-emerald-600">{feedback}</p> : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                className="erp-attendance-clock-btn erp-attendance-clock-btn--in h-14 min-w-[140px] rounded-2xl text-base font-bold"
                disabled={!checkInEnabled}
                onClick={handleCheckIn}
              >
                <LogIn className="mr-2 h-5 w-5" />
                {L.checkIn}
              </Button>
              <Button
                type="button"
                className="erp-attendance-clock-btn erp-attendance-clock-btn--out h-14 min-w-[140px] rounded-2xl text-base font-bold"
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

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{L.myHistory}</h2>
        <AttendanceRecordsTable records={myMonthRecords} emptyLabel={L.emptyHistory} />
      </section>

      {canBrowseTeam ? (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{L.teamHistory}</h2>
              <p className="mt-1 text-sm text-slate-500">{L.teamHistoryDesc}</p>
            </div>
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:flex-wrap md:items-center">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setBrowseMonthKey((prev) => shiftMonthKey(prev, -1))}
                    aria-label={L.prevMonth}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="min-w-[8rem] text-center text-sm font-bold text-slate-800">
                    {formatMonthLabel(browseMonthKey)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setBrowseMonthKey((prev) => shiftMonthKey(prev, 1))}
                    aria-label={L.nextMonth}
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setBrowseMonthKey(monthKey)}
                  >
                    {L.thisMonth}
                  </Button>
                </div>
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">{L.name}</span>
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
                <span className="text-sm font-semibold text-slate-500 md:ml-auto">{browseRecords.length}?</span>
              </CardContent>
            </Card>
            <AttendanceRecordsTable records={browseRecords} showName emptyLabel={L.emptyBrowse} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">{L.teamToday}</h2>
            <TeamTodayTable rows={teamTodayRows} emptyLabel={L.emptyTeam} />
          </section>
        </>
      ) : null}
    </div>
  );
}
