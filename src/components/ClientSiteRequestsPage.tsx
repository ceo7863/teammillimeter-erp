import React from "react";
import { ClientSiteRequestsPanel } from "@/components/ClientSiteRequestsPanel";

type ClientSiteRequestsPageProps = {
  clients: Array<{ id?: number | string; name?: string }>;
};

export function ClientSiteRequestsPage({ clients }: ClientSiteRequestsPageProps) {
  return (
    <div className="erp-page">
      <div className="mb-5">
        <h1 className="erp-text-page-title text-slate-900">{"\uD604\uC7A5 \uC811\uC218"}</h1>
        <p className="mt-1 erp-text-body text-slate-600">
          {"\uC811\uC218 \uBAA9\uB85D \uCC98\uB9AC, \uC644\uB8CC \uB0B4\uC5ED \uD655\uC778, \uAC70\uB798\uCC98\uBCC4 \uB9C1\uD06C \uAD00\uB9AC\uB97C \uD569\uB2C8\uB2E4."}
        </p>
      </div>
      <ClientSiteRequestsPanel clients={clients} />
    </div>
  );
}
