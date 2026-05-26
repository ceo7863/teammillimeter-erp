import React, { useMemo } from "react";
import { StatementSheetFooter, StatementSheetHeader } from "@/components/StatementBrand";
import type { CompanyProfile } from "@/utils/companyProfile";

export type WorkerListSheetRow = {
  id?: number | string;
  name?: string;
  grade?: string;
  category?: string;
  isActive?: boolean;
  phone?: string;
  vehicleNo?: string;
  account?: string;
  bank?: string;
};

const GRADE_CLASS: Record<string, string> = {
  S: "is-s",
  A: "is-a",
  B: "is-b",
  C: "is-c",
  D: "is-d",
};

const LABELS = {
  title: "\uC2DC \uACF5 \uC790 \uBAA9 \uB85D",
  printedAt: "\uCD9C\uB825\uC77C",
  totalPrefix: "\uCD1D",
  totalSuffix: "\uBA85",
  name: "\uC2DC\uACF5\uC790\uBA85",
  grade: "\uC2DC\uACF5\uB4F1\uAE09",
  phone: "\uC5F0\uB77D\uCC98",
  vehicleNo: "\uCC28\uB7C9\uBC88\uD638",
  account: "\uACC4\uC88C\uBC88\uD638",
  bank: "\uC740\uD589\uBA85",
  empty: "\uD45C\uC2DC\uD560 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  footColumns: "\uC2DC\uACF5\uC790\uBA85 \u00B7 \uC2DC\uACF5\uB4F1\uAE09 \u00B7 \uC5F0\uB77D\uCC98 \u00B7 \uCC28\uB7C9\uBC88\uD638 \u00B7 \uACC4\uC88C\uBC88\uD638 \u00B7 \uC740\uD589\uBA85",
  category: "\uAD6C\uBD84",
};

function todayLabel() {
  return new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCell(value?: string) {
  const text = String(value || "").trim();
  return text || "-";
}

function WorkerListGradeBadge({ grade }: { grade?: string }) {
  const normalized = String(grade || "").trim().toUpperCase();
  const tone = GRADE_CLASS[normalized];
  if (!tone) {
    return <span className="erp-worker-list-grade is-empty">-</span>;
  }
  return <span className={`erp-worker-list-grade ${tone}`}>{normalized}</span>;
}

export const WorkerListSheet = React.forwardRef<HTMLDivElement, {
  workers: WorkerListSheetRow[];
  companyProfile?: CompanyProfile;
  categoryFilterLabel?: string;
  className?: string;
}>(function WorkerListSheet({ workers, companyProfile, categoryFilterLabel = "\uC804\uCCB4", className = "" }, ref) {
  const stats = useMemo(() => ({
    total: workers.length,
  }), [workers.length]);

  return (
    <div
      ref={ref}
      className={`erp-statement-sheet erp-worker-list-sheet ${className}`.trim()}
    >
      <StatementSheetHeader title={LABELS.title} companyProfile={companyProfile} />

      <div className="erp-worker-list-meta">
        <span>{LABELS.printedAt} {todayLabel()}</span>
        <span className="erp-worker-list-meta-divider" aria-hidden="true">|</span>
        <span>{LABELS.category} {categoryFilterLabel}</span>
        <span className="erp-worker-list-meta-divider" aria-hidden="true">|</span>
        <span>{LABELS.totalPrefix} <strong>{stats.total}</strong>{LABELS.totalSuffix}</span>
      </div>

      <div className="excel-data-table-shell">
        <table className="excel-data-table erp-worker-list-table">
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "19%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-center">No</th>
              <th>{LABELS.name}</th>
              <th className="text-center">{LABELS.grade}</th>
              <th>{LABELS.phone}</th>
              <th>{LABELS.vehicleNo}</th>
              <th>{LABELS.account}</th>
              <th>{LABELS.bank}</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td colSpan={7} className="excel-empty-cell text-center">
                  {LABELS.empty}
                </td>
              </tr>
            ) : workers.map((worker, index) => (
              <tr key={worker.id ?? `${worker.name}-${index}`}>
                <td className="text-center erp-worker-list-no">{index + 1}</td>
                <td className="erp-worker-list-name">{formatCell(worker.name)}</td>
                <td className="text-center">
                  <WorkerListGradeBadge grade={worker.grade} />
                </td>
                <td className="erp-worker-list-phone">{formatCell(worker.phone)}</td>
                <td>{formatCell(worker.vehicleNo)}</td>
                <td className="erp-worker-list-account">{formatCell(worker.account)}</td>
                <td>{formatCell(worker.bank)}</td>
              </tr>
            ))}
          </tbody>
          {workers.length > 0 ? (
            <tfoot>
              <tr>
                <td colSpan={7} className="erp-worker-list-foot">
                  {LABELS.totalPrefix} {stats.total}{LABELS.totalSuffix} {"\u00B7"} {LABELS.footColumns}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <StatementSheetFooter companyProfile={companyProfile} />
    </div>
  );
});
