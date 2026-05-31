import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  formatKRW,
  formatLedgerCalendarDayLabel,
  buildLedgerCalendarDays,
  summarizeLedgerCalendarMonth,
  getLedgerCategoryColorStyle,
  LEDGER_CALENDAR_WEEKDAYS,
  type LedgerCalendarEntry,
  type LedgerCalendarDayStats,
} from "@/utils/ledgerCalendar";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import { shiftMonthKey, todayISO } from "@/utils/companyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";

const L = {
  tabTitle: "\uAC00\uACC4\uBD80 \uCE98\uB9B0\uB354",
  tabDesc: "\uB0A0\uC9DC\uBCC4 \uBCC0\uB3D9 \uC9C0\uCD9C\uACFC \uACE0\uC815\uBE44\uB97C \uCE98\uB9B0\uB354\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694.",
  thisMonthBtn: "\uC774\uBC88 \uB2EC",
  variableExpense: "\uBCC0\uB3D9 \uC9C0\uCD9C",
  fixedExpense: "\uACE0\uC815\uBE44",
  grandTotal: "\uCD1D \uD569\uACC4",
  unpaidFixedExpense: "\uBBF8\uC9C0\uCD9C \uACE0\uC815\uBE44",
  dayDetail: "\uC77C\uC790 \uC0C1\uC138",
  emptyDay: "\uC774 \uB0A0\uC9D0 \uB4F1\uB85D\uB41C \uC9C0\uCD9C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  busiestDay: "\uC774\uBC88 \uB2EC \uCD5C\uB2E4 \uC9C0\uCD9C\uC77C",
  category: "\uCE74\uD14C\uACE0\uB9AC",
  description: "\uB0B4\uC6A9",
  amount: "\uAE08\uC561",
  section: "\uAD6C\uBD84",
  won: "\uC6D0",
  count: "\uAC74",
  bankLinked: "\uD1B5\uC7A5 \uC5F0\uB3D9",
  unpaidBadge: "\uBBF8\uC9C0\uCD9C",
  paidFixedBadge: "\uC9C0\uCD9C\uC644\uB8CC",
  legendCategory: "\uCE74\uD14C\uACE0\uB9AC \uC0C9\uC0C1",
  legendFixedUnpaid: "\uBBF8\uC9C0\uCD9C \uACE0\uC815\uBE44",
  legendFixedPaid: "\uC9C0\uCD9C \uACE0\uC815\uBE44",
  close: "\uB2EB\uAE30",
  prevDay: "\uC774\uC804 \uB0A0\uC9DC",
  nextDay: "\uB2E4\uC74C \uB0A0\uC9DC",
  prevMonth: "\uC774\uC804 \uB2EC",
  nextMonth: "\uB2E4\uC74C \uB2EC",
  daySummary: "\uC77C\uC790 \uC694\uC57D",
  dayUnit: "\uC77C",
  noExpense: "\uC9C0\uCD9C \uC5C6\uC74C",
  separator: "\u00B7",
  edit: "\uC218\uC815",
  editHint: "\uD074\uB9AD\uD558\uC5EC \uC218\uC815",
};

type CompanyLedgerCalendarProps = {
  companyExpenses?: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  bankTransactions?: BankTransaction[];
  onEditEntry?: (entry: LedgerCalendarEntry) => void;
};

