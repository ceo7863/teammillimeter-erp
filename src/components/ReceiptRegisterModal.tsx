/**
 * Official Receipt Register modal — single write UX for cash/personal/bank/other.
 * All entry points must render this component and call createReceiptRegisterApi
 * (or createBankTransactionReceiptApi when bankTransactionId is set).
 */
import { useEffect, useMemo, useState } from "react";
import {
  createBankTransactionReceiptApi,
  createReceiptRegisterApi,
  type ReceiptApiResult,
} from "@/utils/erpApi";
import { makeReceiptOperationId, type ReceiptSource } from "@/utils/receiptLedger";
import {
  ALLOCATION_TARGET_MODE_LABELS,
  GLOBAL_FIFO_WARNING,
  allocationTargetModeLabel,
  resolveDefaultAllocationTargetMode,
  shouldAutoAllocate,
  type AllocationTargetMode,
} from "@/utils/allocationTargetPolicy";

export type ReceiptRegisterChannel = "bank" | "cash" | "personal_account" | "other";

export type ReceiptRegisterClient = {
  id: string | number;
  name: string;
};

export type ReceiptRegisterSalePreview = {
  saleId: string | number;
  date?: string;
  site?: string;
  billed?: number;
  unpaid?: number;
  allocate?: number;
};

export type ReceiptRegisterModalProps = {
  open: boolean;
  onClose: () => void;
  clients: ReceiptRegisterClient[];
  /** Optional prefill */
  initialClientId?: string | number;
  initialClientName?: string;
  initialAmount?: number;
  initialDate?: string;
  initialChannel?: ReceiptRegisterChannel;
  initialAllocations?: Array<{ saleId: string | number; amount: number }>;
  initialTargetMode?: AllocationTargetMode;
  initialPeriodStart?: string;
  initialPeriodEnd?: string;
  sentStatementId?: string;
  bankTransactionId?: string;
  source?: string;
  /** Preview rows for FIFO / manual selection */
  previewSales?: ReceiptRegisterSalePreview[];
  outstandingBefore?: number;
  onSaved?: (result: ReceiptApiResult) => void;
  title?: string;
};

const CHANNEL_OPTIONS: Array<{ value: ReceiptRegisterChannel; label: string }> = [
  { value: "bank", label: "법인통장" },
  { value: "cash", label: "현금" },
  { value: "personal_account", label: "개인계좌" },
  { value: "other", label: "기타" },
];

