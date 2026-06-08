import React, { memo, useEffect, useMemo, useState } from "react";
import { CalendarDays, RotateCcw, Search } from "lucide-react";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import type { BankTransactionFlowFilter } from "@/utils/bankTransactions";
import type { BankTransactionPeriodKey } from "@/utils/bankTransactionPagePeriod";
import {
  formatBankPeriodRangeLabel,
  resolveBankTransactionPeriod,
} from "@/utils/bankTransactionPagePeriod";
import type { BankTxEvidenceFilter, BankTxGroupFilter, BankTxStatusTab } from "@/utils/bankTransactionStatusFilter";

const PERIOD_TABS: Array<{ key: BankTransactionPeriodKey; label: string }> = [
  { key: "today", label: "\uC77C" },
  { key: "thisWeek", label: "\uC8FC" },
  { key: "thisMonth", label: "\uC6D4" },
  { key: "thisQuarter", label: "\uBD84\uAE30" },
  { key: "thisYear", label: "\uC5F0" },
];

const STATUS_TABS: Array<{ key: BankTxStatusTab; label: string; countKey?: Exclude<BankTxStatusTab, "all"> }> = [
  { key: "all", label: "\uC804\uCCB4" },
  { key: "no_account", label: "\uACC4\uC815 \uBBF8\uC9C0", countKey: "no_account" },
  { key: "no_client", label: "\uAC70\uB798\uCC98 \uBBF8\uC9C0", countKey: "no_client" },
  { key: "no_group", label: "\uADF8\uB8F9 \uBBF8\uC9C0", countKey: "no_group" },
  { key: "other_opex", label: "\uAE30\uD0C0 \uC601\uC5C5\uBE44\uC6A9", countKey: "other_opex" },
];

const FLOW_TABS: Array<{ key: BankTransactionFlowFilter; label: string }> = [
  { key: "all", label: "\uC804\uCCB4" },
  { key: "deposit", label: "\uC785\uAE08" },
  { key: "withdrawal", label: "\uCD9C\uAE08" },
];

export type BankTransactionAppliedFilters = {
  periodKey: BankTransactionPeriodKey;
  startDate: string;
  endDate: string;
  statusTab: BankTxStatusTab;
  flowFilter: BankTransactionFlowFilter;
  accountFilter: string;
  accountSubjectFilter: string;
  clientFilter: string;
  groupFilter: BankTxGroupFilter;
  evidenceFilter: BankTxEvidenceFilter;
  searchQuery: string;
};

type BankTransactionFilterBarProps = {
  applied: BankTransactionAppliedFilters;
  onApply: (filters: BankTransactionAppliedFilters) => void;
  onApplySearch: (searchQuery: string) => void;
  statusCounts: Partial<Record<Exclude<BankTxStatusTab, "all">, number>>;
  accounts: Array<{ accountNumber: string; bankName?: string }>;
  accountSubjects: Array<{ code: string; name: string }>;
  clients: Array<{ name?: string }>;
  filterResetKey: number;
  onReset: () => void;
};

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