function SummaryCard({
  label,
  value,
  tone = "text-slate-900",
  sub,
  compact = false,
}: {
  label: string;
  value: string;
  tone?: string;
  sub?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="erp-ledger-summary-tile">
        <div className="erp-ledger-summary-tile-label">{label}</div>
        <div className={`erp-ledger-summary-tile-value ${tone}`}>{value}</div>
        {sub ? <div className="erp-ledger-summary-tile-sub">{sub}</div> : null}
      </div>
    );
  }
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="erp-text-caption font-bold text-slate-500">{label}</div>
        <div className={`erp-text-stat mt-1 font-black ${tone}`}>{value}</div>
        {sub ? <div className="erp-text-caption mt-1 text-slate-400">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function KindBadge({ kind }: { kind: LedgerCalendarEntry["kind"] }) {
  return (
    <span className={`erp-ledger-kind-badge kind-${kind}`}>
      {kind === "variable" ? L.variableExpense : L.fixedExpense}
    </span>
  );
}

function EntryBadges({ entry }: { entry: LedgerCalendarEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <KindBadge kind={entry.kind} />
      {entry.kind === "fixed" && !entry.bankLinked ? (
        <span className="erp-ledger-unpaid-badge">{L.unpaidBadge}</span>
      ) : null}
      {entry.kind === "fixed" && entry.bankLinked ? (
        <span className="erp-ledger-paid-badge">{L.paidFixedBadge}</span>
      ) : null}
      {entry.bankLinked ? <span className="erp-ledger-bank-source-badge">{L.bankLinked}</span> : null}
    </div>
  );
}

function getEntryRowClass(entry: LedgerCalendarEntry) {
  const base = ["erp-ledger-calendar-entry", "is-category"];
  if (entry.kind === "fixed" && !entry.bankLinked) base.push("is-fixed-unpaid");
  return base.join(" ");
}

function getSideItemClass(entry: LedgerCalendarEntry, editable: boolean) {
  const base = ["erp-ledger-calendar-side-item", "is-category"];
  if (editable) base.push("is-editable");
  if (entry.kind === "fixed" && !entry.bankLinked) base.push("is-fixed-unpaid");
  return base.join(" ");
}

function getCellTone(stats: {
  variableTotal: number;
  fixedTotal: number;
  unpaidFixedTotal: number;
  unpaidFixedCount: number;
  paidFixedCount: number;
  count: number;
}) {
  if (stats.count <= 0) return "";
  if (stats.variableTotal > 0) {
    if (stats.unpaidFixedCount > 0 && stats.paidFixedCount > 0) return "is-mixed-fixed";
    if (stats.unpaidFixedCount > 0) return "is-has-unpaid-fixed";
    if (stats.paidFixedCount > 0) return "is-has-paid-fixed";
    return "is-variable";
  }
  if (stats.unpaidFixedCount > 0 && stats.paidFixedCount > 0) return "is-mixed-fixed";
  if (stats.unpaidFixedCount > 0) return "is-unpaid-only";
  if (stats.paidFixedCount > 0) return "is-paid-only";
  return "";
}

function LedgerDaySidePanel({
  selectedDate,
  selectedDayStats,
  onClose,
  onShiftDate,
  onEditEntry,
}: {
  selectedDate: string;
  selectedDayStats: LedgerCalendarDayStats | null;
  onClose: () => void;
  onShiftDate: (delta: number) => void;
  onEditEntry?: (entry: LedgerCalendarEntry) => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="erp-ledger-calendar-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="erp-ledger-calendar-drawer erp-calendar-side-panel"
        aria-label={`${selectedDate} ${L.dayDetail}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="erp-calendar-side-panel-head">
          <div className="erp-calendar-side-panel-nav">
            <button type="button" className="erp-calendar-nav-btn" onClick={() => onShiftDate(-1)} aria-label={L.prevDay}>
              <ChevronLeft size={18} />
            </button>
            <strong className="erp-calendar-side-panel-date">
              {formatLedgerCalendarDayLabel(selectedDate)}
              {selectedDayStats && selectedDayStats.grandTotal > 0 ? (
                <span className="erp-ledger-calendar-side-total">
                  {" "}
                  {L.separator} {L.grandTotal} {formatKRW(selectedDayStats.grandTotal)}
                  {L.won}
                </span>
              ) : null}
            </strong>
            <button type="button" className="erp-calendar-nav-btn" onClick={() => onShiftDate(1)} aria-label={L.nextDay}>
              <ChevronRight size={18} />
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onClose}>
            {L.close}
          </Button>
        </div>

        {selectedDayStats ? (
          <div className="erp-calendar-side-stats erp-ledger-calendar-side-stats" aria-label={L.daySummary}>
            <div className="erp-calendar-side-stat is-variable">
              <span className="erp-calendar-side-stat-label">{L.variableExpense}</span>
              <strong>{formatKRW(selectedDayStats.variableTotal)}{L.won}</strong>
            </div>
            <div className="erp-calendar-side-stat is-fixed">
              <span className="erp-calendar-side-stat-label">{L.fixedExpense}</span>
              <strong>{formatKRW(selectedDayStats.fixedTotal)}{L.won}</strong>
            </div>
            <div className="erp-calendar-side-stat is-grand">
              <span className="erp-calendar-side-stat-label">{L.grandTotal}</span>
              <strong>{formatKRW(selectedDayStats.grandTotal)}{L.won}</strong>
            </div>
          </div>
        ) : null}

        <div className="erp-calendar-side-panel-body">
          {!selectedDayStats || selectedDayStats.entries.length === 0 ? (
            <p className="erp-calendar-side-empty">{L.emptyDay}</p>
          ) : (
            <>
              {onEditEntry ? (
                <p className="erp-ledger-calendar-side-edit-hint">{L.editHint}</p>
              ) : null}
              <ul className="erp-calendar-side-list erp-ledger-calendar-side-list">
                {selectedDayStats.entries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={getSideItemClass(entry, Boolean(onEditEntry))}
                      style={getLedgerCategoryColorStyle(entry.category)}
                      onClick={() => {
                        if (!onEditEntry) return;
                        onEditEntry(entry);
                        onClose();
                      }}
                      disabled={!onEditEntry}
                    >
                      <div className="erp-ledger-calendar-side-item-head">
                        <EntryBadges entry={entry} />
                        <strong className="erp-ledger-calendar-side-item-amount">
                          {formatKRW(entry.amount)}
                          {L.won}
                        </strong>
                      </div>
                      <div className="erp-ledger-calendar-side-item-category">{entry.category}</div>
                      <div className="erp-ledger-calendar-side-item-label">{entry.label}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function CompanyLedgerCalendar({
  companyExpenses = [],
  fixedExpensePayments = [],
  fixedExpenses = [],
  bankTransactions = [],
  onEditEntry,
}: CompanyLedgerCalendarProps) {
  const currentMonthKey = todayISO().slice(0, 7);
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [selectedDate, setSelectedDate] = useState("");

  const { cells, monthLabel } = useMemo(
    () =>
      buildLedgerCalendarDays(
        monthKey,
        companyExpenses,
        fixedExpensePayments,
        fixedExpenses,
        bankTransactions,
      ),
    [monthKey, companyExpenses, fixedExpensePayments, fixedExpenses, bankTransactions],
  );

  const monthSummary = useMemo(() => summarizeLedgerCalendarMonth(cells), [cells]);

  const monthCategories = useMemo(() => {
    const categories = new Set<string>();
    cells.forEach((cell) => {
      cell?.stats.entries.forEach((entry) => {
        const category = String(entry.category || "").trim();
        if (category) categories.add(category);
      });
    });
    return Array.from(categories).sort((left, right) => left.localeCompare(right, "ko"));
  }, [cells]);

  const selectedDayStats = useMemo(() => {
    if (!selectedDate) return null;
    const cell = cells.find((row) => row?.date === selectedDate);
    return cell?.stats || null;
  }, [cells, selectedDate]);

  const todayDate = todayISO();

  const shiftMonth = (delta: number) => {
    setMonthKey((prev) => shiftMonthKey(prev, delta));
  };

  const shiftSelectedDate = (delta: number) => {
    if (!selectedDate) return;
    const parsed = new Date(`${selectedDate}T12:00:00`);
    parsed.setDate(parsed.getDate() + delta);
    const nextDate = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    setSelectedDate(nextDate);
    if (!nextDate.startsWith(monthKey)) {
      setMonthKey(nextDate.slice(0, 7));
    }
  };

  return (
    <div className="erp-ledger-calendar">
      <Card className="erp-calendar-card rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="space-y-3 p-3 md:p-4">
          <div className="erp-ledger-calendar-summary-grid">
            <SummaryCard
              compact
              label={L.variableExpense}
              value={`${formatKRW(monthSummary.variableTotal)}${L.won}`}
              tone="text-rose-600"
              sub={`${monthSummary.variableCount}${L.count}`}
            />
            <SummaryCard
              compact
              label={L.fixedExpense}
              value={`${formatKRW(monthSummary.fixedTotal)}${L.won}`}
              tone="text-amber-600"
              sub={`${monthSummary.fixedCount}${L.count}`}
            />
            <SummaryCard
              compact
              label={L.unpaidFixedExpense}
              value={`${formatKRW(monthSummary.unpaidFixedTotal)}${L.won}`}
              tone="text-amber-700"
              sub={`\uD1B5\uC7A5 \uBBF8\uC5F0\uB3D9`}
            />
            <SummaryCard
              compact
              label={L.grandTotal}
              value={`${formatKRW(monthSummary.grandTotal)}${L.won}`}
              tone="text-slate-900"
              sub={`${monthSummary.count}${L.count}`}
            />
          </div>

          <div className="erp-calendar-toolbar erp-ledger-calendar-toolbar">
              <div className="erp-calendar-toolbar-main">
                <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftMonth(-1)} aria-label={L.prevMonth}>
                  <ChevronLeft size={18} />
                </button>
                <div className="erp-calendar-month-label">
                  <CalendarDays size={18} className="text-amber-600" />
                  <h2>{monthLabel}</h2>
                </div>
                <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftMonth(1)} aria-label={L.nextMonth}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <Button variant="outline" size="sm" className="erp-calendar-today-btn rounded-xl" onClick={() => setMonthKey(currentMonthKey)}>
                {L.thisMonthBtn}
              </Button>
            </div>

            {monthSummary.busiestDay ? (
              <div className="erp-calendar-highlight">
                <span className="erp-calendar-highlight-label">{L.busiestDay}</span>
                <strong>{monthSummary.busiestDay}{L.dayUnit}</strong>
                <span className="erp-calendar-highlight-meta">
                  {formatKRW(monthSummary.busiestAmount)}
                  {L.won}
                </span>
              </div>
            ) : null}

            {monthCategories.length > 0 ? (
              <div className="erp-ledger-calendar-legend" aria-label={L.legendCategory}>
                {monthCategories.map((category) => (
                  <span
                    key={category}
                    className="erp-ledger-calendar-legend-item is-category"
                    style={getLedgerCategoryColorStyle(category)}
                  >
                    {category}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="erp-calendar-weekdays">
              {LEDGER_CALENDAR_WEEKDAYS.map((item) => (
                <div key={item.label} className={`erp-calendar-weekday is-${item.tone}`}>
                  {item.label}
                </div>
              ))}
            </div>

            <div className="erp-calendar-grid erp-ledger-calendar-grid">
              {cells.map((cell, index) => {
                if (!cell) {
                  return <div key={`empty-${index}`} className="erp-calendar-cell is-placeholder" aria-hidden="true" />;
                }

                const weekday = new Date(`${cell.date}T12:00:00`).getDay();
                const isToday = cell.date === todayDate;
                const hasData = cell.stats.count > 0;
                const weekendTone = weekday === 0 ? "sun" : weekday === 6 ? "sat" : "default";
                const isSelected = selectedDate === cell.date;
                const tone = getCellTone(cell.stats);

                return (
                  <button
                    key={cell.date}
                    type="button"
                    className={[
                      "erp-calendar-cell",
                      "erp-ledger-calendar-cell",
                      `is-${weekendTone}`,
                      hasData ? "has-data" : "is-empty",
                      isToday ? "is-today" : "",
                      tone ? tone : "",
                      isSelected ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelectedDate(cell.date)}
                    aria-pressed={isSelected}
                    aria-label={
                      hasData
                        ? `${cell.day}${L.dayUnit} ${formatKRW(cell.stats.grandTotal)}${L.won}`
                        : `${cell.day}${L.dayUnit} ${L.noExpense}`
                    }
                  >
                    <div className="erp-calendar-cell-head">
                      <div className="erp-calendar-cell-head-start">
                        <span className="erp-calendar-day">{cell.day}</span>
                        {hasData ? (
                          <span className="erp-ledger-calendar-cell-total" title={L.grandTotal}>
                            {formatKRW(cell.stats.grandTotal)}
                          </span>
                        ) : null}
                      </div>
                      {hasData ? (
                        <div className="erp-calendar-cell-badges">
                          {cell.stats.variableCount > 0 ? (
                            <span className="erp-ledger-calendar-badge is-variable">{cell.stats.variableCount}</span>
                          ) : null}
                          {cell.stats.unpaidFixedCount > 0 ? (
                            <span className="erp-ledger-calendar-badge is-fixed-unpaid" title={L.legendFixedUnpaid}>
                              {cell.stats.unpaidFixedCount}
                            </span>
                          ) : null}
                          {cell.stats.paidFixedCount > 0 ? (
                            <span className="erp-ledger-calendar-badge is-fixed-paid" title={L.legendFixedPaid}>
                              {cell.stats.paidFixedCount}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {hasData ? (
                      <ul className="erp-ledger-calendar-entry-list" aria-label={`${cell.date} ${L.dayDetail}`}>
                        {cell.stats.entries.map((entry) => (
                          <li
                            key={entry.id}
                            className={getEntryRowClass(entry)}
                            style={getLedgerCategoryColorStyle(entry.category)}
                            title={entry.label}
                          >
                            <span className="erp-ledger-calendar-entry-category">{entry.category}</span>
                            <span className="erp-ledger-calendar-entry-amount">{formatKRW(entry.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

      {selectedDate ? (
        <LedgerDaySidePanel
          selectedDate={selectedDate}
          selectedDayStats={selectedDayStats}
          onClose={() => setSelectedDate("")}
          onShiftDate={shiftSelectedDate}
          onEditEntry={onEditEntry}
        />
      ) : null}
    </div>
  );
}
