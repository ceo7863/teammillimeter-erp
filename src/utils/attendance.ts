export type AttendanceRecord = {
  id: string;
  userId: number;
  userName: string;
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AttendanceFilter = {
  userId?: number;
  monthKey?: string;
  date?: string;
};

const KOREA_TZ = "Asia/Seoul";

export function makeAttendanceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function todayAttendanceDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KOREA_TZ }).format(new Date());
}

export function findTodayAttendance(
  records: AttendanceRecord[],
  userId: number,
  date: string = todayAttendanceDate(),
): AttendanceRecord | undefined {
  return records.find((record) => record.userId === userId && record.date === date);
}

export function canCheckIn(record: AttendanceRecord | undefined) {
  return !record?.checkInAt;
}

export function canCheckOut(record: AttendanceRecord | undefined) {
  return Boolean(record?.checkInAt) && !record?.checkOutAt;
}

export function formatAttendanceTime(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatWorkDuration(checkIn?: string, checkOut?: string) {
  if (!checkIn || !checkOut) return "-";
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms <= 0) return "-";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}\uC2DC\uAC04 ${minutes}\uBD84`;
  if (hours) return `${hours}\uC2DC\uAC04`;
  return `${minutes}\uBD84`;
}

export function filterAttendanceRecords(records: AttendanceRecord[], filter: AttendanceFilter = {}) {
  return records.filter((record) => {
    if (filter.userId != null && record.userId !== filter.userId) return false;
    if (filter.date && record.date !== filter.date) return false;
    if (filter.monthKey && !record.date.startsWith(filter.monthKey)) return false;
    return true;
  });
}

export function buildAttendanceStatusLabel(record: AttendanceRecord | undefined) {
  if (!record?.checkInAt) return "\uBBF8\uCD9C\uADFC";
  if (!record?.checkOutAt) return "\uADFC\uBB34 \uC911";
  return "\uD1F4\uADFC \uC644\uB8CC";
}

export function normalizeAttendanceRecords(value: unknown): AttendanceRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is AttendanceRecord => row && typeof row === "object" && typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      userId: Number(row.userId) || 0,
      userName: String(row.userName || ""),
      date: String(row.date || "").slice(0, 10),
      checkInAt: row.checkInAt ? String(row.checkInAt) : undefined,
      checkOutAt: row.checkOutAt ? String(row.checkOutAt) : undefined,
      memo: row.memo ? String(row.memo) : undefined,
      createdAt: row.createdAt ? String(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
    }))
    .filter((row) => row.userId > 0 && row.date);
}

function upsertRecord(records: AttendanceRecord[], record: AttendanceRecord) {
  const index = records.findIndex((row) => row.id === record.id);
  if (index >= 0) {
    return records.map((row, idx) => (idx === index ? record : row));
  }
  return [...records, record];
}

export type AttendanceClockResult =
  | { ok: true; records: AttendanceRecord[]; record: AttendanceRecord }
  | { ok: false; message: string };

export function checkInAttendance(
  records: AttendanceRecord[],
  user: { id: number; name: string },
): AttendanceClockResult {
  const date = todayAttendanceDate();
  const existing = findTodayAttendance(records, user.id, date);
  if (!canCheckIn(existing)) {
    return { ok: false, message: "\uC774\uBBF8 \uCD9C\uADFC \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  const record: AttendanceRecord = existing
    ? { ...existing, userName: user.name, checkInAt: now, updatedAt: now }
    : {
        id: makeAttendanceId(),
        userId: user.id,
        userName: user.name,
        date,
        checkInAt: now,
        createdAt: now,
        updatedAt: now,
      };

  return { ok: true, records: upsertRecord(records, record), record };
}

export function checkOutAttendance(
  records: AttendanceRecord[],
  user: { id: number; name: string },
): AttendanceClockResult {
  const date = todayAttendanceDate();
  const existing = findTodayAttendance(records, user.id, date);
  if (!canCheckOut(existing)) {
    return { ok: false, message: "\uCD9C\uADFC \uAE30\uB85D \uC5C6\uAC70\uB098 \uC774\uBBF8 \uD1F4\uADFC \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  const record: AttendanceRecord = {
    ...existing!,
    userName: user.name,
    checkOutAt: now,
    updatedAt: now,
  };

  return { ok: true, records: upsertRecord(records, record), record };
}
