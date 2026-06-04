import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Search, Trash2, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAudit } from "@/context/AuditContext";
import { useSaveMessage } from "@/hooks/useSaveMessage";
import { AutocompleteInput, AutocompleteSelect } from "@/components/AutocompleteInput";
import { EntityAuditButton } from "@/components/AuditField";
import { TableExportSection } from "@/components/TableExportSection";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { PAYMENT_AUDIT_FIELDS, snapshotPaymentForAudit } from "@/utils/auditLog";
import { confirmDelete } from "@/utils/confirmDelete";
import {
  RECEIVABLE_STATUS_OPTIONS,
  formatKRW,
  getStatus,
  getUnpaid,
  monthStartISO,
  parseMoney,
  todayISO,
  type ReceivableRow,
} from "@/utils/receivables";
import { summarizePaymentVatBySaleDate } from "@/utils/paymentVatTotals";
import {
  createPaymentInputLogsFromVouchers,
  formatPaymentInputLogRecord,
  summarizePaymentInputLogs,
  type PaymentInputLog,
} from "@/utils/paymentInputLogs";
import {
  formatPaymentDepositChannel,
  normalizePaymentDepositChannel,
  PAYMENT_DEPOSIT_CHANNEL_OPTIONS,
  type PaymentDepositChannel,
} from "@/utils/paymentDepositChannel";
import { SalePaymentLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";

type PaymentTab = "input" | "receivables" | "history" | "log";

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
  isPartialPayment?: boolean;
  depositChannel?: PaymentDepositChannel;
};

type PaymentDraft = {
  checked?: boolean;
  paymentDate?: string;
  vatType?: string;
  customAmount?: string;
  memo?: string;
  depositChannel?: PaymentDepositChannel;
};

const TAB_ITEMS: Array<{ key: PaymentTab; label: string }> = [
  { key: "input", label: "입금 입력" },
  { key: "receivables", label: "미수 조회" },
  { key: "history", label: "입금 내역" },
  { key: "log", label: "입금로그" },
];

