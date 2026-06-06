import React, { useEffect, useState } from "react";
import { CashStatusPanel } from "@/components/analysis/CashStatusPanel";
import { ProfitLossPanel } from "@/components/analysis/ProfitLossPanel";
import { CashFlowPanel } from "@/components/analysis/CashFlowPanel";
import { CustomAnalysisPanel } from "@/components/analysis/CustomAnalysisPanel";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { CompanyExpense, FixedExpense, FixedExpensePayment } from "@/utils/companyLedger";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import type { TaxInvoice } from "@/utils/taxInvoices";
import {
  readStoredAnalysisTab,
  storeAnalysisTab,
  type AnalysisHubTab,
} from "@/utils/analysisHub";

const TAB_ITEMS: Array<{ key: AnalysisHubTab; label: string }> = [
  { key: "cashStatus", label: "\uC790\uAE08\uD604\uD669" },
  { key: "profitLoss", label: "\uC190\uC775\uACC4\uC0B0\uC11C" },
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
};

export function AnalysisHubPage({
  isHubActive: _isHubActive,
  bankTransactions,
  companyExpenses,
  fixedExpensePayments,
  fixedExpenses,
  ledgerCategories,
  accountCodes,
  taxInvoices,
}: AnalysisHubPageProps) {
  const [activeTab, setActiveTab] = useState<AnalysisHubTab>(() => readStoredAnalysisTab());
  const [mountedTabs, setMountedTabs] = useState<Record<AnalysisHubTab, boolean>>(() => ({
    cashStatus: readStoredAnalysisTab() === "cashStatus",
    profitLoss: readStoredAnalysisTab() === "profitLoss",
    cashFlow: readStoredAnalysisTab() === "cashFlow",
    custom: readStoredAnalysisTab() === "custom",
  }));

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

      {mountedTabs.cashStatus ? (
        <div className={activeTab === "cashStatus" ? "" : "hidden"} aria-hidden={activeTab !== "cashStatus"}>
          <CashStatusPanel {...panelProps} />
        </div>
      ) : null}

      {mountedTabs.profitLoss ? (
        <div className={activeTab === "profitLoss" ? "" : "hidden"} aria-hidden={activeTab !== "profitLoss"}>
          <ProfitLossPanel {...profitLossProps} />
        </div>
      ) : null}

      {mountedTabs.cashFlow ? (
        <div className={activeTab === "cashFlow" ? "" : "hidden"} aria-hidden={activeTab !== "cashFlow"}>
          <CashFlowPanel {...panelProps} />
        </div>
      ) : null}

      {mountedTabs.custom ? (
        <div className={activeTab === "custom" ? "" : "hidden"} aria-hidden={activeTab !== "custom"}>
          <CustomAnalysisPanel {...panelProps} />
        </div>
      ) : null}
    </div>
  );
}
