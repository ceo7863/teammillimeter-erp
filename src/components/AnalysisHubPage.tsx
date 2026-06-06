import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CashStatusPanel } from "@/components/analysis/CashStatusPanel";
import { ProfitLossPanel } from "@/components/analysis/ProfitLossPanel";
import { CashFlowPanel } from "@/components/analysis/CashFlowPanel";
import { CustomAnalysisPanel } from "@/components/analysis/CustomAnalysisPanel";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { CompanyExpense } from "@/utils/companyLedger";
import type { AccountCode, LedgerCategory } from "@/utils/ledgerSystem";
import {
  readStoredAnalysisTab,
  storeAnalysisTab,
  type AnalysisHubTab,
} from "@/utils/analysisHub";

const TAB_ITEMS: Array<{ key: AnalysisHubTab; label: string }> = [
  { key: "cashStatus", label: "\uC790\uAE08\uD604\uD669" },
  { key: "profitLoss", label: "\uC190\uC775\uACC4\uC0B0\uC11C" },
  { key: "cashFlow", label: "\uD604\uAE08\uD750\uB984\uD45C" },
  { key: "custom", label: "\uB9DE\uCDA4\uBD84\uC11D" },
];

export type AnalysisHubPageProps = {
  isHubActive: boolean;
  bankTransactions: BankTransaction[];
  companyExpenses: CompanyExpense[];
  ledgerCategories: LedgerCategory[];
  accountCodes: AccountCode[];
};

export function AnalysisHubPage({
  isHubActive: _isHubActive,
  bankTransactions,
  companyExpenses,
  ledgerCategories,
  accountCodes,
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
    ledgerCategories,
    accountCodes,
  };

  return (
    <div className="erp-page erp-analysis-hub-page">
      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <h1 className="erp-text-page-title text-slate-900">{"\uBD84\uC11D"}</h1>
            <p className="mt-1 erp-text-body text-slate-600">
              {"\uC790\uAE08 \uD604\uD669, \uC190\uC775, \uD604\uAE08\uD750\uB984\uC744 \uAE30\uAC04\uBCC4\uB85C \uBD84\uC11D\uD569\uB2C8\uB2E4."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`erp-text-body rounded-xl px-4 py-2 font-bold ${activeTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {mountedTabs.cashStatus ? (
        <div className={activeTab === "cashStatus" ? "" : "hidden"} aria-hidden={activeTab !== "cashStatus"}>
          <CashStatusPanel {...panelProps} />
        </div>
      ) : null}

      {mountedTabs.profitLoss ? (
        <div className={activeTab === "profitLoss" ? "" : "hidden"} aria-hidden={activeTab !== "profitLoss"}>
          <ProfitLossPanel {...panelProps} />
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