function PaymentDepositChannelSelect({
  value,
  onChange,
  compact = false,
  disabled = false,
}: {
  value: PaymentDepositChannel;
  onChange: (value: PaymentDepositChannel) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      className={`erp-input erp-payment-deposit-channel-select ${compact ? "erp-input-compact" : ""}`.trim()}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(normalizePaymentDepositChannel(event.target.value))}
      aria-label="입금 구분"
    >
      {PAYMENT_DEPOSIT_CHANNEL_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

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
  autoLinkedSaleIds = new Set<string>(),
  manualLinkedSaleIds = new Set<string>(),
}: {
  rows: ReceivableRow[];
  onPayRow?: (row: ReceivableRow) => void;
  exportFileName?: string;
  autoLinkedSaleIds?: Set<string>;
  manualLinkedSaleIds?: Set<string>;
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
                <td>
                  {row.voucherNo}
                  <SalePaymentLinkBadge
                    saleId={row.id}
                    autoLinkedSaleIds={autoLinkedSaleIds}
                    manualLinkedSaleIds={manualLinkedSaleIds}
                  />
                </td>
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
  paymentInputLogs = [],
  setPaymentInputLogs,
  bankTransactions = [],
  setBankTransactions,
  currentUser,
  autoLinkedSaleIds = new Set<string>(),
  manualLinkedSaleIds = new Set<string>(),
}: {
  sales?: SaleLike[];
  receivableRows?: ReceivableRow[];
  clients?: Array<{ name?: string; manager?: string; phone?: string }>;
  paymentVouchers?: PaymentVoucherLike[];
  setPaymentVouchers: React.Dispatch<React.SetStateAction<PaymentVoucherLike[]>>;
  paymentInputLogs?: PaymentInputLog[];
  setPaymentInputLogs: React.Dispatch<React.SetStateAction<PaymentInputLog[]>>;
  bankTransactions?: Array<{ id?: string; linkedPaymentVoucherId?: string | number; [key: string]: unknown }>;
  setBankTransactions?: React.Dispatch<React.SetStateAction<Array<{ id?: string; linkedPaymentVoucherId?: string | number; [key: string]: unknown }>>>;
  currentUser: { name?: string; email?: string } | null;
  autoLinkedSaleIds?: Set<string>;
  manualLinkedSaleIds?: Set<string>;
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
  const [logQuery, setLogQuery] = useState("");
  const [selectedLogSummaryId, setSelectedLogSummaryId] = useState<string | null>(null);
  const [receivableQuery, setReceivableQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [unpaidOnly, setUnpaidOnly] = useState(true);
  const { message: saveMessage, setMessage: setSaveMessage, clearMessage: clearSaveMessage } = useSaveMessage();
  const [depositEditSalesId, setDepositEditSalesId] = useState<string | null>(null);
  const [defaultDepositChannel, setDefaultDepositChannel] = useState<PaymentDepositChannel>("personal");

  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (tab !== "log") setSelectedLogSummaryId(null);
  }, [tab]);

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

  const vouchersBySalesId = useMemo(() => {
    return paymentVouchers.reduce<Record<string, PaymentVoucherLike[]>>((acc, voucher) => {
      if (!voucher.salesId) return acc;
      const key = String(voucher.salesId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(voucher);
      return acc;
    }, {});
  }, [paymentVouchers]);

  const saleDateById = useMemo(() => {
    return sales.reduce<Record<string, string>>((acc, row) => {
      if (row.id != null && row.date) acc[String(row.id)] = row.date;
      return acc;
    }, {});
  }, [sales]);

  const getVoucherSaleDate = (voucher: PaymentVoucherLike) => {
    if (voucher.salesId != null) return saleDateById[String(voucher.salesId)] || "";
    return "";
  };

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
    clearSaveMessage();
    setPaymentRows((prev) => {
      const rowKey = String(id);
      const prevRow = prev[rowKey] || {};
      const nextRow: PaymentDraft = {
        checked: prevRow.checked || false,
        paymentDate: prevRow.paymentDate || filters.endDate,
        vatType: prevRow.vatType || "included",
        customAmount: prevRow.customAmount || "",
        memo: prevRow.memo || "",
        depositChannel: prevRow.depositChannel || defaultDepositChannel,
        ...prevRow,
        [key]: value,
      };
      if (key === "checked" && value === true && !prevRow.depositChannel) {
        nextRow.depositChannel = defaultDepositChannel;
      }
      return { ...prev, [rowKey]: nextRow };
    });
  };

  const getRowVatIncluded = (rowKey: string) => (paymentRows[rowKey]?.vatType || "included") === "included";

  const togglePaymentVat = (id: string | number) => {
    const rowKey = String(id);
    updatePaymentRow(id, "vatType", getRowVatIncluded(rowKey) ? "excluded" : "included");
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
      depositChannel: normalizePaymentDepositChannel(draft.depositChannel || defaultDepositChannel),
    };
  };

  const checkedRows = useMemo(
    () => targetSalesRows.filter((row) => paymentRows[String(row.id)]?.checked),
    [targetSalesRows, paymentRows]
  );

  const inputUnselectedUnpaidTotals = useMemo(() => {
    return targetSalesRows.reduce(
      (acc, row) => {
        if (paymentRows[String(row.id)]?.checked) return acc;
        const unpaid = getUnpaid(row);
        if (unpaid <= 0) return acc;
        acc.amount += unpaid;
        acc.count += 1;
        return acc;
      },
      { amount: 0, count: 0 }
    );
  }, [targetSalesRows, paymentRows]);

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
          depositChannel: draft.depositChannel,
        };
      })
      .filter(Boolean) as PaymentVoucherLike[];

    if (nextPayments.length === 0) {
      setSaveMessage("체크된 입금 전표가 없습니다.");
      return;
    }

    const batchId = Date.now();
    const savedBy = currentUser?.name || currentUser?.email || "";
    const newLogs = createPaymentInputLogsFromVouchers(nextPayments, savedBy, batchId);

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
    setPaymentInputLogs((prev) => [...newLogs, ...prev]);
    setPaymentRows({});
    setSaveMessage(`${nextPayments.length}건의 입금이 등록되었습니다.`);
  };

  const deletePayment = (id: number | string, options?: { skipConfirm?: boolean; confirmMessage?: string }) => {
    const voucher = paymentVouchers.find((item) => item.id === id);
    if (!voucher) return false;
    if (
      !options?.skipConfirm &&
      !confirmDelete(options?.confirmMessage || `입금 전표 (${voucher.client} · ${voucher.site})를 삭제할까요?`)
    ) {
      return false;
    }

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
    setPaymentVouchers((prev) => prev.filter((item) => item.id !== id));
    setPaymentInputLogs((prev) => prev.filter((log) => String(log.paymentVoucherId) !== String(id)));
    if (setBankTransactions && voucher.bankTransactionId) {
      const bankTxId = String(voucher.bankTransactionId);
      const stillLinked = paymentVouchers.some(
        (item) => item.id !== id && String(item.bankTransactionId || "") === bankTxId,
      );
      if (!stillLinked) {
        setBankTransactions((prev) =>
          prev.map((row) =>
            String(row.id || "") === bankTxId && String(row.linkedPaymentVoucherId || "") === String(id)
              ? {
                  ...row,
                  linkedPaymentVoucherId: undefined,
                  linkedPdfArchiveId: undefined,
                  linkedSalesId: undefined,
                  matchConfirmedAt: undefined,
                  matchConfirmedBy: undefined,
                  matchAutoLinked: undefined,
                }
              : row,
          ),
        );
      }
    }
    if (voucher.salesId != null) {
      const salesKey = String(voucher.salesId);
      const remainingDeposits = (vouchersBySalesId[salesKey] || []).filter((item) => item.id !== id).length;
      setPaymentRows((prev) => {
        if (!prev[salesKey]) return prev;
        const next = { ...prev };
        delete next[salesKey];
        return next;
      });
      setDepositEditSalesId((prev) => (prev === salesKey && remainingDeposits === 0 ? null : prev));
    }
    setSaveMessage("입금 내역이 취소되었습니다.");
    return true;
  };

  const cancelDeposit = (voucher: PaymentVoucherLike) => {
    deletePayment(voucher.id, {
      confirmMessage: `${voucher.client} · ${voucher.site} 입금 ${formatKRW(voucher.amount || 0)}을 취소할까요?`,
    });
  };

  const toggleDepositEdit = (salesId: string | number) => {
    const key = String(salesId);
    setDepositEditSalesId((prev) => (prev === key ? null : key));
  };

  const dateFilteredVouchers = useMemo(() => {
    return paymentVouchers.filter((voucher) => {
      const startMatch = filters.startDate ? (voucher.date || "") >= filters.startDate : true;
      const endMatch = filters.endDate ? (voucher.date || "") <= filters.endDate : true;
      const clientMatch = filters.client ? voucher.client === filters.client : true;
      return startMatch && endMatch && clientMatch;
    });
  }, [paymentVouchers, filters]);

  const historyDateFilteredVouchers = useMemo(() => {
    return paymentVouchers.filter((voucher) => {
      const saleDate = getVoucherSaleDate(voucher) || voucher.date || "";
      const startMatch = filters.startDate ? saleDate >= filters.startDate : true;
      const endMatch = filters.endDate ? saleDate <= filters.endDate : true;
      const clientMatch = filters.client ? voucher.client === filters.client : true;
      return startMatch && endMatch && clientMatch;
    });
  }, [paymentVouchers, filters, saleDateById]);

  const inputTablePaymentTotals = useMemo(() => {
    const voucherTotalsBySalesId = paymentVouchers.reduce<
      Record<string, { amount: number; vat: number; final: number; vatCount: number }>
    >((acc, voucher) => {
      if (!voucher.salesId) return acc;
      const key = String(voucher.salesId);
      if (!acc[key]) acc[key] = { amount: 0, vat: 0, final: 0, vatCount: 0 };
      const vat = voucher.vatAmount || 0;
      acc[key].amount += voucher.amount || 0;
      acc[key].vat += vat;
      acc[key].final += voucher.finalAmount ?? voucher.amount ?? 0;
      if (vat > 0) acc[key].vatCount += 1;
      return acc;
    }, {});

    return targetSalesRows.reduce(
      (acc, row) => {
        const saved = voucherTotalsBySalesId[String(row.id)] || { amount: 0, vat: 0, final: 0, vatCount: 0 };
        const draft = getPaymentDraft(row);

        acc.registeredAmount += saved.amount;
        acc.registeredVat += saved.vat;
        acc.registeredFinal += saved.final;
        acc.vatCount += saved.vatCount;

        if (draft.checked) {
          acc.pendingAmount += draft.amount;
          acc.pendingVat += draft.vatAmount;
          acc.pendingFinal += draft.finalAmount;
          if (draft.vatAmount > 0) acc.pendingVatCount += 1;
        }

        acc.amount += saved.amount + (draft.checked ? draft.amount : 0);
        acc.vat += saved.vat + (draft.checked ? draft.vatAmount : 0);
        acc.final += saved.final + (draft.checked ? draft.finalAmount : 0);
        return acc;
      },
      {
        amount: 0,
        vat: 0,
        final: 0,
        vatCount: 0,
        registeredAmount: 0,
        registeredVat: 0,
        registeredFinal: 0,
        pendingAmount: 0,
        pendingVat: 0,
        pendingFinal: 0,
        pendingVatCount: 0,
      }
    );
  }, [targetSalesRows, paymentVouchers, paymentRows, paidVoucherBySalesId, filters.endDate]);

  const filteredVouchers = useMemo(() => {
    const query = historyQuery.toLowerCase();
    return historyDateFilteredVouchers
      .filter((voucher) => Object.values(voucher).join(" ").toLowerCase().includes(query))
      .sort((a, b) => {
        const aSale = getVoucherSaleDate(a) || a.date || "";
        const bSale = getVoucherSaleDate(b) || b.date || "";
        const saleCmp = String(bSale).localeCompare(String(aSale));
        if (saleCmp !== 0) return saleCmp;
        return String(b.date || "").localeCompare(String(a.date || "")) || Number(b.id || 0) - Number(a.id || 0);
      });
  }, [historyDateFilteredVouchers, historyQuery, saleDateById]);

  const inputHistoryVatTotals = useMemo(
    () => summarizePaymentVatBySaleDate(paymentVouchers, sales, filters.startDate, filters.endDate, filters.client),
    [paymentVouchers, sales, filters.startDate, filters.endDate, filters.client]
  );

  const historyTotals = useMemo(() => {
    const round = (value: number) => Math.round(Number(value) || 0);

    return filteredVouchers.reduce(
      (acc, voucher) => {
        const amount = round(voucher.amount);
        const vat = round(voucher.vatAmount);
        const final = round(voucher.finalAmount ?? voucher.amount);
        acc.count += 1;
        acc.bill += round(voucher.totalSalesAmount);
        acc.amount += amount;
        acc.vat += vat;
        acc.final += final;
        if (vat > 0) {
          acc.vatCount += 1;
          acc.vatFinal += final;
        }
        return acc;
      },
      { count: 0, bill: 0, amount: 0, vat: 0, final: 0, vatCount: 0, vatFinal: 0 }
    );
  }, [filteredVouchers]);

  const filteredPaymentInputLogSummaries = useMemo(() => {
    const query = logQuery.toLowerCase();
    const filteredLogs = paymentInputLogs.filter((log) => {
      const startMatch = filters.startDate ? (log.paymentDate || "") >= filters.startDate : true;
      const endMatch = filters.endDate ? (log.paymentDate || "") <= filters.endDate : true;
      const clientMatch = filters.client ? log.client === filters.client : true;
      return startMatch && endMatch && clientMatch;
    });

    return summarizePaymentInputLogs(filteredLogs).filter((row) =>
      Object.values(row).join(" ").toLowerCase().includes(query)
    );
  }, [paymentInputLogs, filters.startDate, filters.endDate, filters.client, logQuery]);

  const selectedLogSummary = useMemo(
    () => filteredPaymentInputLogSummaries.find((row) => row.id === selectedLogSummaryId) || null,
    [filteredPaymentInputLogSummaries, selectedLogSummaryId]
  );

  const selectedLogVouchers = useMemo(() => {
    if (!selectedLogSummary) return [];
    const idSet = new Set(selectedLogSummary.paymentVoucherIds.map(String));
    return paymentVouchers
      .filter((voucher) => idSet.has(String(voucher.id)))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.id || 0) - Number(a.id || 0));
  }, [selectedLogSummary, paymentVouchers]);

  const selectedLogVoucherTotals = useMemo(() => {
    const round = (value: number) => Math.round(Number(value) || 0);
    return selectedLogVouchers.reduce(
      (acc, voucher) => {
        acc.count += 1;
        acc.bill += round(voucher.totalSalesAmount);
        acc.amount += round(voucher.amount);
        acc.vat += round(voucher.vatAmount);
        acc.final += round(voucher.finalAmount ?? voucher.amount);
        return acc;
      },
      { count: 0, bill: 0, amount: 0, vat: 0, final: 0 }
    );
  }, [selectedLogVouchers]);

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
          depositChannel: prev[String(row.id)]?.depositChannel || defaultDepositChannel,
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

  /** 거래처별 미수 현황 표와 동일 범위(기간·거래처)의 입금전표 합계 */
  const receivableScopePaymentTotals = useMemo(() => {
    const salesIds = new Set(dateFilteredReceivables.map((row) => String(row.id)));
    const round = (value: number) => Math.round(Number(value) || 0);

    return paymentVouchers.reduce(
      (acc, voucher) => {
        if (!voucher.salesId || !salesIds.has(String(voucher.salesId))) return acc;
        const amount = round(voucher.amount);
        const vat = round(voucher.vatAmount);
        const final = round(voucher.finalAmount ?? voucher.amount);
        acc.count += 1;
        acc.amount += amount;
        acc.vat += vat;
        acc.final += final;
        if (vat > 0) acc.vatCount += 1;
        return acc;
      },
      { count: 0, amount: 0, vat: 0, final: 0, vatCount: 0 }
    );
  }, [dateFilteredReceivables, paymentVouchers]);

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
              <KoreanDateInput className="erp-input-compact" value={filters.startDate} onChange={(e) => updateFilter("startDate", e.target.value)} />
            </label>
            <label className="erp-payment-hub-filter">
              <span>종료</span>
              <KoreanDateInput className="erp-input-compact" value={filters.endDate} onChange={(e) => updateFilter("endDate", e.target.value)} />
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
              <>
                <label className="erp-payment-hub-filter">
                  <span>입금구분</span>
                  <PaymentDepositChannelSelect
                    compact
                    value={defaultDepositChannel}
                    onChange={setDefaultDepositChannel}
                  />
                </label>
                <label className="erp-payment-hub-check">
                  <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
                  미수만
                </label>
              </>
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
        <>
          <div className="erp-payment-input-summary space-y-2">
            <div className="erp-payment-input-summary-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                compact
                title="총 시공비"
                value={formatKRW(scopedTotals.bill)}
                sub={`${targetSalesRows.length}건 · ${filters.startDate || "전체"} ~ ${filters.endDate || "전체"}`}
                icon={WalletCards}
              />
              <SummaryCard
                compact
                title="입금"
                value={formatKRW(scopedTotals.paid)}
                sub="기간 내 공급가 입금"
                tone="success"
                icon={CheckCircle2}
              />
              <SummaryCard
                compact
                title="미수"
                value={formatKRW(scopedTotals.unpaid)}
                sub="기간 내 미수 잔액"
                tone="danger"
                icon={AlertCircle}
              />
              <SummaryCard
                compact
                title="입금내역 부가세"
                value={formatKRW(inputHistoryVatTotals.vat)}
                sub={
                  inputHistoryVatTotals.count
                    ? `${inputHistoryVatTotals.count}건 · 최종 ${formatKRW(inputHistoryVatTotals.final)} · 거래일 기준`
                    : "입금내역 부가세 없음"
                }
                tone={inputHistoryVatTotals.vat > 0 ? "warning" : "default"}
                icon={CreditCard}
              />
            </div>

            <div className="erp-payment-input-summary-panel rounded-xl border border-slate-200/80 bg-slate-50/70">
              <p className="erp-payment-input-summary-label text-xs font-bold text-slate-600">입금 · 부가세 · 선택</p>
              <div className="erp-payment-input-summary-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <SummaryCard
                  compact
                  title="시공비 총액"
                  value={formatKRW(inputTablePaymentTotals.amount)}
                  sub={
                    checkedRows.length
                      ? `공급가 · 등록 ${formatKRW(inputTablePaymentTotals.registeredAmount)} · 선택 +${formatKRW(inputTablePaymentTotals.pendingAmount)}`
                      : inputTablePaymentTotals.amount
                        ? `공급가 · ${targetSalesRows.length}건 · 표시 전표 기준`
                        : "공급가 · 표시 전표 기준 입금 없음"
                  }
                  icon={WalletCards}
                />
                <SummaryCard
                  compact
                  title="미선택 미수금액"
                  value={formatKRW(inputUnselectedUnpaidTotals.amount)}
                  sub={
                    inputUnselectedUnpaidTotals.count
                      ? `${inputUnselectedUnpaidTotals.count}건 · 체크 안 한 전표`
                      : checkedRows.length
                        ? "선택 전표 제외 · 미수 없음"
                        : "표시 전표 · 미수 없음"
                  }
                  tone={inputUnselectedUnpaidTotals.amount > 0 ? "danger" : "default"}
                  icon={AlertCircle}
                />
                <SummaryCard
                  compact
                  title="부가세포함 총입금액"
                  value={formatKRW(inputTablePaymentTotals.final)}
                  sub={
                    checkedRows.length
                      ? `등록 ${formatKRW(inputTablePaymentTotals.registeredFinal)} · 선택 +${formatKRW(inputTablePaymentTotals.pendingFinal)}`
                      : inputTablePaymentTotals.final
                        ? `공급가 ${formatKRW(inputTablePaymentTotals.amount)} · 부가세 ${formatKRW(inputTablePaymentTotals.vat)}`
                        : "표시 전표 기준 입금 없음"
                  }
                  tone={inputTablePaymentTotals.final > 0 ? "success" : "default"}
                  icon={WalletCards}
                />
                <SummaryCard
                  compact
                  title="부가세 입금"
                  value={formatKRW(inputTablePaymentTotals.vat)}
                  sub={
                    checkedRows.length
                      ? `등록 ${formatKRW(inputTablePaymentTotals.registeredVat)} · 선택 +${formatKRW(inputTablePaymentTotals.pendingVat)}`
                      : inputTablePaymentTotals.vatCount
                        ? `${inputTablePaymentTotals.vatCount}건 · 최종 ${formatKRW(inputTablePaymentTotals.registeredFinal)}`
                        : "부가세 포함 입금 없음"
                  }
                  tone={inputTablePaymentTotals.vat > 0 ? "warning" : "default"}
                  icon={CreditCard}
                />
                <SummaryCard
                  compact
                  title="선택 입금"
                  value={formatKRW(selectedDraftTotals.finalAmount)}
                  sub={
                    checkedRows.length
                      ? `${checkedRows.length}건 · 공급가 ${formatKRW(selectedDraftTotals.paymentAmount)}`
                      : "전표 선택 후 저장"
                  }
                  tone={checkedRows.length ? "warning" : "default"}
                  icon={CreditCard}
                />
              </div>
            </div>
          </div>

        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-800">입금 입력</h2>
                <p className="text-xs text-slate-500">전표 선택 · 입금일 · 금액 · 부가세 · 입금구분(현금/개인통장)</p>
              </div>
              {checkedRows.length > 0 && <span className="erp-payment-badge">{checkedRows.length}건 선택</span>}
            </div>

            <TableExportSection fileName="입금입력_전표" title="입금 입력 전표" disabled={targetSalesRows.length === 0}>
            <div className="erp-payment-table-wrap erp-payment-table-wrap--input">
              <table className="erp-payment-table erp-payment-table--input">
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
                  <col className="col-channel" />
                  <col className="col-memo" />
                  <col className="col-action" />
                </colgroup>
                <thead>
                  <tr className="erp-payment-group-row">
                    <th colSpan={7}>매출 전표</th>
                    <th colSpan={7}>입금 입력</th>
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
                    <th className="text-center">부가세+</th>
                    <th className="text-right">최종</th>
                    <th className="text-center">입금구분</th>
                    <th className="text-left">비고</th>
                    <th className="text-center erp-table-export-skip">수정</th>
                  </tr>
                </thead>
                <tbody>
                  {targetSalesRows.map((row) => {
                    const draft = getPaymentDraft(row);
                    const rowKey = String(row.id);
                    const isSelected = !!paymentRows[rowKey]?.checked;
                    const workerCount = row.workers?.length || String(row.worker || "").split(",").filter(Boolean).length || 0;
                    const unpaid = getUnpaid(row);
                    const rowDeposits = vouchersBySalesId[rowKey] || [];
                    const hasDeposits = rowDeposits.length > 0;
                    const isDepositEditOpen = depositEditSalesId === rowKey;

                    return (
                      <React.Fragment key={row.id}>
                      <tr className={isSelected ? "is-selected" : ""}>
                        <td className="text-center">
                          <input type="checkbox" checked={isSelected} onChange={(e) => updatePaymentRow(row.id, "checked", e.target.checked)} className="erp-payment-check" />
                        </td>
                        <td className="text-left font-semibold">{row.voucherNo || row.id}</td>
                        <td className="text-slate-600">
                          {row.date}
                          <SalePaymentLinkBadge
                            saleId={row.id}
                            autoLinkedSaleIds={autoLinkedSaleIds}
                            manualLinkedSaleIds={manualLinkedSaleIds}
                          />
                        </td>
                        <td className="erp-cell-clip text-left font-semibold" title={row.client}>{row.client}</td>
                        <td className="erp-cell-clip text-left text-slate-600" title={row.site || ""}>{row.site || "-"}</td>
                        <td className="text-right">{workerCount}</td>
                        <td className="text-right font-semibold">{formatKRW(row.amount || 0)}</td>
                        <td>
                          <KoreanDateInput
                            className="erp-input-compact"
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
                        <td className="text-center">
                          <div className="erp-worker-vat-toggle erp-payment-input-vat-toggle flex flex-col items-center">
                            <Button
                              type="button"
                              size="sm"
                              variant={getRowVatIncluded(rowKey) ? "default" : "outline"}
                              className={`erp-payment-input-vat-btn ${getRowVatIncluded(rowKey) ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                              onClick={() => togglePaymentVat(row.id)}
                              aria-pressed={getRowVatIncluded(rowKey)}
                              aria-label={`${row.client || "거래처"} 부가세 포함 입금`}
                            >
                              부가세+
                            </Button>
                            <span className="erp-text-caption text-slate-600">{getRowVatIncluded(rowKey) ? formatKRW(draft.vatAmount) : "-"}</span>
                          </div>
                        </td>
                        <td className="text-right font-bold text-emerald-700">{formatKRW(draft.finalAmount)}</td>
                        <td className="text-center">
                          {isSelected ? (
                            <PaymentDepositChannelSelect
                              compact
                              value={normalizePaymentDepositChannel(paymentRows[rowKey]?.depositChannel || defaultDepositChannel)}
                              onChange={(value) => updatePaymentRow(row.id, "depositChannel", value)}
                            />
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td>
                          <input className="erp-input erp-input-compact" value={paymentRows[rowKey]?.memo || ""} onChange={(e) => updatePaymentRow(row.id, "memo", e.target.value)} placeholder="비고" />
                        </td>
                        <td className="text-center erp-table-export-skip">
                          {hasDeposits ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={isDepositEditOpen ? "default" : "outline"}
                              className="h-7 rounded-lg px-2 text-xs"
                              onClick={() => toggleDepositEdit(row.id)}
                              aria-expanded={isDepositEditOpen}
                            >
                              수정
                            </Button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                      {isDepositEditOpen && hasDeposits && (
                        <tr className="erp-payment-deposit-edit-row">
                          <td colSpan={14} className="!p-0">
                            <div className="erp-payment-deposit-edit-panel">
                              <div className="erp-payment-deposit-edit-head">
                                <span className="font-semibold text-slate-700">입금 내역 · {row.voucherNo || row.id}</span>
                                <span className="text-xs text-slate-500">{rowDeposits.length}건 · 취소 시 미수금이 복원됩니다</span>
                              </div>
                              <div className="erp-table-wrap">
                                <table className="erp-table erp-table--sm">
                                  <thead className="bg-slate-50 text-slate-600">
                                    <tr>
                                      <th className="text-left">입금일</th>
                                      <th className="text-center">입금구분</th>
                                      <th className="text-right">입금액</th>
                                      <th className="text-center">VAT</th>
                                      <th className="text-right">최종</th>
                                      <th className="text-left">비고</th>
                                      <th className="text-center erp-table-export-skip">취소</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...rowDeposits]
                                      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.id || 0) - Number(a.id || 0))
                                      .map((voucher) => (
                                        <tr key={voucher.id} className="border-t">
                                          <td>{voucher.date || "-"}</td>
                                          <td className="text-center">
                                            <span className={`erp-payment-channel-badge erp-payment-channel-badge--${normalizePaymentDepositChannel(voucher.depositChannel)}`}>
                                              {formatPaymentDepositChannel(voucher.depositChannel)}
                                            </span>
                                          </td>
                                          <td className="text-right font-semibold text-emerald-600">{formatKRW(voucher.amount || 0)}</td>
                                          <td className="text-center text-slate-600">{voucher.vatType === "excluded" ? "별도" : "포함"}</td>
                                          <td className="text-right font-bold text-emerald-700">{formatKRW(voucher.finalAmount ?? voucher.amount ?? 0)}</td>
                                          <td className="text-slate-600">{voucher.memo || "-"}</td>
                                          <td className="text-center erp-table-export-skip">
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="h-7 rounded-lg border-red-200 px-2 text-xs text-red-600 hover:bg-red-50"
                                              onClick={() => cancelDeposit(voucher)}
                                            >
                                              취소
                                            </Button>
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
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
        </>
      )}

      {tab === "receivables" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="총매출"
              value={formatKRW(clientSummaryTotals.sales)}
              sub={`${clientSummaryTotals.clients}개 거래처 · 전표 ${clientSummaryTotals.count}건`}
              icon={WalletCards}
            />
            <SummaryCard
              title="입금액"
              value={formatKRW(clientSummaryTotals.paid)}
              sub={
                receivableScopePaymentTotals.count
                  ? `공급가 ${formatKRW(receivableScopePaymentTotals.amount)} · 전표 ${receivableScopePaymentTotals.count}건`
                  : "입금 전표 없음"
              }
              tone="success"
              icon={CheckCircle2}
            />
            <SummaryCard
              title="부가세 입금"
              value={formatKRW(receivableScopePaymentTotals.vat)}
              sub={
                receivableScopePaymentTotals.vatCount
                  ? `${receivableScopePaymentTotals.vatCount}건 · 실입금 ${formatKRW(receivableScopePaymentTotals.final)}`
                  : "부가세 포함 입금 없음"
              }
              tone={receivableScopePaymentTotals.vat > 0 ? "warning" : "default"}
              icon={CreditCard}
            />
            <SummaryCard
              title="미수금"
              value={formatKRW(clientSummaryTotals.unpaid)}
              sub={`${clientSummaryTotals.clients}개 거래처 · 아래 표 합계와 동일`}
              tone="danger"
              icon={AlertCircle}
            />
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
              <ReceivableDetailTable rows={filteredReceivableRows} onPayRow={openPaymentForRow} exportFileName="미수전표_상세" autoLinkedSaleIds={autoLinkedSaleIds} manualLinkedSaleIds={manualLinkedSaleIds} />
            </CardContent>
          </Card>
        </>
      )}

      {tab === "history" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="입금 건수"
              value={`${historyTotals.count}건`}
              sub={`${filters.startDate || "전체"} ~ ${filters.endDate || "전체"} · 거래일 기준`}
              icon={WalletCards}
            />
            <SummaryCard
              title="입금액"
              value={formatKRW(historyTotals.amount)}
              sub="공급가액 합계"
              tone="success"
              icon={CheckCircle2}
            />
            <SummaryCard
              title="부가세 입금"
              value={formatKRW(historyTotals.vat)}
              sub={
                historyTotals.vatCount
                  ? `${historyTotals.vatCount}건 · 최종 ${formatKRW(historyTotals.vatFinal)}`
                  : "부가세 포함 입금 없음"
              }
              tone={historyTotals.vat > 0 ? "warning" : "default"}
              icon={CreditCard}
            />
            <SummaryCard
              title="최종 입금"
              value={formatKRW(historyTotals.final)}
              sub="입금액 + 부가세"
              icon={CreditCard}
            />
          </div>

        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">입금 내역</h2>
                <p className="text-xs text-slate-500">거래일(매출일) 기준 조회 · 입금일·삭제</p>
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
                  <col className="col-channel" />
                  <col className="col-memo" />
                  <col className="col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="text-left">거래일</th>
                    <th className="text-left">입금일</th>
                    <th className="text-left">거래처</th>
                    <th className="text-left">현장</th>
                    <th className="text-right">시공비</th>
                    <th className="text-right">입금액</th>
                    <th className="text-center">VAT</th>
                    <th className="text-right">최종</th>
                    <th className="text-center">입금구분</th>
                    <th className="text-left">비고</th>
                    <th className="text-center erp-table-export-skip">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVouchers.map((voucher) => (
                    <tr key={voucher.id}>
                      <td className="font-medium text-slate-800">
                        {getVoucherSaleDate(voucher) || "-"}
                        <SalePaymentLinkBadge saleId={voucher.salesId} />
                        {voucher.isPartialPayment ? <PartialPaymentBadge /> : null}
                      </td>
                      <td className="text-slate-600">{voucher.date}</td>
                      <td className="erp-cell-clip text-left font-semibold" title={voucher.client}>{voucher.client}</td>
                      <td className="erp-cell-clip text-left text-slate-600" title={voucher.site || ""}>{voucher.site || "-"}</td>
                      <td className="text-right">{formatKRW(voucher.totalSalesAmount || 0)}</td>
                      <td className="text-right font-semibold text-emerald-600">{formatKRW(voucher.amount || 0)}</td>
                      <td className="text-center text-slate-600">{voucher.vatType === "excluded" ? "별도" : "포함"}</td>
                      <td className="text-right font-bold text-emerald-700">{formatKRW(voucher.finalAmount ?? voucher.amount ?? 0)}</td>
                      <td className="text-center">
                        <span className={`erp-payment-channel-badge erp-payment-channel-badge--${normalizePaymentDepositChannel(voucher.depositChannel)}`}>
                          {formatPaymentDepositChannel(voucher.depositChannel)}
                        </span>
                      </td>
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
                {filteredVouchers.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="text-left">
                        총합계 {historyTotals.count}건
                        <span className="erp-text-caption ml-2 font-normal text-slate-500">거래일 기준 · 시공비는 매출 참고값</span>
                      </td>
                      <td className="text-right">{formatKRW(historyTotals.bill)}</td>
                      <td className="text-right text-emerald-600">{formatKRW(historyTotals.amount)}</td>
                      <td className="text-center text-slate-500">{formatKRW(historyTotals.vat)}</td>
                      <td className="text-right text-emerald-700">{formatKRW(historyTotals.final)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
              {filteredVouchers.length === 0 && <div className="erp-payment-empty">등록된 입금내역이 없습니다.</div>}
            </div>
            </TableExportSection>
          </CardContent>
        </Card>
        </>
      )}

      {tab === "log" && (
        <>
        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">입금로그</h2>
                <p className="text-xs text-slate-500">행 클릭 → 해당 저장 건의 입금 내역 표시</p>
              </div>
              <SearchBox query={logQuery} setQuery={setLogQuery} placeholder="입금로그 검색" />
            </div>
            <TableExportSection fileName="입금로그" title="입금로그" disabled={filteredPaymentInputLogSummaries.length === 0}>
              <div className="erp-table-wrap">
                <table className="erp-table">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="text-left">입금일자</th>
                      <th className="text-left">거래처명</th>
                      <th className="text-right">총합</th>
                      <th className="text-right">공급가</th>
                      <th className="text-right">VAT</th>
                      <th className="text-left">저장일시</th>
                      <th className="text-left">로그기록</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPaymentInputLogSummaries.map((row) => (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-t hover:bg-sky-50 ${selectedLogSummaryId === row.id ? "bg-sky-50" : ""}`}
                        onClick={() => setSelectedLogSummaryId((prev) => (prev === row.id ? null : row.id))}
                      >
                        <td className="text-slate-700">{row.paymentDate}</td>
                        <td className="text-left font-semibold">{row.clientLabel}</td>
                        <td className="text-right font-bold text-emerald-700">{formatKRW(row.totalAmount)}</td>
                        <td className="text-right font-semibold text-emerald-600">{formatKRW(row.supplyAmount)}</td>
                        <td className="text-right text-slate-600">{formatKRW(row.vatAmount)}</td>
                        <td className="text-slate-500">{row.createdAt ? row.createdAt.replace("T", " ").slice(0, 16) : "-"}</td>
                        <td className="text-left text-slate-600">{formatPaymentInputLogRecord(row)}</td>
                      </tr>
                    ))}
                    {filteredPaymentInputLogSummaries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          입금로그가 없습니다. 입금 입력에서 선택 입금 저장 시 기록됩니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TableExportSection>
          </CardContent>
        </Card>

        {selectedLogSummary && (
          <Card className="rounded-xl border-sky-200/80 shadow-sm">
            <CardContent className="p-3 md:p-4">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-slate-800">입금 내역</h2>
                <p className="text-xs text-slate-500">
                  {formatPaymentInputLogRecord(selectedLogSummary)} · {selectedLogSummary.paymentDate}
                </p>
              </div>
              <TableExportSection
                fileName={`입금로그_내역_${selectedLogSummary.paymentDate}`}
                title="입금로그 상세 입금내역"
                disabled={selectedLogVouchers.length === 0}
              >
                <div className="erp-payment-table-wrap">
                  <table className="erp-payment-table erp-payment-table--history">
                    <colgroup>
                      <col className="col-date" />
                      <col className="col-date" />
                      <col className="col-client" />
                      <col className="col-site" />
                      <col className="col-money" />
                      <col className="col-money" />
                      <col className="col-vat" />
                      <col className="col-money" />
                      <col className="col-channel" />
                      <col className="col-memo" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="text-left">거래일</th>
                        <th className="text-left">입금일</th>
                        <th className="text-left">거래처</th>
                        <th className="text-left">현장</th>
                        <th className="text-right">시공비</th>
                        <th className="text-right">입금액</th>
                        <th className="text-center">VAT</th>
                        <th className="text-right">최종</th>
                        <th className="text-center">입금구분</th>
                        <th className="text-left">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLogVouchers.map((voucher) => (
                        <tr key={voucher.id}>
                          <td className="font-medium text-slate-800">
                        {getVoucherSaleDate(voucher) || "-"}
                        <SalePaymentLinkBadge saleId={voucher.salesId} />
                        {voucher.isPartialPayment ? <PartialPaymentBadge /> : null}
                      </td>
                          <td className="text-slate-600">{voucher.date}</td>
                          <td className="erp-cell-clip text-left font-semibold" title={voucher.client}>{voucher.client}</td>
                          <td className="erp-cell-clip text-left text-slate-600" title={voucher.site || ""}>{voucher.site || "-"}</td>
                          <td className="text-right">{formatKRW(voucher.totalSalesAmount || 0)}</td>
                          <td className="text-right font-semibold text-emerald-600">{formatKRW(voucher.amount || 0)}</td>
                          <td className="text-center text-slate-600">{voucher.vatType === "excluded" ? "별도" : "포함"}</td>
                          <td className="text-right font-bold text-emerald-700">{formatKRW(voucher.finalAmount ?? voucher.amount ?? 0)}</td>
                          <td className="text-center">
                            <span className={`erp-payment-channel-badge erp-payment-channel-badge--${normalizePaymentDepositChannel(voucher.depositChannel)}`}>
                              {formatPaymentDepositChannel(voucher.depositChannel)}
                            </span>
                          </td>
                          <td className="erp-cell-clip text-slate-600" title={voucher.memo || ""}>{voucher.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    {selectedLogVouchers.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={4} className="text-left">총합계 {selectedLogVoucherTotals.count}건</td>
                          <td className="text-right">{formatKRW(selectedLogVoucherTotals.bill)}</td>
                          <td className="text-right text-emerald-600">{formatKRW(selectedLogVoucherTotals.amount)}</td>
                          <td className="text-center text-slate-500">{formatKRW(selectedLogVoucherTotals.vat)}</td>
                          <td className="text-right text-emerald-700">{formatKRW(selectedLogVoucherTotals.final)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {selectedLogVouchers.length === 0 && (
                    <div className="erp-payment-empty">
                      연결된 입금 전표를 찾을 수 없습니다. 입금 내역에서 삭제되었거나 로그만 남아 있을 수 있습니다.
                    </div>
                  )}
                </div>
              </TableExportSection>
            </CardContent>
          </Card>
        )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  tone = "default",
  icon: Icon,
  compact = false,
}: {
  title: string;
  value: string;
  sub: string;
  tone?: "default" | "success" | "danger" | "warning";
  icon: React.ComponentType<{ size?: number }>;
  compact?: boolean;
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
    <Card className={`erp-summary-card ${compact ? "erp-summary-card--compact" : ""} rounded-2xl shadow-sm`}>
      <CardContent className={compact ? "p-2.5 md:p-3" : "p-4 md:p-5"}>
        <div className="flex items-start justify-between gap-2 md:gap-3">
          <div className="min-w-0 flex-1">
            <div className="erp-text-caption font-bold text-slate-500">{title}</div>
            <div className={`${compact ? "erp-text-stat" : "erp-text-title"} ${compact ? "mt-0.5" : "mt-1"} font-black ${toneClass}`}>{value}</div>
            <div className={`erp-text-caption ${compact ? "mt-0.5" : "mt-1"} text-slate-500`}>{sub}</div>
          </div>
          <div className={`shrink-0 bg-slate-100 text-slate-600 ${compact ? "rounded-lg p-1.5" : "rounded-2xl p-3"}`}>
            <Icon size={compact ? 16 : 20} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
