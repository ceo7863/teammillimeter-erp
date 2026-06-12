import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { KeepAlivePanel } from "@/components/PageKeepAlive";
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
  officeStaffPanel: ReactNode;
  companyPanel: ReactNode;
  onWorkersTabVisible?: () => void;
};

const TAB_ITEMS: Array<{ key: BasicInfoHubTab; label: string }> = [
  { key: "clients", label: "거래처" },
  { key: "workers", label: "시공자" },
  { key: "officeStaff", label: "내근직" },
  { key: "company", label: "회사정보" },
];

function tabAccessKey(tab: BasicInfoHubTab): keyof BasicInfoTabAccess {
  if (tab === "company") return "company";
  return tab;
}

function resolveInitialTab(initialTab: BasicInfoHubTab | undefined, tabAccess: BasicInfoTabAccess): BasicInfoHubTab {
  const candidate = initialTab || readStoredBasicInfoTab();
  if (tabAccess[tabAccessKey(candidate)]) return candidate;
  return firstAccessibleBasicInfoTab(tabAccess);
}

export function BasicInfoHubPage({
  isHubActive,
  initialTab,
  tabAccess,
  clientsPanel,
  workersPanel,
  officeStaffPanel,
  companyPanel,
  onWorkersTabVisible,
}: BasicInfoHubPageProps) {
  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((tab) => tabAccess[tabAccessKey(tab.key)]),
    [tabAccess],
  );

  const [activeTab, setActiveTab] = useState<BasicInfoHubTab>(() => resolveInitialTab(initialTab, tabAccess));
  const [mountedTabs, setMountedTabs] = useState<Record<BasicInfoHubTab, boolean>>(() => {
    const initial = resolveInitialTab(initialTab, tabAccess);
    return {
      clients: initial === "clients",
      workers: initial === "workers",
      officeStaff: initial === "officeStaff",
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
    if (!tabAccess[tabAccessKey(activeTab)]) {
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
            <h1 className="erp-text-page-title text-slate-900">기본정보</h1>
            <p className="mt-1 erp-text-body text-slate-600">
              거래처, 시공자, 내근직, 회사 정보를 한 메뉴에서 관리합니다.
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
        <KeepAlivePanel active={activeTab === "clients"}>{clientsPanel}</KeepAlivePanel>
      ) : null}

      {mountedTabs.workers ? (
        <KeepAlivePanel active={activeTab === "workers"}>{workersPanel}</KeepAlivePanel>
      ) : null}

      {mountedTabs.officeStaff ? (
        <KeepAlivePanel active={activeTab === "officeStaff"}>{officeStaffPanel}</KeepAlivePanel>
      ) : null}

      {mountedTabs.company ? (
        <KeepAlivePanel active={activeTab === "company"}>{companyPanel}</KeepAlivePanel>
      ) : null}
    </div>
  );
}
