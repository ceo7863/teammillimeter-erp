import type { AuditLogEntry } from "./auditLog";

export const MAX_LOGIN_LOGS = 3000;

export type LoginLogKind = "erp" | "worker-portal";

export type LoginLogEntry = {
  id: number;
  at: string;
  userId: string | number;
  userName: string;
  loginId: string;
  role: string;
  loginType?: LoginLogKind;
};

export function isWorkerPortalLoginLog(entry: Pick<LoginLogEntry, "role" | "loginType">) {
  return entry.loginType === "worker-portal" || entry.role === "worker-portal";
}

export function loginLogKindLabel(entry: Pick<LoginLogEntry, "role" | "loginType">) {
  if (isWorkerPortalLoginLog(entry)) return "\uC2DC\uACF5\uB0B4\uC5ED\uC11C";
  return roleLabel(entry.role);
}

export type LoginUser = {
  id?: string | number;
  name?: string;
  loginId?: string;
  email?: string;
  role?: string;
};

export function roleLabel(role: string) {
  if (role === "admin") return "관리자";
  if (role === "staff") return "일반";
  return role ? String(role) : "-";
}

export function buildLoginLogEntry(user: LoginUser): LoginLogEntry {
  const at = new Date().toISOString();
  const loginId = String(user.loginId || user.email || "").trim();

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    at,
    userId: user.id ?? loginId ?? "unknown",
    userName: user.name || loginId || "\uC0AC\uC6A9\uC790",
    loginId: loginId || "-",
    role: user.role || "",
    loginType: "erp",
  };
}

export function buildWorkerPortalLoginLogEntry(input: {
  id?: string | number;
  name?: string;
  portalLoginId?: string;
}): LoginLogEntry {
  const portalLoginId = String(input.portalLoginId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    at: new Date().toISOString(),
    userId: input.id ?? portalLoginId ?? "unknown",
    userName: String(input.name || "").trim() || portalLoginId || "\uC2DC\uACF5\uC790",
    loginId: portalLoginId || "-",
    role: "worker-portal",
    loginType: "worker-portal",
  };
}

export function normalizeLoginLogs(raw: unknown): LoginLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = Number(row.id);
      const at = String(row.at || "");
      if (!id || !at) return null;
      const role = String(row.role || "");
      const loginTypeRaw = String(row.loginType || row.login_type || "");
      const loginType: LoginLogKind =
        loginTypeRaw === "worker-portal" || role === "worker-portal" ? "worker-portal" : "erp";
      return {
        id,
        at,
        userId: row.userId ?? row.user_id ?? "unknown",
        userName: String(row.userName || row.user_name || "\uC0AC\uC6A9\uC790"),
        loginId: String(row.loginId || row.login_id || "-"),
        role: loginType === "worker-portal" ? "worker-portal" : role,
        loginType,
      } satisfies LoginLogEntry;
    })
    .filter(Boolean) as LoginLogEntry[];
}

export function appendLoginLogs(existing: LoginLogEntry[], entries: LoginLogEntry[]) {
  if (!entries.length) return existing;
  return [...entries, ...existing].slice(0, MAX_LOGIN_LOGS);
}

function auditLoginToLoginLog(entry: AuditLogEntry): LoginLogEntry {
  const loginId = String(entry.userEmail || "").trim();
  let role = "";
  const after = String(entry.after || "");
  if (after.includes(" · ")) {
    const rolePart = after.split(" · ")[1]?.trim() || "";
    if (rolePart === "관리자") role = "admin";
    else if (rolePart === "일반") role = "staff";
    else role = rolePart;
  }

  return {
    id: entry.id,
    at: entry.at,
    userId: entry.entityId,
    userName: entry.userName,
    loginId: loginId || (after.includes(" · ") ? after.split(" · ")[0] : after) || "-",
    role,
  };
}

export function splitLoginLogsFromAudit(
  auditLogs: AuditLogEntry[],
  existingLoginLogs: LoginLogEntry[] = []
): { auditLogs: AuditLogEntry[]; loginLogs: LoginLogEntry[] } {
  const migrated: LoginLogEntry[] = [];
  const remaining: AuditLogEntry[] = [];

  for (const entry of auditLogs) {
    if (entry.action === "login") {
      migrated.push(auditLoginToLoginLog(entry));
    } else {
      remaining.push(entry);
    }
  }

  const loginLogs = appendLoginLogs(normalizeLoginLogs(existingLoginLogs), migrated);
  return { auditLogs: remaining, loginLogs };
}

export function migrateErpLoginLogs<T extends { auditLogs?: unknown; loginLogs?: unknown }>(payload: T) {
  const auditLogs = Array.isArray(payload.auditLogs) ? (payload.auditLogs as AuditLogEntry[]) : [];
  const existingLoginLogs = normalizeLoginLogs(payload.loginLogs);
  const split = splitLoginLogsFromAudit(auditLogs, existingLoginLogs);
  return {
    ...payload,
    auditLogs: split.auditLogs,
    loginLogs: split.loginLogs,
  };
}
