import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, FileText, ArrowDown, ArrowUp, ArrowUpDown, Undo2, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { useAudit } from "@/context/AuditContext";
import { getUnpaid, todayISO, formatKRW } from "@/utils/receivables";
import { aggregateSaleBilling, getSaleTotalBill, getSaleWorkerLines } from "@/utils/saleBilling";
import { formatWorkerNameSummary } from "@/utils/statementSheets";
import { PAYMENT_AUDIT_FIELDS, snapshotPaymentForAudit } from "@/utils/auditLog";
import {
  buildCalendarPaymentPreview,
  buildCalendarPaymentCancelPreview,
  type CalendarPaymentPreview,
  type CalendarPaymentCancelPreview,
  type CalendarPaymentVoucherRecord,
} from "@/utils/clientCalendarPayment";
import { createPaymentInputLogsFromVouchers, type PaymentInputLog } from "@/utils/paymentInputLogs";
import {
  createClientCalendarStatementDraft,
  stashStatementDraft,
  type StatementDraft,
} from "@/utils/statementDraft";
import type { SortDirection } from "@/utils/pivotSort";
import { useActionNotice } from "@/hooks/useActionNotice";

type ClientMonthSortColumn = "client" | "sales" | "unpaid";

type SaleLike = {
  id?: string | number;
  client?: string;
  date?: string;
  amount?: number;
  paid?: number;
  salesAmount?: number;
  paidAmount?: number;
  site?: string;
  memo?: string;
  worker?: string;
  workers?: Array<Record<string, unknown>>;
};

type ClientLike = {
  name?: string;
  vat?: string;
};

type DayVoucher = {
  site: string;
  amount: number;
  unpaid: number;
  hasUnpaid: boolean;
};

type DayTooltipVoucher = {
  site: string;
  totalAmount: number;
  workerSummary: string;
  mealCost: number;
  lodgingCost: number;
  expenseCost: number;
  overtimeCost: number;
};

type DayStats = {
  count: number;
  totalAmount: number;
  totalUnpaid: number;
  saleIds: Array<string | number>;
  vouchers: DayVoucher[];
  tooltipVouchers: DayTooltipVoucher[];
  hasUnpaid: boolean;
};

type DayHoverPreview = {
  date: string;
  stats: DayStats;
  anchorX: number;
  anchorY: number;
};

type ClientMonthRow = {
  client: string;
  count: number;
  sales: number;
  paid: number;
  unpaid: number;
};

function normalizeClientName(value: unknown) {
  return String(value || "").trim() || "(미지정)";
}

function getSaleAmount(row: SaleLike) {
  return Number(row.salesAmount ?? row.amount ?? 0) || 0;
}

function getSiteName(row: SaleLike) {
  return String(row.site || row.memo || "").trim();
}

type ClientCalendarPageProps = {
  sales: SaleLike[];
  clients: ClientLike[];
  paymentVouchers?: CalendarPaymentVoucherRecord[];
  setPaymentVouchers?: React.Dispatch<React.SetStateAction<Array<Record<string, unknown>>>>;
  setPaymentInputLogs?: React.Dispatch<React.SetStateAction<PaymentInputLog[]>>;
  currentUser?: { name?: string; email?: string };
  onRequestClientStatement?: (draft: StatementDraft) => void;
  onOpenVoucherEdit?: (input: { client: string; date: string; saleIds: Array<string | number> }) => void;
  pendingClient?: string | null;
  pendingMonthKey?: string | null;
  onPendingClientConsumed?: () => void;
  embedded?: boolean;
  embeddedClient?: string | null;
  embeddedMonthKey?: string;
  onEmbeddedMonthKeyChange?: (monthKey: string) => void;
};

function PageTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h1 className="erp-text-page-title">{title}</h1>
      <p className="mt-1 erp-text-body text-slate-500">{desc}</p>
    </div>
  );
}

function matchesClientName(row: SaleLike, clientName: string) {
  return normalizeClientName(row.client) === clientName;
}

function isClientVatIncluded(clients: ClientLike[], clientName: string) {
  const match = clients.find((row) => String(row.name || "").trim() === clientName);
  return String(match?.vat || "Y").trim().toUpperCase() !== "N";
}

function buildMonthCells(monthKey: string, statsByDate: Record<string, DayStats>) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells: Array<{ date: string; day: number; stats: DayStats } | null> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({
      date,
      day,
      stats: statsByDate[date] || {
        count: 0,
        totalAmount: 0,
        totalUnpaid: 0,
        saleIds: [],
        vouchers: [],
        tooltipVouchers: [],
        hasUnpaid: false,
      },
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return { cells, monthLabel: `${year}년 ${month}월` };
}

function formatSelectedDateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"][parsed.getDay()];
  const [, monthText, dayText] = date.split("-");
  return `${Number(monthText)}/${Number(dayText)} (${weekday})`;
}

