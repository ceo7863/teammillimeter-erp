import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";

const WEEKDAY_LABELS = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"] as const;
const MONTH_LABELS = [
  "1\uC6D4",
  "2\uC6D4",
  "3\uC6D4",
  "4\uC6D4",
  "5\uC6D4",
  "6\uC6D4",
  "7\uC6D4",
  "8\uC6D4",
  "9\uC6D4",
  "10\uC6D4",
  "11\uC6D4",
  "12\uC6D4",
] as const;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toISODate(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseISODate(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function formatDisplay(value: string) {
  const date = parseISODate(value);
  if (!date) return "";
  return `${date.getFullYear()}\uB144 ${date.getMonth() + 1}\uC6D4 ${date.getDate()}\uC77C`;
}

function todayISO() {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth(), now.getDate());
}

type ChangeEventLike = {
  target: { value: string };
  currentTarget: { value: string };
};

type KoreanDateInputProps = {
  value?: string;
  onChange?: (event: ChangeEventLike) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  clearable?: boolean;
  /** 생년월일 등 과거 연도 선택이 필요할 때 연도 이동·선택 UI를 표시합니다. */
  yearNavigation?: boolean;
  minYear?: number;
  maxYear?: number;
  name?: string;
  id?: string;
};

export function KoreanDateInput({
  value = "",
  onChange,
  className = "",
  placeholder = "\uB0A0\uC9DC \uC120\uD0DD",
  disabled = false,
  compact = false,
  clearable = true,
  yearNavigation = false,
  minYear,
  maxYear,
  name,
  id,
}: KoreanDateInputProps) {
  const currentYear = new Date().getFullYear();
  const resolvedMinYear = minYear ?? currentYear - 100;
  const resolvedMaxYear = maxYear ?? currentYear;
  const isCompact = compact || className.includes("erp-input-compact");
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});
  const selectedDate = useMemo(() => parseISODate(value), [value]);
  const [viewYear, setViewYear] = useState(() => selectedDate?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => selectedDate?.getMonth() ?? new Date().getMonth());

  const yearOptions = useMemo(() => {
    const min = Math.min(resolvedMinYear, resolvedMaxYear);
    const max = Math.max(resolvedMinYear, resolvedMaxYear);
    const years: number[] = [];
    for (let year = max; year >= min; year -= 1) years.push(year);
    return years;
  }, [resolvedMinYear, resolvedMaxYear]);

  const updatePickerPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 16);
    let left = Math.max(8, rect.left);
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = rect.bottom + 6;
    const estimatedHeight = yearNavigation ? 360 : 320;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 6);
    }
    setPickerStyle({ position: "fixed", top, left, width, zIndex: 9999 });
  }, [yearNavigation]);

  useEffect(() => {
    if (!open) return;
    setViewYear(selectedDate?.getFullYear() ?? new Date().getFullYear());
    setViewMonth(selectedDate?.getMonth() ?? new Date().getMonth());
  }, [open, selectedDate]);

  useEffect(() => {
    if (!open) return;
    updatePickerPosition();
    window.addEventListener("resize", updatePickerPosition);
    window.addEventListener("scroll", updatePickerPosition, true);
    return () => {
      window.removeEventListener("resize", updatePickerPosition);
      window.removeEventListener("scroll", updatePickerPosition, true);
    };
  }, [open, updatePickerPosition, viewYear, viewMonth]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || pickerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const emitChange = (nextValue: string) => {
    onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } });
  };

  const moveMonth = (offset: number) => {
    const anchor = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
  };

  const moveYear = (offset: number) => {
    setViewYear((prev) => Math.min(resolvedMaxYear, Math.max(resolvedMinYear, prev + offset)));
  };

  const handleYearSelect = (nextYear: number) => {
    setViewYear(Math.min(resolvedMaxYear, Math.max(resolvedMinYear, nextYear)));
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const today = todayISO();

  const cells: Array<{ key: string; day?: number; iso?: string }> = [];
  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `blank-${index}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toISODate(viewYear, viewMonth, day);
    cells.push({ key: iso, day, iso });
  }

  const selectDate = (iso: string) => {
    emitChange(iso);
    setOpen(false);
  };

  const picker = open ? (
    <div
      ref={pickerRef}
      className={`erp-date-picker erp-date-picker--fixed ${isCompact ? "erp-date-picker--compact-anchor" : ""}`}
      style={pickerStyle}
      role="dialog"
      aria-label={"\uB0A0\uC9DC \uC120\uD0DD"}
    >
      {yearNavigation ? (
        <div className="erp-date-picker-header erp-date-picker-header--year">
          <button
            type="button"
            className="erp-date-picker-nav"
            aria-label={"\uC774\uC804 \uC5F0\uB3C4"}
            disabled={viewYear <= resolvedMinYear}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => moveYear(-1)}
          >
            <ChevronsLeft size={16} />
          </button>
          <select
            className="erp-date-picker-year-select"
            value={viewYear}
            aria-label={"\uC5F0\uB3C4 \uC120\uD0DD"}
            onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) => handleYearSelect(Number(event.target.value))}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
                {"\uB144"}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="erp-date-picker-nav"
            aria-label={"\uB2E4\uC74C \uC5F0\uB3C4"}
            disabled={viewYear >= resolvedMaxYear}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => moveYear(1)}
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      ) : null}

      <div className="erp-date-picker-header">
        <button
          type="button"
          className="erp-date-picker-nav"
          aria-label={"\uC774\uC804 \uB2EC"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => moveMonth(-1)}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="erp-date-picker-title">
          {yearNavigation ? MONTH_LABELS[viewMonth] : `${viewYear}\uB144 ${MONTH_LABELS[viewMonth]}`}
        </div>
        <button
          type="button"
          className="erp-date-picker-nav"
          aria-label={"\uB2E4\uC74C \uB2EC"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => moveMonth(1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="erp-date-picker-weekdays">
        {WEEKDAY_LABELS.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className={`erp-date-picker-weekday ${index === 0 ? "is-sunday" : index === 6 ? "is-saturday" : ""}`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="erp-date-picker-grid">
        {cells.map((cell) =>
          cell.day && cell.iso ? (
            <button
              key={cell.key}
              type="button"
              className={[
                "erp-date-picker-day",
                value === cell.iso ? "is-selected" : "",
                today === cell.iso ? "is-today" : "",
                new Date(viewYear, viewMonth, cell.day).getDay() === 0 ? "is-sunday" : "",
                new Date(viewYear, viewMonth, cell.day).getDay() === 6 ? "is-saturday" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectDate(cell.iso!);
              }}
            >
              {cell.day}
            </button>
          ) : (
            <span key={cell.key} className="erp-date-picker-day is-empty" aria-hidden="true" />
          ),
        )}
      </div>

      <div className="erp-date-picker-footer">
        <button
          type="button"
          className="erp-date-picker-today"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectDate(today);
          }}
        >
          {"\uC624\uB298"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`erp-date-input ${isCompact ? "erp-date-input--compact" : ""}`}>
      <input type="hidden" name={name} id={id} value={value} readOnly />
      <button
        ref={triggerRef}
        type="button"
        className={`erp-date-input-trigger erp-input w-full ${className} ${open ? "is-open" : ""}`}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={value ? formatDisplay(value) : undefined}
      >
        <span className={value ? "erp-date-input-value" : "erp-date-input-placeholder"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <span className="erp-date-input-actions">
          {value && !disabled && clearable && !compact ? (
            <span
              role="button"
              tabIndex={-1}
              className="erp-date-input-clear"
              aria-label={"\uB0A0\uC9DC \uC9C0\uC6B0\uAE30"}
              onClick={(event) => {
                event.stopPropagation();
                emitChange("");
              }}
            >
              <X size={14} />
            </span>
          ) : null}
          <CalendarDays size={isCompact ? 14 : 16} className="erp-date-input-icon" />
        </span>
      </button>

      {picker ? createPortal(picker, document.body) : null}
    </div>
  );
}
