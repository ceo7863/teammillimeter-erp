import React, { useMemo, useState } from "react";
import { LogIn, RotateCcw } from "lucide-react";
import { auditLocalDayKey, formatAuditDateTime } from "@/utils/auditLog";
import {
  isWorkerPortalLoginLog,
  loginLogKindLabel,
  roleLabel,
  type LoginLogEntry,
  type LoginLogKind,
} from "@/utils/loginLogs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { KoreanDateInput } from "@/components/KoreanDateInput";

function Input({ className = "", lang, type, value, onChange, ...props }) {
  if (type === "date") {
    return <KoreanDateInput className={className} value={value ?? ""} onChange={onChange} {...props} />;
  }
  const skipKoLang = type === "number";
  return (
    <input
      {...props}
      type={type}
      value={value}
      onChange={onChange}
      lang={lang ?? (skipKoLang ? undefined : "ko")}
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function matchesDateRange(at: string, startDate: string, endDate: string) {
  if (!at) return false;
  const day = auditLocalDayKey(at);
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

type LoginHistoryPageProps = {
  loginLogs: LoginLogEntry[];
};

const KIND_FILTER_ITEMS: Array<{ key: "all" | LoginLogKind; label: string }> = [
  { key: "all", label: "\uC804\uCCB4" },
  { key: "erp", label: "ERP" },
  { key: "worker-portal", label: "\uC2DC\uACF5\uB0B4\uC5ED\uC11C" },
];

export function LoginHistoryPage({ loginLogs }: LoginHistoryPageProps) {
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | LoginLogKind>("all");

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return loginLogs.filter((entry) => {
      if (kindFilter !== "all") {
        const isPortal = isWorkerPortalLoginLog(entry);
        if (kindFilter === "worker-portal" && !isPortal) return false;
        if (kindFilter === "erp" && isPortal) return false;
      }
      if (!matchesDateRange(entry.at, startDate, endDate)) return false;
      if (!q) return true;

      const haystack = [entry.userName, entry.loginId, loginLogKindLabel(entry), roleLabel(entry.role)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [loginLogs, startDate, endDate, query, kindFilter]);

  const stats = useMemo(() => {
    const today = auditLocalDayKey(new Date().toISOString());
    const portalLogs = loginLogs.filter((entry) => isWorkerPortalLoginLog(entry));
    return {
      total: loginLogs.length,
      filtered: filteredLogs.length,
      today: loginLogs.filter((entry) => auditLocalDayKey(entry.at) === today).length,
      portal: portalLogs.length,
      portalToday: portalLogs.filter((entry) => auditLocalDayKey(entry.at) === today).length,
      admins: loginLogs.filter((entry) => !isWorkerPortalLoginLog(entry) && entry.role === "admin").length,
    };
  }, [loginLogs, filteredLogs.length]);

  const resetFilters = () => {
    setQuery("");
    setStartDate("");
    setEndDate("");
    setKindFilter("all");
  };

  const exportFiltered = () => {
    if (!filteredLogs.length) return;
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `login-history-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="erp-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <h1 className="erp-text-page-title flex items-center gap-2">
            <LogIn size={24} className="text-slate-700" />
            로그인 이력
          </h1>
          <p className="erp-text-body mt-1 text-slate-500 md:mt-2">
            ERP 사용자와 시공내역서 포털 로그인 기록을 조회합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-2xl" onClick={resetFilters}>
            <RotateCcw size={16} />
            필터 초기화
          </Button>
          <Button className="rounded-2xl" onClick={exportFiltered} disabled={!filteredLogs.length}>
            JSON 내보내기
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">전체 이력</div>
            <div className="erp-text-section mt-1 font-black">{stats.total.toLocaleString()}건</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">오늘 로그인</div>
            <div className="erp-text-section mt-1 font-black text-emerald-700">{stats.today.toLocaleString()}건</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">시공내역서 로그인</div>
            <div className="erp-text-section mt-1 font-black text-violet-700">
              {stats.portal.toLocaleString()}건
              <span className="erp-text-caption ml-1 font-semibold text-slate-500">
                (오늘 {stats.portalToday.toLocaleString()})
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">조회 결과</div>
            <div className="erp-text-section mt-1 font-black">{stats.filtered.toLocaleString()}건</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {KIND_FILTER_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
                  kindFilter === item.key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setKindFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="erp-audit-log-filters">
            <Field label="검색">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름, 로그인 ID, 구분 검색"
              />
            </Field>
            <Field label="시작일">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="종료일">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="erp-text-section">로그인 이력 목록</h2>
            <span className="erp-text-caption text-slate-500">{filteredLogs.length}건 표시</span>
          </div>

          <TableExportSection fileName="로그인이력" title="로그인 이력" disabled={filteredLogs.length === 0}>
            <div className="erp-audit-log-table-wrap">
              <table className="erp-audit-log-table">
                <thead>
                  <tr>
                    <th className="text-left">일시</th>
                    <th className="text-left">사용자명</th>
                    <th className="text-left">로그인 ID</th>
                    <th className="text-left">구분</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-slate-600">{formatAuditDateTime(entry.at)}</td>
                      <td className="font-semibold text-slate-900">{entry.userName}</td>
                      <td>{entry.loginId}</td>
                      <td>
                        <span
                          className={`erp-audit-action ${
                            isWorkerPortalLoginLog(entry)
                              ? "create"
                              : entry.role === "admin"
                                ? "update"
                                : "create"
                          }`}
                        >
                          {loginLogKindLabel(entry)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredLogs.length === 0 && (
                <div className="erp-audit-empty">
                  {loginLogs.length === 0 ? "아직 기록된 로그인 이력이 없습니다." : "조건에 맞는 로그인 이력이 없습니다."}
                </div>
              )}
            </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}
