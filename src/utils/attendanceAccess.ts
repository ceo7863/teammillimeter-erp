import type { ErpUser } from "./erpApi";

export type AttendanceViewUser = {
  id: number;
  name: string;
};

export function normalizeAttendanceViewUserIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map((item) => Number(item)).filter((id) => Number.isFinite(id) && id > 0))];
  return ids.length ? ids : null;
}

/** ??? ?? ?? ?? ??? ??? ??? */
export function canBrowseTeamAttendance(user: Pick<ErpUser, "role" | "attendanceViewUserIds"> | null | undefined) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(normalizeAttendanceViewUserIds(user.attendanceViewUserIds)?.length);
}

export function canViewUserAttendance(
  viewer: Pick<ErpUser, "id" | "role" | "attendanceViewUserIds"> | null | undefined,
  targetUserId: number,
) {
  if (!viewer || !targetUserId) return false;
  if (viewer.id === targetUserId) return true;
  if (viewer.role === "admin") return true;
  return normalizeAttendanceViewUserIds(viewer.attendanceViewUserIds)?.includes(targetUserId) ?? false;
}

export function resolveAttendanceViewUserIds(
  viewer: Pick<ErpUser, "id" | "role" | "attendanceViewUserIds"> | null | undefined,
  roster: AttendanceViewUser[] = [],
) {
  if (!viewer) return [];
  if (viewer.role === "admin") {
    return roster.map((user) => user.id);
  }
  const ids = new Set<number>([viewer.id]);
  for (const id of normalizeAttendanceViewUserIds(viewer.attendanceViewUserIds) || []) {
    ids.add(id);
  }
  return [...ids];
}
