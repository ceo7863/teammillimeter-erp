import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAudit } from "@/context/AuditContext";
import { AutocompleteInput, AutocompleteSelect } from "@/components/AutocompleteInput";
import { EntityAuditButton } from "@/components/AuditField";
import { TableExportSection } from "@/components/TableExportSection";
import { PAYMENT_AUDIT_FIELDS, snapshotPaymentForAudit } from "@/utils/auditLog";
import {
  RECEIVABLE_STATUS_OPTIONS,
  VAT_TYPE_OPTIONS,
  formatKRW,
  getStatus,
  getUnpaid,
  monthStartISO,
  parseMoney,
  todayISO,
  type ReceivableRow,
} from "@/utils/receivables";

type PaymentTab = "input" | "receivables" | "history";

type SaleLike = {
  id: number | string;
  date?: string;
  client?: string;
  site?: string;
  amount?: number;
  paid?: number;
  voucherNo?: string;
  worker?: string;
  workers?: unknown[];
};

type PaymentVoucherLike = {
  id: number | string;
  salesId?: number | string;
  date?: string;
  client?: string;
  site?: string;
  amount?: number;
  vatType?: string;
  vatAmount?: number;
  finalAmount?: number;
  totalSalesAmount?: number;
  memo?: string;
};

type PaymentDraft = {
  checked?: boolean;
  paymentDate?: string;
  vatType?: string;
  customAmount?: string;
  memo?: string;
};

const TAB_ITEMS: Array<{ key: PaymentTab; label: string }> = [
  { key: "input", label: "입금 입력" },
  { key: "receivables", label: "미수 조회" },
  { key: "history", label: "입금 내역" },
];

