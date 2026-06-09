import React, { memo, useEffect, useMemo, useState } from "react";
import { CalendarDays, RotateCcw, Search } from "lucide-react";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import type { LedgerFlow } from "@/utils/ledgerSystem";
import {
  formatBankPeriodRangeLabel,
  resolveBankTransactionPeriod,
  type BankTransactionPeriodKey,
} from "@/utils/bankTransactionPagePeriod";

const PERIOD_TABS: Array<{ key: BankTransactionPeriodKey; label: string }> = [
  { key: "today", label: "\uC77C" },
  { key: "thisWeek", label: "\uC8FC" },
  { key: "thisMonth", label: "\uC6D4" },
  { key: "thisQuarter", label: "\uBD84\uAE30" },
  { key: "thisYear", label: "\uC5F0" },
  { key: "all", label: "\uC804\uCCB4" },
];

const FLOW_TABS: Array<{ key: LedgerFlow | "all"; label: string }> = [
  { key: "all", label: "\uC804\uCCB4" },
  { key: "income", label: "\uC785\uAE08" },
  { key: "expense", label: "\uCD9C\uAE08" },
];

export type LedgerFixedExpenseFilter = "all" | "fixed" | "variable";

const FIXED_EXPENSE_TABS: Array<{ key: LedgerFixedExpenseFilter; label: string }> = [
  { key: "all", label: "\uC804\uCCB4" },
  { key: "fixed", label: "\uACE0\uC815\uBE44" },
  { key: "variable", label: "\uC77C\uBC18 \uCD9C\uAE08" },
];

export type LedgerViewerAppliedFilters = {
  periodKey: BankTransactionPeriodKey;
  startDate: string;
  endDate: string;
  flowFilter: LedgerFlow | "all";
  fixedExpenseFilter: LedgerFixedExpenseFilter;
  accountFilter: string;
  searchQuery: string;
};

export const DEFAULT_LEDGER_VIEWER_FILTERS: LedgerViewerAppliedFilters = {
  periodKey: "thisMonth",
  startDate: "",
  endDate: "",
  flowFilter: "all",
  fixedExpenseFilter: "all",
  accountFilter: "",
  searchQuery: "",
};

function normalizeCustomRange(startDate: string, endDate: string) {
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  if (start && end && start > end) {
    return { startDate: end, endDate: start };
  }
  return { startDate: start, endDate: end };
}

