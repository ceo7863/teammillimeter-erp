import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  formatWorkerChargeCostState,
  parseWorkerChargeCostDraft,
  readWorkerChargeCost,
  WORKER_RATE_SCOPE_NOTICE,
  WORKER_RATE_ZERO_CONFIRM,
  workerChargeCostInputValue,
} from "@/utils/workerChargeRate";

type WorkerChargeRateSaveFailure = { ok: false; message: string; currentValue?: number | null };

export type WorkerChargeRateSave = (
  worker: { id?: number | string; name?: string },
  value: number | null,
  expected: number | null,
) => Promise<{ ok: true; value: number | null } | WorkerChargeRateSaveFailure>;

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function WorkerChargeRateCell({
  worker,
  onSave,
}: {
  worker: { id?: number | string; name?: string; customChargeCost?: number | null };
  onSave: WorkerChargeRateSave;
}) {
  const value = readWorkerChargeCost(worker);
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const baseRef = useRef<number | null>(value);
  const savedTimerRef = useRef<number | null>(null);
  const cancelBlurRef = useRef(false);

  useEffect(() => () => {
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
  }, []);

  const commit = async (next: number | null) => {
    const expected = baseRef.current;
    if (next === value && expected === value) {
      setDraft(null);
      return;
    }
    if (next === 0 && !window.confirm(`${WORKER_RATE_ZERO_CONFIRM}\n기존 확정 매출전표는 자동 변경되지 않습니다.`)) {
      setDraft(null);
      return;
    }
    setStatus({ kind: "saving" });
    const result = await onSave(worker, next, expected);
    setDraft(null);
    if (result.ok) {
      baseRef.current = result.value;
      setStatus({ kind: "saved" });
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setStatus({ kind: "idle" }), 4000);
    } else {
      const failure = result as WorkerChargeRateSaveFailure;
      baseRef.current = failure.currentValue === undefined ? value : failure.currentValue;
      setStatus({ kind: "error", message: failure.message });
    }
  };

  const handleBlur = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const parsed = parseWorkerChargeCostDraft(draft);
    if (parsed.kind === "invalid") {
      setStatus({ kind: "error", message: parsed.message });
      setDraft(null);
      return;
    }
    void commit(parsed.kind === "null" ? null : parsed.value);
  };

  const stateKey = value === null ? "default" : value === 0 ? "zero" : "value";
  const saving = status.kind === "saving";

  return (
    <div
      className="erp-worker-rate-cell"
      data-worker-rate-cell={String(worker.id ?? "")}
      data-worker-rate-state={stateKey}
      data-worker-rate-value={value === null ? "" : String(value)}
      data-worker-rate-status={status.kind}
      title={WORKER_RATE_SCOPE_NOTICE}
    >
      <div className="erp-worker-rate-row">
        <Input
          inputMode="numeric"
          aria-label={`${worker.name || ""} 개별청구단가`}
          value={draft ?? workerChargeCostInputValue(value)}
          disabled={saving}
          onFocus={() => {
            baseRef.current = value;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelBlurRef.current = true;
              e.currentTarget.blur();
            }
          }}
          placeholder="기본단가"
          className="erp-input-compact erp-workers-charge-input text-right"
        />
        {value !== null ? (
          <button
            type="button"
            className="erp-worker-rate-default-btn"
            disabled={saving}
            title="개별단가 삭제 — 기본단가(거래처 청구단가) 사용"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              baseRef.current = value;
              void commit(null);
            }}
          >
            기본단가 사용
          </button>
        ) : null}
      </div>
      <div className="erp-worker-rate-meta">
        <span className={`erp-worker-rate-badge erp-worker-rate-badge--${stateKey}`}>{formatWorkerChargeCostState(value)}</span>
        {status.kind === "saving" ? <span className="erp-worker-rate-status">저장 중…</span> : null}
        {status.kind === "saved" ? <span className="erp-worker-rate-status erp-worker-rate-status--ok">저장완료</span> : null}
        {status.kind === "error" ? (
          <span className="erp-worker-rate-status erp-worker-rate-status--error" role="alert">
            저장 실패: {status.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
