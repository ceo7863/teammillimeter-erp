import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  firstAccessibleBasicInfoTab,
  readStoredBasicInfoTab,
  storeBasicInfoTab,
  type BasicInfoHubTab,
  type BasicInfoTabAccess,
} from "@/utils/basicInfoHub";

type BasicInfoHubPageProps = {
  isHubActive: boolean;
  initialTab?: BasicInfoHubTab;
  tabAccess: BasicInfoTabAccess;
  clientsPanel: ReactNode;
  workersPanel: ReactNode;
  companyPanel: ReactNode;
  onWorkersTabVisible?: () => void;
};

const TAB_ITEMS: Array<{ key: BasicInfoHubTab; label: string }> = [
  { key: "clients", label: "\uAC70\uB798\uCC98" },
  { key: "workers", label: "\uC2DC\uACF5\uC790" },
  { key: "company", label: "\uD68C\uC0AC\uC815\uBCF4" },
];

function resolveInitialTab(initialTab: BasicInfoHubTab | undefined, tabAccess: BasicInfoTabAccess): BasicInfoHubTab {
  const candidate = initialTab || readStoredBasicInfoTab();
  if (candidate === "clients" && tabAccess.clients) return "clients";
  if (candidate === "workers" && tabAccess.workers) return "workers";
  if (candidate === "company" && tabAccess.company) return "company";
  return firstAccessibleBasicInfoTab(tabAccess);
}

export function BasicInfoHubPage({
  isHubActive,
  initialTab,
  tabAccess,
  clientsPanel,
  workersPanel,
  companyPanel,
  onWorkersTabVisible,
}: BasicInfoHubPageProps) {
  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((tab) => tabAccess[tab.key === "company" ? "company" : tab.key]),
    [tabAccess],
  );

  const [activeTab, setActiveTab] = useState<BasicInfoHubTab>(() => resolveInitialTab(initialTab, tabAccess));
  const [mountedTabs, setMountedTabs] = useState<Record<BasicInfoHubTab, boolean>>(() => {
    const initial = resolveInitialTab(initialTab, tabAccess);
    return {
      clients: initial === "clients",
      workers: initial === "workers",
      company: initial === "company",
    };
  });

  useEffect(() => {
    if (!initialTab) return;
    const next = resolveInitialTab(initialTab, tabAccess);
    setActiveTab(next);
    setMountedTabs((prev) => ({ ...prev, [next]: true }));
  }, [initialTab, tabAccess]);

  useEffect(() => {
    if (!tabAccess[activeTab === "company" ? "company" : activeTab]) {
      const next = firstAccessibleBasicInfoTab(tabAccess);
      setActiveTab(next);
      setMountedTabs((prev) => ({ ...prev, [next]: true }));
      return;
    }
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
    storeBasicInfoTab(activeTab);
  }, [activeTab, tabAccess]);

  useEffect(() => {
    if (!isHubActive || activeTab !== "workers") return;
    onWorkersTabVisible?.();
  }, [isHubActive, activeTab, onWorkersTabVisible]);

  const switchTab = (tab: BasicInfoHubTab) => {
    setActiveTab(tab);
  };

  return (
    <div className="erp-page erp-basic-info-hub-page" data-hub-active={isHubActive ? "true" : "false"}>
      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <h1 className="erp-text-page-title text-slate-900">{"\uAE30\uBCF8\uC815\uBCF4"}</h1>
            <p className="mt-1 erp-text-body text-slate-600">
              {"\uAC70\uB798\uCC98, \uC2DC\uACF5\uC790, \uD68C\uC0AC \uC815\uBCF4\uB97C \uD55C \uBA54\uB274\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4."}
            </p>
          </div>
          {visibleTabs.length > 1 ? (
            <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
              {visibleTabs.map((tab) => (
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
          ) : null}
        </CardContent>
      </Card>

      {mountedTabs.clients ? (
        <div className={activeTab === "clients" ? "" : "hidden"} aria-hidden={activeTab !== "clients"}>
          {clientsPanel}
        </div>
      ) : null}

      {mountedTabs.workers ? (
        <div className={activeTab === "workers" ? "" : "hidden"} aria-hidden={activeTab !== "workers"}>
          {workersPanel}
        </div>
      ) : null}

      {mountedTabs.company ? (
        <div className={activeTab === "company" ? "" : "hidden"} aria-hidden={activeTab !== "company"}>
          {companyPanel}
        </div>
      ) : null}
    </div>
  );
}
