import React from "react";
import { Clock3 } from "lucide-react";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);

function clampHour(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(23, Math.max(0, Math.trunc(value)));
}

function clampMinute(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(59, Math.max(0, Math.trunc(value)));
}

function formatHour12Label(hour: number) {
  const ampm = hour < 12 ? "\uC624\uC804" : "\uC624\uD6C4";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${ampm} ${h12}\uC2DC`;
}

function formatHourOptionLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}\uC2DC (${formatHour12Label(hour)})`;
}

function formatMinuteLabel(minute: number) {
  return `${String(minute).padStart(2, "0")}\uBD84`;
}

function formatTimeDisplay(hour: number, minute: number) {
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return `${clock} \u00B7 ${formatHour12Label(hour)} ${String(minute).padStart(2, "0")}\uBD84`;
}

type NotifyScheduleTimePickerProps = {
  hour: number;
  minute: number;
  disabled?: boolean;
  onChange: (hour: number, minute: number) => void;
  label?: string;
  frequencyLabel?: string;
  hint?: string;
};

export function NotifyScheduleTimePicker({
  hour,
  minute,
  disabled = false,
  onChange,
  label = "\uBC1C\uC1A1 \uC2DC\uAC01",
  frequencyLabel,
  hint,
}: NotifyScheduleTimePickerProps) {
  const safeHour = clampHour(hour);
  const safeMinute = clampMinute(minute);

  return (
    <div className={`erp-notify-schedule-time${disabled ? " is-disabled" : ""}`}>
      <div className="erp-notify-schedule-time-head">
        <span className="erp-notify-schedule-time-label">
          <Clock3 size={14} aria-hidden="true" />
          {label}
        </span>
        <span className="erp-notify-schedule-time-kst">KST</span>
      </div>

      <div className="erp-notify-schedule-time-body">
        <div className="erp-notify-schedule-time-display" aria-live="polite">
          <span className="erp-notify-schedule-time-display-main">{formatTimeDisplay(safeHour, safeMinute)}</span>
          {frequencyLabel ? (
            <span className="erp-notify-schedule-time-frequency">{frequencyLabel}</span>
          ) : null}
        </div>

        <div className="erp-notify-schedule-time-fields">
          <label className="erp-notify-schedule-time-field">
            <span className="erp-notify-schedule-time-field-label">{"\uC2DC"}</span>
            <select
              className="erp-notify-schedule-time-select erp-notify-schedule-time-select--hour"
              value={safeHour}
              disabled={disabled}
              onChange={(event) => onChange(Number(event.target.value), safeMinute)}
            >
              {HOUR_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {formatHourOptionLabel(value)}
                </option>
              ))}
            </select>
          </label>

          <span className="erp-notify-schedule-time-sep" aria-hidden="true">
            :
          </span>

          <label className="erp-notify-schedule-time-field">
            <span className="erp-notify-schedule-time-field-label">{"\uBD84"}</span>
            <select
              className="erp-notify-schedule-time-select"
              value={safeMinute}
              disabled={disabled}
              onChange={(event) => onChange(safeHour, Number(event.target.value))}
            >
              {MINUTE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {formatMinuteLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {hint ? <p className="erp-notify-schedule-time-hint">{hint}</p> : null}
      {disabled ? (
        <p className="erp-notify-schedule-time-hint is-warning">
          {"\uC54C\uB9BC\uD1A1 \uC0AC\uC6A9\uC744 \uC9C0\uAE08 \uCF1C\uC57C \uBC1C\uC1A1 \uC2DC\uAC01\uC744 \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}
        </p>
      ) : null}
    </div>
  );
}

export const NOTIFY_WEEKDAY_OPTIONS = [
  { value: 0, label: "\uC77C\uC694\uC77C" },
  { value: 1, label: "\uC6D4\uC694\uC77C" },
  { value: 2, label: "\uD654\uC694\uC77C" },
  { value: 3, label: "\uC218\uC694\uC77C" },
  { value: 4, label: "\uBAA9\uC694\uC77C" },
  { value: 5, label: "\uAE08\uC694\uC77C" },
  { value: 6, label: "\uD1A0\uC694\uC77C" },
] as const;

type NotifyWeeklySchedulePickerProps = {
  weekday: number;
  hour: number;
  minute: number;
  disabled?: boolean;
  onWeekdayChange: (weekday: number) => void;
  onTimeChange: (hour: number, minute: number) => void;
  hint?: string;
};

export function NotifyWeeklySchedulePicker({
  weekday,
  hour,
  minute,
  disabled = false,
  onWeekdayChange,
  onTimeChange,
  hint,
}: NotifyWeeklySchedulePickerProps) {
  const safeWeekday = NOTIFY_WEEKDAY_OPTIONS.some((row) => row.value === weekday) ? weekday : 1;
  const dayLabel = NOTIFY_WEEKDAY_OPTIONS.find((row) => row.value === safeWeekday)?.label || "\uC6D4\uC694\uC77C";

  return (
    <div className={`erp-notify-weekly-schedule${disabled ? " is-disabled" : ""}`}>
      <div className="erp-notify-weekly-schedule-row">
        <label className="erp-notify-weekly-schedule-field">
          <span className="erp-notify-schedule-time-label">
            <Clock3 size={14} aria-hidden="true" />
            {"\uBC1C\uC1A1 \uC694\uC77C"}
          </span>
          <select
            className="erp-notify-schedule-time-select erp-notify-weekly-schedule-select"
            value={safeWeekday}
            disabled={disabled}
            onChange={(event) => onWeekdayChange(Number(event.target.value))}
          >
            {NOTIFY_WEEKDAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <NotifyScheduleTimePicker
          hour={hour}
          minute={minute}
          disabled={disabled}
          onChange={onTimeChange}
          label={"\uBC1C\uC1A1 \uC2DC\uAC01"}
          frequencyLabel={`\uB9E4\uC8FC ${dayLabel}`}
          hint={hint}
        />
      </div>
    </div>
  );
}
