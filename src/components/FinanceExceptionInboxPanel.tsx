/**
 * Actionable unresolved-deposit exception inbox for 입금·미수 hub.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchUnresolvedDepositsApi,
  ignoreUnresolvedDepositApi,
  retryUnresolvedDepositApi,
} from "@/utils/erpApi";
import {
  filterActionableFinanceExceptions,
  formatExceptionReason,
  mapUnresolvedQueueToExceptionItems,
  type FinanceExceptionItem,
} from "@/utils/financeExceptionInbox";
import { formatKRW } from "@/utils/workerPayments";

export type FinanceExceptionInboxPanelProps = {
  isActive: boolean;
  refreshToken?: number;
  onCountChange?: (count: number | null, meta: { fetchFailed: boolean }) => void;
  onOpenBankTransaction?: (bankTransactionId: string) => void;
  onOpenReceiptRegister?: () => void;
  pendingExceptionId?: string | null;
  onPendingExceptionConsumed?: () => void;
};

export function FinanceExceptionInboxPanel({
  isActive,
  refreshToken = 0,
  onCountChange,
  onOpenBankTransaction,
  onOpenReceiptRegister,
  pendingExceptionId,
  onPendingExceptionConsumed,
}: FinanceExceptionInboxPanelProps) {
  const [items, setItems] = useState<FinanceExceptionItem[]>([]);
  const [actionableCount, setActionableCount] = useState<number | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchUnresolvedDepositsApi();
      const mapped = mapUnresolvedQueueToExceptionItems(payload?.actionable || payload?.unresolved || []);
      const actionable = filterActionableFinanceExceptions(mapped);
      const count =
        typeof payload?.actionableCount === "number" ? payload.actionableCount : actionable.length;
      setItems(actionable);
      setActionableCount(count);
      setFetchFailed(false);
      onCountChange?.(count, { fetchFailed: false });
    } catch {
      setFetchFailed(true);
      // Keep previous count to avoid badge flicker to 0.
      onCountChange?.(null, { fetchFailed: true });
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (!isActive && refreshToken === 0) return;
    void load();
  }, [isActive, refreshToken, load]);

  useEffect(() => {
    if (!pendingExceptionId) return;
    setSelectedId(pendingExceptionId);
    onPendingExceptionConsumed?.();
  }, [pendingExceptionId, onPendingExceptionConsumed]);

  const selected = useMemo(
    () => items.find((row) => row.exceptionId === selectedId || row.bankTransactionId === selectedId) || null,
    [items, selectedId],
  );

  const runIgnore = async (row: FinanceExceptionItem) => {
    if (!row.bankTransactionId) return;
    setBusyId(row.exceptionId);
    setActionMessage("");
    try {
      const result = await ignoreUnresolvedDepositApi(row.bankTransactionId, {
        operationId: `ignore-${row.bankTransactionId}-${Date.now()}`,
      });
      const mapped = mapUnresolvedQueueToExceptionItems(result?.actionable || result?.unresolved || []);
      const actionable = filterActionableFinanceExceptions(mapped);
      const count =
        typeof result?.actionableCount === "number" ? result.actionableCount : actionable.length;
      setItems(actionable);
      setActionableCount(count);
      onCountChange?.(count, { fetchFailed: false });
      setActionMessage("무시 처리되었습니다.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "무시 처리에 실패했습니다. 항목을 유지합니다.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const runRetry = async (row: FinanceExceptionItem) => {
    if (!row.bankTransactionId) return;
    setBusyId(row.exceptionId);
    setActionMessage("");
    try {
      const result = await retryUnresolvedDepositApi(row.bankTransactionId, {
        operationId: `retry-${row.bankTransactionId}-${Date.now()}`,
      });
      const mapped = mapUnresolvedQueueToExceptionItems(result?.actionable || result?.unresolved || []);
      const actionable = filterActionableFinanceExceptions(mapped);
      const count =
        typeof result?.actionableCount === "number" ? result.actionableCount : actionable.length;
      setItems(actionable);
      setActionableCount(count);
      onCountChange?.(count, { fetchFailed: false });
      setActionMessage("재시도 요청을 반영했습니다.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "재시도에 실패했습니다. 항목을 유지합니다.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3" data-finance-exception-inbox="true">
      <Card className="rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="space-y-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                미배정·미확인 입금
                {actionableCount != null && !fetchFailed ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900" data-exception-list-count="true">
                    {actionableCount > 99 ? "99+" : actionableCount}
                  </span>
                ) : null}
              </h2>
              <p className="text-xs text-slate-500">
                과거 492/156건·PRE_CUTOVER·해결/무시는 제외합니다. 서버 actionable count와 목록이 동일합니다.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => void load()}>
              새로고침
            </Button>
          </div>

          {fetchFailed ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
              data-exception-fetch-failed="true"
            >
              확인 필요 목록을 불러오지 못했습니다. 0건으로 표시하지 않습니다.
            </div>
          ) : null}
          {actionMessage ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{actionMessage}</div>
          ) : null}
          {loading && items.length === 0 && !fetchFailed ? (
            <div className="p-6 text-center text-sm text-slate-500">불러오는 중…</div>
          ) : null}

          <div className="erp-table-wrap">
            <table className="erp-table" aria-label="확인 필요 입금 목록">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">감지일</th>
                  <th className="text-left">거래일</th>
                  <th className="text-right">금액</th>
                  <th className="text-left">입금자명</th>
                  <th className="text-left">사유</th>
                  <th className="text-left">상태</th>
                  <th className="text-center">조치</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.exceptionId}
                    className={`cursor-pointer border-t hover:bg-amber-50 ${
                      selectedId === row.exceptionId ? "bg-amber-50" : ""
                    }`}
                    onClick={() => setSelectedId(row.exceptionId)}
                    data-exception-row={row.exceptionId}
                  >
                    <td className="text-slate-600">{row.firstSeenAt ? String(row.firstSeenAt).slice(0, 10) : "-"}</td>
                    <td className="text-slate-700">{row.transactionDate || "-"}</td>
                    <td className="text-right font-semibold text-emerald-700">{formatKRW(row.depositAmount)}</td>
                    <td className="erp-cell-clip text-left font-semibold" title={row.subject || ""}>
                      {row.subject || "-"}
                    </td>
                    <td className="text-left text-slate-700">{formatExceptionReason(row.reasonCode || row.kind)}</td>
                    <td className="text-left text-slate-600">{row.status}</td>
                    <td className="text-center" onClick={(event) => event.stopPropagation()}>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {row.bankTransactionId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg px-2 text-[11px]"
                            onClick={() => onOpenBankTransaction?.(row.bankTransactionId!)}
                            aria-label="통장거래 열기"
                          >
                            통장
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg px-2 text-[11px]"
                          onClick={() => onOpenReceiptRegister?.()}
                          aria-label="입금 등록 열기"
                        >
                          입금
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg px-2 text-[11px]"
                          disabled={busyId === row.exceptionId || !row.bankTransactionId}
                          onClick={() => void runRetry(row)}
                          aria-label="재시도"
                        >
                          재시도
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg px-2 text-[11px] text-slate-600"
                          disabled={busyId === row.exceptionId || !row.bankTransactionId}
                          onClick={() => void runIgnore(row)}
                          aria-label="무시 처리"
                        >
                          무시
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !fetchFailed && items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      확인이 필요한 입금이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <Card className="rounded-xl border-amber-200/80 shadow-sm" data-exception-detail="true">
          <CardContent className="space-y-2 p-3 md:p-4 text-sm">
            <h3 className="font-bold text-slate-900">예외 상세</h3>
            <p>사유: {formatExceptionReason(selected.reasonCode || selected.kind)}</p>
            <p>금액: {formatKRW(selected.depositAmount)}</p>
            <p>입금자: {selected.subject || "-"}</p>
            <p>은행거래: {selected.bankTransactionId || "-"}</p>
            <p>Receipt: {selected.receiptId || "-"}</p>
            <p>마지막 처리: {selected.lastCheckedAt || "-"}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default FinanceExceptionInboxPanel;
