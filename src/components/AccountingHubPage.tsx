import React, { memo, useCallback, useEffect, useState, type ComponentProps } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { KeepAlivePanel } from "@/components/PageKeepAlive";
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
  onBankTabActiveChange?: (active: boolean) => void;
  initialTab?: AccountingHubTab;
  pendingBankDateFilter?: { startDate: string; endDate: string } | null;
  onPendingBankDateFilterConsumed?: () => void;
  pendingBankColumnPreset?: "account_only" | null;
  onPendingBankColumnPresetConsumed?: () => void;
  pendingBankSearchQuery?: string | null;
  onPendingBankSearchQueryConsumed?: () => void;
  pendingBankTransactionId?: string | null;
  onPendingBankTransactionIdConsumed?: () => void;
  bank: Omit<
    ComponentProps<typeof BankTransactionsPage>,
    | "isPageActive"
    | "onNavigateToCompanyLedger"
    | "onNavigateToClassify"
    | "onNavigateToFixedExpense"
    | "onNavigateToTaxInvoice"
    | "pendingBankDateFilter"
    | "onPendingBankDateFilterConsumed"
    | "pendingBankColumnPreset"
    | "onPendingBankColumnPresetConsumed"
    | "pendingBankSearchQuery"
    | "onPendingBankSearchQueryConsumed"
    | "pendingBankTransactionId"
    | "onPendingBankTransactionIdConsumed"
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

function AccountingHubPageComponent({
  isHubActive,
  onBankTabActiveChange,
  initialTab,
  pendingBankDateFilter = null,
  onPendingBankDateFilterConsumed,
  pendingBankColumnPreset = null,
  onPendingBankColumnPresetConsumed,
  pendingBankSearchQuery = null,
  onPendingBankSearchQueryConsumed,
  pendingBankTransactionId = null,
  onPendingBankTransactionIdConsumed,
  bank,
  ledger,
  tax,
  classify,
}: AccountingHubPageProps) {
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

  useEffect(() => {
    onBankTabActiveChange?.(isHubActive && activeTab === "bank");
  }, [isHubActive, activeTab, onBankTabActiveChange]);

  useEffect(() => {
    if (!isHubActive) {
      onBankTabActiveChange?.(false);
    }
  }, [isHubActive, onBankTabActiveChange]);

  const switchTab = useCallback((tab: AccountingHubTab) => {
    setActiveTab(tab);
  }, []);

  const openLedgerFixedTab = useCallback(() => {
    setLedgerSubTab("fixed");
    setActiveTab("ledger");
  }, []);

  const navigateToLedger = useCallback(() => switchTab("ledger"), [switchTab]);
  const navigateToClassify = useCallback(() => switchTab("classify"), [switchTab]);
  const navigateToTaxInvoice = useCallback(() => switchTab("tax"), [switchTab]);
  const openBankTab = useCallback(() => switchTab("bank"), [switchTab]);

  return (
    <div className="erp-page erp-accounting-hub-page">
      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <h1 className="erp-text-page-title text-slate-900">통장</h1>
            <p className="mt-1 erp-text-body text-slate-600">
              은행 거래를 Receipt/Disbursement와 연결·대사합니다. 별도 회계 원장이 아니라 연결 허브입니다.
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
        <KeepAlivePanel active={activeTab === "bank"}>
          <BankTransactionsPage
            {...bank}
            pendingBankDateFilter={pendingBankDateFilter}
            onPendingBankDateFilterConsumed={onPendingBankDateFilterConsumed}
            pendingBankColumnPreset={pendingBankColumnPreset}
            onPendingBankColumnPresetConsumed={onPendingBankColumnPresetConsumed}
            pendingBankSearchQuery={pendingBankSearchQuery}
            onPendingBankSearchQueryConsumed={onPendingBankSearchQueryConsumed}
            pendingBankTransactionId={pendingBankTransactionId}
            onPendingBankTransactionIdConsumed={onPendingBankTransactionIdConsumed}
            isPageActive={isHubActive && activeTab === "bank"}
            onNavigateToCompanyLedger={navigateToLedger}
            onNavigateToClassify={navigateToClassify}
            onNavigateToFixedExpense={openLedgerFixedTab}
            onNavigateToTaxInvoice={navigateToTaxInvoice}
          />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.ledger ? (
        <KeepAlivePanel active={activeTab === "ledger"}>
          <LedgerViewerPage
            {...ledger}
            initialSubTab={ledgerSubTab}
            onSubTabConsumed={() => setLedgerSubTab(undefined)}
            onOpenBankTab={openBankTab}
          />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.tax ? (
        <KeepAlivePanel active={activeTab === "tax"}>
          <TaxInvoicePage {...tax} />
        </KeepAlivePanel>
      ) : null}

      {mountedTabs.classify ? (
        <KeepAlivePanel active={activeTab === "classify"}>
          <LedgerClassificationManagePage {...classify} />
        </KeepAlivePanel>
      ) : null}
    </div>
  );
}

export const AccountingHubPage = memo(AccountingHubPageComponent);
