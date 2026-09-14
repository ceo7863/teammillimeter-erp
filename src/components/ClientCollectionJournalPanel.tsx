/**
 * Canonical 수금원장 panel — renders server collection journal verbatim.
 *
 * Adjustment journal rows call onOpenAdjustment → host opens ArAdjustmentDetailDrawer.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  WalletCards,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { TableExportSection } from "@/components/TableExportSection";
import { DepositorAliasManager } from "@/components/DepositorAliasManager";
import { formatKRW } from "@/utils/receivables";
import { formatMonthLabel, monthRangeForKey, shiftMonthKey } from "@/utils/companyLedger";
import {
  fetchClientCollectionJournalApi,
  fetchUnifiedClientArLedgerApi,
  isApiModeEnabled,
  type ClientCollectionJournalResponse,
  type UnifiedClientArLedgerResponse,
} from "@/utils/erpApi";

const TYPE_LABEL: Record<string, string> = {
  SALE: "매출",
  RECEIPT_BANK: "통장입금",
  RECEIPT_CASH: "현금입금",
  RECEIPT_PERSONAL: "개인계좌입금",
  RECEIPT_OTHER: "기타입금",
  RECEIPT_REVERSAL: "입금취소",
  AR_DEBIT_ADJUSTMENT: "미수증가조정",
  AR_CREDIT_ADJUSTMENT: "미수감소조정",
  ADJUSTMENT_REVERSAL: "조정취소",
  OPENING: "기초미수",
  STATEMENT_SENT: "내역서 발송",
};

const FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "receipts", label: "실제 입금만" },
  { value: "adjustments", label: "미수조정만" },
  { value: "sales", label: "매출만" },
] as const;

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).slice(0, 7);
}

function SummaryCard({
  title,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  title: string;
  value: string;
  sub: string;
  tone?: "default" | "success" | "danger" | "warning";
  icon: React.ComponentType<{ size?: number }>;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-red-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-slate-950";
  return (
    <Card className="erp-summary-card erp-summary-card--compact rounded-2xl shadow-sm">
      <CardContent className="p-2.5 md:p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="erp-text-caption font-bold text-slate-500">{title}</div>
            <div className={`erp-text-stat mt-0.5 font-black ${toneClass}`}>{value}</div>
            <div className="erp-text-caption mt-0.5 text-slate-500">{sub}</div>
          </div>
          <div className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-600">
            <Icon size={16} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export type ClientCollectionJournalPanelProps = {
  clients: Array<{ id?: string | number; name?: string }>;
  initialClientName?: string;
  startDate: string;
  endDate: string;
  onRangeChange: (next: { startDate: string; endDate: string }) => void;
  onOpenReceipt?: (receiptId: string) => void;
  onOpenSale?: (saleId: string | number) => void;
  onOpenAdjustment?: (adjustmentId: string) => void;
};

export function ClientCollectionJournalPanel({
  clients,
  initialClientName = "",
  startDate,
  endDate,
  onRangeChange,
  onOpenReceipt,
  onOpenSale,
  onOpenAdjustment,
}: ClientCollectionJournalPanelProps) {
  const [clientName, setClientName] = useState(initialClientName);
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]["value"]>("all");
  const [monthKey, setMonthKey] = useState(() => {
    if (startDate && endDate && startDate.slice(0, 7) === endDate.slice(0, 7)) {
      return startDate.slice(0, 7);
    }
    return currentMonthKey();
  });
  const [journal, setJournal] = useState<ClientCollectionJournalResponse | null>(null);
  const [saleLedger, setSaleLedger] = useState<UnifiedClientArLedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saleBalanceOpen, setSaleBalanceOpen] = useState(false);

  const clientId = useMemo(() => {
    const target = String(clientName || "").trim();
    if (!target) return "";
    const row = clients.find((item) => String(item.name || "").trim() === target);
    return row?.id != null ? String(row.id) : "";
  }, [clientName, clients]);

  useEffect(() => {
    if (initialClientName) setClientName(initialClientName);
  }, [initialClientName]);

  useEffect(() => {
    if (!isApiModeEnabled()) {
      setJournal(null);
      setError("수금원장은 서버 모드에서만 조회할 수 있습니다.");
      return;
    }
    if (!clientId) {
      setJournal(null);
      setSaleLedger(null);
      setError(clientName ? "거래처 마스터에서 해당 거래처를 찾을 수 없습니다." : "");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      fetchClientCollectionJournalApi(clientId, { start: startDate, end: endDate, filter }),
      fetchUnifiedClientArLedgerApi(clientId, { start: startDate, end: endDate }),
    ])
      .then(([journalResult, ledgerResult]) => {
        if (cancelled) return;
        setJournal(journalResult);
        setSaleLedger(ledgerResult);
      })
      .catch((cause) => {
        if (cancelled) return;
        setJournal(null);
        setSaleLedger(null);
        setError(cause?.message || "수금원장을 조회할 수 없습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, clientName, startDate, endDate, filter]);

  const goMonth = (delta: number) => {
    const next = shiftMonthKey(monthKey, delta);
    setMonthKey(next);
    const range = monthRangeForKey(next);
    onRangeChange({ startDate: range.startDate, endDate: range.endDate });
  };

  const applyCurrentMonth = () => {
    const key = currentMonthKey();
    setMonthKey(key);
    const range = monthRangeForKey(key);
    onRangeChange({ startDate: range.startDate, endDate: range.endDate });
  };

  const summary = journal?.summary;
  const contrast = journal?.balanceContrast || {};
  const entries = journal?.entries || [];
  const monthly = journal?.monthlySummaries || [];

  const onRowClick = (entry: (typeof entries)[number]) => {
    const ref = entry.ref || {};
    if (ref.kind === "receipt" && ref.receiptId && onOpenReceipt) {
      onOpenReceipt(String(ref.receiptId));
      return;
    }
    if (ref.kind === "sale" && ref.saleId != null && onOpenSale) {
      onOpenSale(ref.saleId as string | number);
      return;
    }
    if (ref.kind === "adjustment" && ref.adjustmentId && onOpenAdjustment) {
      onOpenAdjustment(String(ref.adjustmentId));
    }
  };

  const rowClickable = (entry: (typeof entries)[number]) => {
    const ref = entry.ref || {};
    if (ref.kind === "receipt" && onOpenReceipt) return true;
    if (ref.kind === "sale" && onOpenSale) return true;
    if (ref.kind === "adjustment" && onOpenAdjustment) return true;
    return false;
  };

  return (
    <>
      <div data-client-collection-journal="true">
      <Card className="rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">수금원장</h2>
              <p className="text-xs text-slate-500">
                매출 · 실제 입금 · 미수조정을 날짜순으로 표시 · 재충당은 현금 행을 만들지 않음
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-48">
                <div className="erp-text-caption mb-1 font-bold text-slate-500">거래처</div>
                <AutocompleteInput
                  value={clientName}
                  onChange={setClientName}
                  options={clients.map((row) => String(row.name || "")).filter(Boolean)}
                  placeholder="거래처 선택"
                />
              </div>
              <div className="flex items-end gap-1">
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => goMonth(-1)} aria-label="이전 달">
                  <ChevronLeft size={14} />
                </Button>
                <div>
                  <div className="erp-text-caption mb-1 font-bold text-slate-500">월</div>
                  <div className="erp-input-compact flex h-9 min-w-[7rem] items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold">
                    {formatMonthLabel(monthKey)}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => goMonth(1)} aria-label="다음 달">
                  <ChevronRight size={14} />
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={applyCurrentMonth}>
                  이번 달
                </Button>
              </div>
              <div>
                <div className="erp-text-caption mb-1 font-bold text-slate-500">시작일</div>
                <KoreanDateInput
                  className="erp-input-compact"
                  value={startDate}
                  onChange={(e) => onRangeChange({ startDate: e.target.value, endDate })}
                />
              </div>
              <div>
                <div className="erp-text-caption mb-1 font-bold text-slate-500">종료일</div>
                <KoreanDateInput
                  className="erp-input-compact"
                  value={endDate}
                  onChange={(e) => onRangeChange({ startDate, endDate: e.target.value })}
                />
              </div>
              <div>
                <div className="erp-text-caption mb-1 font-bold text-slate-500">필터</div>
                <select
                  className="erp-input-compact h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  aria-label="수금원장 필터"
                  data-collection-journal-filter="true"
                >
                  {FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {clientId ? (
            <div className="mb-3">
              <DepositorAliasManager clientId={clientId} clientName={clientName} compact />
            </div>
          ) : null}

          {error ? <div className="erp-payment-empty text-red-600">{error}</div> : null}
          {loading ? <div className="erp-payment-empty" data-journal-loading="true">조회 중…</div> : null}

          {journal && summary && !loading ? (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                <SummaryCard
                  title="청구 미수"
                  value={formatKRW(summary.billedOutstanding)}
                  sub="매출 미충당 합"
                  icon={WalletCards}
                  tone={summary.billedOutstanding > 0 ? "danger" : "success"}
                />
                <SummaryCard
                  title="누적 실제 입금"
                  value={formatKRW(summary.cumulativeReceiptsGross)}
                  sub="Receipt gross"
                  icon={CreditCard}
                  tone="success"
                />
                <SummaryCard
                  title="유효 입금충당"
                  value={formatKRW(summary.allocatedFromReceipts)}
                  sub="sale 배정분"
                  icon={CheckCircle2}
                  tone="success"
                />
                <SummaryCard
                  title="미충당 선수금"
                  value={formatKRW(summary.unappliedPrepaid)}
                  sub="청구 미수와 분리"
                  icon={WalletCards}
                  tone={summary.unappliedPrepaid > 0 ? "warning" : "default"}
                />
                <SummaryCard
                  title="미수 증가 조정"
                  value={formatKRW(summary.debitAdjustments)}
                  sub="현금 아님"
                  icon={AlertCircle}
                />
                <SummaryCard
                  title="미수 감소 조정"
                  value={formatKRW(summary.creditAdjustments)}
                  sub="현금 아님"
                  icon={AlertCircle}
                />
                <SummaryCard
                  title="실질 미수"
                  value={formatKRW(summary.netExposure)}
                  sub="invoice + 조정 − 선수금"
                  icon={WalletCards}
                  tone={summary.netExposure > 0 ? "danger" : "success"}
                />
              </div>

              {monthly.length ? (
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/80" data-collection-journal-monthly="true" data-journal-monthly-summary="true">
                  <div className="flex min-w-max gap-2 p-2">
                    {monthly.map((m) => (
                      <button
                        key={m.monthKey}
                        type="button"
                        data-collection-journal-month={m.monthKey}
                        className={`min-w-[9.5rem] rounded-lg border px-2.5 py-2 text-left text-xs ${
                          m.monthKey === monthKey
                            ? "border-slate-400 bg-white shadow-sm"
                            : "border-slate-200 bg-white/70 hover:bg-white"
                        }`}
                        onClick={() => {
                          setMonthKey(m.monthKey);
                          const range = monthRangeForKey(m.monthKey);
                          onRangeChange({ startDate: range.startDate, endDate: range.endDate });
                        }}
                      >
                        <div className="font-bold text-slate-800">{formatMonthLabel(m.monthKey)}</div>
                        <div className="mt-1 text-slate-500">매출 {formatKRW(m.sales)}</div>
                        <div className="text-emerald-700">입금 {formatKRW(m.receiptsGross)}</div>
                        <div className="text-slate-600">기말 {formatKRW(m.closingNet)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="mb-2 font-bold text-slate-800">잔액 대조 (읽기 전용)</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                  <div>
                    <div className="text-slate-500">ERP 실질 미수</div>
                    <div className="font-bold">{formatKRW(money(contrast.erpNetExposure))}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">청구 미수</div>
                    <div className="font-bold">{formatKRW(money(contrast.invoiceAr))}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">선수금</div>
                    <div className="font-bold text-violet-700">{formatKRW(money(contrast.prepaid))}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">조정 순액</div>
                    <div className="font-bold">{formatKRW(money(contrast.adjustmentNet))}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">마지막 실제 입금</div>
                    <div className="font-bold">{String(contrast.lastReceiptDate || "-")}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">마지막 미수조정</div>
                    <div className="font-bold">{String(contrast.lastAdjustmentDate || "-")}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">미충당 Receipt</div>
                    <div className="font-bold">{String(contrast.unappliedReceiptCount ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">확인 필요</div>
                    <div className="font-bold">{String(contrast.needsReviewCount ?? 0)}</div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {journal && !loading ? (
        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-slate-800">원장 상세</h2>
              <p className="text-xs text-slate-500">
                {journal.clientName} · {journal.startDate || "전체"} ~ {journal.endDate} · {entries.length}건
              </p>
            </div>
            <TableExportSection fileName="수금원장" title="수금원장" disabled={entries.length === 0}>
              <div className="erp-payment-table-wrap" style={{ maxHeight: "560px" }}>
                <table className="erp-payment-table">
                  <thead>
                    <tr>
                      <th className="text-left">유효일</th>
                      <th className="text-left">등록일</th>
                      <th className="text-left">구분</th>
                      <th className="text-left">전표번호</th>
                      <th className="text-left">내용</th>
                      <th className="text-right">매출/미수↑</th>
                      <th className="text-right">실제 입금</th>
                      <th className="text-right">조정↑</th>
                      <th className="text-right">조정↓</th>
                      <th className="text-right">취소·정정</th>
                      <th className="text-right">실질 잔액</th>
                      <th className="text-left">작성자</th>
                      <th className="text-left">수단</th>
                      <th className="text-center">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((row) => {
                      const clickable = rowClickable(row);
                      const ref = row.ref || {};
                      return (
                        <tr
                          key={row.id}
                          data-journal-row="true"
                          className={clickable ? "cursor-pointer hover:bg-slate-50" : undefined}
                          data-journal-entry-type={row.type}
                          data-journal-ref-kind={ref.kind || ""}
                          data-journal-receipt-id={ref.kind === "receipt" ? String(ref.receiptId || "") : undefined}
                          data-journal-adjustment-id={ref.kind === "adjustment" ? String(ref.adjustmentId || "") : undefined}
                          onClick={() => clickable && onRowClick(row)}
                        >
                          <td className="font-medium text-slate-800">{row.effectiveDate || "-"}</td>
                          <td className="text-slate-500">{row.recordedAt ? String(row.recordedAt).slice(0, 10) : "-"}</td>
                          <td>{TYPE_LABEL[row.type] || row.type}</td>
                          <td className="font-medium text-slate-800">{row.voucherNo || "-"}</td>
                          <td className="erp-cell-clip text-left text-slate-600" title={row.description || ""}>
                            {row.description || "-"}
                          </td>
                          <td className="text-right">{money(row.salesIncrease) ? formatKRW(money(row.salesIncrease)) : "-"}</td>
                          <td className="text-right text-emerald-700">
                            {money(row.actualReceipt) ? formatKRW(money(row.actualReceipt)) : "-"}
                          </td>
                          <td className="text-right">{money(row.adjDebit) ? formatKRW(money(row.adjDebit)) : "-"}</td>
                          <td className="text-right text-violet-700">
                            {money(row.adjCredit) ? formatKRW(money(row.adjCredit)) : "-"}
                          </td>
                          <td className="text-right text-red-600">
                            {money(row.reversal) ? formatKRW(money(row.reversal)) : "-"}
                          </td>
                          <td className={`text-right font-bold ${money(row.runningBalance) > 0 ? "text-red-600" : "text-slate-700"}`}>
                            {formatKRW(money(row.runningBalance))}
                          </td>
                          <td className="text-slate-500">{row.author || "-"}</td>
                          <td className="text-slate-500">{row.channel || "-"}</td>
                          <td className="text-center text-slate-500">{row.status || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {entries.length === 0 ? <div className="erp-payment-empty">해당 기간의 원장 행이 없습니다.</div> : null}
              </div>
            </TableExportSection>
          </CardContent>
        </Card>
      ) : null}

      {saleLedger && !loading ? (
        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => setSaleBalanceOpen((v) => !v)}
              aria-expanded={saleBalanceOpen}
            >
              <div>
                <h2 className="text-sm font-bold text-slate-800">매출별 잔액</h2>
                <p className="text-xs text-slate-500">통합 AR 매출 단위 잔액 (보조)</p>
              </div>
              <ChevronDown size={16} className={`text-slate-500 transition ${saleBalanceOpen ? "rotate-180" : ""}`} />
            </button>
            {saleBalanceOpen ? (
              <div className="mt-3">
                <TableExportSection
                  fileName="매출별잔액"
                  title="매출별 잔액"
                  disabled={(saleLedger.sales || []).length === 0}
                >
                  <div className="erp-payment-table-wrap" style={{ maxHeight: "420px" }}>
                    <table className="erp-payment-table">
                      <thead>
                        <tr>
                          <th className="text-left">매출일</th>
                          <th className="text-left">현장</th>
                          <th className="text-right">청구</th>
                          <th className="text-right">입금전표 배분</th>
                          <th className="text-right">기존 입금</th>
                          <th className="text-right">배분 합계</th>
                          <th className="text-right">잔액</th>
                          <th className="text-center">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(saleLedger.sales || []).map((row) => (
                          <tr
                            key={row.saleId}
                            className={onOpenSale ? "cursor-pointer hover:bg-slate-50" : undefined}
                            onClick={() => onOpenSale?.(row.saleId)}
                          >
                            <td className="font-medium text-slate-800">{row.saleDate || "-"}</td>
                            <td className="erp-cell-clip text-left text-slate-600" title={row.site || ""}>
                              {row.site || "-"}
                            </td>
                            <td className="text-right">{formatKRW(row.billedAmount)}</td>
                            <td className="text-right text-emerald-600">{formatKRW(row.receiptAllocatedAmount)}</td>
                            <td className="text-right text-slate-500">{formatKRW(row.legacyAppliedAmount)}</td>
                            <td className="text-right font-semibold text-emerald-700">{formatKRW(row.totalAppliedAmount)}</td>
                            <td
                              className={`text-right font-bold ${
                                row.outstandingAmount > 0 ? "text-red-600" : "text-slate-400"
                              }`}
                            >
                              {formatKRW(row.outstandingAmount)}
                            </td>
                            <td className="text-center">{row.paymentStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TableExportSection>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      </div>
    </>
  );
}

export default ClientCollectionJournalPanel;
