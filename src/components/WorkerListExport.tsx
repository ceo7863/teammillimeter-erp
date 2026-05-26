import React, { useCallback, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkerListSheet, type WorkerListSheetRow } from "@/components/WorkerListSheet";
import type { CompanyProfile } from "@/utils/companyProfile";
import { exportWorkerListPdf, printWorkerListDocument } from "@/utils/workerListExport";

export type WorkerListCategoryFilter = "all" | "team" | "outsource";

const CATEGORY_FILTER_OPTIONS: Array<{ value: WorkerListCategoryFilter; label: string }> = [
  { value: "all", label: "\uC804\uCCB4" },
  { value: "team", label: "\uD300\uC6D0" },
  { value: "outsource", label: "\uC678\uC8FC" },
];

function normalizeWorkerCategory(value?: string) {
  return String(value || "").trim() === "\uC678\uC8FC" ? "\uC678\uC8FC" : "\uD300\uC6D0";
}

function isActiveWorker(worker: WorkerListSheetRow) {
  return worker.isActive !== false;
}

function filterWorkersByCategory(workers: WorkerListSheetRow[], categoryFilter: WorkerListCategoryFilter) {
  const activeWorkers = workers.filter((worker) => isActiveWorker(worker));
  if (categoryFilter === "all") return activeWorkers;
  const target = categoryFilter === "outsource" ? "\uC678\uC8FC" : "\uD300\uC6D0";
  return activeWorkers.filter((worker) => normalizeWorkerCategory(worker.category) === target);
}

function resolveCategoryFilterLabel(categoryFilter: WorkerListCategoryFilter) {
  if (categoryFilter === "team") return "\uD300\uC6D0";
  if (categoryFilter === "outsource") return "\uC678\uC8FC";
  return "\uC804\uCCB4";
}

function resolveExportFileName(categoryFilter: WorkerListCategoryFilter) {
  const base = "\uC2DC\uACF5\uC790\uBAA9\uB85D";
  if (categoryFilter === "team") return `${base}_\uD300\uC6D0`;
  if (categoryFilter === "outsource") return `${base}_\uC678\uC8FC`;
  return base;
}

export function WorkerListExport({
  workers,
  companyProfile,
  disabled = false,
  className = "",
}: {
  workers: WorkerListSheetRow[];
  companyProfile?: CompanyProfile;
  disabled?: boolean;
  className?: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
  const [message, setMessage] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<WorkerListCategoryFilter>("all");

  const filteredWorkers = useMemo(
    () => filterWorkersByCategory(workers, categoryFilter),
    [workers, categoryFilter]
  );

  const categoryFilterLabel = useMemo(
    () => resolveCategoryFilterLabel(categoryFilter),
    [categoryFilter]
  );

  const exportDisabled = disabled || filteredWorkers.length === 0;

  const runExport = useCallback(async (kind: "pdf" | "print") => {
    const root = sheetRef.current;
    if (!root) {
      setMessage("\uCD9C\uB825 \uBB38\uC11C\uB97C \uC900\uBE44\uD558\uC9C0 \uBAB0\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (filteredWorkers.length === 0) {
      setMessage("\uCD9C\uB825\uD560 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }

    setBusy(kind);
    setMessage("");

    try {
      if (kind === "print") {
        await printWorkerListDocument(root);
        return;
      }

      const result = await exportWorkerListPdf(root, resolveExportFileName(categoryFilter));
      setMessage(result.previewOpened ? "PDF\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      console.error(error);
      setMessage(kind === "pdf" ? "PDF \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." : "\uC778\uC1C4 \uC900\uBE44\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setBusy(null);
    }
  }, [categoryFilter, filteredWorkers.length]);

  return (
    <div className={`erp-worker-list-export ${className}`.trim()}>
      <div className="erp-worker-list-export-host" aria-hidden="true">
        <WorkerListSheet
          ref={sheetRef}
          workers={filteredWorkers}
          companyProfile={companyProfile}
          categoryFilterLabel={categoryFilterLabel}
        />
      </div>

      <div className="erp-worker-list-export-toolbar">
        <span className="erp-worker-list-export-label">
          <FileText size={15} aria-hidden="true" />
          {"\uC2DC\uACF5\uC790\uB9AC\uC2A4\uD2B8\uCD9C\uB825"}
        </span>

        <label className="erp-worker-list-export-category">
          <span className="erp-worker-list-export-category-label">{"\uAD6C\uBD84"}</span>
          <select
            className="erp-input erp-worker-list-export-category-select rounded-lg px-2 py-1.5 text-sm font-semibold"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as WorkerListCategoryFilter)}
            disabled={disabled || busy !== null}
          >
            {CATEGORY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="erp-worker-list-export-actions">
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
      {message ? <p className="erp-worker-list-export-message">{message}</p> : null}
    </div>
  );
}
