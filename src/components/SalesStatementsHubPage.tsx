/**
 * 매출·내역서 hub — single entry for sales vouchers + statements.
 */
import React, { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { KeepAlivePanel } from "@/components/PageKeepAlive";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SALES_STATEMENTS_HUB_TABS,
  readStoredSalesStatementsTab,
  storeSalesStatementsTab,
  type SalesStatementsHubTab,
} from "@/utils/financeInformationArchitecture";

export type SalesStatementsHubPageProps = {
  isHubActive: boolean;
  initialTab?: SalesStatementsHubTab | null;
  onInitialTabConsumed?: () => void;
  vouchers: ReactNode;
  register: ReactNode;
  search: ReactNode;
  comments: ReactNode;
  statements: ReactNode;
  onOpenRegister?: () => void;
};

function SalesStatementsHubPageComponent({
  isHubActive,
  initialTab,
  onInitialTabConsumed,
  vouchers,
  register,
  search,
  comments,
  statements,
  onOpenRegister,
}: SalesStatementsHubPageProps) {
  const [activeTab, setActiveTab] = useState<SalesStatementsHubTab>(
    () => initialTab || readStoredSalesStatementsTab(),
  );
  const [mounted, setMounted] = useState<Record<string, boolean>>(() => {
    const start = initialTab || readStoredSalesStatementsTab();
    return { vouchers: true, [start]: true };
  });

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
    setMounted((prev) => ({ ...prev, [initialTab]: true, vouchers: true }));
    storeSalesStatementsTab(
      initialTab === "register" || initialTab === "search" || initialTab === "comments"
        ? "vouchers"
        : initialTab,
    );
    onInitialTabConsumed?.();
  }, [initialTab, onInitialTabConsumed]);

  useEffect(() => {
    if (!isHubActive) return;
    storeSalesStatementsTab(
      activeTab === "register" || activeTab === "search" || activeTab === "comments"
        ? "vouchers"
        : activeTab,
    );
  }, [activeTab, isHubActive]);

  const primaryTab = useMemo(() => {
    if (activeTab === "statements") return "statements";
    return "vouchers";
  }, [activeTab]);

  const selectPrimary = (tab: "vouchers" | "statements") => {
    setActiveTab(tab);
    setMounted((prev) => ({ ...prev, [tab]: true }));
  };

  return (
    <div className="erp-page space-y-4" data-sales-statements-hub="true">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">매출·내역서</h1>
          <p className="text-sm text-slate-600">
            매출전표 · 내역서를 한 곳에서 처리합니다. 공식 등록·상세는 공통 경로를 사용합니다.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="rounded-lg"
          onClick={() => {
            setActiveTab("register");
            setMounted((prev) => ({ ...prev, register: true, vouchers: true }));
            onOpenRegister?.();
          }}
          aria-label="매출전표 등록"
          data-sales-register-entry="true"
        >
          + 매출전표 등록
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="매출·내역서 탭">
        {SALES_STATEMENTS_HUB_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={primaryTab === tab.key}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              primaryTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
            }`}
            onClick={() => selectPrimary(tab.key as "vouchers" | "statements")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {primaryTab === "vouchers" ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={activeTab === "vouchers" || activeTab === "register" ? "default" : "outline"}
                size="sm"
                className="rounded-lg"
                onClick={() => setActiveTab("vouchers")}
              >
                목록
              </Button>
              <Button
                type="button"
                variant={activeTab === "search" ? "default" : "outline"}
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  setActiveTab("search");
                  setMounted((prev) => ({ ...prev, search: true }));
                }}
                aria-label="전표 검색 필터"
              >
                검색·필터
              </Button>
              <Button
                type="button"
                variant={activeTab === "comments" ? "default" : "outline"}
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  setActiveTab("comments");
                  setMounted((prev) => ({ ...prev, comments: true }));
                }}
                aria-label="댓글 있음 필터"
              >
                댓글
              </Button>
            </div>
            {mounted.vouchers || mounted.register ? (
              <KeepAlivePanel active={activeTab === "vouchers" || activeTab === "register"}>
                {activeTab === "register" ? register : vouchers}
              </KeepAlivePanel>
            ) : null}
            {mounted.search ? <KeepAlivePanel active={activeTab === "search"}>{search}</KeepAlivePanel> : null}
            {mounted.comments ? (
              <KeepAlivePanel active={activeTab === "comments"}>{comments}</KeepAlivePanel>
            ) : null}
          </CardContent>
        </Card>
      ) : mounted.statements || primaryTab === "statements" ? (
        <KeepAlivePanel active={primaryTab === "statements"}>{statements}</KeepAlivePanel>
      ) : null}
    </div>
  );
}

export const SalesStatementsHubPage = memo(SalesStatementsHubPageComponent);
export default SalesStatementsHubPage;
