/**
 * Worker individual billing rate (worker.customChargeCost):
 *   number >= 0  explicit rate — 0 is a real 0원 rate
 *   null/absent  no individual rate — fall back to the client rate with `??`
 * Mirrors server/workerChargeRate.mjs.
 */

export type WorkerChargeRateDraft =
  | { kind: "null" }
  | { kind: "value"; value: number }
  | { kind: "invalid"; message: string };

export const WORKER_RATE_ZERO_CONFIRM = "신규 매출전표의 청구단가가 0원으로 적용됩니다.";
export const WORKER_RATE_SCOPE_NOTICE =
  "개별청구단가 변경은 신규 매출전표와 이후 CalWalk 가져오기에만 적용됩니다. 기존 확정 매출전표는 자동 변경되지 않습니다.";

/** Raw input → draft. Empty means "no individual rate" (null), never 0. */
export function parseWorkerChargeCostDraft(raw: unknown): WorkerChargeRateDraft {
  if (raw === null || raw === undefined) return { kind: "null" };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { kind: "invalid", message: "개별청구단가는 숫자로 입력해 주세요." };
    if (raw < 0) return { kind: "invalid", message: "개별청구단가는 0원 이상이어야 합니다." };
    if (!Number.isInteger(raw)) return { kind: "invalid", message: "개별청구단가는 원 단위 정수로 입력해 주세요." };
    return { kind: "value", value: raw };
  }
  const text = String(raw).trim().replace(/,/g, "").replace(/원$/, "").trim();
  if (!text) return { kind: "null" };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { kind: "invalid", message: "개별청구단가는 숫자로 입력해 주세요." };
  return parseWorkerChargeCostDraft(Number(text));
}

/** Stored value → number | null. Absent, null and unreadable values all mean "no individual rate". */
export function readWorkerChargeCost(worker?: { customChargeCost?: unknown } | null): number | null {
  if (!worker || !Object.prototype.hasOwnProperty.call(worker, "customChargeCost")) return null;
  const draft = parseWorkerChargeCostDraft(worker.customChargeCost);
  return draft.kind === "value" ? draft.value : null;
}

export function formatWorkerChargeCostState(value: number | null) {
  if (value === null) return "기본단가";
  if (value === 0) return "0원 개별단가";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function workerChargeCostInputValue(value: number | null) {
  return value === null ? "" : String(value);
}
