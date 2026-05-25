import React, { useMemo, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { useAudit } from "@/context/AuditContext";
import { formatAuditDateTime, type AuditAction, type AuditLogEntry } from "@/utils/auditLog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { KoreanDateInput } from "@/components/KoreanDateInput";

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "전체 유형" },
  { value: "sale", label: "매출" },
  { value: "paymentVoucher", label: "입금전표" },
  { value: "client", label: "거래처" },
  { value: "worker", label: "시공자" },
  { value: "user", label: "사용자" },
  { value: "system", label: "시스템" },
];

const ACTION_OPTIONS = [
  { value: "", label: "전체 작업" },
  { value: "create", label: "등록" },
  { value: "update", label: "수정" },
  { value: "delete", label: "삭제" },
  { value: "import", label: "일괄적용" },
];

function entityTypeLabel(value: string) {
  return ENTITY_TYPE_OPTIONS.find((option) => option.value === value)?.label || value || "-";
}

function actionLabel(value: AuditAction) {
  return ACTION_OPTIONS.find((option) => option.value === value)?.label || value;
}

function actionTone(value: AuditAction) {
  if (value === "create") return "erp-audit-action create";
  if (value === "update") return "erp-audit-action update";
  if (value === "delete") return "erp-audit-action delete";
  if (value === "import") return "erp-audit-action import";
  return "erp-audit-action";
}

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

export function AuditLogPage() {
  const { auditLogs } = useAudit();
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [screen, setScreen] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const screenOptions = useMemo(() => {
    const screens = [...new Set(auditLogs.map((entry) => entry.screen).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
    return [{ value: "", label: "전체 화면" }, ...screens.map((value) => ({ value, label: value }))];
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (entityType && entry.entityType !== entityType) return false;
      if (action && entry.action !== action) return false;
      if (screen && entry.screen !== screen) return false;
      if (!matchesDateRange(entry.at, startDate, endDate)) return false;
      if (!q) return true;

      const haystack = [
        entry.entityLabel,
        entry.fieldLabel,
        entry.before,
        entry.after,
        entry.userName,
        entry.userEmail,
        entry.screen,
        entityTypeLabel(entry.entityType),
        actionLabel(entry.action),
        String(entry.entityId),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [auditLogs, entityType, action, screen, startDate, endDate, query]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: auditLogs.length,
      filtered: filteredLogs.length,
      today: auditLogs.filter((entry) => entry.at?.slice(0, 10) === today).length,
      updates: auditLogs.filter((entry) => entry.action === "update").length,
    };
  }, [auditLogs, filteredLogs.length]);

  const resetFilters = () => {
    setQuery("");
    setEntityType("");
    setAction("");
    setScreen("");
    setStartDate("");
    setEndDate("");
  };

  const exportFiltered = () => {
    if (!filteredLogs.length) return;
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="erp-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="min-w-0">
          <h1 className="erp-text-page-title flex items-center gap-2">
            <History size={24} className="text-slate-700" />
            감사로그
          </h1>
          <p className="erp-text-body mt-1 text-slate-500 md:mt-2">
            필드별 변경 이력을 조회합니다. 누가, 언제, 어떤 화면에서 수정했는지 확인할 수 있습니다.
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
            <div className="erp-text-caption text-slate-500">오늘 변경</div>
            <div className="erp-text-section mt-1 font-black text-emerald-700">{stats.today.toLocaleString()}건</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">수정 이력</div>
            <div className="erp-text-section mt-1 font-black text-blue-700">{stats.updates.toLocaleString()}건</div>
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
                placeholder="대상, 필드, 변경값, 사용자 검색"
              />
            </Field>
            <Field label="유형">
              <select className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 outline-none focus:border-slate-900 md:px-4 md:py-3" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                {ENTITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="작업">
              <select className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 outline-none focus:border-slate-900 md:px-4 md:py-3" value={action} onChange={(e) => setAction(e.target.value)}>
                {ACTION_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="화면">
              <select className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 outline-none focus:border-slate-900 md:px-4 md:py-3" value={screen} onChange={(e) => setScreen(e.target.value)}>
                {screenOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
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
            <h2 className="erp-text-section">변경 이력 목록</h2>
            <span className="erp-text-caption text-slate-500">{filteredLogs.length}건 표시</span>
          </div>

          <TableExportSection fileName="감사로그" title="감사 로그" disabled={filteredLogs.length === 0}>
          <div className="erp-audit-log-table-wrap">
            <table className="erp-audit-log-table">
              <thead>
                <tr>
                  <th className="text-left">일시</th>
                  <th className="text-left">사용자</th>
                  <th className="text-left">화면</th>
                  <th className="text-left">유형</th>
                  <th className="text-left">대상</th>
                  <th className="text-left">필드</th>
                  <th className="text-center">작업</th>
                  <th className="text-left">변경 내용</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((entry: AuditLogEntry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-slate-600">{formatAuditDateTime(entry.at)}</td>
                    <td>
                      <div className="font-semibold text-slate-900">{entry.userName}</div>
                      {entry.userEmail && <div className="erp-text-caption text-slate-400">{entry.userEmail}</div>}
                    </td>
                    <td><span className="erp-audit-chip">{entry.screen}</span></td>
                    <td>{entityTypeLabel(entry.entityType)}</td>
                    <td className="erp-cell-clip" title={entry.entityLabel}>{entry.entityLabel}</td>
                    <td>{entry.fieldLabel}</td>
                    <td className="text-center">
                      <span className={actionTone(entry.action)}>{actionLabel(entry.action)}</span>
                    </td>
                    <td>
                      <div className="erp-audit-log-change">
                        <span className="text-slate-500">{entry.before}</span>
                        <span className="text-slate-300">→</span>
                        <span className="font-semibold text-slate-900">{entry.after}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLogs.length === 0 && (
              <div className="erp-audit-empty">
                {auditLogs.length === 0 ? "아직 기록된 감사로그가 없습니다." : "조건에 맞는 감사로그가 없습니다."}
              </div>
            )}
          </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}
