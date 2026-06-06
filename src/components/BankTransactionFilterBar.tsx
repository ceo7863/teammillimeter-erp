import React, { useEffect, useState } from "react";
import { CalendarDays, RotateCcw, Search } from "lucide-react";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import type { BankTransactionFlowFilter } from "@/utils/bankTransactions";
import type { BankTransactionPeriodKey } from "@/utils/bankTransactionPagePeriod";
import { formatBankPeriodRangeLabel } from "@/utils/bankTransactionPagePeriod";
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

type BankTransactionFilterBarProps = {
  periodKey: BankTransactionPeriodKey;
  onPeriodKeyChange: (key: BankTransactionPeriodKey) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  statusTab: BankTxStatusTab;
  onStatusTabChange: (tab: BankTxStatusTab) => void;
  statusCounts: Partial<Record<Exclude<BankTxStatusTab, "all">, number>>;
  flowFilter: BankTransactionFlowFilter;
  onFlowFilterChange: (value: BankTransactionFlowFilter) => void;
  accountFilter: string;
  onAccountFilterChange: (value: string) => void;
  accounts: Array<{ accountNumber: string; bankName?: string }>;
  accountSubjectFilter: string;
  onAccountSubjectFilterChange: (value: string) => void;
  accountSubjects: Array<{ code: string; name: string }>;
  clientFilter: string;
  onClientFilterChange: (value: string) => void;
  clients: Array<{ name?: string }>;
  groupFilter: BankTxGroupFilter;
  onGroupFilterChange: (value: BankTxGroupFilter) => void;
  evidenceFilter: BankTxEvidenceFilter;
  onEvidenceFilterChange: (value: BankTxEvidenceFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
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

export function BankTransactionFilterBar({
  periodKey,
  onPeriodKeyChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  statusTab,
  onStatusTabChange,
  statusCounts,
  flowFilter,
  onFlowFilterChange,
  accountFilter,
  onAccountFilterChange,
  accounts,
  accountSubjectFilter,
  onAccountSubjectFilterChange,
  accountSubjects,
  clientFilter,
  onClientFilterChange,
  clients,
  groupFilter,
  onGroupFilterChange,
  evidenceFilter,
  onEvidenceFilterChange,
  searchQuery,
  onSearchQueryChange,
  filterResetKey,
  onReset,
}: BankTransactionFilterBarProps) {
  const [searchDraft, setSearchDraft] = useState(searchQuery);

  useEffect(() => {
    setSearchDraft(searchQuery);
  }, [searchQuery, filterResetKey]);

  const applySearch = () => onSearchQueryChange(searchDraft.trim());

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
                className={`erp-bank-wehago-period-tab ${periodKey === option.key ? "is-active" : ""}`}
                onClick={() => onPeriodKeyChange(option.key)}
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
            value={startDate}
            onChange={(event) => {
              onPeriodKeyChange("custom");
              onStartDateChange(event.target.value);
            }}
          />
          <span className="text-slate-400">-</span>
          <KoreanDateInput
            className="erp-bank-wehago-date-input"
            value={endDate}
            onChange={(event) => {
              onPeriodKeyChange("custom");
              onEndDateChange(event.target.value);
            }}
          />
          <span className="erp-bank-wehago-toolbar__range-label">
            {formatBankPeriodRangeLabel({ startDate, endDate })}
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
              className={`erp-bank-wehago-status-tab ${statusTab === option.key ? "is-active" : ""}`}
              onClick={() => onStatusTabChange(option.key)}
            >
              {option.label}
              {countLabel ? <span className="erp-bank-wehago-status-tab__count">{countLabel}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="erp-bank-wehago-filter-row">
        <div className="erp-bank-wehago-search">
          <Search size={16} className="erp-bank-wehago-search__icon" aria-hidden="true" />
          <input
            type="text"
            lang="ko"
            className="erp-bank-wehago-search__input"
            value={searchDraft}
            placeholder={"\uBA54\uBAA8, \uAC70\uB798\uCC98, \uAE08\uC561 \uB4F1 \uAC80\uC0C9..."}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applySearch();
              }
            }}
          />
        </div>

        <div className="erp-bank-wehago-flow-tabs">
          {FLOW_TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`erp-bank-wehago-flow-tab ${flowFilter === option.key ? "is-active" : ""}`}
              onClick={() => onFlowFilterChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <FilterSelect label={"\uACC4\uC88C"} value={accountFilter} onChange={onAccountFilterChange}>
          <option value="">{"\uC804\uCCB4"}</option>
          {accounts.map((account) => (
            <option key={account.accountNumber} value={account.accountNumber}>
              {account.bankName ? `${account.bankName} ${account.accountNumber}` : account.accountNumber}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label={"\uACC4\uC815"} value={accountSubjectFilter} onChange={onAccountSubjectFilterChange}>
          <option value="">{"\uC804\uCCB4"}</option>
          {accountSubjects.map((account) => (
            <option key={account.code} value={account.code}>
              {account.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label={"\uAC70\uB798\uCC98"} value={clientFilter} onChange={onClientFilterChange}>
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

        <FilterSelect label={"\uADF8\uB8F9"} value={groupFilter} onChange={(value) => onGroupFilterChange(value as BankTxGroupFilter)}>
          <option value="all">{"\uC804\uCCB4"}</option>
          <option value="unfiled">{"\uBBF8\uBD84\uB958"}</option>
          <option value="client">{"\uAC70\uB798\uCC98"}</option>
          <option value="worker">{"\uC2DC\uACF5\uC790"}</option>
          <option value="card">{"\uCE74\uB4DC\uB9E4\uCD9C"}</option>
        </FilterSelect>

        <FilterSelect label={"\uC99D\uB9F9 \uC790\uB8CC"} value={evidenceFilter} onChange={(value) => onEvidenceFilterChange(value as BankTxEvidenceFilter)}>
          <option value="all">{"\uC804\uCCB4"}</option>
          <option value="linked">{"\uC99D\uB9F9 \uC788\uC74C"}</option>
          <option value="missing">{"\uC99D\uB9F9 \uC5C6\uC74C"}</option>
        </FilterSelect>

        <button type="button" className="erp-bank-wehago-reset" onClick={onReset} title={"\uD544\uD130 \uCD08\uAE30\uD654"}>
          <RotateCcw size={14} />
          {"\uCD08\uAE30\uD654"}
        </button>
      </div>
    </div>
  );
}
