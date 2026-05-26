import React, { useMemo } from "react";
import { StatementSheetFooter, StatementSheetHeader } from "@/components/StatementBrand";
import type { CompanyProfile } from "@/utils/companyProfile";

export type { ClientListSheetRow } from "@/utils/clientListExport";

const LABELS = {
  title: "\uAC70 \uB798 \uCC98 \uBAA9 \uB85D",
  printedAt: "\uCD9C\uB825\uC77C",
  filter: "\uD544\uD130",
  totalPrefix: "\uCD1D",
  totalSuffix: "\uAC74",
  name: "\uAC70\uB798\uCC98\uBA85",
  businessNo: "\uC0AC\uC5C5\uC790\uBC88\uD638",
  manager: "\uB2F4\uB2F9\uC790",
  phone: "\uC5F0\uB77D\uCC98",
  vat: "\uBD80\uAC00\uC138",
  empty: "\uD45C\uC2DC\uD560 \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  footColumns: "\uAC70\uB798\uCC98\uBA85 \u00B7 \uC0AC\uC5C5\uC790\uBC88\uD638 \u00B7 \uB2F4\uB2F9\uC790 \u00B7 \uC5F0\uB77D\uCC98 \u00B7 \uBD80\uAC00\uC138",
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

function ClientVatBadge({ vat }: { vat?: string }) {
  const normalized = String(vat || "Y").trim().toUpperCase();
  const isYes = normalized === "Y";
  return (
    <span className={`erp-client-list-vat ${isYes ? "is-yes" : "is-no"}`}>
      {isYes ? "Y" : "N"}
    </span>
  );
}

type ClientListSheetProps = {
  clients: Array<{
    id?: number | string;
    name?: string;
    businessNo?: string;
    manager?: string;
    phone?: string;
    vat?: string;
  }>;
  companyProfile?: CompanyProfile;
  activityFilterLabel?: string;
  className?: string;
};

export const ClientListSheet = React.forwardRef<HTMLDivElement, ClientListSheetProps>(function ClientListSheet(
  { clients, companyProfile, activityFilterLabel = "\uC804\uCCB4", className = "" },
  ref
) {
  const stats = useMemo(() => ({
    total: clients.length,
  }), [clients.length]);

  return (
    <div
      ref={ref}
      className={`erp-statement-sheet erp-client-list-sheet ${className}`.trim()}
    >
      <StatementSheetHeader title={LABELS.title} companyProfile={companyProfile} />

      <div className="erp-client-list-meta">
        <span>{LABELS.printedAt} {todayLabel()}</span>
        <span className="erp-client-list-meta-divider" aria-hidden="true">|</span>
        <span>{LABELS.filter} {activityFilterLabel}</span>
        <span className="erp-client-list-meta-divider" aria-hidden="true">|</span>
        <span>{LABELS.totalPrefix} <strong>{stats.total}</strong>{LABELS.totalSuffix}</span>
      </div>

      <div className="excel-data-table-shell">
        <table className="excel-data-table erp-client-list-table">
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="text-center">No</th>
              <th>{LABELS.name}</th>
              <th>{LABELS.businessNo}</th>
              <th>{LABELS.manager}</th>
              <th>{LABELS.phone}</th>
              <th className="text-center">{LABELS.vat}</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="excel-empty-cell text-center">
                  {LABELS.empty}
                </td>
              </tr>
            ) : clients.map((client, index) => (
              <tr key={client.id ?? `${client.name}-${index}`}>
                <td className="text-center erp-client-list-no">{index + 1}</td>
                <td className="erp-client-list-name">{formatCell(client.name)}</td>
                <td className="erp-client-list-business-no">{formatCell(client.businessNo)}</td>
                <td>{formatCell(client.manager)}</td>
                <td className="erp-client-list-phone">{formatCell(client.phone)}</td>
                <td className="text-center">
                  <ClientVatBadge vat={client.vat} />
                </td>
              </tr>
            ))}
          </tbody>
          {clients.length > 0 ? (
            <tfoot>
              <tr>
                <td colSpan={6} className="erp-client-list-foot">
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
