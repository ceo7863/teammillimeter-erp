import { currentStatementMonthKey, formatMonthLabel, shiftMonthKey } from "./workerMonthlyPayments";

export type WorkerPortalStatementAck = {
  id: string;
  workerId: string | number;
  workerName: string;
  monthKey: string;
  signatureDataUrl: string;
  confirmedAt: string;
  portalLoginId?: string;
  lineCount?: number;
  grossPay?: number;
  fee?: number;
  netPay?: number;
};

export function workerPortalPreviousMonthKey(baseMonthKey = currentStatementMonthKey()) {
  return shiftMonthKey(baseMonthKey, -1);
}

/** Past/current months only (not future). */
export function isWorkerPortalSignableMonth(monthKey: string, baseMonthKey = currentStatementMonthKey()) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return false;
  return monthKey <= baseMonthKey;
}

/** @deprecated Use isWorkerPortalSignableMonth */
export function isWorkerPortalAckMonth(monthKey: string, baseMonthKey = currentStatementMonthKey()) {
  return isWorkerPortalSignableMonth(monthKey, baseMonthKey);
}

export function makeWorkerPortalAckKey(workerId: string | number, monthKey: string) {
  return `${String(workerId)}::${monthKey}`;
}

export function findWorkerPortalAck(
  acks: WorkerPortalStatementAck[] = [],
  workerId: string | number | undefined,
  monthKey: string,
) {
  if (workerId == null || workerId === "" || !monthKey) return null;
  const key = makeWorkerPortalAckKey(workerId, monthKey);
  return acks.find((row) => makeWorkerPortalAckKey(row.workerId, row.monthKey) === key) || null;
}

export function formatWorkerPortalAckConfirmedAt(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildWorkerPortalAckConfirmMessage(monthKey: string) {
  return `${formatMonthLabel(monthKey)} \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uB0B4\uC6A9\uC744 \uD655\uC778\uD558\uC600\uC73C\uBA70, \uC704\uC640 \uAC19\uC774 \uC11C\uBA85\uD569\uB2C8\uB2E4.\n\n\uC800\uC7A5\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`;
}
