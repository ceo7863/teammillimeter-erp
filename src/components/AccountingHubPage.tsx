import React, { useEffect, useState, type ComponentProps } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BankTransactionsPage } from "@/components/BankTransactionsPage";
import { LedgerViewerPage, type LedgerViewerSubTab } from "@/components/LedgerViewerPage";
import { TaxInvoicePage } from "@/components/TaxInvoicePage";
import { LedgerClassificationManagePage } from "@/components/LedgerClassificationManagePage";
import {
  ACCOUNTING_HUB_TABS,
  readStoredAccountingTab,
  storeAccountingTab,
  type AccountingHubTab,
} from "@/utils/accountingHub";

type AccountingHubPageProps = {
  isHubActive: boolean;
  initialTab?: AccountingHubTab;
  bank: Omit<
    ComponentProps<typeof BankTransactionsPage>,
    "isPageActive" | "onNavigateToCompanyLedger" | "onNavigateToClassify" | "onNavigateToFixedExpense"
  >;
  ledger: ComponentProps<typeof LedgerViewerPage>;
  tax: ComponentProps<typeof TaxInvoicePage>;
  classify: ComponentProps<typeof LedgerClassificationManagePage>;
};

function buildInitialMountedTabs(tab: AccountingHubTab): Record<AccountingHubTab, boolean> {
  return {
    bank: tab === "bank",
    ledger: tab === "ledger",
    tax: tab === "tax",
    classify: tab === "classify",
  };
}

export function AccountingHubPage({ isHubActive, initialTab, bank, ledger, tax, classify }: AccountingHubPageProps) {
  const [activeTab, setActiveTab] = useState<AccountingHubTab>(() => initialTab || readStoredAccountingTab());
  const [mountedTabs, setMountedTabs] = useState<Record<AccountingHubTab, boolean>>(() =>
    buildInitialMountedTabs(initialTab || readStoredAccountingTab()),
  );
  const [ledgerSubTab, setLedgerSubTab] = useState<LedgerViewerSubTab | undefined>();

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
    setMountedTabs((prev) => ({ ...prev, [initialTab]: true }));
  }, [initialTab]);

  useEffect(() => {
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
    storeAccountingTab(activeTab);
  }, [activeTab]);

  const switchTab = (tab: AccountingHubTab) => {
    setActiveTab(tab);
  };

  const openLedgerFixedTab = () => {
    setLedgerSubTab("fixed");
    switchTab("ledger");
  };

  return (
    <div className="erp-page erp-accounting-hub-page">
      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <h1 className="erp-text-page-title text-slate-900">{"\uD68C\uACC4\u00B7\uD1B5\uC7A5"}</h1>
            <p className="mt-1 erp-text-body text-slate-600">
              {"\uD1B5\uC7A5 \uAC70\uB798\uC5D0\uC11C \uBD84\uB958\uD558\uACE0, \uAC00\uACC4\uBD80 \uC870\uD68C\uC5D0\uC11C \uD655\uC815 \uB0B4\uC5ED\uACFC \uACE0\uC815\uBE44\uB97C \uAD00\uB9AC\uD569\uB2C8\uB2E4."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
            {ACCOUNTING_HUB_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchTab(tab.key)}
                className={`erp-text-body rounded-xl px-4 py-2 font-bold ${activeTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {mountedTabs.bank ? (
        <div className={activeTab === "bank" ? "" : "hidden"} aria-hidden={activeTab !== "bank"}>
          <BankTransactionsPage
            {...bank}
            isPageActive={isHubActive && activeTab === "bank"}
            onNavigateToCompanyLedger={() => switchTab("ledger")}
            onNavigateToClassify={() => switchTab("classify")}
            onNavigateToFixedExpense={openLedgerFixedTab}
            onNavigateToTaxInvoice={() => switchTab("tax")}
          />
        </div>
      ) : null}

      {mountedTabs.ledger ? (
        <div className={activeTab === "ledger" ? "" : "hidden"} aria-hidden={activeTab !== "ledger"}>
          <LedgerViewerPage
            {...ledger}
            initialSubTab={ledgerSubTab}
            onSubTabConsumed={() => setLedgerSubTab(undefined)}
            onOpenBankTab={() => switchTab("bank")}
          />
        </div>
      ) : null}

      {mountedTabs.tax ? (
        <div className={activeTab === "tax" ? "" : "hidden"} aria-hidden={activeTab !== "tax"}>
          <TaxInvoicePage {...tax} />
        </div>
      ) : null}

      {mountedTabs.classify ? (
        <div className={activeTab === "classify" ? "" : "hidden"} aria-hidden={activeTab !== "classify"}>
          <LedgerClassificationManagePage {...classify} />
        </div>
      ) : null}
    </div>
  );
}
