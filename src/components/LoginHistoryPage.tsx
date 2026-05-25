import React, { useMemo, useState } from "react";
import { LogIn, RotateCcw } from "lucide-react";
import { formatAuditDateTime } from "@/utils/auditLog";
import { roleLabel, type LoginLogEntry } from "@/utils/loginLogs";
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
  const day = at.slice(0, 10);
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

type LoginHistoryPageProps = {
  loginLogs: LoginLogEntry[];
};

export function LoginHistoryPage({ loginLogs }: LoginHistoryPageProps) {
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return loginLogs.filter((entry) => {
      if (!matchesDateRange(entry.at, startDate, endDate)) return false;
      if (!q) return true;

      const haystack = [entry.userName, entry.loginId, roleLabel(entry.role)].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [loginLogs, startDate, endDate, query]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: loginLogs.length,
      filtered: filteredLogs.length,
      today: loginLogs.filter((entry) => entry.at?.slice(0, 10) === today).length,
      admins: loginLogs.filter((entry) => entry.role === "admin").length,
    };
  }, [loginLogs, filteredLogs.length]);

  const resetFilters = () => {
    setQuery("");
    setStartDate("");
    setEndDate("");
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
            사용자 로그인 기록을 조회합니다. 누가, 언제 접속했는지 확인할 수 있습니다.
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
            <div className="erp-text-caption text-slate-500">관리자 로그인</div>
            <div className="erp-text-section mt-1 font-black text-blue-700">{stats.admins.toLocaleString()}건</div>
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
          <div className="erp-audit-log-filters">
            <Field label="검색">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="사용자명, 로그인 ID 검색"
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
                    <th className="text-left">권한</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-slate-600">{formatAuditDateTime(entry.at)}</td>
                      <td className="font-semibold text-slate-900">{entry.userName}</td>
                      <td>{entry.loginId}</td>
                      <td>
                        <span className={`erp-audit-action ${entry.role === "admin" ? "update" : "create"}`}>
                          {roleLabel(entry.role)}
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