function isValidISODate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="erp-bank-wehago-filter-select">
      <span className="erp-bank-wehago-filter-select__label">{label}</span>
      <select className="erp-bank-wehago-filter-select__control" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function LedgerViewerFilterBarComponent({
  applied,
  onApply,
  onApplySearch,
  accountSubjects,
  fixedCounts,
  filterResetKey,
  onReset,
}: {
  applied: LedgerViewerAppliedFilters;
  onApply: (filters: LedgerViewerAppliedFilters) => void;
  onApplySearch: (searchQuery: string) => void;
  accountSubjects: Array<{ code: string; name: string }>;
  fixedCounts: Partial<Record<Exclude<LedgerFixedExpenseFilter, "all">, number>>;
  filterResetKey: number;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<LedgerViewerAppliedFilters>(applied);

  useEffect(() => {
    setDraft(applied);
  }, [
    applied.periodKey,
    applied.startDate,
    applied.endDate,
    applied.flowFilter,
    applied.fixedExpenseFilter,
    applied.accountFilter,
    applied.searchQuery,
    filterResetKey,
  ]);

  const draftPeriodRange = useMemo(
    () =>
      resolveBankTransactionPeriod(draft.periodKey, {
        startDate: draft.startDate,
        endDate: draft.endDate,
      }),
    [draft.periodKey, draft.startDate, draft.endDate],
  );

  const hasPendingFilters = draft.accountFilter !== applied.accountFilter;

  const hasPendingSearch = draft.searchQuery.trim() !== applied.searchQuery;

  const applySearch = () => {
    onApplySearch(draft.searchQuery.trim());
  };

  const applyFilters = () => {
    onApply({
      ...draft,
      searchQuery: draft.searchQuery.trim(),
    });
  };

  const applyDraftNow = (patch: Partial<LedgerViewerAppliedFilters>) => {
    const next: LedgerViewerAppliedFilters = {
      ...draft,
      ...patch,
      searchQuery: draft.searchQuery.trim(),
    };
    if (patch.periodKey && patch.periodKey !== "custom") {
      next.startDate = "";
      next.endDate = "";
    }
    setDraft(next);
    onApply(next);
  };

  const applyCustomPeriod = (patch: Partial<Pick<LedgerViewerAppliedFilters, "startDate" | "endDate">>) => {
    const normalized = normalizeCustomRange(
      patch.startDate ?? draft.startDate,
      patch.endDate ?? draft.endDate,
    );
    const next: LedgerViewerAppliedFilters = {
      ...draft,
      periodKey: "custom",
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      searchQuery: draft.searchQuery.trim(),
    };
    setDraft(next);
    if (isValidISODate(next.startDate) || isValidISODate(next.endDate)) {
      onApply(next);
    }
  };

  return (
    <div className="erp-bank-wehago-toolbar mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="erp-bank-wehago-toolbar__head">
        <div className="erp-bank-wehago-toolbar__title-wrap">
          <h2 className="erp-bank-wehago-toolbar__title">{"\uAC00\uACC4\uBD80 \uB0B4\uC5ED"}</h2>
          <div className="erp-dashboard-period-tabs erp-bank-wehago-period-tabs">
            {PERIOD_TABS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`erp-bank-wehago-period-tab ${draft.periodKey === option.key ? "is-active" : ""}`}
                onClick={() => applyDraftNow({ periodKey: option.key })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="erp-bank-wehago-toolbar__range">
          <CalendarDays size={16} className="text-slate-400" aria-hidden="true" />
          <KoreanDateInput
            className="erp-bank-wehago-date-input"
            value={draftPeriodRange.startDate}
            onChange={(event) => {
              applyCustomPeriod({ startDate: event.target.value });
            }}
          />
          <span className="text-slate-400">-</span>
          <KoreanDateInput
            className="erp-bank-wehago-date-input"
            value={draftPeriodRange.endDate}
            onChange={(event) => {
              applyCustomPeriod({ endDate: event.target.value });
            }}
          />
          <span className="erp-bank-wehago-toolbar__range-label">{formatBankPeriodRangeLabel(draftPeriodRange)}</span>
        </div>
      </div>

      <div className="erp-bank-wehago-status-tabs">
        {FIXED_EXPENSE_TABS.map((option) => {
          const count = option.key === "all" ? undefined : fixedCounts[option.key];
          const countLabel = typeof count === "number" && count > 0 ? (count > 99 ? "99+" : String(count)) : "";
          return (
            <button
              key={option.key}
              type="button"
              className={`erp-bank-wehago-status-tab ${draft.fixedExpenseFilter === option.key ? "is-active" : ""}`}
              onClick={() => applyDraftNow({ fixedExpenseFilter: option.key })}
            >
              {option.label}
              {countLabel ? <span className="erp-bank-wehago-status-tab__count">{countLabel}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="erp-bank-wehago-filter-row">
        <div className="erp-bank-wehago-search-wrap">
          <div className="erp-bank-wehago-search">
            <Search size={16} className="erp-bank-wehago-search__icon" aria-hidden="true" />
            <input
              type="text"
              lang="ko"
              className="erp-bank-wehago-search__input"
              value={draft.searchQuery}
              placeholder={"\uC801\uC694, \uACC4\uC815, \uBA54\uBAA8 \uAC80\uC0C9..."}
              onChange={(event) => setDraft((prev) => ({ ...prev, searchQuery: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySearch();
                }
              }}
            />
          </div>
          <button
            type="button"
            className={`erp-bank-wehago-action-btn ${hasPendingSearch ? "is-pending" : ""}`}
            onClick={applySearch}
          >
            {"\uAC80\uC0C9"}
          </button>
        </div>

        <div className="erp-bank-wehago-flow-tabs">
          {FLOW_TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`erp-bank-wehago-flow-tab ${draft.flowFilter === option.key ? "is-active" : ""}`}
              onClick={() => applyDraftNow({ flowFilter: option.key })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <FilterSelect
          label={"\uACC4\uC815"}
          value={draft.accountFilter}
          onChange={(value) => setDraft((prev) => ({ ...prev, accountFilter: value }))}
        >
          <option value="">{"\uC804\uCCB4"}</option>
          {accountSubjects.map((account) => (
            <option key={account.code} value={account.code}>
              {account.code} {account.name}
            </option>
          ))}
        </FilterSelect>

        <button
          type="button"
          className={`erp-bank-wehago-action-btn erp-bank-wehago-action-btn--primary ${hasPendingFilters ? "is-pending" : ""}`}
          onClick={applyFilters}
        >
          {"\uC801\uC6A9"}
        </button>

        <button type="button" className="erp-bank-wehago-reset" onClick={onReset} title={"\uD544\uD130 \uCD08\uAE30\uD654"}>
          <RotateCcw size={14} />
          {"\uCD08\uAE30\uD654"}
        </button>
      </div>

      <p className="erp-bank-wehago-filter-hint">
        {"\uAE30\uAC04\u00B7\uACE0\uC815\uBE44\u00B7\uC785\uCD9C\uAE08\u00B7\uB0A0\uC9DC \uBC94\uC704\uB294 \uC120\uD0DD \uC2DC \uBC14\uB85C \uC801\uC6A9\uB429\uB2C8\uB2E4. \uACC4\uC815 \uD544\uD130\uC640 \uAC80\uC0C9\uC740 \uAC01\uAC01 \uC801\uC6A9 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC8FC\uC138\uC694."}
      </p>
    </div>
  );
}

export const LedgerViewerFilterBar = memo(LedgerViewerFilterBarComponent);

export function matchesLedgerViewerPeriod(rowDate: string, range: { startDate: string; endDate: string }) {
  const date = String(rowDate || "").slice(0, 10);
  if (!date) return false;
  const start = String(range.startDate || "").trim();
  const end = String(range.endDate || "").trim();
  if (!start && !end) return true;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function matchesLedgerFixedExpenseFilter(
  row: { flow: LedgerFlow; fixedExpenseId?: string },
  filter: LedgerFixedExpenseFilter,
) {
  if (filter === "all") return true;
  if (row.flow !== "expense") return filter === "all";
  if (filter === "fixed") return Boolean(row.fixedExpenseId);
  return !row.fixedExpenseId;
}
