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
  const matches = records.filter((record) => record.userId === userId && record.date === date);
  if (!matches.length) return undefined;
  if (matches.length === 1) return matches[0];
  return pickPreferredAttendanceRecord(...matches);
}

function attendanceRecordKey(record: Pick<AttendanceRecord, "userId" | "date">) {
  return `${record.userId}:${record.date}`;
}

function pickPreferredAttendanceRecord(a: AttendanceRecord, b: AttendanceRecord) {
  if (a.checkInAt && !b.checkInAt) return a;
  if (!a.checkInAt && b.checkInAt) return b;
  const aUpdated = String(a.updatedAt || a.createdAt || "");
  const bUpdated = String(b.updatedAt || b.createdAt || "");
  return bUpdated >= aUpdated ? b : a;
}

export function dedupeAttendanceRecords(records: AttendanceRecord[]) {
  const map = new Map<string, AttendanceRecord>();
  for (const row of normalizeAttendanceRecords(records)) {
    const key = attendanceRecordKey(row);
    const prev = map.get(key);
    map.set(key, prev ? pickPreferredAttendanceRecord(prev, row) : row);
  }
  return [...map.values()];
}

export function mergeAttendanceRecords(local: AttendanceRecord[], incoming: AttendanceRecord[]) {
  const map = new Map<string, AttendanceRecord>();
  for (const row of dedupeAttendanceRecords(incoming)) {
    map.set(attendanceRecordKey(row), row);
  }
  for (const row of dedupeAttendanceRecords(local)) {
    const key = attendanceRecordKey(row);
    const prev = map.get(key);
    map.set(key, prev ? pickPreferredAttendanceRecord(row, prev) : row);
  }
  return [...map.values()];
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

export function isoToKstTimeInput(iso?: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KOREA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function buildKstIso(date: string, time: string) {
  const trimmed = String(time || "").trim();
  if (!trimmed) return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const hour = String(match[1]).padStart(2, "0");
  const minute = match[2];
  return `${date.slice(0, 10)}T${hour}:${minute}:00+09:00`;
}

export type AdminAttendanceSaveInput = {
  userId: number;
  userName: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  memo?: string;
  existingRecord?: AttendanceRecord;
};

export function saveAdminAttendanceRecord(
  records: AttendanceRecord[],
  input: AdminAttendanceSaveInput,
): AttendanceClockResult {
  const date = String(input.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "\uC77C\uC790 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }
  if (!input.userId) {
    return { ok: false, message: "\uC0AC\uC6A9\uC790\uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const checkInAt = buildKstIso(date, input.checkInTime || "");
  const checkOutAt = buildKstIso(date, input.checkOutTime || "");
  const existing =
    input.existingRecord ?? records.find((row) => row.userId === input.userId && row.date === date);

  if (!checkInAt && !checkOutAt) {
    if (!existing) {
      return { ok: false, message: "\uCD9C\uADFC \uB610\uB294 \uD1F4\uADFC \uC2DC\uAC04\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
    }
    return {
      ok: true,
      records: records.filter((row) => row.id !== existing.id),
      record: existing,
    };
  }

  if (checkOutAt && !checkInAt) {
    return { ok: false, message: "\uD1F4\uADFC \uC804\uC5D0 \uCD9C\uADFC \uC2DC\uAC04\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  if (checkInAt && checkOutAt && new Date(checkOutAt).getTime() <= new Date(checkInAt).getTime()) {
    return { ok: false, message: "\uD1F4\uADFC \uC2DC\uAC04\uC740 \uCD9C\uADFC \uC2DC\uAC04\uBCF4\uB2E4 \uB4A4\uC5EC\uC57C \uD569\uB2C8\uB2E4." };
  }

  const now = new Date().toISOString();
  const memo = String(input.memo || "").trim() || undefined;
  const record: AttendanceRecord = existing
    ? {
        ...existing,
        userName: input.userName,
        checkInAt,
        checkOutAt,
        memo,
        updatedAt: now,
      }
    : {
        id: makeAttendanceId(),
        userId: input.userId,
        userName: input.userName,
        date,
        checkInAt,
        checkOutAt,
        memo,
        createdAt: now,
        updatedAt: now,
      };

  return { ok: true, records: dedupeAttendanceRecords(upsertRecord(records, record)), record };
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

  return { ok: true, records: dedupeAttendanceRecords(upsertRecord(records, record)), record };
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

  return { ok: true, records: dedupeAttendanceRecords(upsertRecord(records, record)), record };
}