const TARGET_MODE_OPTIONS: AllocationTargetMode[] = [
  "UNAPPLIED",
  "STATEMENT",
  "PERIOD",
  "SELECTED_SALES",
  "GLOBAL_FIFO",
];

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function todaySeoul() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function ReceiptRegisterModal({
  open,
  onClose,
  clients,
  initialClientId,
  initialClientName,
  initialAmount = 0,
  initialDate,
  initialChannel = "cash",
  initialAllocations,
  initialTargetMode,
  initialPeriodStart,
  initialPeriodEnd,
  sentStatementId,
  bankTransactionId,
  source = "receivables",
  previewSales = [],
  outstandingBefore,
  onSaved,
  title = "입금 등록",
}: ReceiptRegisterModalProps) {
  const [clientId, setClientId] = useState(String(initialClientId || ""));
  const [receiptDate, setReceiptDate] = useState(initialDate || todaySeoul());
  const [grossAmount, setGrossAmount] = useState(String(initialAmount || ""));
  const [channel, setChannel] = useState<ReceiptRegisterChannel>(initialChannel);
  const [receivedBy, setReceivedBy] = useState("");
  const [memo, setMemo] = useState("");
  const [targetMode, setTargetMode] = useState<AllocationTargetMode>(() =>
    resolveDefaultAllocationTargetMode({
      initialTargetMode,
      initialAllocations,
      initialPeriodStart,
      initialPeriodEnd,
      sentStatementId,
    }),
  );
  const [periodStart, setPeriodStart] = useState(initialPeriodStart || "");
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd || "");
  const [globalFifoConfirmed, setGlobalFifoConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [manualAllocations, setManualAllocations] = useState(
    () =>
      initialAllocations ||
      previewSales
        .filter((row) => money(row.allocate) > 0)
        .map((row) => ({
          saleId: row.saleId,
          amount: money(row.allocate),
        })),
  );

  useEffect(() => {
    if (!open) return;
    setClientId(String(initialClientId || ""));
    setReceiptDate(initialDate || todaySeoul());
    setGrossAmount(String(initialAmount || ""));
    setChannel(initialChannel);
    setTargetMode(
      resolveDefaultAllocationTargetMode({
        initialTargetMode,
        initialAllocations,
        initialPeriodStart,
        initialPeriodEnd,
        sentStatementId,
      }),
    );
    setPeriodStart(initialPeriodStart || "");
    setPeriodEnd(initialPeriodEnd || "");
    setGlobalFifoConfirmed(false);
    setManualAllocations(
      initialAllocations ||
        previewSales
          .filter((row) => money(row.allocate) > 0)
          .map((row) => ({
            saleId: row.saleId,
            amount: money(row.allocate),
          })),
    );
    setError("");
    // Reset form only when modal opens (avoid wiping edits on parent re-render).
  }, [open]);

  const selectedClient = useMemo(() => {
    const byId = clients.find((row) => String(row.id) === String(clientId));
    if (byId) return byId;
    if (initialClientName) {
      return clients.find((row) => String(row.name).trim() === String(initialClientName).trim());
    }
    return null;
  }, [clients, clientId, initialClientName]);

  const amount = money(grossAmount);
  const allocatedPreview =
    targetMode === "UNAPPLIED"
      ? 0
      : targetMode === "SELECTED_SALES"
        ? manualAllocations.reduce((sum, row) => sum + money(row.amount), 0)
        : previewSales.reduce((sum, row) => sum + money(row.allocate), 0);
  const outstandingAfter =
    outstandingBefore != null ? Math.max(0, money(outstandingBefore) - Math.min(amount, money(outstandingBefore))) : null;

  const autoAllocate = shouldAutoAllocate(targetMode);
  const previewNote =
    targetMode === "UNAPPLIED"
      ? "업체만 확정하고 매출 충당은 하지 않습니다. 입금전표는 미충당으로 보존됩니다."
      : targetMode === "GLOBAL_FIFO"
        ? "전체 오래된 미수부터 자동 충당합니다. 과거 누락 입금이 있으면 잘못된 매출에 배정될 수 있습니다."
        : targetMode === "SELECTED_SALES"
          ? "선택한 매출에만 배정합니다."
          : targetMode === "PERIOD"
            ? "지정 기간 매출 범위 안에서만 자동 충당합니다."
            : "특정 내역서 매출 범위 안에서만 자동 충당합니다.";

  if (!open) return null;

  const submit = async () => {
    if (saving) return;
    if (!selectedClient?.id) {
      setError("업체를 선택하세요.");
      return;
    }
    if (amount <= 0) {
      setError("입금액을 입력하세요.");
      return;
    }
    if (targetMode === "GLOBAL_FIFO" && !globalFifoConfirmed) {
      setError("전체 FIFO 충당 경고를 확인한 뒤 체크해야 저장할 수 있습니다.");
      return;
    }
    if (targetMode === "PERIOD" && (!periodStart || !periodEnd)) {
      setError("기간을 입력하세요.");
      return;
    }
    if (targetMode === "STATEMENT" && !sentStatementId) {
      setError("내역서 ID가 필요합니다.");
      return;
    }
    if (targetMode === "SELECTED_SALES" && manualAllocations.length === 0) {
      setError("배정할 매출을 선택하세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let result: ReceiptApiResult;
      if (bankTransactionId) {
        result = await createBankTransactionReceiptApi(bankTransactionId, {
          operationId: makeReceiptOperationId("bank-register"),
          clientId: selectedClient.id,
          targetMode,
          periodStart: targetMode === "PERIOD" ? periodStart : undefined,
          periodEnd: targetMode === "PERIOD" ? periodEnd : undefined,
          saleIds:
            targetMode === "SELECTED_SALES"
              ? manualAllocations.map((row) => row.saleId)
              : undefined,
          allocations: targetMode === "SELECTED_SALES" ? manualAllocations : undefined,
          autoAllocate,
          requireSentStatements: targetMode === "STATEMENT",
          sentStatementId: targetMode === "STATEMENT" ? sentStatementId : undefined,
          memo: [memo, receivedBy ? `받은사람:${receivedBy}` : ""].filter(Boolean).join(" · "),
          source: "bank_manual",
        });
      } else {
        result = await createReceiptRegisterApi({
          operationId: makeReceiptOperationId(source || "register"),
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          receiptDate,
          grossAmount: amount,
          channel,
          source: (source || "receivables") as ReceiptSource,
          memo: [memo, receivedBy ? `받은사람:${receivedBy}` : ""].filter(Boolean).join(" · "),
          targetMode,
          periodStart: targetMode === "PERIOD" ? periodStart : undefined,
          periodEnd: targetMode === "PERIOD" ? periodEnd : undefined,
          saleIds:
            targetMode === "SELECTED_SALES"
              ? manualAllocations.map((row) => row.saleId)
              : undefined,
          allocations: targetMode === "SELECTED_SALES" ? manualAllocations : undefined,
          autoAllocate,
          requireSentStatements: targetMode === "STATEMENT",
          sentStatementId: targetMode === "STATEMENT" ? sentStatementId : undefined,
        });
      }
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "입금 등록에 실패했습니다.");
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
        data-receipt-register-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">공식 입금 등록 · Receipt / Allocation</p>
          </div>
          <button type="button" className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">업체</span>
            <select
              className="rounded border border-slate-300 px-3 py-2"
              value={selectedClient ? String(selectedClient.id) : clientId}
              onChange={(event) => setClientId(event.target.value)}
            >
              <option value="">선택</option>
              {clients.map((client) => (
                <option key={String(client.id)} value={String(client.id)}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">입금일</span>
              <input
                type="date"
                className="rounded border border-slate-300 px-3 py-2"
                value={receiptDate}
                onChange={(event) => setReceiptDate(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">입금액</span>
              <input
                type="number"
                className="rounded border border-slate-300 px-3 py-2"
                value={grossAmount}
                onChange={(event) => setGrossAmount(event.target.value)}
                min={0}
                data-receipt-amount-input="true"
              />
            </label>
          </div>

          {!bankTransactionId ? (
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">결제수단</span>
              <select
                className="rounded border border-slate-300 px-3 py-2"
                value={channel}
                onChange={(event) => setChannel(event.target.value as ReceiptRegisterChannel)}
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
              연결 통장거래: <code>{bankTransactionId}</code>
            </p>
          )}

          <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">충당 대상</legend>
            <div className="grid gap-2">
              {TARGET_MODE_OPTIONS.map((mode) => {
                const disabled =
                  (mode === "STATEMENT" && !sentStatementId) ||
                  (mode === "SELECTED_SALES" && !(initialAllocations?.length || manualAllocations.length || previewSales.length));
                return (
                  <label
                    key={mode}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      targetMode === mode ? "border-slate-900 bg-slate-50" : "border-slate-200"
                    } ${disabled ? "opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="receipt-target-mode"
                      className="mt-1"
                      checked={targetMode === mode}
                      disabled={disabled}
                      onChange={() => {
                        setTargetMode(mode);
                        setGlobalFifoConfirmed(false);
                      }}
                    />
                    <span>
                      <span className="font-semibold text-slate-800">{ALLOCATION_TARGET_MODE_LABELS[mode]}</span>
                      {mode === "UNAPPLIED" ? (
                        <span className="mt-0.5 block text-xs text-slate-500">기본 · 업체만 확정, 미충당 보존</span>
                      ) : null}
                      {mode === "GLOBAL_FIFO" ? (
                        <span className="mt-0.5 block text-xs text-amber-700">{GLOBAL_FIFO_WARNING}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>

            {targetMode === "PERIOD" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-600">시작일</span>
                  <input
                    type="date"
                    className="rounded border border-slate-300 px-2 py-1.5"
                    value={periodStart}
                    onChange={(event) => setPeriodStart(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-600">종료일</span>
                  <input
                    type="date"
                    className="rounded border border-slate-300 px-2 py-1.5"
                    value={periodEnd}
                    onChange={(event) => setPeriodEnd(event.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {targetMode === "STATEMENT" && sentStatementId ? (
              <p className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
                내역서: <code>{sentStatementId}</code>
              </p>
            ) : null}

            {targetMode === "GLOBAL_FIFO" ? (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={globalFifoConfirmed}
                  onChange={(event) => setGlobalFifoConfirmed(event.target.checked)}
                />
                <span>
                  <strong>경고 확인:</strong> {GLOBAL_FIFO_WARNING} 전체 오래된 미수 FIFO 충당에 동의합니다.
                </span>
              </label>
            ) : null}
          </fieldset>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">받은 사람</span>
            <input
              className="rounded border border-slate-300 px-3 py-2"
              value={receivedBy}
              onChange={(event) => setReceivedBy(event.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">메모 / 증빙</span>
            <textarea
              className="min-h-[72px] rounded border border-slate-300 px-3 py-2"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>
              충당 대상: <strong>{allocationTargetModeLabel(targetMode)}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-600">{previewNote}</p>
            <p className="mt-2">
              현재 미수:{" "}
              <strong>{outstandingBefore != null ? outstandingBefore.toLocaleString("ko-KR") : "—"}</strong>
            </p>
            <p>
              처리 후 예상 미수:{" "}
              <strong>{outstandingAfter != null ? outstandingAfter.toLocaleString("ko-KR") : "—"}</strong>
            </p>
            <p>
              배정 예정 합계: <strong>{allocatedPreview.toLocaleString("ko-KR")}</strong>
              {amount > allocatedPreview ? (
                <span className="ml-2 text-violet-700">
                  (잔액 미충당/선수금 {Math.max(0, amount - allocatedPreview).toLocaleString("ko-KR")})
                </span>
              ) : null}
            </p>
            {previewSales.length > 0 && targetMode !== "UNAPPLIED" ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                {previewSales.map((row) => (
                  <li key={String(row.saleId)}>
                    {row.date || "—"} · {row.site || row.saleId} · 미수 {(row.unpaid ?? 0).toLocaleString("ko-KR")}
                    {row.allocate ? ` → 배정 ${money(row.allocate).toLocaleString("ko-KR")}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rounded border px-4 py-2 text-sm" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={submit}
              disabled={saving}
              data-receipt-register-submit="true"
            >
              {saving ? "저장 중…" : "입금 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReceiptRegisterModal;