function BankTransactionFilterBarComponent({
  applied,
  onApply,
  onApplySearch,
  statusCounts,
  accounts,
  accountSubjects,
  clients,
  filterResetKey,
  onReset,
}: BankTransactionFilterBarProps) {
  const [draft, setDraft] = useState<BankTransactionAppliedFilters>(applied);

  useEffect(() => {
    setDraft(applied);
  }, [
    applied.periodKey,
    applied.startDate,
    applied.endDate,
    applied.statusTab,
    applied.flowFilter,
    applied.accountFilter,
    applied.accountSubjectFilter,
    applied.clientFilter,
    applied.groupFilter,
    applied.evidenceFilter,
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

  const hasPendingFilters = useMemo(() => {
    return (
      draft.accountFilter !== applied.accountFilter ||
      draft.accountSubjectFilter !== applied.accountSubjectFilter ||
      draft.clientFilter !== applied.clientFilter ||
      draft.groupFilter !== applied.groupFilter ||
      draft.evidenceFilter !== applied.evidenceFilter
    );
  }, [draft, applied]);

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

  const applyDraftNow = (patch: Partial<BankTransactionAppliedFilters>) => {
    const next: BankTransactionAppliedFilters = {
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

  return (
    <div className="erp-bank-wehago-toolbar mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="erp-bank-wehago-toolbar__head">
        <div className="erp-bank-wehago-toolbar__title-wrap">
          <h2 className="erp-bank-wehago-toolbar__title">{"\uD1B5\uC7A5 \uB0B4\uC5ED"}</h2>
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
              setDraft((prev) => ({
                ...prev,
                periodKey: "custom",
                startDate: event.target.value,
              }));
            }}
          />
          <span className="text-slate-400">-</span>
          <KoreanDateInput
            className="erp-bank-wehago-date-input"
            value={draftPeriodRange.endDate}
            onChange={(event) => {
              setDraft((prev) => ({
                ...prev,
                periodKey: "custom",
                endDate: event.target.value,
              }));
            }}
          />
          <span className="erp-bank-wehago-toolbar__range-label">
            {formatBankPeriodRangeLabel(draftPeriodRange)}
          </span>
        </div>
      </div>

      <div className="erp-bank-wehago-status-tabs">
        {STATUS_TABS.map((option) => {
          const count = option.countKey ? statusCounts[option.countKey] : undefined;
          const countLabel = typeof count === "number" && count > 0 ? (count > 99 ? "99+" : String(count)) : "";
          return (
            <button
              key={option.key}
              type="button"
              className={`erp-bank-wehago-status-tab ${draft.statusTab === option.key ? "is-active" : ""}`}
              onClick={() => applyDraftNow({ statusTab: option.key })}
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
              placeholder={"\uBA54\uBAA8, \uAC70\uB798\uCC98, \uAE08\uC561 \uB4F1 \uAC80\uC0C9..."}
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
          label={"\uACC4\uC88C"}
          value={draft.accountFilter}
          onChange={(value) => setDraft((prev) => ({ ...prev, accountFilter: value }))}
        >
          <option value="">{"\uC804\uCCB4"}</option>
          {accounts.map((account) => (
            <option key={account.accountNumber} value={account.accountNumber}>
              {account.bankName ? `${account.bankName} ${account.accountNumber}` : account.accountNumber}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label={"\uACC4\uC815"}
          value={draft.accountSubjectFilter}
          onChange={(value) => setDraft((prev) => ({ ...prev, accountSubjectFilter: value }))}
        >
          <option value="">{"\uC804\uCCB4"}</option>
          {accountSubjects.map((account) => (
            <option key={account.code} value={account.code}>
              {account.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          label={"\uAC70\uB798\uCC98"}
          value={draft.clientFilter}
          onChange={(value) => setDraft((prev) => ({ ...prev, clientFilter: value }))}
        >
          <option value="">{"\uC804\uCCB4"}</option>
          {clients.map((client) => {
            const name = String(client.name || "").trim();
            if (!name) return null;
            return (
              <option key={name} value={name}>
                {name}
              </option>
            );
          })}
        </FilterSelect>

        <FilterSelect
          label={"\uADF8\uB8F9"}
          value={draft.groupFilter}
          onChange={(value) => setDraft((prev) => ({ ...prev, groupFilter: value as BankTxGroupFilter }))}
        >
          <option value="all">{"\uC804\uCCB4"}</option>
          <option value="unfiled">{"\uBBF8\uBD84\uB958"}</option>
          <option value="client">{"\uAC70\uB798\uCC98"}</option>
          <option value="worker">{"\uC2DC\uACF5\uC790"}</option>
          <option value="card">{"\uCE74\uB4DC\uB9E4\uCD9C"}</option>
        </FilterSelect>

        <FilterSelect
          label={"\uC99D\uB9F9 \uC790\uB8CC"}
          value={draft.evidenceFilter}
          onChange={(value) => setDraft((prev) => ({ ...prev, evidenceFilter: value as BankTxEvidenceFilter }))}
        >
          <option value="all">{"\uC804\uCCB4"}</option>
          <option value="linked">{"\uC99D\uB9F9 \uC788\uC74C"}</option>
          <option value="missing">{"\uC99D\uB9F9 \uC5C6\uC74C"}</option>
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
        {"\uAE30\uAC04\u00B7\uC0C1\uD0DC\u00B7\uC785\uCD9C\uAE08\uC740 \uBC84\uD2BC \uD074\uB9AD \uC2DC \uBC14\uB85C \uC801\uC6A9\uB429\uB2C8\uB2E4. \uACC4\uC88C\u00B7\uAC70\uB798\uCC98 \uB4F1 \uC120\uD0DD \uD544\uD130\uC640 \uAC80\uC0C9\uC740 \uAC01\uAC01 \uC801\uC6A9 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC8FC\uC138\uC694."}
      </p>
    </div>
  );
}

export const BankTransactionFilterBar = memo(BankTransactionFilterBarComponent);
