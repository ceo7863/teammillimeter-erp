export type StatementGenerationType = "client" | "worker";

export type StatementClientView = "summary" | "detail";

export type StatementGenerationLog = {
  id: string;
  createdAt: string;
  createdBy: string;
  statementType: StatementGenerationType;
  subjectName: string;
  startDate: string;
  endDate: string;
  clientStatementView?: StatementClientView;
  rowCount: number;
};

const MAX_LOGS = 10;

export function makeStatementGenerationLogId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `stmt-log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeStatementGenerationLog(raw: unknown): StatementGenerationLog | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<StatementGenerationLog>;
  if (!row.id || !row.subjectName) return null;
  const statementType = row.statementType === "worker" ? "worker" : "client";
  return {
    id: String(row.id),
    createdAt: String(row.createdAt || new Date().toISOString()),
    createdBy: String(row.createdBy || ""),
    statementType,
    subjectName: String(row.subjectName),
    startDate: String(row.startDate || ""),
    endDate: String(row.endDate || ""),
    clientStatementView: row.clientStatementView === "detail" ? "detail" : statementType === "client" ? "summary" : undefined,
    rowCount: Number(row.rowCount) || 0,
  };
}

export function normalizeStatementGenerationLogs(rows: unknown[]) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeStatementGenerationLog)
    .filter((row): row is StatementGenerationLog => Boolean(row))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, MAX_LOGS);
}

export function createStatementGenerationLog(input: {
  statementType: StatementGenerationType;
  subjectName: string;
  startDate: string;
  endDate: string;
  clientStatementView?: StatementClientView;
  rowCount: number;
  createdBy?: string;
}): StatementGenerationLog {
  return {
    id: makeStatementGenerationLogId(),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy || "",
    statementType: input.statementType,
    subjectName: input.subjectName,
    startDate: input.startDate || "",
    endDate: input.endDate || "",
    clientStatementView: input.statementType === "client" ? input.clientStatementView || "summary" : undefined,
    rowCount: input.rowCount || 0,
  };
}

export function appendStatementGenerationLog(logs: StatementGenerationLog[], next: StatementGenerationLog) {
  return [next, ...logs].slice(0, MAX_LOGS);
}

export function appendStatementGenerationLogs(logs: StatementGenerationLog[], nextLogs: StatementGenerationLog[]) {
  if (!nextLogs.length) return logs;
  return [...nextLogs, ...logs].slice(0, MAX_LOGS);
}

export function removeStatementGenerationLog(logs: StatementGenerationLog[], logId: string) {
  return logs.filter((log) => log.id !== logId);
}

export function formatStatementGenerationTypeLabel(type: StatementGenerationType) {
  return type === "client" ? "\uAC70\uB798\uCC98 \uC2DC\uACF5\uBE44" : "\uC2DC\uACF5\uC790 \uC2DC\uACF5";
}

export function formatStatementGenerationViewLabel(view?: StatementClientView) {
  if (view === "detail") return "\uC0C1\uC138";
  if (view === "summary") return "\uC694\uC57D";
  return "";
}

export function formatStatementGenerationPeriod(startDate: string, endDate: string) {
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  if (startDate) return `${startDate} ~`;
  if (endDate) return `~ ${endDate}`;
  return "\uC804\uCCB4 \uAE30\uAC04";
}

export function formatStatementGenerationDateTime(iso: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace("T", " ");
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
