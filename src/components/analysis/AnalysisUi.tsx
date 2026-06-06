import React from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { formatKRW, monthRangeForKey, shiftMonthKey, todayISO } from "@/utils/companyLedger";

export type FinancialPeriod = "day" | "week" | "month" | "quarter" | "year";

export const FINANCIAL_PERIOD_LABELS: Record<FinancialPeriod, string> = {
  day: "\uC77C",
  week: "\uC8FC",
  month: "\uC6D4",
  quarter: "\uBD84\uAE30",
  year: "\uC5F0",
};

export function formatFinancialKRW(value: number) {
  if (!value) return "-";
  if (value < 0) return `(${formatKRW(Math.abs(value))})`;
  return formatKRW(value);
}

export function formatFinancialChangePct(value: number | null) {
  if (value === null) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function quarterStartMonth(month: number) {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

export function resolveFinancialPeriodRange(period: FinancialPeriod, anchor = todayISO()) {
  const date = String(anchor || todayISO()).slice(0, 10);
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (period === "day") {
    return { startDate: date, endDate: date };
  }

  if (period === "week") {
    const anchorDate = new Date(`${date}T12:00:00`);
    const weekday = anchorDate.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const monday = new Date(anchorDate);
    monday.setDate(anchorDate.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { startDate: fmt(monday), endDate: fmt(sunday) };
  }

  if (period === "month") {
    const monthKey = `${yearStr}-${monthStr}`;
    return monthRangeForKey(monthKey);
  }

  if (period === "quarter") {
    const startMonth = quarterStartMonth(month);
    const endMonth = startMonth + 2;
    const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const endDay = new Date(year, endMonth, 0).getDate();
    const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    return { startDate, endDate };
  }

  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

export function resolveFinancialMonthKeys(dateFrom: string, dateTo: string, limit = 6) {
  const fromKey = String(dateFrom || "").slice(0, 7);
  const toKey = String(dateTo || "").slice(0, 7);
  if (!fromKey || !toKey) return [];
  const keys: string[] = [];
  let cursor = toKey;
  while (cursor >= fromKey && keys.length < limit) {
    keys.unshift(cursor);
    if (cursor === fromKey) break;
    cursor = shiftMonthKey(cursor, -1);
  }
  return keys.slice(-limit);
}

type FinancialToolbarProps = {
  title: string;
  period: FinancialPeriod;
  onPeriodChange: (period: FinancialPeriod) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  trailing?: React.ReactNode;
};

export function FinancialToolbar({
  title,
  period,
  onPeriodChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  trailing,
}: FinancialToolbarProps) {
  return (
    <div className="erp-financial-toolbar">
      <h2 className="erp-financial-toolbar-title">{title}</h2>
      <div className="erp-financial-period-group" role="group" aria-label={"\uAE30\uAC04 \uB2E8\uC704"}>
        {(Object.keys(FINANCIAL_PERIOD_LABELS) as FinancialPeriod[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`erp-financial-period-btn${period === key ? " is-active" : ""}`}
            onClick={() => onPeriodChange(key)}
          >
            {FINANCIAL_PERIOD_LABELS[key]}
          </button>
        ))}
      </div>
      <div className="erp-financial-date-range">
        <KoreanDateInput value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="erp-input erp-financial-date-input" />
        <span className="erp-financial-date-sep">~</span>
        <KoreanDateInput value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="erp-input erp-financial-date-input" />
      </div>
      {trailing ? <div className="erp-financial-toolbar-trailing">{trailing}</div> : null}
    </div>
  );
}

type FinancialSummaryItem = {
  label: string;
  value: string;
  changePct?: number | null;
};

export function FinancialSummaryBar({ items }: { items: FinancialSummaryItem[] }) {
  return (
    <div className="erp-financial-summary-bar">
      {items.map((item) => {
        const change = item.changePct ?? null;
        const changeTone =
          change === null ? "" : change >= 0 ? "is-up" : "is-down";
        return (
          <div key={item.label} className="erp-financial-summary-item">
            <div className="erp-financial-summary-item-label">{item.label}</div>
            <div className="erp-financial-summary-item-value">{item.value}</div>
            {change !== null ? (
              <div className={`erp-financial-summary-item-change ${changeTone}`}>
                {change >= 0 ? "\u25B2" : "\u25BC"} {formatFinancialChangePct(change)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type FinancialPanelProps = {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function FinancialPanel({ title, actions, children, className = "" }: FinancialPanelProps) {
  return (
    <section className={`erp-financial-panel ${className}`.trim()}>
      <div className="erp-financial-panel-head">
        <h3 className="erp-financial-panel-title">{title}</h3>
        {actions ? <div className="erp-financial-panel-actions">{actions}</div> : null}
      </div>
      <div className="erp-financial-panel-body">{children}</div>
    </section>
  );
}

export function FinancialTableWrap({ children }: { children: React.ReactNode }) {
  return <div className="erp-financial-table-wrap">{children}</div>;
}

export function FinancialEmpty({ message }: { message: string }) {
  return <div className="erp-financial-empty">{message}</div>;
}

type SegmentOption<T extends string> = { key: T; label: string };

export function FinancialSegmentButtons<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="erp-financial-segment" role="group">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`erp-financial-segment-btn${value === option.key ? " is-active" : ""}`}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type FlowBreakdownRow = {
  label: string;
  count: number;
  amount: number;
  isUncategorized?: boolean;
};

export function FinancialFlowBreakdown({
  incomeTitle,
  expenseTitle,
  incomeRows,
  expenseRows,
}: {
  incomeTitle: string;
  expenseTitle: string;
  incomeRows: FlowBreakdownRow[];
  expenseRows: FlowBreakdownRow[];
}) {
  return (
    <div className="erp-financial-flow-grid">
      <FlowColumn title={incomeTitle} rows={incomeRows} />
      <FlowColumn title={expenseTitle} rows={expenseRows} />
    </div>
  );
}

function FlowColumn({ title, rows }: { title: string; rows: FlowBreakdownRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="erp-financial-flow-col">
      <div className="erp-financial-flow-col-head">
        <span>{title}</span>
        <span>{formatFinancialKRW(total)}</span>
      </div>
      <ul className="erp-financial-flow-list">
        {rows.map((row) => (
          <li
            key={row.label}
            className={`erp-financial-flow-row${row.isUncategorized ? " is-warning" : ""}`}
          >
            <span className="erp-financial-flow-row-label">
              {row.isUncategorized ? <AlertTriangle className="erp-financial-flow-warning-icon" aria-hidden /> : null}
              {row.label} ({row.count})
            </span>
            <span className="erp-financial-flow-row-amount">{formatFinancialKRW(row.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinancialTreeToggle({
  collapsed,
  onToggle,
  label,
  indent = 0,
}: {
  collapsed: boolean;
  onToggle: () => void;
  label: string;
  indent?: 0 | 1 | 2;
}) {
  return (
    <button type="button" className={`erp-financial-tree-toggle erp-financial-indent-${indent}`} onClick={onToggle}>
      {collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      <span>{label}</span>
    </button>
  );
}

export function FinancialCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="erp-financial-checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
