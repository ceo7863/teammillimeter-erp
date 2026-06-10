import React, { useEffect, useState } from "react";
import { KeepAlivePanel } from "@/components/PageKeepAlive";
import { AccountOverviewPanel } from "@/components/analysis/AccountOverviewPanel";
import { CashStatusPanel } from "@/components/analysis/CashStatusPanel";
import { ProfitLossPanel } from "@/components/analysis/ProfitLossPanel";
import { CashFlowPanel } from "@/components/analysis/CashFlowPanel";
import { FixedExpenseAnalysisPanel } from "@/components/analysis/FixedExpenseAnalysisPanel";
import { AccountTrendPanel } from "@/components/analysis/AccountTrendPanel";
import { CustomAnalysisPanel } from "@/components/analysis/CustomAnalysisPanel";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import type { TaxInvoice } from "@/utils/taxInvoices";
import {
  consumeAnalysisNavTab,
  readStoredAnalysisTab,
  storeAnalysisTab,
  type AnalysisHubTab,
} from "@/utils/analysisHub";

const TAB_ITEMS: Array<{ key: AnalysisHubTab; label: string }> = [
  { key: "accountSummary", label: "\uACC4\uC815 \uC694\uC57D" },
  { key: "profitLoss", label: "\uC190\uC775\uACC4\uC0B0\uC11C" },
  { key: "fixedExpense", label: "\uACE0\uC815\uBE44" },
  { key: "accountTrend", label: "\uACC4\uC815\uBCC4 \uCD94\uC774" },
  { key: "cashStatus", label: "\uD1B5\uC7A5 \uC790\uAE08" },
  { key: "cashFlow", label: "\uD604\uAE08\uD750\uB984\uD45C" },
  { key: "custom", label: "\uB9DE\uCDA4 \uBD84\uC11D" },
];

export type AnalysisHubPageProps = {
  isHubActive: boolean;
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  fixedExpensePayments?: FixedExpensePayment[];
  fixedExpenses?: FixedExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
  taxInvoices: TaxInvoice[];
  onOpenUnclassifiedInbox?: () => void;
  initialTab?: AnalysisHubTab;
};

function resolveInitialAnalysisTab(initialTab?: AnalysisHubTab): AnalysisHubTab {
  return consumeAnalysisNavTab() || initialTab || readStoredAnalysisTab();
}

function createMountedState(tab: AnalysisHubTab): Record<AnalysisHubTab, boolean> {
  return {
    accountSummary: tab === "accountSummary",
    profitLoss: tab === "profitLoss",
    fixedExpense: tab === "fixedExpense",
    accountTrend: tab === "accountTrend",
    cashStatus: tab === "cashStatus",
    cashFlow: tab === "cashFlow",
    custom: tab === "custom",
  };
}

export function AnalysisHubPage({
  isHubActive: _isHubActive,
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
  taxInvoices,
  onOpenUnclassifiedInbox,
  initialTab,
}: AnalysisHubPageProps) {
  const [activeTab, setActiveTab] = useState<AnalysisHubTab>(() => resolveInitialAnalysisTab(initialTab));
  const [mountedTabs, setMountedTabs] = useState<Record<AnalysisHubTab, boolean>>(() =>
    createMountedState(resolveInitialAnalysisTab(initialTab)),
  );

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
    setMountedTabs((prev) => ({ ...prev, [initialTab]: true }));
  }, [initialTab]);

  useEffect(() => {
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
    storeAnalysisTab(activeTab);
  }, [activeTab]);

  const panelProps = {
    bankTransactions,
    companyExpenses,
    fixedExpensePayments,
    fixedExpenses,
    ledgerCategories,
    accountCodes,
  };

  const profitLossProps = {
    ...panelProps,
    taxInvoices,
  };

  return (
    <div className="erp-page erp-analysis-hub-page">
      <div className="mb-4">
        <h1 className="erp-text-page-title text-slate-900">{"\uBD84\uC11D"}</h1>
        <p className="mt-1 erp-text-body text-slate-600">
          {"\uACC4\uC815\uACFC\uBAA9, \uBD84\uB958\uACC4\uC815, \uACE0\uC815\uBE44 \uAE30\uC900\uC73C\uB85C \uC785\uCD9C\uAE08\uACFC \uC190\uC775\uC744 \uD655\uC778\uD569\uB2C8\uB2E4."}
        </p>
      </div>

      <nav className="erp-financial-subtabs" aria-label={"\uBD84\uC11D \uBA54\uB274"}>
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`erp-financial-subtab${activeTab === tab.key ? " is-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {mountedTabs.accountSummary ? (
        <KeepAlivePanel active={activeTab === "accountSummary"}>
          <AccountOverviewPanel {...panelProps} onOpenUnclassifiedInbox={onOpenUnclassifiedInbox} />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.profitLoss ? (
        <KeepAlivePanel active={activeTab === "profitLoss"}>
          <ProfitLossPanel {...profitLossProps} />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.fixedExpense ? (
        <KeepAlivePanel active={activeTab === "fixedExpense"}>
          <FixedExpenseAnalysisPanel {...panelProps} />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.accountTrend ? (
        <KeepAlivePanel active={activeTab === "accountTrend"}>
          <AccountTrendPanel {...panelProps} />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.cashStatus ? (
        <KeepAlivePanel active={activeTab === "cashStatus"}>
          <CashStatusPanel {...panelProps} />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.cashFlow ? (
        <KeepAlivePanel active={activeTab === "cashFlow"}>
          <CashFlowPanel {...panelProps} />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.custom ? (
        <KeepAlivePanel active={activeTab === "custom"}>
          <CustomAnalysisPanel {...panelProps} />
        </KeepAlivePanel>
      ) : null}
    </div>
  );
}