function SearchBox({ query, setQuery, placeholder }: { query: string; setQuery: (value: string) => void; placeholder: string }) {
  return (
    <div className="flex max-w-xl items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <Search size={18} className="text-slate-400" />
      <input lang="ko" className="erp-input w-full bg-transparent outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function ReceivableDetailTable({
  rows,
  onPayRow,
  exportFileName = "미수전표_상세",
}: {
  rows: ReceivableRow[];
  onPayRow?: (row: ReceivableRow) => void;
  exportFileName?: string;
}) {
  const today = todayISO();

  return (
    <TableExportSection fileName={exportFileName} title="미수 전표 상세" disabled={rows.length === 0}>
    <div className="erp-table-wrap">
      <table className="erp-table erp-table--lg">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="text-left">미수일자</th>
            <th className="text-left">전표번호</th>
            <th className="text-left">거래처명</th>
            <th className="text-left">현장</th>
            <th className="text-left">담당자</th>
            <th className="text-right">총매출</th>
            <th className="text-right">입금액</th>
            <th className="text-right">미수금</th>
            <th className="text-left">입금예정일</th>
            <th className="text-left">상태</th>
            <th className="text-left">메모</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const unpaid = getUnpaid(row);
            const overdue = Boolean(row.dueDate && row.dueDate < today && unpaid > 0);
            const status = getStatus(row);

            return (
              <tr
                key={row.id}
                className={`border-t hover:bg-slate-50 ${onPayRow ? "cursor-pointer" : ""} ${overdue ? "bg-red-50/40" : ""}`}
                onClick={() => onPayRow?.(row)}
              >
                <td>{row.date}</td>
                <td>{row.voucherNo}</td>
                <td className="text-left font-semibold">{row.client}</td>
                <td>{row.site || "-"}</td>
                <td>{row.manager || "-"}</td>
                <td className="text-right font-semibold">{formatKRW(row.salesAmount)}</td>
                <td className="text-right text-emerald-600">{formatKRW(row.paidAmount)}</td>
                <td className="text-right font-bold text-red-600">{formatKRW(unpaid)}</td>
                <td className={overdue ? "font-semibold text-red-600" : ""}>{row.dueDate || "-"}</td>
                <td>
                  <span className={`erp-text-caption inline-flex items-center gap-1 rounded-full px-3 py-1 font-bold ${status === "완료" ? "bg-emerald-50 text-emerald-700" : status === "일부수금" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                    {status === "완료" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    {status}
                  </span>
                </td>
                <td>{row.memo || "-"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="p-8 text-center text-slate-500">
                표시할 미수 전표가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </TableExportSection>
  );
}

export function PaymentReceivablesPage({
  sales = [],
  receivableRows = [],
  clients = [],
  paymentVouchers = [],
  setPaymentVouchers,
  currentUser,
}: {
  sales?: SaleLike[];
  receivableRows?: ReceivableRow[];
  clients?: Array<{ name?: string; manager?: string; phone?: string }>;
  paymentVouchers?: PaymentVoucherLike[];
  setPaymentVouchers: React.Dispatch<React.SetStateAction<PaymentVoucherLike[]>>;
  currentUser: { name?: string; email?: string } | null;
}) {
  const { recordAudit } = useAudit();
  const [tab, setTab] = useState<PaymentTab>("input");
  const [filters, setFilters] = useState({
    startDate: monthStartISO(),
    endDate: todayISO(),
    client: "",
  });
  const [paymentRows, setPaymentRows] = useState<Record<string, PaymentDraft>>({});
  const [historyQuery, setHistoryQuery] = useState("");
  const [receivableQuery, setReceivableQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [unpaidOnly, setUnpaidOnly] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");

  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  const clientAutocompleteOptions = useMemo(
    () => [{ name: "전체", manager: "거래처 필터 해제", phone: "" }, ...clients],
    [clients]
  );

  const paidVoucherBySalesId = useMemo(() => {
    return paymentVouchers.reduce<Record<string, number>>((acc, voucher) => {
      if (!voucher.salesId) return acc;
      const key = String(voucher.salesId);
      acc[key] = (acc[key] || 0) + (voucher.amount || 0);
      return acc;
    }, {});
  }, [paymentVouchers]);

  const targetSalesRows = useMemo(() => {
    return sales
      .filter((row) => {
        const startMatch = filters.startDate ? (row.date || "") >= filters.startDate : true;
        const endMatch = filters.endDate ? (row.date || "") <= filters.endDate : true;
        const clientMatch = filters.client ? row.client === filters.client : true;
        const unpaid = getUnpaid(row);
        const unpaidMatch = !unpaidOnly || unpaid > 0 || paymentRows[String(row.id)]?.checked;
        return startMatch && endMatch && clientMatch && unpaidMatch;
      })
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(a.id || 0) - Number(b.id || 0));
  }, [sales, filters, unpaidOnly, paymentRows]);

  const scopedTotals = useMemo(() => {
    const scopeRows = sales.filter((row) => {
      const startMatch = filters.startDate ? (row.date || "") >= filters.startDate : true;
      const endMatch = filters.endDate ? (row.date || "") <= filters.endDate : true;
      const clientMatch = filters.client ? row.client === filters.client : true;
      return startMatch && endMatch && clientMatch;
    });

    return scopeRows.reduce(
      (acc, row) => {
        acc.bill += row.amount || 0;
        acc.paid += row.paid || 0;
        acc.unpaid += getUnpaid(row);
        return acc;
      },
      { bill: 0, paid: 0, unpaid: 0 }
    );
  }, [sales, filters]);

  const updatePaymentRow = (id: string | number, key: keyof PaymentDraft, value: unknown) => {
    setSaveMessage("");
    setPaymentRows((prev) => ({
      ...prev,
      [String(id)]: {
        checked: prev[String(id)]?.checked || false,
        paymentDate: prev[String(id)]?.paymentDate || filters.endDate,
        vatType: prev[String(id)]?.vatType || "included",
        customAmount: prev[String(id)]?.customAmount || "",
        memo: prev[String(id)]?.memo || "",
        ...prev[String(id)],
        [key]: value,
      },
    }));
  };

  const getPaymentDraft = (row: SaleLike) => {
    const draft = paymentRows[String(row.id)] || {};
    const checked = !!draft.checked;
    const savedAmount = paidVoucherBySalesId[String(row.id)] || 0;
    const unpaid = getUnpaid(row);
    const amount = checked
      ? Math.min(parseMoney(draft.customAmount !== undefined && draft.customAmount !== "" ? draft.customAmount : unpaid), unpaid)
      : savedAmount;
    const vatType = draft.vatType || "included";
    const vatAmount = vatType === "included" ? Math.round(amount * 0.1) : 0;
    const finalAmount = amount + vatAmount;

    return {
      paymentDate: draft.paymentDate || filters.endDate,
      checked,
      amount,
      vatType,
      vatAmount,
      finalAmount,
      memo: draft.memo || "",
    };
  };

  const checkedRows = useMemo(
    () => targetSalesRows.filter((row) => paymentRows[String(row.id)]?.checked),
    [targetSalesRows, paymentRows]
  );

  const selectedDraftTotals = useMemo(() => {
    return checkedRows.reduce(
      (acc, row) => {
        const draft = getPaymentDraft(row);
        acc.paymentAmount += draft.amount;
        acc.vatAmount += draft.vatAmount;
        if (draft.vatType === "included") acc.includedVatAmount += draft.vatAmount;
        acc.finalAmount += draft.finalAmount;
        return acc;
      },
      { paymentAmount: 0, vatAmount: 0, includedVatAmount: 0, finalAmount: 0 }
    );
  }, [checkedRows, paymentRows, paidVoucherBySalesId, filters.endDate]);

  const savePayments = () => {
    const nextPayments = checkedRows
      .map((row) => {
        const draft = getPaymentDraft(row);
        if (!draft.amount || draft.amount <= 0) return null;

        return {
          id: Date.now() + Number(row.id || 0),
          salesId: row.id,
          date: draft.paymentDate,
          client: row.client,
          site: row.site,
          workerCount: row.workers?.length || String(row.worker || "").split(",").filter(Boolean).length || 0,
          totalSalesAmount: row.amount || 0,
          amount: draft.amount,
          vatType: draft.vatType,
          supplyAmount: draft.amount,
          vatAmount: draft.vatAmount,
          finalAmount: draft.finalAmount,
          memo: draft.memo,
        };
      })
      .filter(Boolean) as PaymentVoucherLike[];

    if (nextPayments.length === 0) {
      setSaveMessage("체크된 입금 전표가 없습니다.");
      return;
    }

    nextPayments.forEach((voucher) => {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: voucher.id,
        entityLabel: `${voucher.client} · ${voucher.site}`,
        screen: "입금/미수금",
        action: "create",
        after: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    });

    setPaymentVouchers((prev) => [...nextPayments, ...prev]);
    setPaymentRows({});
    setSaveMessage(`${nextPayments.length}건의 입금이 등록되었습니다.`);
  };

  const deletePayment = (id: number | string) => {
    const voucher = paymentVouchers.find((item) => item.id === id);
    if (voucher) {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: id,
        entityLabel: `${voucher.client} · ${voucher.site}`,
        screen: "입금/미수금",
        action: "delete",
        before: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    }
    setPaymentVouchers((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredVouchers = paymentVouchers
    .filter((voucher) => Object.values(voucher).join(" ").toLowerCase().includes(historyQuery.toLowerCase()))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.id || 0) - Number(a.id || 0));

  const allChecked = targetSalesRows.length > 0 && targetSalesRows.every((row) => paymentRows[String(row.id)]?.checked);

  const toggleAllChecked = (checked: boolean) => {
    setPaymentRows((prev) => {
      const next = { ...prev };
      targetSalesRows.forEach((row) => {
        const unpaid = getUnpaid(row);
        next[String(row.id)] = {
          checked,
          paymentDate: prev[String(row.id)]?.paymentDate || filters.endDate,
          vatType: prev[String(row.id)]?.vatType || "included",
          customAmount: String(unpaid),
          memo: prev[String(row.id)]?.memo || "",
        };
      });
      return next;
    });
  };

  const openPaymentForClient = (client: string) => {
    setFilters((prev) => ({ ...prev, client }));
    setUnpaidOnly(true);
    setTab("input");
  };

  const openPaymentForRow = (row: ReceivableRow) => {
    const unpaid = getUnpaid(row);
    setFilters((prev) => ({ ...prev, client: row.client }));
    setUnpaidOnly(false);
    setTab("input");
    setPaymentRows((prev) => ({
      ...prev,
      [String(row.id)]: {
        checked: true,
        paymentDate: prev[String(row.id)]?.paymentDate || filters.endDate,
        vatType: prev[String(row.id)]?.vatType || "included",
        customAmount: String(unpaid),
        memo: prev[String(row.id)]?.memo || "",
      },
    }));
  };

  const dateFilteredReceivables = useMemo(() => {
    return receivableRows.filter((row) => {
      const startMatch = filters.startDate ? row.date >= filters.startDate : true;
      const endMatch = filters.endDate ? row.date <= filters.endDate : true;
      const clientMatch = filters.client ? row.client === filters.client : true;
      return startMatch && endMatch && clientMatch;
    });
  }, [receivableRows, filters]);

  const clientSummaryRows = useMemo(() => {
    const grouped = dateFilteredReceivables.reduce<Record<string, { client: string; salesAmount: number; paidAmount: number; unpaidAmount: number; count: number }>>((acc, row) => {
      if (!acc[row.client]) acc[row.client] = { client: row.client, salesAmount: 0, paidAmount: 0, unpaidAmount: 0, count: 0 };
      acc[row.client].salesAmount += row.salesAmount || 0;
      acc[row.client].paidAmount += row.paidAmount || 0;
      acc[row.client].unpaidAmount += getUnpaid(row);
      acc[row.client].count += 1;
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => b.unpaidAmount - a.unpaidAmount || a.client.localeCompare(b.client, "ko"));
  }, [dateFilteredReceivables]);

  const filteredReceivableRows = useMemo(() => {
    return dateFilteredReceivables.filter((row) => {
      const text = Object.values(row).join(" ").toLowerCase();
      const matchesQuery = text.includes(receivableQuery.toLowerCase());
      const status = getStatus(row);
      const matchesStatus = statusFilter === "전체" || status === statusFilter;
      const matchesCompleted = !hideCompleted || status !== "완료";
      return matchesQuery && matchesStatus && matchesCompleted;
    });
  }, [dateFilteredReceivables, receivableQuery, statusFilter, hideCompleted]);

  const receivableDetailTotals = useMemo(() => {
    return filteredReceivableRows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.sales += row.salesAmount || 0;
        acc.paid += row.paidAmount || 0;
        acc.unpaid += getUnpaid(row);
        return acc;
      },
      { count: 0, sales: 0, paid: 0, unpaid: 0 }
    );
  }, [filteredReceivableRows]);

  const clientSummaryTotals = useMemo(() => {
    return clientSummaryRows.reduce(
      (acc, row) => {
        acc.clients += 1;
        acc.count += row.count;
        acc.sales += row.salesAmount;
        acc.paid += row.paidAmount;
        acc.unpaid += row.unpaidAmount;
        return acc;
      },
      { clients: 0, count: 0, sales: 0, paid: 0, unpaid: 0 }
    );
  }, [clientSummaryRows]);

  return (
    <div className="erp-page erp-payment-hub-page">
      <div className="erp-payment-hub-head">
        <div>
          <h1 className="erp-payment-hub-title">입금/미수금</h1>
          <p className="erp-payment-hub-desc">입금 입력 · 미수 확인 · 입금 내역을 한 화면에서 처리합니다.</p>
        </div>
        <div className="erp-payment-hub-metrics">
          <div className="erp-payment-hub-metric">
            <span className="label">청구</span>
            <span className="value">{formatKRW(scopedTotals.bill)}</span>
          </div>
          <div className="erp-payment-hub-metric">
            <span className="label">입금</span>
            <span className="value text-emerald-700">{formatKRW(scopedTotals.paid)}</span>
          </div>
          <div className="erp-payment-hub-metric">
            <span className="label">미수</span>
            <span className="value text-red-600">{formatKRW(scopedTotals.unpaid)}</span>
          </div>
          {tab === "input" && checkedRows.length > 0 && (
            <div className="erp-payment-hub-metric is-highlight">
              <span className="label">이번 입금</span>
              <span className="value text-emerald-700">{formatKRW(selectedDraftTotals.finalAmount)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="erp-payment-tabs">
        {TAB_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`erp-payment-tab ${tab === item.key ? "is-active" : ""}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="erp-payment-hub-filters">
            <label className="erp-payment-hub-filter">
              <span>시작</span>
              <input type="date" className="erp-input erp-input-compact" value={filters.startDate} onChange={(e) => updateFilter("startDate", e.target.value)} />
            </label>
            <label className="erp-payment-hub-filter">
              <span>종료</span>
              <input type="date" className="erp-input erp-input-compact" value={filters.endDate} onChange={(e) => updateFilter("endDate", e.target.value)} />
            </label>
            <label className="erp-payment-hub-filter erp-payment-hub-filter--grow">
              <span>거래처</span>
              <AutocompleteInput
                value={filters.client}
                options={clientAutocompleteOptions}
                onChange={(value) => updateFilter("client", value === "전체" ? "" : value)}
                placeholder="전체"
                freeSolo={false}
                showOptionsOnFocus
                limit={12}
                inputProps={{ className: "erp-input-compact rounded-lg" }}
                renderSub={(client) => {
                  const item = client as { manager?: string; phone?: string; name?: string };
                  if (item.name === "전체") return item.manager || "";
                  return `${item.manager || "담당자 없음"} · ${item.phone || "연락처 없음"}`;
                }}
              />
            </label>
            {tab === "input" && (
              <label className="erp-payment-hub-check">
                <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
                미수만
              </label>
            )}
            {tab === "receivables" && (
              <>
                <label className="erp-payment-hub-check">
                  <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
                  완료 제외
                </label>
                <AutocompleteSelect
                  value={statusFilter}
                  options={RECEIVABLE_STATUS_OPTIONS}
                  onChange={setStatusFilter}
                  placeholder="상태"
                  inputProps={{ className: "erp-input-compact rounded-lg md:w-32" }}
                />
              </>
            )}
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setFilters({ startDate: monthStartISO(), endDate: todayISO(), client: "" })}>
              초기화
            </Button>
            {tab === "input" && (
              <Button size="sm" className="h-8 rounded-lg px-4 text-xs" onClick={savePayments}>
                선택 입금 저장 {checkedRows.length > 0 ? `(${checkedRows.length})` : ""}
              </Button>
            )}
          </div>

          {saveMessage && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
              {saveMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {tab === "input" && (
        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-800">입금 입력</h2>
                <p className="text-xs text-slate-500">전표 선택 · 입금일 · 금액(부분입금 가능) · 부가세</p>
              </div>
              {checkedRows.length > 0 && <span className="erp-payment-badge">{checkedRows.length}건 선택</span>}
            </div>

            <TableExportSection fileName="입금입력_전표" title="입금 입력 전표" disabled={targetSalesRows.length === 0}>
            <div className="erp-payment-table-wrap">
              <table className="erp-payment-table">
                <colgroup>
                  <col className="col-check" />
                  <col className="col-no" />
                  <col className="col-date" />
                  <col className="col-client" />
                  <col className="col-site" />
                  <col className="col-num" />
                  <col className="col-money" />
                  <col className="col-paydate" />
                  <col className="col-money" />
                  <col className="col-vat" />
                  <col className="col-money" />
                  <col className="col-memo" />
                </colgroup>
                <thead>
                  <tr className="erp-payment-group-row">
                    <th colSpan={7}>매출 전표</th>
                    <th colSpan={5}>입금 입력</th>
                  </tr>
                  <tr className="erp-payment-col-row">
                    <th className="text-center">
                      <input type="checkbox" className="erp-payment-check" checked={allChecked} onChange={(e) => toggleAllChecked(e.target.checked)} aria-label="전체 선택" />
                    </th>
                    <th className="text-left">NO</th>
                    <th className="text-left">일자</th>
                    <th className="text-left">거래처</th>
                    <th className="text-left">현장</th>
                    <th className="text-right">인원</th>
                    <th className="text-right">시공비</th>
                    <th className="text-left">입금일</th>
                    <th className="text-right">입금액</th>
                    <th className="text-center">VAT</th>
                    <th className="text-right">최종</th>
                    <th className="text-left">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {targetSalesRows.map((row) => {
                    const draft = getPaymentDraft(row);
                    const rowKey = String(row.id);
                    const isSelected = !!paymentRows[rowKey]?.checked;
                    const workerCount = row.workers?.length || String(row.worker || "").split(",").filter(Boolean).length || 0;
                    const unpaid = getUnpaid(row);

                    return (
                      <tr key={row.id} className={isSelected ? "is-selected" : ""}>
                        <td className="text-center">
                          <input type="checkbox" checked={isSelected} onChange={(e) => updatePaymentRow(row.id, "checked", e.target.checked)} className="erp-payment-check" />
                        </td>
                        <td className="text-left font-semibold">{row.voucherNo || row.id}</td>
                        <td className="text-slate-600">{row.date}</td>
                        <td className="erp-cell-clip text-left font-semibold" title={row.client}>{row.client}</td>
                        <td className="erp-cell-clip text-left text-slate-600" title={row.site || ""}>{row.site || "-"}</td>
                        <td className="text-right">{workerCount}</td>
                        <td className="text-right font-semibold">{formatKRW(row.amount || 0)}</td>
                        <td>
                          <input
                            type="date"
                            className="erp-input erp-input-compact"
                            value={paymentRows[rowKey]?.paymentDate || filters.endDate || row.date}
                            onChange={(e) => updatePaymentRow(row.id, "paymentDate", e.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          {isSelected ? (
                            <input
                              className="erp-input erp-input-compact text-right"
                              inputMode="numeric"
                              value={paymentRows[rowKey]?.customAmount ?? String(unpaid)}
                              onChange={(e) => updatePaymentRow(row.id, "customAmount", e.target.value)}
                            />
                          ) : (
                            <span className={paidVoucherBySalesId[rowKey] ? "font-bold text-emerald-600" : "text-slate-400"}>
                              {paidVoucherBySalesId[rowKey] ? formatKRW(paidVoucherBySalesId[rowKey]) : "-"}
                            </span>
                          )}
                        </td>
                        <td className="erp-vat-select">
                          <AutocompleteSelect
                            value={paymentRows[rowKey]?.vatType || "included"}
                            options={VAT_TYPE_OPTIONS}
                            onChange={(value) => updatePaymentRow(row.id, "vatType", value)}
                            placeholder="VAT"
                            inputProps={{ className: "erp-input-compact rounded-lg" }}
                          />
                        </td>
                        <td className="text-right font-bold text-emerald-700">{formatKRW(draft.finalAmount)}</td>
                        <td>
                          <input className="erp-input erp-input-compact" value={paymentRows[rowKey]?.memo || ""} onChange={(e) => updatePaymentRow(row.id, "memo", e.target.value)} placeholder="비고" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {targetSalesRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="text-left">선택 {checkedRows.length}건 / {targetSalesRows.length}건</td>
                      <td className="text-right">{formatKRW(targetSalesRows.reduce((sum, row) => sum + (row.amount || 0), 0))}</td>
                      <td />
                      <td className="text-right text-emerald-600">{formatKRW(selectedDraftTotals.paymentAmount)}</td>
                      <td className="text-center text-slate-500">{formatKRW(selectedDraftTotals.vatAmount)}</td>
                      <td className="text-right text-emerald-700">{formatKRW(selectedDraftTotals.finalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              {targetSalesRows.length === 0 && <div className="erp-payment-empty">조건에 맞는 매출 전표가 없습니다.</div>}
            </div>
            </TableExportSection>
          </CardContent>
        </Card>
      )}

      {tab === "receivables" && (
        <>
          <div className="erp-receivable-totals-bar">
            <div className="erp-receivable-totals-group">
              <span className="erp-receivable-totals-label">미수 전표 합계</span>
              <div className="erp-receivable-totals-items">
                <div className="erp-receivable-totals-item">
                  <span>건수</span>
                  <b>{receivableDetailTotals.count.toLocaleString()}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>총매출</span>
                  <b>{formatKRW(receivableDetailTotals.sales)}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>입금</span>
                  <b className="text-emerald-700">{formatKRW(receivableDetailTotals.paid)}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>미수</span>
                  <b className="text-red-600">{formatKRW(receivableDetailTotals.unpaid)}</b>
                </div>
              </div>
            </div>
            <div className="erp-receivable-totals-group">
              <span className="erp-receivable-totals-label">거래처 합계</span>
              <div className="erp-receivable-totals-items">
                <div className="erp-receivable-totals-item">
                  <span>거래처</span>
                  <b>{clientSummaryTotals.clients.toLocaleString()}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>전표</span>
                  <b>{clientSummaryTotals.count.toLocaleString()}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>총매출</span>
                  <b>{formatKRW(clientSummaryTotals.sales)}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>입금</span>
                  <b className="text-emerald-700">{formatKRW(clientSummaryTotals.paid)}</b>
                </div>
                <div className="erp-receivable-totals-item">
                  <span>미수</span>
                  <b className="text-red-600">{formatKRW(clientSummaryTotals.unpaid)}</b>
                </div>
              </div>
            </div>
          </div>

          <Card className="rounded-xl border-slate-200/80 shadow-sm">
            <CardContent className="p-3 md:p-4">
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">거래처별 미수 현황</h2>
                  <p className="text-xs text-slate-500">거래처 클릭 → 입금 입력 탭으로 이동</p>
                </div>
                <SearchBox query={receivableQuery} setQuery={setReceivableQuery} placeholder="거래처, 담당자, 전표번호 검색" />
              </div>
              <TableExportSection fileName="거래처별_미수현황" title="거래처별 미수 현황" disabled={clientSummaryRows.length === 0}>
              <div className="erp-table-wrap">
                <table className="erp-table">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="text-left">거래처명</th>
                      <th className="text-right">총매출</th>
                      <th className="text-right">입금액</th>
                      <th className="text-right">미수금</th>
                      <th className="text-right">건수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientSummaryRows.map((client) => (
                      <tr key={client.client} className="cursor-pointer border-t hover:bg-sky-50" onClick={() => openPaymentForClient(client.client)}>
                        <td className="text-left font-bold">{client.client}</td>
                        <td className="text-right font-semibold">{formatKRW(client.salesAmount)}</td>
                        <td className="text-right font-semibold text-emerald-600">{formatKRW(client.paidAmount)}</td>
                        <td className="text-right font-bold text-red-600">{formatKRW(client.unpaidAmount)}</td>
                        <td className="text-right">{client.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </TableExportSection>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200/80 shadow-sm">
            <CardContent className="p-3 md:p-4">
              <h2 className="mb-3 text-sm font-bold text-slate-800">미수 전표 상세</h2>
              <p className="mb-3 text-xs text-slate-500">전표 클릭 → 입금 입력 탭에서 해당 건 선택</p>
              <ReceivableDetailTable rows={filteredReceivableRows} onPayRow={openPaymentForRow} exportFileName="미수전표_상세" />
            </CardContent>
          </Card>
        </>
      )}

      {tab === "history" && (
        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">입금 내역</h2>
                <p className="text-xs text-slate-500">등록된 입금전표 조회 · 삭제</p>
              </div>
              <SearchBox query={historyQuery} setQuery={setHistoryQuery} placeholder="입금내역 검색" />
            </div>
            <TableExportSection fileName="입금내역" title="입금 내역" disabled={filteredVouchers.length === 0}>
            <div className="erp-payment-table-wrap" style={{ maxHeight: "560px" }}>
              <table className="erp-payment-table erp-payment-table--history">
                <colgroup>
                  <col className="col-date" />
                  <col className="col-client" />
                  <col className="col-site" />
                  <col className="col-money" />
                  <col className="col-money" />
                  <col className="col-vat" />
                  <col className="col-money" />
                  <col className="col-memo" />
                  <col className="col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="text-left">입금일</th>
                    <th className="text-left">거래처</th>
                    <th className="text-left">현장</th>
                    <th className="text-right">시공비</th>
                    <th className="text-right">입금액</th>
                    <th className="text-center">VAT</th>
                    <th className="text-right">최종</th>
                    <th className="text-left">비고</th>
                    <th className="text-center erp-table-export-skip">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVouchers.map((voucher) => (
                    <tr key={voucher.id}>
                      <td className="text-slate-600">{voucher.date}</td>
                      <td className="erp-cell-clip text-left font-semibold" title={voucher.client}>{voucher.client}</td>
                      <td className="erp-cell-clip text-left text-slate-600" title={voucher.site || ""}>{voucher.site || "-"}</td>
                      <td className="text-right">{formatKRW(voucher.totalSalesAmount || 0)}</td>
                      <td className="text-right font-semibold text-emerald-600">{formatKRW(voucher.amount || 0)}</td>
                      <td className="text-center text-slate-600">{voucher.vatType === "excluded" ? "별도" : "포함"}</td>
                      <td className="text-right font-bold text-emerald-700">{formatKRW(voucher.finalAmount ?? voucher.amount ?? 0)}</td>
                      <td className="erp-cell-clip text-slate-600" title={voucher.memo || ""}>{voucher.memo || "-"}</td>
                      <td className="text-center erp-table-export-skip">
                        <div className="flex items-center justify-center gap-1">
                          <EntityAuditButton entityType="paymentVoucher" entityId={voucher.id} title={`${voucher.client} · ${voucher.site} 입금 이력`} />
                          <Button size="sm" variant="outline" className="rounded-lg border-red-200 text-red-600 hover:bg-red-50" onClick={() => deletePayment(voucher.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredVouchers.length === 0 && <div className="erp-payment-empty">등록된 입금내역이 없습니다.</div>}
            </div>
            </TableExportSection>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
