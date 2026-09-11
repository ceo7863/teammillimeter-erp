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
import { makeReceiptOperationId } from "@/utils/receiptLedger";

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

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
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
  bankTransactionId,
  source = "receivables",
  previewSales = [],
  outstandingBefore,
  onSaved,
  title = "입금 등록",
}: ReceiptRegisterModalProps) {
  const [clientId, setClientId] = useState(String(initialClientId || ""));
  const [receiptDate, setReceiptDate] = useState(
    initialDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }),
  );
  const [grossAmount, setGrossAmount] = useState(String(initialAmount || ""));
  const [channel, setChannel] = useState<ReceiptRegisterChannel>(initialChannel);
  const [receivedBy, setReceivedBy] = useState("");
  const [memo, setMemo] = useState("");
  const [autoAllocate, setAutoAllocate] = useState(!initialAllocations?.length);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [manualAllocations, setManualAllocations] = useState(
    () => initialAllocations || previewSales.filter((row) => money(row.allocate) > 0).map((row) => ({
      saleId: row.saleId,
      amount: money(row.allocate),
    })),
  );

  useEffect(() => {
    if (!open) return;
    setClientId(String(initialClientId || ""));
    setReceiptDate(initialDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }));
    setGrossAmount(String(initialAmount || ""));
    setChannel(initialChannel);
    setAutoAllocate(!initialAllocations?.length);
    setError("");
  }, [open, initialClientId, initialAmount, initialDate, initialChannel, initialAllocations]);

  const selectedClient = useMemo(() => {
    const byId = clients.find((row) => String(row.id) === String(clientId));
    if (byId) return byId;
    if (initialClientName) {
      return clients.find((row) => String(row.name).trim() === String(initialClientName).trim());
    }
    return null;
  }, [clients, clientId, initialClientName]);

  const amount = money(grossAmount);
  const allocatedPreview = autoAllocate
    ? previewSales.reduce((sum, row) => sum + money(row.allocate), 0)
    : manualAllocations.reduce((sum, row) => sum + money(row.amount), 0);
  const outstandingAfter =
    outstandingBefore != null ? Math.max(0, money(outstandingBefore) - Math.min(amount, money(outstandingBefore))) : null;

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
    setSaving(true);
    setError("");
    try {
      let result: ReceiptApiResult;
      if (bankTransactionId) {
        result = await createBankTransactionReceiptApi(bankTransactionId, {
          operationId: makeReceiptOperationId("bank-register"),
          clientId: selectedClient.id,
          allocations: autoAllocate ? undefined : manualAllocations,
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
          source: source || "receivables",
          memo: [memo, receivedBy ? `받은사람:${receivedBy}` : ""].filter(Boolean).join(" · "),
          autoAllocate,
          allocations: autoAllocate ? undefined : manualAllocations,
          requireSentStatements: true,
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

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">받은 사람</span>
            <input
              className="rounded border border-slate-300 px-3 py-2"
              value={receivedBy}
              onChange={(event) => setReceivedBy(event.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoAllocate} onChange={(event) => setAutoAllocate(event.target.checked)} />
            발송 내역서 미수 saleId에 자동 FIFO 배정
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
                <span className="ml-2 text-violet-700">(잔액 선수금 {Math.max(0, amount - allocatedPreview).toLocaleString("ko-KR")})</span>
              ) : null}
            </p>
            {previewSales.length > 0 ? (
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
