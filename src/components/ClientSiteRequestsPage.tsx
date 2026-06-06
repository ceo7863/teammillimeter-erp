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
          {"\uAC70\uB798\uCC98\uBCC4 \uACF5\uAC1C \uB9C1\uD06C \uBC1C\uAE09\uACFC \uC811\uC218 \uB0B4\uC5ED \uCC98\uB9AC\uB97C \uD569\uB2C8\uB2E4."}
        </p>
      </div>
      <ClientSiteRequestsPanel clients={clients} />
    </div>
  );
}
