import React, { useEffect, useState, type ComponentProps } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BankTransactionsPage } from "@/components/BankTransactionsPage";
import { CompanyLedgerPage } from "@/components/CompanyLedgerPage";
import { TaxInvoicePage } from "@/components/TaxInvoicePage";
import {
  readStoredAccountingTab,
  storeAccountingTab,
  type AccountingHubTab,
} from "@/utils/accountingHub";

type AccountingHubPageProps = {
  isHubActive: boolean;
  initialTab?: AccountingHubTab;
  bank: Omit<ComponentProps<typeof BankTransactionsPage>, "isPageActive" | "onNavigateToCompanyLedger">;
  ledger: ComponentProps<typeof CompanyLedgerPage>;
  tax: ComponentProps<typeof TaxInvoicePage>;
};

const TAB_ITEMS: Array<{ key: AccountingHubTab; label: string }> = [
  { key: "bank", label: "\uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED" },
  { key: "ledger", label: "\uD68C\uC0AC \uAC00\uACC4\uBD80" },
  { key: "tax", label: "\uACC4\uC0B0\uC11C \uBC1C\uD589" },
];

export function AccountingHubPage({ isHubActive, initialTab, bank, ledger, tax }: AccountingHubPageProps) {
  const [activeTab, setActiveTab] = useState<AccountingHubTab>(() => initialTab || readStoredAccountingTab());
  const [mountedTabs, setMountedTabs] = useState<Record<AccountingHubTab, boolean>>(() => ({
    bank: (initialTab || readStoredAccountingTab()) === "bank",
    ledger: (initialTab || readStoredAccountingTab()) === "ledger",
    tax: (initialTab || readStoredAccountingTab()) === "tax",
  }));

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

  return (
    <div className="erp-page erp-accounting-hub-page">
      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <h1 className="erp-text-page-title text-slate-900">{"\uD68C\uACC4\u00B7\uD1B5\uC7A5"}</h1>
            <p className="mt-1 erp-text-body text-slate-600">
              {"\uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED, \uD68C\uC0AC \uAC00\uACC4\uBD80, \uACC4\uC0B0\uC11C \uBC1C\uD589\uC744 \uD55C \uBA54\uB274\uC5D0\uC11C \uC804\uD658\uD569\uB2C8\uB2E4."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
            {TAB_ITEMS.map((tab) => (
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
          />
        </div>
      ) : null}

      {mountedTabs.ledger ? (
        <div className={activeTab === "ledger" ? "" : "hidden"} aria-hidden={activeTab !== "ledger"}>
          <CompanyLedgerPage {...ledger} />
        </div>
      ) : null}

      {mountedTabs.tax ? (
        <div className={activeTab === "tax" ? "" : "hidden"} aria-hidden={activeTab !== "tax"}>
          <TaxInvoicePage {...tax} />
        </div>
      ) : null}
    </div>
  );
}
