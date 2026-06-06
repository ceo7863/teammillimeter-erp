import React, { useEffect, useState } from "react";
import { CalendarDays, RotateCcw, Search } from "lucide-react";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import type { BankTransactionFlowFilter } from "@/utils/bankTransactions";
import type { BankTransactionPeriodKey } from "@/utils/bankTransactionPagePeriod";
import { formatBankPeriodRangeLabel } from "@/utils/bankTransactionPagePeriod";
import type { BankTxEvidenceFilter, BankTxGroupFilter, BankTxStatusTab } from "@/utils/bankTransactionStatusFilter";

const PERIOD_TABS: Array<{ key: BankTransactionPeriodKey; label: string }> = [
  { key: "today", label: "?" },
  { key: "thisWeek", label: "?" },
  { key: "thisMonth", label: "?" },
  { key: "thisQuarter", label: "??" },
  { key: "thisYear", label: "?" },
];

const STATUS_TABS: Array<{ key: BankTxStatusTab; label: string; countKey?: Exclude<BankTxStatusTab, "all"> }> = [
  { key: "all", label: "??" },
  { key: "no_account", label: "?? ??", countKey: "no_account" },
  { key: "no_client", label: "??? ??", countKey: "no_client" },
  { key: "no_group", label: "?? ??", countKey: "no_group" },
  { key: "other_opex", label: "?? ????", countKey: "other_opex" },
];

const FLOW_TABS: Array<{ key: BankTransactionFlowFilter; label: string }> = [
  { key: "all", label: "???" },
  { key: "deposit", label: "??" },
  { key: "withdrawal", label: "??" },
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
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categories: Array<{ id: string; name: string }>;
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
  categoryFilter,
  onCategoryFilterChange,
  categories,
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
          <h2 className="erp-bank-wehago-toolbar__title">?? ??</h2>
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
            placeholder="??, ????, ??, ?? ??..."
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

        <FilterSelect label="??" value={accountFilter} onChange={onAccountFilterChange}>
          <option value="">??</option>
          {accounts.map((account) => (
            <option key={account.accountNumber} value={account.accountNumber}>
              {account.bankName ? `${account.bankName} ${account.accountNumber}` : account.accountNumber}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label="??" value={categoryFilter} onChange={onCategoryFilterChange}>
          <option value="">??</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect label="???" value={clientFilter} onChange={onClientFilterChange}>
          <option value="">??</option>
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

        <FilterSelect label="??" value={groupFilter} onChange={(value) => onGroupFilterChange(value as BankTxGroupFilter)}>
          <option value="all">??</option>
          <option value="unfiled">???</option>
          <option value="client">???</option>
          <option value="worker">???</option>
          <option value="card">????</option>
        </FilterSelect>

        <FilterSelect label="?? ??" value={evidenceFilter} onChange={(value) => onEvidenceFilterChange(value as BankTxEvidenceFilter)}>
          <option value="all">??</option>
          <option value="linked">?? ??</option>
          <option value="missing">?? ??</option>
        </FilterSelect>

        <button type="button" className="erp-bank-wehago-reset" onClick={onReset} title="?? ???">
          <RotateCcw size={14} />
          ???
        </button>
      </div>
    </div>
  );
}
