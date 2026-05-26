import React, { useCallback, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientListSheet } from "@/components/ClientListSheet";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  type ClientListActivityFilter,
  type ClientListSheetRow,
  filterClientsForExport,
  resolveClientActivityFilterLabel,
  resolveClientExportFileName,
} from "@/utils/clientListExport";
import { exportListDocumentPdf, printListDocument } from "@/utils/listDocumentExport";

const ACTIVITY_FILTER_OPTIONS: Array<{ value: ClientListActivityFilter; label: string }> = [
  { value: "all", label: "\uC804\uCCB4" },
  { value: "excludeStale", label: "3\uAC1C\uC6D4\u2191 \uBBF8\uAC70\uB798 \uC81C\uC678" },
];

export function ClientListExport({
  clients,
  lastSaleByClient,
  companyProfile,
  disabled = false,
  className = "",
}: {
  clients: ClientListSheetRow[];
  lastSaleByClient: Map<string, string>;
  companyProfile?: CompanyProfile;
  disabled?: boolean;
  className?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
  const [message, setMessage] = useState("");
  const [activityFilter, setActivityFilter] = useState<ClientListActivityFilter>("all");

  const filteredClients = useMemo(
    () => filterClientsForExport(clients, activityFilter, lastSaleByClient),
    [clients, activityFilter, lastSaleByClient]
  );

  const activityFilterLabel = useMemo(
    () => resolveClientActivityFilterLabel(activityFilter),
    [activityFilter]
  );

  const exportDisabled = disabled || filteredClients.length === 0;

  const runExport = useCallback(async (kind: "pdf" | "print") => {
    const root = sheetRef.current;
    if (!root) {
      setMessage("\uCD9C\uB825 \uBB38\uC11C\uB97C \uC900\uBE44\uD558\uC9C0 \uBAB0\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (filteredClients.length === 0) {
      setMessage("\uCD9C\uB825\uD560 \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }

    setBusy(kind);
    setMessage("");

    try {
      if (kind === "print") {
        await printListDocument(root);
        return;
      }

      const result = await exportListDocumentPdf(root, resolveClientExportFileName(activityFilter));
      setMessage(result.previewOpened ? "PDF\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      console.error(error);
      setMessage(kind === "pdf" ? "PDF \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." : "\uC778\uC1C4 \uC900\uBE44\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setBusy(null);
    }
  }, [activityFilter, filteredClients.length]);

  return (
    <div className={`erp-client-list-export ${className}`.trim()}>
      <div className="erp-client-list-export-host" aria-hidden="true">
        <ClientListSheet
          ref={sheetRef}
          clients={filteredClients}
          companyProfile={companyProfile}
          activityFilterLabel={activityFilterLabel}
        />
      </div>

      <div className="erp-client-list-export-toolbar">
        <span className="erp-client-list-export-label">
          <FileText size={15} aria-hidden="true" />
          {"\uAC70\uB798\uCC98\uB9AC\uC2A4\uD2B8\uCD9C\uB825"}
        </span>

        <label className="erp-client-list-export-filter">
          <span className="erp-client-list-export-filter-label">{"\uD544\uD130"}</span>
          <select
            className="erp-input erp-client-list-export-filter-select rounded-lg px-2 py-1.5 text-sm font-semibold"
            value={activityFilter}
            onChange={(event) => setActivityFilter(event.target.value as ClientListActivityFilter)}
            disabled={disabled || busy !== null}
          >
            {ACTIVITY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="erp-client-list-export-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={exportDisabled || busy !== null}
            onClick={() => runExport("pdf")}
          >
            {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {"PDF \uC0DD\uC131"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={exportDisabled || busy !== null}
            onClick={() => runExport("print")}
          >
            {busy === "print" ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            {"\uC778\uC1C4"}
          </Button>
        </div>
      </div>
      {message ? <p className="erp-client-list-export-message">{message}</p> : null}
    </div>
  );
}
