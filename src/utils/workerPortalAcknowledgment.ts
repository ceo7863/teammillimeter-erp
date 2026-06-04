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

export function isWorkerPortalAckMonth(monthKey: string, baseMonthKey = currentStatementMonthKey()) {
  return /^\d{4}-\d{2}$/.test(monthKey) && monthKey === workerPortalPreviousMonthKey(baseMonthKey);
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
  return `${formatMonthLabel(monthKey)} ????? ??? ??????, ?? ?? ?????.\n\n?????????`;
}
