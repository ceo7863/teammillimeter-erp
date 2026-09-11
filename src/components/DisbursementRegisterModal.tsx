/**
 * Official Disbursement Register modal.
 * Write path is gated by isDisbursementWriteEnabled() — default OFF until AP cutover approval.
 */
import { useEffect, useMemo, useState } from "react";
import {
  createDisbursementRegisterApi,
} from "@/utils/erpApi";
import { makeReceiptOperationId } from "@/utils/receiptLedger";
import { AP_LEDGER_INACTIVE_NOTICE, isDisbursementWriteEnabled } from "@/utils/featureFlags";

export type DisbursementRegisterWorker = {
  id?: string | number;
  name: string;
};

export type DisbursementRegisterPreviewItem = {
  workItemId: string;
  workDate?: string;
  site?: string;
  due?: number;
  remaining?: number;
  allocate?: number;
};

export type DisbursementRegisterModalProps = {
  open: boolean;
  onClose: () => void;
  workers: DisbursementRegisterWorker[];
  initialWorkerName?: string;
  initialAmount?: number;
  initialDate?: string;
  initialChannel?: "bank" | "cash" | "personal_account" | "other";
  bankTransactionId?: string;
  previewItems?: DisbursementRegisterPreviewItem[];
  payableBefore?: number;
  onSaved?: (result: unknown) => void;
  title?: string;
};

export function DisbursementRegisterModal({
  open,
  onClose,
  workers,
  initialWorkerName = "",
  initialAmount = 0,
  initialDate,
  initialChannel = "bank",
  bankTransactionId,
  previewItems = [],
  payableBefore,
  onSaved,
  title = "지급 등록",
}: DisbursementRegisterModalProps) {
  const writeEnabled = isDisbursementWriteEnabled();
  const [workerName, setWorkerName] = useState(initialWorkerName);
  const [disbursementDate, setDisbursementDate] = useState(
    initialDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
  );
  const [grossAmount, setGrossAmount] = useState(String(initialAmount || ""));
  const [channel, setChannel] = useState(initialChannel);
  const [paidBy, setPaidBy] = useState("");
  const [memo, setMemo] = useState("");
  const [autoAllocate, setAutoAllocate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setWorkerName(initialWorkerName);
    setGrossAmount(String(initialAmount || ""));
    setDisbursementDate(initialDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }));
    setChannel(initialChannel);
    setError("");
  }, [open, initialWorkerName, initialAmount, initialDate, initialChannel]);

  const amount = Math.round(Number(grossAmount) || 0);
  const allocatedPreview = previewItems.reduce((sum, row) => sum + Math.round(Number(row.allocate) || 0), 0);
  const payableAfter =
    payableBefore != null ? Math.max(0, Math.round(Number(payableBefore)) - Math.min(amount, Math.round(Number(payableBefore)))) : null;

  const workerOptions = useMemo(() => {
    const names = new Set(workers.map((row) => String(row.name || "").trim()).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b, "ko"));
  }, [workers]);

  if (!open) return null;

  const submit = async () => {
    if (!writeEnabled) {
      setError(AP_LEDGER_INACTIVE_NOTICE);
      return;
    }
    if (!workerName.trim()) {
      setError("시공자를 선택하세요.");
      return;
    }
    if (amount <= 0) {
      setError("지급액을 입력하세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await createDisbursementRegisterApi({
        operationId: makeReceiptOperationId("disbursement"),
        workerName: workerName.trim(),
        disbursementDate,
        grossAmount: amount,
        channel,
        bankTransactionId: bankTransactionId || null,
        autoAllocate,
        memo: [memo, paidBy ? `지급한사람:${paidBy}` : ""].filter(Boolean).join(" · "),
      });
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "지급 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        data-disbursement-register-modal="true"
        {...(!writeEnabled ? { "data-ap-ledger-inactive": "true" } : {})}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">공식 Disbursement / Allocation</p>
          </div>
          <button type="button" className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            닫기
          </button>
        </div>

        {!writeEnabled ? (
          <div
            className="mt-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-medium text-amber-950"
            role="alert"
            data-ap-ledger-inactive="true"
          >
            <p>{AP_LEDGER_INACTIVE_NOTICE}</p>
            <p className="mt-1 font-normal text-amber-900">
              모달은 미리보기만 가능하며 저장은 비활성입니다. 레거시 시공자 지급 화면을 계속 사용하세요.
            </p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">시공자</span>
            <select
              className="rounded border border-slate-300 px-3 py-2"
              value={workerName}
              onChange={(event) => setWorkerName(event.target.value)}
            >
              <option value="">선택</option>
              {workerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">지급일</span>
              <input
                type="date"
                className="rounded border border-slate-300 px-3 py-2"
                value={disbursementDate}
                onChange={(event) => setDisbursementDate(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">실제 지급액</span>
              <input
                type="number"
                className="rounded border border-slate-300 px-3 py-2"
                value={grossAmount}
                onChange={(event) => setGrossAmount(event.target.value)}
                min={0}
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">지급수단</span>
            <select
              className="rounded border border-slate-300 px-3 py-2"
              value={channel}
              onChange={(event) => setChannel(event.target.value as typeof channel)}
            >
              <option value="bank">법인통장</option>
              <option value="cash">현금</option>
              <option value="personal_account">개인계좌</option>
              <option value="other">기타</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">지급한 사람</span>
            <input className="rounded border border-slate-300 px-3 py-2" value={paidBy} onChange={(event) => setPaidBy(event.target.value)} />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoAllocate} onChange={(event) => setAutoAllocate(event.target.checked)} />
            미지급 workItem FIFO 자동 배정
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">메모 / 증빙</span>
            <textarea className="min-h-[72px] rounded border border-slate-300 px-3 py-2" value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>

          {bankTransactionId ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              연결 통장거래: <strong>{bankTransactionId}</strong>
            </p>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>
              지급 예정액(잔액): <strong>{payableBefore != null ? payableBefore.toLocaleString("ko-KR") : "—"}</strong>
            </p>
            <p>
              지급할 금액: <strong>{amount.toLocaleString("ko-KR")}</strong>
            </p>
            <p>
              지급 후 예상 미지급: <strong>{payableAfter != null ? payableAfter.toLocaleString("ko-KR") : "—"}</strong>
            </p>
            <p>
              FIFO 배정 preview: <strong>{allocatedPreview.toLocaleString("ko-KR")}</strong>
              {amount > allocatedPreview ? (
                <span className="ml-2 text-amber-800">
                  · 선지급 예상 {(amount - allocatedPreview).toLocaleString("ko-KR")}
                </span>
              ) : null}
            </p>
            {previewItems.length ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs" aria-label="FIFO 배정 preview">
                {previewItems.map((row) => (
                  <li key={row.workItemId}>
                    {row.workDate || "—"} · {row.site || row.workItemId} · 잔액 {(row.remaining ?? 0).toLocaleString("ko-KR")}
                    {row.allocate != null ? ` · 배정 ${Number(row.allocate).toLocaleString("ko-KR")}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">컷오버 전/미활성 시 신규 미지급 FIFO preview는 비어 있습니다.</p>
            )}
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <button type="button" className="rounded border px-4 py-2 text-sm" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={submit}
              disabled={saving || !writeEnabled}
              data-disbursement-register-submit="true"
            >
              {saving ? "저장 중…" : "지급 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DisbursementRegisterModal;
