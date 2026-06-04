import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  firstAccessibleUserAdminTab,
  readStoredUserAdminTab,
  storeUserAdminTab,
  type UserAdminHubTab,
  type UserAdminTabAccess,
} from "@/utils/userAdminHub";

type UserAdminHubPageProps = {
  isHubActive: boolean;
  initialTab?: UserAdminHubTab;
  tabAccess: UserAdminTabAccess;
  usersPanel: ReactNode;
  auditPanel: ReactNode;
  loginPanel: ReactNode;
};

const TAB_ITEMS: Array<{ key: UserAdminHubTab; label: string }> = [
  { key: "users", label: "\uC0AC\uC6A9\uC790 \uAD00\uB9AC" },
  { key: "audit", label: "\uAC10\uC0AC\uB85C\uADF8" },
  { key: "login", label: "\uB85C\uADF8\uC778 \uC774\uB825" },
];

function resolveInitialTab(initialTab: UserAdminHubTab | undefined, tabAccess: UserAdminTabAccess): UserAdminHubTab {
  const candidate = initialTab || readStoredUserAdminTab();
  if (candidate === "users" && tabAccess.users) return "users";
  if (candidate === "audit" && tabAccess.audit) return "audit";
  if (candidate === "login" && tabAccess.login) return "login";
  return firstAccessibleUserAdminTab(tabAccess);
}

export function UserAdminHubPage({
  isHubActive,
  initialTab,
  tabAccess,
  usersPanel,
  auditPanel,
  loginPanel,
}: UserAdminHubPageProps) {
  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((tab) => tabAccess[tab.key]),
    [tabAccess],
  );

  const [activeTab, setActiveTab] = useState<UserAdminHubTab>(() => resolveInitialTab(initialTab, tabAccess));
  const [mountedTabs, setMountedTabs] = useState<Record<UserAdminHubTab, boolean>>(() => {
    const initial = resolveInitialTab(initialTab, tabAccess);
    return {
      users: initial === "users",
      audit: initial === "audit",
      login: initial === "login",
    };
  });

  useEffect(() => {
    if (!initialTab) return;
    const next = resolveInitialTab(initialTab, tabAccess);
    setActiveTab(next);
    setMountedTabs((prev) => ({ ...prev, [next]: true }));
  }, [initialTab, tabAccess]);

  useEffect(() => {
    if (!tabAccess[activeTab]) {
      const next = firstAccessibleUserAdminTab(tabAccess);
      setActiveTab(next);
      setMountedTabs((prev) => ({ ...prev, [next]: true }));
      return;
    }
    setMountedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
    storeUserAdminTab(activeTab);
  }, [activeTab, tabAccess]);

  const switchTab = (tab: UserAdminHubTab) => {
    setActiveTab(tab);
  };

  return (
    <div className="erp-page erp-user-admin-hub-page" data-hub-active={isHubActive ? "true" : "false"}>
      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4">
            <h1 className="erp-text-page-title text-slate-900">{"\uC0AC\uC6A9\uC790 \uAD00\uB9AC"}</h1>
            <p className="mt-1 erp-text-body text-slate-600">
              {"\uACC4\uC815 \uAD00\uB9AC, \uAC10\uC0AC \uB85C\uADF8, \uB85C\uADF8\uC778 \uC774\uB825\uC744 \uD55C \uBA54\uB274\uC5D0\uC11C \uC804\uD658\uD569\uB2C8\uB2E4."}
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

      {mountedTabs.users ? (
        <div className={activeTab === "users" ? "" : "hidden"} aria-hidden={activeTab !== "users"}>
          {usersPanel}
        </div>
      ) : null}

      {mountedTabs.audit ? (
        <div className={activeTab === "audit" ? "" : "hidden"} aria-hidden={activeTab !== "audit"}>
          {auditPanel}
        </div>
      ) : null}

      {mountedTabs.login ? (
        <div className={activeTab === "login" ? "" : "hidden"} aria-hidden={activeTab !== "login"}>
          {loginPanel}
        </div>
      ) : null}
    </div>
  );
}
