/**
 * Admin AR adjustment modal — NOT a cash receipt.
 * Preview then confirm create via /api/ar-adjustments.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createArAdjustmentApi,
  previewArAdjustmentApi,
  type ArAdjustmentPreview,
} from "@/utils/erpApi";
import { formatKRW } from "@/utils/receivables";

export type ArAdjustmentClient = {
  id: string | number;
  name: string;
};

export type ArAdjustmentModalProps = {
  open: boolean;
  onClose: () => void;
  clients: ArAdjustmentClient[];
  initialClientId?: string | number;
  initialClientName?: string;
  /** System outstanding used when confirming actual outstanding (diff → amount). */
  systemOutstanding?: number;
  onSaved?: () => void;
};

const ADJUSTMENT_TYPES = [
  { value: "CREDIT_AR_ADJUSTMENT", label: "대변 조정 (미수 감소)" },
  { value: "DEBIT_AR_ADJUSTMENT", label: "차변 조정 (미수 증가)" },
  { value: "OPENING_AR_BALANCE", label: "기초 미수" },
  { value: "HISTORICAL_COLLECTION_RECONCILIATION", label: "과거 수금 정합" },
] as const;

function todaySeoul() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function makeOpId() {
  return `aradj-ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveInitialClientId(
  clients: ArAdjustmentClient[],
  initialClientId?: string | number,
  initialClientName?: string,
) {
  if (initialClientId != null && String(initialClientId).trim()) return String(initialClientId);
  const name = String(initialClientName || "").trim();
  if (!name) return "";
  const match = clients.find((row) => String(row.name || "").trim() === name);
  return match?.id != null ? String(match.id) : "";
}

export function ArAdjustmentModal({
  open,
  onClose,
  clients,
  initialClientId,
  initialClientName,
  systemOutstanding = 0,
  onSaved,
}: ArAdjustmentModalProps) {
  const [clientId, setClientId] = useState(() =>
    resolveInitialClientId(clients, initialClientId, initialClientName),
  );
  const [effectiveDate, setEffectiveDate] = useState(todaySeoul());
  const [adjustmentType, setAdjustmentType] = useState<string>("CREDIT_AR_ADJUSTMENT");
  const [targetMode, setTargetMode] = useState<"BALANCE_ONLY" | "TARGETED">("BALANCE_ONLY");
  const [amountMode, setAmountMode] = useState<"amount" | "confirmed">("amount");
  const [amount, setAmount] = useState("");
  const [confirmedActual, setConfirmedActual] = useState("");
  const [reason, setReason] = useState("");
  const [confirmNotCash, setConfirmNotCash] = useState(false);
  const [preview, setPreview] = useState<ArAdjustmentPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setClientId(resolveInitialClientId(clients, initialClientId, initialClientName));
    setEffectiveDate(todaySeoul());
    setAdjustmentType("CREDIT_AR_ADJUSTMENT");
    setTargetMode("BALANCE_ONLY");
    setAmountMode("amount");
    setAmount("");
    setConfirmedActual("");
    setReason("");
    setConfirmNotCash(false);
    setPreview(null);
    setError("");
  }, [open, initialClientId, initialClientName, clients]);

  const resolvedAmount = useMemo(() => {
    if (amountMode === "confirmed") {
      const actual = money(confirmedActual);
      return Math.abs(money(systemOutstanding) - actual);
    }
    return Math.abs(money(amount));
  }, [amountMode, amount, confirmedActual, systemOutstanding]);

  if (!open) return null;

  async function runPreview() {
    setError("");
    setPreview(null);
    if (!clientId) {
      setError("거래처를 선택하세요.");
      return;
    }
    if (resolvedAmount <= 0) {
      setError("조정 금액이 필요합니다.");
      return;
    }
    if (!String(reason || "").trim()) {
      setError("사유를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const result = await previewArAdjustmentApi({
        clientId,
        effectiveDate,
        adjustmentType,
        targetMode,
        amount: resolvedAmount,
        memo: reason,
      });
      setPreview(result);
    } catch (err: any) {
      setError(err?.message || "미리보기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    setError("");
    if (!preview) {
      setError("먼저 미리보기를 실행하세요.");
      return;
    }
    if (!confirmNotCash) {
      setError("현금 입금이 아님을 확인해야 합니다.");
      return;
    }
    setBusy(true);
    try {
      await createArAdjustmentApi({
        operationId: makeOpId(),
        clientId,
        clientName: clients.find((row) => String(row.id) === String(clientId))?.name,
        effectiveDate,
        adjustmentType,
        targetMode,
        amount: resolvedAmount,
        memo: reason,
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || "조정 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      data-ar-adjustment-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label="미수조정"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
          <h2 className="text-base font-bold">미수조정 (관리자)</h2>
          <p className="mt-1 text-xs text-amber-200">
            이것은 현금 입금전표가 아닙니다. 미수 잔액만 조정합니다. 통장·현금·입금전표를 건드리지 않습니다.
          </p>
        </div>

        <div className="grid gap-3 p-4">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">거래처</span>
            <select
              className="rounded border border-slate-300 px-3 py-2"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPreview(null);
              }}
              data-ar-adjustment-client="true"
            >
              <option value="">선택</option>
              {clients.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">효력일</span>
            <input
              type="date"
              className="rounded border border-slate-300 px-3 py-2"
              value={effectiveDate}
              onChange={(e) => {
                setEffectiveDate(e.target.value);
                setPreview(null);
              }}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">조정 유형</span>
            <select
              className="rounded border border-slate-300 px-3 py-2"
              value={adjustmentType}
              onChange={(e) => {
                setAdjustmentType(e.target.value);
                setPreview(null);
              }}
            >
              {ADJUSTMENT_TYPES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-600">대상 모드</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={targetMode === "BALANCE_ONLY"}
                onChange={() => {
                  setTargetMode("BALANCE_ONLY");
                  setPreview(null);
                }}
              />
              BALANCE_ONLY (잔액만)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={targetMode === "TARGETED"}
                onChange={() => {
                  setTargetMode("TARGETED");
                  setPreview(null);
                }}
              />
              TARGETED (매출 지정 — 현재는 금액만)
            </label>
          </fieldset>

          <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-600">금액</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={amountMode === "amount"}
                onChange={() => {
                  setAmountMode("amount");
                  setPreview(null);
                }}
              />
              직접 금액
            </label>
            {amountMode === "amount" ? (
              <input
                type="number"
                className="rounded border border-slate-300 px-3 py-2"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setPreview(null);
                }}
                placeholder="조정 금액"
                data-ar-adjustment-amount="true"
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={amountMode === "confirmed"}
                onChange={() => {
                  setAmountMode("confirmed");
                  setPreview(null);
                }}
              />
              확인된 실제 미수 (시스템 미수와의 차이 자동 계산)
            </label>
            {amountMode === "confirmed" ? (
              <div className="grid gap-1 text-xs text-slate-600">
                <div>시스템 미수: {formatKRW(systemOutstanding)}</div>
                <input
                  type="number"
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                  value={confirmedActual}
                  onChange={(e) => {
                    setConfirmedActual(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="확인된 실제 미수"
                />
                <div>
                  자동 산출 조정액: <strong>{formatKRW(resolvedAmount)}</strong>
                </div>
              </div>
            ) : null}
          </fieldset>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">사유</span>
            <textarea
              className="min-h-[72px] rounded border border-slate-300 px-3 py-2"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setPreview(null);
              }}
              placeholder="조정 사유 (필수)"
            />
          </label>

          {preview ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div>
                미리보기 · {preview.direction === "debit" ? "차변" : "대변"} {formatKRW(preview.amount)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                입금전표/매출금액/통장/지급전표에 영향 없음 (
                {[preview.touchesReceipts, preview.touchesSalesAmounts, preview.touchesBankTransactions, preview.touchesPaymentVouchers]
                  .every((v) => v === false)
                  ? "확인됨"
                  : "확인 필요"}
                )
              </div>
            </div>
          ) : null}

          <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmNotCash}
              onChange={(e) => setConfirmNotCash(e.target.checked)}
              data-ar-adjustment-confirm-not-cash="true"
            />
            <span>
              <strong>확인:</strong> 이것은 현금 입금이 아니며, 미수 잔액 조정만 수행합니다. 되돌리려면 별도 역분개가
              필요합니다.
            </span>
          </label>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              닫기
            </Button>
            <Button type="button" variant="outline" onClick={runPreview} disabled={busy} data-ar-adjustment-preview="true">
              미리보기
            </Button>
            <Button
              type="button"
              onClick={runConfirm}
              disabled={busy || !preview || !confirmNotCash}
              data-ar-adjustment-submit="true"
            >
              조정 확정
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArAdjustmentModal;