function ClientCalendarDayTooltip({
  preview,
  clientName,
  onOpenVoucherEdit,
  onMouseEnter,
  onMouseLeave,
}: {
  preview: DayHoverPreview | null;
  clientName: string;
  onOpenVoucherEdit?: (input: { client: string; date: string; saleIds: Array<string | number> }) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  if (!preview) return null;

  const { date, stats } = preview;
  const canEdit = stats.saleIds.length > 0 && Boolean(onOpenVoucherEdit);

  return (
    <div
      className={`erp-client-calendar-day-tooltip${canEdit ? " is-interactive" : ""}`}
      style={{ left: preview.anchorX, top: preview.anchorY }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="erp-client-calendar-day-tooltip-head">
        <strong>{formatSelectedDateLabel(date)}</strong>
        <span>{stats.count}건</span>
      </div>
      <ul className="erp-client-calendar-day-tooltip-list">
        {stats.tooltipVouchers.map((voucher, index) => (
          <li key={`${date}-tooltip-${index}`} className="erp-client-calendar-day-tooltip-item">
            <div className="erp-client-calendar-day-tooltip-row">
              <span className="erp-client-calendar-day-tooltip-site">{voucher.site}</span>
              <span className="erp-client-calendar-day-tooltip-total">{formatKRW(voucher.totalAmount)}</span>
            </div>
            {voucher.workerSummary ? (
              <div className="erp-client-calendar-day-tooltip-workers">{voucher.workerSummary}</div>
            ) : null}
            {voucher.mealCost || voucher.expenseCost || voucher.lodgingCost || voucher.overtimeCost ? (
              <div className="erp-client-calendar-day-tooltip-extras">
                {voucher.mealCost ? <span>식대 {formatKRW(voucher.mealCost)}</span> : null}
                {voucher.expenseCost ? <span>경비 {formatKRW(voucher.expenseCost)}</span> : null}
                {voucher.lodgingCost ? <span>숙박 {formatKRW(voucher.lodgingCost)}</span> : null}
                {voucher.overtimeCost ? <span>잔업 {formatKRW(voucher.overtimeCost)}</span> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="erp-client-calendar-day-tooltip-foot">
        <span>합계 {formatKRW(stats.totalAmount)}</span>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="erp-client-calendar-day-tooltip-edit h-7 rounded-lg px-2 text-xs"
            onClick={() => {
              onOpenVoucherEdit?.({
                client: clientName,
                date,
                saleIds: stats.saleIds,
              });
            }}
          >
            <Pencil size={12} className="mr-1" />
            매출전표 수정
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ClientMonthSortButton({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: ClientMonthSortColumn;
  sort: { column: ClientMonthSortColumn; direction: SortDirection };
  onSort: (column: ClientMonthSortColumn) => void;
  align?: "left" | "right";
}) {
  const isActive = sort.column === column;
  const SortIcon = !isActive ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  const alignClass = align === "right" ? "text-right" : "text-left";

  return (
    <button
      type="button"
      className={`erp-pivot-sort-btn erp-client-calendar-sort-btn ${alignClass} ${isActive ? "is-active" : ""}`}
      onClick={() => onSort(column)}
      aria-label={`${label} ${isActive ? (sort.direction === "asc" ? "오름차순" : "내림차순") : "정렬"}`}
    >
      <span>{label}</span>
      <span className="erp-pivot-sort-icon" aria-hidden="true">
        <SortIcon size={12} />
      </span>
    </button>
  );
}

function sortClientMonthRows(
  rows: ClientMonthRow[],
  sort: { column: ClientMonthSortColumn; direction: SortDirection },
) {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sort.column === "client") {
      return left.client.localeCompare(right.client, "ko") * dir;
    }
    if (sort.column === "sales") {
      return (left.sales - right.sales) * dir || left.client.localeCompare(right.client, "ko");
    }
    return (left.unpaid - right.unpaid) * dir || left.client.localeCompare(right.client, "ko");
  });
}

export function ClientCalendarPage({
  sales,
  clients,
  paymentVouchers = [],
  setPaymentVouchers,
  setPaymentInputLogs,
  currentUser,
  onRequestClientStatement,
  onOpenVoucherEdit,
  pendingClient = null,
  pendingMonthKey = null,
  onPendingClientConsumed,
  embedded = false,
  embeddedClient = null,
  embeddedMonthKey,
  onEmbeddedMonthKeyChange,
}: ClientCalendarPageProps) {
  const { recordAudit } = useAudit();
  const [monthKey, setMonthKey] = useState(() => todayISO().slice(0, 7));
  const [client, setClient] = useState("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const { message: notice, showNotice, clearNotice } = useActionNotice();
  const [paymentPreview, setPaymentPreview] = useState<CalendarPaymentPreview | null>(null);
  const [paymentCancelPreview, setPaymentCancelPreview] = useState<CalendarPaymentCancelPreview | null>(null);
  const [hoverDayPreview, setHoverDayPreview] = useState<DayHoverPreview | null>(null);
  const [clientListSort, setClientListSort] = useState<{ column: ClientMonthSortColumn; direction: SortDirection }>({
    column: "sales",
    direction: "desc",
  });
  const calendarRef = React.useRef<HTMLDivElement | null>(null);
  const hideDayPreviewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const name = String(pendingClient || "").trim();
    if (!name) return;
    const normalized = normalizeClientName(name);
    setClient(normalized);
    const nextMonth = String(pendingMonthKey || "").trim();
    if (/^\d{4}-\d{2}$/.test(nextMonth)) setMonthKey(nextMonth);
    setSelectedDates([]);
    showNotice(`${normalized} 캘린더를 표시합니다.`);
    window.requestAnimationFrame(() => {
      calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    onPendingClientConsumed?.();
  }, [pendingClient, pendingMonthKey, onPendingClientConsumed, showNotice]);

  useEffect(() => {
    if (!embedded) return;
    const name = String(embeddedClient || "").trim();
    if (!name) return;
    setClient(normalizeClientName(name));
    setSelectedDates([]);
  }, [embedded, embeddedClient]);

  useEffect(() => {
    if (!embedded || !embeddedMonthKey) return;
    if (/^\d{4}-\d{2}$/.test(embeddedMonthKey)) setMonthKey(embeddedMonthKey);
  }, [embedded, embeddedMonthKey]);

  const clientOptions = useMemo(() => {
    const fromMaster = clients.map((row) => String(row.name || "").trim()).filter(Boolean);
    const fromSales = sales.map((row) => normalizeClientName(row.client)).filter((name) => name !== "(미지정)");
    return [...new Set([...fromMaster, ...fromSales])].sort((a, b) => a.localeCompare(b, "ko"));
  }, [clients, sales]);

  const clientMonthRowsRaw = useMemo(() => {
    const acc = new Map<string, ClientMonthRow>();
    sales.forEach((sale) => {
      const date = String(sale.date || "").trim();
      if (!date.startsWith(monthKey)) return;
      const name = normalizeClientName(sale.client);
      const amount = getSaleAmount(sale);
      const unpaid = getUnpaid(sale);
      const current = acc.get(name) || { client: name, count: 0, sales: 0, paid: 0, unpaid: 0 };
      current.count += 1;
      current.sales += amount;
      current.unpaid += unpaid;
      current.paid += Math.max(amount - unpaid, 0);
      acc.set(name, current);
    });
    return [...acc.values()];
  }, [sales, monthKey]);

  const clientMonthRows = useMemo(
    () => sortClientMonthRows(clientMonthRowsRaw, clientListSort),
    [clientMonthRowsRaw, clientListSort],
  );

  const handleClientListSort = (column: ClientMonthSortColumn) => {
    setClientListSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column, direction: column === "client" ? "asc" : "desc" };
    });
  };

  const clientMonthTotals = useMemo(
    () =>
      clientMonthRowsRaw.reduce(
        (sum, row) => ({
          count: sum.count + row.count,
          sales: sum.sales + row.sales,
          paid: sum.paid + row.paid,
          unpaid: sum.unpaid + row.unpaid,
        }),
        { count: 0, sales: 0, paid: 0, unpaid: 0 },
      ),
    [clientMonthRowsRaw],
  );

  const applyClientFromTable = (clientName: string) => {
    setClient(clientName);
    showNotice(`${clientName} 캘린더를 표시합니다.`);
    window.requestAnimationFrame(() => {
      calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const clientSales = useMemo(() => {
    if (!client) return [];
    return sales.filter((sale) => matchesClientName(sale, client));
  }, [sales, client]);

  const statsByDate = useMemo(() => {
    const acc: Record<string, DayStats> = {};
    clientSales.forEach((sale) => {
      const date = String(sale.date || "").trim();
      if (!date.startsWith(monthKey)) return;
      if (!acc[date]) {
        acc[date] = {
          count: 0,
          totalAmount: 0,
          totalUnpaid: 0,
          saleIds: [],
          vouchers: [],
          tooltipVouchers: [],
          hasUnpaid: false,
        };
      }
      const amount = getSaleAmount(sale);
      const unpaid = getUnpaid(sale);
      const billing = aggregateSaleBilling(sale);
      const totalAmount = billing.totalConstructionCost || getSaleTotalBill(sale) || amount;
      const workerLines = getSaleWorkerLines(sale);
      acc[date].count += 1;
      if (sale.id != null && sale.id !== "") {
        acc[date].saleIds.push(sale.id);
      }
      acc[date].totalAmount += totalAmount;
      acc[date].totalUnpaid += unpaid;
      acc[date].vouchers.push({
        site: getSiteName(sale) || "현장명 없음",
        amount,
        unpaid,
        hasUnpaid: unpaid > 0,
      });
      acc[date].tooltipVouchers.push({
        site: getSiteName(sale) || "현장명 없음",
        totalAmount,
        workerSummary: formatWorkerNameSummary(workerLines),
        mealCost: billing.mealCost,
        lodgingCost: billing.lodgingCost,
        expenseCost: billing.expenseCost,
        overtimeCost: billing.overtimeCost,
      });
      if (unpaid > 0) acc[date].hasUnpaid = true;
    });
    return acc;
  }, [clientSales, monthKey]);

  const { cells, monthLabel } = useMemo(() => buildMonthCells(monthKey, statsByDate), [monthKey, statsByDate]);
  const todayDate = todayISO();

  const monthTransactionDates = useMemo(
    () =>
      cells
        .filter((cell): cell is { date: string; day: number; stats: DayStats } => Boolean(cell && cell.stats.count > 0))
        .map((cell) => cell.date),
    [cells],
  );

  const allMonthDatesSelected = useMemo(
    () =>
      monthTransactionDates.length > 0 &&
      monthTransactionDates.every((date) => selectedDates.includes(date)),
    [monthTransactionDates, selectedDates],
  );

  const monthTotals = useMemo(() => {
    return monthTransactionDates.reduce(
      (acc, date) => {
        const stats = statsByDate[date];
        if (!stats) return acc;
        acc.count += stats.count;
        if (stats.hasUnpaid) acc.unpaidDays += 1;
        else acc.paidDays += 1;
        return acc;
      },
      { count: 0, unpaidDays: 0, paidDays: 0 },
    );
  }, [monthTransactionDates, statsByDate]);

  const selectedTotals = useMemo(() => {
    return selectedDates.reduce(
      (acc, date) => {
        const stats = statsByDate[date];
        if (!stats) return acc;
        acc.days += 1;
        acc.count += stats.count;
        acc.amount += stats.totalAmount;
        return acc;
      },
      { days: 0, count: 0, amount: 0 },
    );
  }, [selectedDates, statsByDate]);

  useEffect(() => {
    setSelectedDates([]);
    clearNotice();
    setHoverDayPreview(null);
  }, [client, monthKey, clearNotice]);

  const shiftMonth = (delta: number) => {
    const [yearText, monthText] = monthKey.split("-");
    const date = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
    const nextKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setMonthKey(nextKey);
    onEmbeddedMonthKeyChange?.(nextKey);
  };

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => (prev.includes(date) ? prev.filter((item) => item !== date) : [...prev, date].sort()));
  };

  const showDayPreview = (date: string, stats: DayStats, event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    if (hideDayPreviewTimerRef.current) {
      clearTimeout(hideDayPreviewTimerRef.current);
      hideDayPreviewTimerRef.current = null;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverDayPreview({
      date,
      stats,
      anchorX: rect.left + rect.width / 2,
      anchorY: rect.top,
    });
  };

  const hideDayPreview = () => {
    if (hideDayPreviewTimerRef.current) {
      clearTimeout(hideDayPreviewTimerRef.current);
    }
    hideDayPreviewTimerRef.current = setTimeout(() => {
      setHoverDayPreview(null);
      hideDayPreviewTimerRef.current = null;
    }, 120);
  };

  const keepDayPreview = () => {
    if (hideDayPreviewTimerRef.current) {
      clearTimeout(hideDayPreviewTimerRef.current);
      hideDayPreviewTimerRef.current = null;
    }
  };

  const selectAllMonthDates = () => {
    if (!client) {
      showNotice("거래처를 먼저 선택해 주세요.");
      return;
    }
    if (!monthTransactionDates.length) {
      showNotice("이번 달에 거래 내역이 있는 날짜가 없습니다.");
      return;
    }
    if (allMonthDatesSelected) {
      setSelectedDates([]);
      showNotice("선택이 해제되었습니다.");
      return;
    }
    setSelectedDates([...monthTransactionDates]);
    showNotice(`${monthTransactionDates.length}일이 선택되었습니다.`);
  };

  const handleExportStatement = () => {
    if (!client) {
      showNotice("거래처를 선택해 주세요.");
      return;
    }
    if (!selectedDates.length) {
      showNotice("시공비내역서를 만들 날짜를 선택해 주세요.");
      return;
    }

    const draft = createClientCalendarStatementDraft(client, clientSales, selectedDates);
    if (!draft) {
      showNotice("선택한 날짜에 해당 거래처 전표가 없습니다.");
      return;
    }

    stashStatementDraft(draft);
    onRequestClientStatement?.(draft);
    showNotice(`${selectedDates.length}일 · 시공비내역서 생성 화면으로 이동합니다.`);
  };

  const openPaymentConfirm = () => {
    if (!client) {
      showNotice("거래처를 선택해 주세요.");
      return;
    }
    if (!selectedDates.length) {
      showNotice("입금 처리할 날짜를 선택해 주세요.");
      return;
    }
    if (!setPaymentVouchers || !setPaymentInputLogs) {
      showNotice("입금 처리 기능을 사용할 수 없습니다.");
      return;
    }

    const vatIncluded = isClientVatIncluded(clients, client);
    const preview = buildCalendarPaymentPreview(sales, client, selectedDates, todayISO(), vatIncluded);
    if (!preview) {
      showNotice("선택한 날짜에 미수 전표가 없습니다.");
      return;
    }

    setPaymentPreview(preview);
  };

  const handlePaymentVatChange = (vatIncluded: boolean) => {
    if (!client || !selectedDates.length) return;
    const preview = buildCalendarPaymentPreview(sales, client, selectedDates, todayISO(), vatIncluded);
    if (preview) setPaymentPreview(preview);
  };

  const closePaymentConfirm = () => {
    setPaymentPreview(null);
  };

  const confirmPaymentProcess = () => {
    if (!paymentPreview || !setPaymentVouchers || !setPaymentInputLogs) return;

    const batchId = Date.now();
    const savedBy = currentUser?.name || currentUser?.email || "";
    const vouchers = paymentPreview.vouchers;
    const logs = createPaymentInputLogsFromVouchers(vouchers, savedBy, batchId);

    vouchers.forEach((voucher) => {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: voucher.id,
        entityLabel: `${voucher.client} · ${voucher.site}`,
        screen: "거래처캘린더",
        action: "create",
        after: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    });

    setPaymentVouchers((prev) => [...vouchers, ...prev]);
    setPaymentInputLogs((prev) => [...logs, ...prev]);
    setPaymentPreview(null);
    setSelectedDates([]);
    showNotice(`${vouchers.length}건 · ${formatKRW(paymentPreview.totalFinal)} 입금완료 처리되었습니다.`);
  };

  const openPaymentCancelConfirm = () => {
    if (!client) {
      showNotice("거래처를 선택해 주세요.");
      return;
    }
    if (!selectedDates.length) {
      showNotice("입금 취소할 날짜를 선택해 주세요.");
      return;
    }
    if (!setPaymentVouchers || !setPaymentInputLogs) {
      showNotice("입금 취소 기능을 사용할 수 없습니다.");
      return;
    }

    const preview = buildCalendarPaymentCancelPreview(sales, paymentVouchers, client, selectedDates);
    if (!preview) {
      showNotice("선택한 날짜에 취소할 입금 내역이 없습니다.");
      return;
    }

    setPaymentCancelPreview(preview);
  };

  const closePaymentCancelConfirm = () => {
    setPaymentCancelPreview(null);
  };

  const confirmPaymentCancel = () => {
    if (!paymentCancelPreview || !setPaymentVouchers || !setPaymentInputLogs) return;

    const cancelIds = new Set(paymentCancelPreview.vouchers.map((voucher) => String(voucher.id)));

    paymentCancelPreview.vouchers.forEach((voucher) => {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: voucher.id,
        entityLabel: `${voucher.client} · ${voucher.site}`,
        screen: "거래처캘린더",
        action: "delete",
        before: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    });

    setPaymentVouchers((prev) => prev.filter((item) => !cancelIds.has(String(item.id))));
    setPaymentInputLogs((prev) => prev.filter((log) => !cancelIds.has(String(log.paymentVoucherId))));
    setPaymentCancelPreview(null);
    setSelectedDates([]);
    showNotice(`${paymentCancelPreview.voucherCount}건 · ${formatKRW(paymentCancelPreview.totalFinal)} 입금이 취소되었습니다.`);
  };

  const weekdayLabels = [
    { label: "일", tone: "sun" },
    { label: "월", tone: "default" },
    { label: "화", tone: "default" },
    { label: "수", tone: "default" },
    { label: "목", tone: "default" },
    { label: "금", tone: "default" },
    { label: "토", tone: "sat" },
  ];

  return (
    <div className={embedded ? "erp-client-calendar-embedded" : "erp-page erp-calendar-page erp-client-calendar-page"}>
      {paymentCancelPreview ? (
        <div className="erp-ledger-modal-backdrop" onClick={closePaymentCancelConfirm}>
          <div
            className="erp-ledger-modal erp-client-calendar-payment-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-calendar-payment-cancel-title"
          >
            <h2 id="client-calendar-payment-cancel-title" className="text-base font-bold text-slate-900 md:text-lg">
              입금 취소
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-800">{paymentCancelPreview.client}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>선택 일자 <strong>{paymentCancelPreview.selectedDays}일</strong></p>
              <p>취소 입금 <strong>{paymentCancelPreview.voucherCount}건</strong></p>
              <p>입금 공급가액 <strong>{formatKRW(paymentCancelPreview.totalAmount)}</strong></p>
              <p>
                부가세{" "}
                <strong className={paymentCancelPreview.totalVat > 0 ? "text-amber-700" : "text-slate-500"}>
                  {paymentCancelPreview.totalVat > 0 ? formatKRW(paymentCancelPreview.totalVat) : "없음"}
                </strong>
              </p>
              <p>취소 금액 <strong className="text-red-700">{formatKRW(paymentCancelPreview.totalFinal)}</strong></p>
              <p className="text-xs text-slate-500">선택한 날짜 매출 전표에 연결된 입금 내역을 삭제합니다.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={closePaymentCancelConfirm} noFeedback>
                닫기
              </Button>
              <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={confirmPaymentCancel}>
                입금취소
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentPreview ? (
        <div className="erp-ledger-modal-backdrop" onClick={closePaymentConfirm}>
          <div
            className="erp-ledger-modal erp-client-calendar-payment-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-calendar-payment-title"
          >
            <h2 id="client-calendar-payment-title" className="text-base font-bold text-slate-900 md:text-lg">
              입금 처리
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-800">{paymentPreview.client}</p>
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500">부가세 처리</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={paymentPreview.vatIncluded ? "default" : "outline"}
                  className="flex-1 rounded-xl"
                  onClick={() => handlePaymentVatChange(true)}
                >
                  부가세 포함
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!paymentPreview.vatIncluded ? "default" : "outline"}
                  className="flex-1 rounded-xl"
                  onClick={() => handlePaymentVatChange(false)}
                >
                  부가세 미포함
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>선택 일자 <strong>{paymentPreview.selectedDays}일</strong></p>
              <p>미수 전표 <strong>{paymentPreview.saleCount}건</strong></p>
              <p>입금 공급가액 <strong>{formatKRW(paymentPreview.totalUnpaid)}</strong></p>
              <p>
                부가세{" "}
                <strong className={paymentPreview.totalVat > 0 ? "text-amber-700" : "text-slate-500"}>
                  {paymentPreview.totalVat > 0 ? formatKRW(paymentPreview.totalVat) : "없음"}
                </strong>
              </p>
              <p>최종 입금액 <strong className="text-emerald-700">{formatKRW(paymentPreview.totalFinal)}</strong></p>
              <p className="text-xs text-slate-500">선택한 날짜의 미수 잔액을 오늘({todayISO()}) 입금완료 처리합니다.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={closePaymentConfirm} noFeedback>
                취소
              </Button>
              <Button className="flex-1 rounded-xl" onClick={confirmPaymentProcess}>
                입금완료
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!embedded ? (
      <>
      <PageTitle
        title="거래처캘린더"
        desc="거래처별 일자 매출 전표, 현장명, 미수금 상태를 확인하고 선택한 날짜의 시공비내역서 생성·입금 처리를 할 수 있습니다."
      />

      <div className="erp-client-calendar-toolbar mb-4">
        <label className="erp-client-calendar-client-field block min-w-0 flex-1">
          <span className="erp-text-caption mb-1 block font-semibold text-slate-500">거래처</span>
          <AutocompleteInput
            value={client}
            onChange={setClient}
            options={clientOptions}
            placeholder="거래처 검색"
            compact={false}
          />
        </label>
      </div>

      <Card className="erp-client-calendar-table-card mb-3 rounded-2xl shadow-sm">
        <CardContent className="p-2.5 md:p-3">
          <div className="erp-client-calendar-table-head mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="erp-text-body font-bold text-slate-900">거래처 매출 · 미수</h2>
              <p className="erp-text-caption text-slate-500">{monthLabel} · 행 클릭 시 캘린더 적용</p>
            </div>
            <span className="erp-text-caption shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-600">
              {clientMonthRows.length}곳
            </span>
          </div>

          {clientMonthRows.length ? (
            <div className="erp-client-calendar-client-list">
              <div className="erp-client-calendar-client-list-head">
                <ClientMonthSortButton
                  label="거래처"
                  column="client"
                  sort={clientListSort}
                  onSort={handleClientListSort}
                />
                <div className="erp-client-calendar-client-list-head-amounts">
                  <ClientMonthSortButton
                    label="매출"
                    column="sales"
                    sort={clientListSort}
                    onSort={handleClientListSort}
                    align="right"
                  />
                  <ClientMonthSortButton
                    label="미수"
                    column="unpaid"
                    sort={clientListSort}
                    onSort={handleClientListSort}
                    align="right"
                  />
                </div>
              </div>
              <div className="erp-client-calendar-client-list-body">
                {clientMonthRows.map((row) => (
                  <button
                    key={row.client}
                    type="button"
                    className={`erp-client-calendar-client-row ${client === row.client ? "is-selected" : ""}`}
                    onClick={() => applyClientFromTable(row.client)}
                  >
                    <div className="erp-client-calendar-client-row-inner">
                      <span className="erp-client-calendar-client-row-name">{row.client}</span>
                      <div className="erp-client-calendar-client-row-amounts">
                        <div className="erp-client-calendar-client-row-sales">{formatKRW(row.sales)}</div>
                        <div className="erp-client-calendar-client-row-sub">
                          <span className="is-paid">입금 {formatKRW(row.paid)}</span>
                          <span className={row.unpaid > 0 ? "is-unpaid" : "is-zero"}>미수 {formatKRW(row.unpaid)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="erp-client-calendar-client-list-foot">
                <div className="erp-client-calendar-client-row-inner">
                  <span className="erp-client-calendar-client-row-name">합계</span>
                  <div className="erp-client-calendar-client-row-amounts">
                    <div className="erp-client-calendar-client-row-sales">{formatKRW(clientMonthTotals.sales)}</div>
                    <div className="erp-client-calendar-client-row-sub">
                      <span className="is-paid">입금 {formatKRW(clientMonthTotals.paid)}</span>
                      <span className="is-unpaid">미수 {formatKRW(clientMonthTotals.unpaid)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="erp-text-caption rounded-xl bg-slate-50 px-3 py-4 text-center text-slate-500">
              {monthLabel}에 매출이 있는 거래처가 없습니다.
            </p>
          )}
        </CardContent>
      </Card>
      </>
      ) : null}

      {client ? (
        <div className="erp-calendar-summary-grid mb-4">
          <div className="erp-summary-card erp-summary-card--compact rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="erp-text-caption font-semibold text-slate-500">월간 전표</div>
            <div className="erp-text-stat mt-1 font-black text-slate-900">{monthTotals.count}건</div>
            <div className="erp-text-caption mt-1 text-slate-400">{monthLabel}</div>
          </div>
          <div className="erp-summary-card erp-summary-card--compact rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-sm">
            <div className="erp-text-caption font-semibold text-emerald-700">완납 일자</div>
            <div className="erp-text-stat mt-1 font-black text-emerald-700">{monthTotals.paidDays}일</div>
            <div className="erp-text-caption mt-1 text-emerald-600">미수 없음</div>
          </div>
          <div className="erp-summary-card erp-summary-card--compact rounded-2xl border border-red-200 bg-red-50/60 p-3 shadow-sm">
            <div className="erp-text-caption font-semibold text-red-700">미수 일자</div>
            <div className="erp-text-stat mt-1 font-black text-red-700">{monthTotals.unpaidDays}일</div>
            <div className="erp-text-caption mt-1 text-red-600">미수금 포함</div>
          </div>
          {selectedTotals.days > 0 ? (
            <div className="erp-summary-card erp-summary-card--compact erp-client-calendar-selected-card rounded-2xl border border-sky-300 bg-sky-50 p-3 shadow-sm">
              <div className="erp-text-caption font-semibold text-sky-700">선택 매출 합계</div>
              <div className="erp-text-stat mt-1 font-black text-sky-800">{formatKRW(selectedTotals.amount)}</div>
              <div className="erp-text-caption mt-1 text-sky-600">
                {selectedTotals.days}일 · {selectedTotals.count}건
              </div>
            </div>
          ) : (
            <div className="erp-summary-card erp-summary-card--compact rounded-2xl border border-sky-200 bg-sky-50/60 p-3 shadow-sm">
              <div className="erp-text-caption font-semibold text-sky-700">선택 일자</div>
              <div className="erp-text-stat mt-1 font-black text-sky-700">0일</div>
              <div className="erp-text-caption mt-1 text-sky-600">날짜를 눌러 선택</div>
            </div>
          )}
        </div>
      ) : null}

      <div ref={calendarRef}>
      <Card className="erp-calendar-card rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-5">
          <div className="erp-calendar-toolbar">
            <div className="erp-calendar-toolbar-main">
              <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftMonth(-1)} aria-label="이전 달">
                <ChevronLeft size={18} />
              </button>
              <div className="erp-calendar-month-label">
                <CalendarDays size={18} className="text-sky-600" />
                <h2>{monthLabel}</h2>
              </div>
              <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftMonth(1)} aria-label="다음 달">
                <ChevronRight size={18} />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="erp-calendar-today-btn rounded-xl"
              onClick={() => {
                const nextKey = todayISO().slice(0, 7);
                setMonthKey(nextKey);
                onEmbeddedMonthKeyChange?.(nextKey);
              }}
            >
              이번 달
            </Button>
          </div>

          <div className={`erp-client-calendar-client-title${client ? "" : " is-empty"}`}>
            {client || "거래처를 선택해 주세요"}
          </div>

          {client && selectedDates.length > 0 ? (
            <div className="erp-client-calendar-selected-bar" aria-label={`선택된 날짜 ${selectedDates.length}일`}>
              <span className="erp-client-calendar-selected-bar-label">선택 {selectedDates.length}일</span>
              <div className="erp-client-calendar-selected-chips">
                {selectedDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="erp-client-calendar-selected-chip"
                    onClick={() => toggleDate(date)}
                    title={`${date} 선택 해제`}
                  >
                    {formatSelectedDateLabel(date)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="erp-calendar-weekdays">
            {weekdayLabels.map((item) => (
              <div key={item.label} className={`erp-calendar-weekday is-${item.tone}`}>
                {item.label}
              </div>
            ))}
          </div>

          <div className="erp-calendar-grid">
            {cells.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="erp-calendar-cell is-placeholder" aria-hidden="true" />;
              }

              const weekday = new Date(`${cell.date}T12:00:00`).getDay();
              const isToday = cell.date === todayDate;
              const hasData = client && cell.stats.count > 0;
              const isChecked = selectedDates.includes(cell.date);
              const weekendTone = weekday === 0 ? "sun" : weekday === 6 ? "sat" : "default";
              const paymentTone = hasData ? (cell.stats.hasUnpaid ? "unpaid" : "paid") : "";
              const voucherSummary = cell.stats.vouchers
                .map((voucher) => `${voucher.site} ${formatKRW(voucher.amount)}`)
                .join(" · ");

              const cellClassName = [
                "erp-calendar-cell",
                "erp-client-calendar-cell",
                `is-${weekendTone}`,
                hasData ? "has-data is-selectable" : "is-empty",
                isToday ? "is-today" : "",
                paymentTone ? `is-${paymentTone}` : "",
                isChecked ? "is-checked" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const cellBody = (
                <>
                  <div className="erp-calendar-cell-head">
                    <span className="erp-calendar-day">{cell.day}</span>
                    <div className="erp-client-calendar-cell-head-meta">
                      {isChecked ? (
                        <span className="erp-client-calendar-selected-badge" aria-hidden="true">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : null}
                      {hasData ? <span className="erp-calendar-badge">{cell.stats.count}건</span> : null}
                    </div>
                  </div>
                  {hasData ? (
                    <ul className="erp-client-calendar-vouchers">
                      {cell.stats.vouchers.map((voucher, voucherIndex) => (
                        <li
                          key={`${cell.date}-${voucherIndex}`}
                          className={`erp-client-calendar-voucher ${voucher.hasUnpaid ? "is-unpaid" : "is-paid"}`}
                        >
                          <span className="erp-client-calendar-voucher-site">{voucher.site}</span>
                          <span className="erp-client-calendar-voucher-amount">{formatKRW(voucher.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              );

              if (hasData) {
                return (
                  <button
                    key={cell.date}
                    type="button"
                    className={cellClassName}
                    onClick={() => toggleDate(cell.date)}
                    onMouseEnter={(event) => showDayPreview(cell.date, cell.stats, event)}
                    onMouseLeave={hideDayPreview}
                    onFocus={(event) => showDayPreview(cell.date, cell.stats, event)}
                    onBlur={hideDayPreview}
                    aria-pressed={isChecked}
                    aria-label={`${cell.date} ${isChecked ? "선택됨" : "선택"} · ${voucherSummary}`}
                  >
                    {cellBody}
                  </button>
                );
              }

              return (
                <div
                  key={cell.date}
                  className={cellClassName}
                  title={cell.date}
                >
                  {cellBody}
                </div>
              );
            })}
          </div>

          {client ? (
            <div className="erp-calendar-legend">
              <span className="erp-calendar-legend-item">
                <i className="erp-client-calendar-legend-dot is-unpaid" /> 미수금
              </span>
              <span className="erp-calendar-legend-item">
                <i className="erp-client-calendar-legend-dot is-paid" /> 완납
              </span>
              <span className="erp-calendar-legend-item">
                <i className="erp-client-calendar-legend-dot is-checked" /> 선택 (날짜 클릭)
              </span>
              <span className="erp-calendar-legend-item">
                <i className="erp-calendar-legend-dot is-today" /> 오늘
              </span>
            </div>
          ) : (
            <p className="erp-text-caption mt-3 text-center text-slate-500">거래처를 선택하면 일별 매출·현장명이 표시됩니다. 거래가 있는 날짜를 눌러 선택할 수 있습니다.</p>
          )}

          {notice ? <p className="erp-text-body mt-3 font-semibold text-sky-700">{notice}</p> : null}

          <div className="erp-client-calendar-bottom-actions">
            <div className="erp-text-caption text-slate-500">
              {client
                ? selectedDates.length
                  ? `${selectedDates.length}일 선택됨`
                  : "거래가 있는 날짜를 선택해 주세요."
                : "거래처를 선택해 주세요."}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={selectAllMonthDates}
                disabled={!client || !monthTransactionDates.length}
              >
                {allMonthDatesSelected ? "전체해제" : "전체선택"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-xl"
                onClick={handleExportStatement}
                disabled={!client || !selectedDates.length}
              >
                <FileText size={16} className="mr-1.5" />
                시공비내역서 생성
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-xl"
                onClick={openPaymentConfirm}
                disabled={!client || !selectedDates.length}
              >
                <CreditCard size={16} className="mr-1.5" />
                입금처리
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                onClick={openPaymentCancelConfirm}
                disabled={!client || !selectedDates.length}
              >
                <Undo2 size={16} className="mr-1.5" />
                입금취소
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
      <ClientCalendarDayTooltip
        preview={hoverDayPreview}
        clientName={client}
        onOpenVoucherEdit={onOpenVoucherEdit}
        onMouseEnter={keepDayPreview}
        onMouseLeave={hideDayPreview}
      />
    </div>
  );
}
