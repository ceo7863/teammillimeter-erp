import React, { useCallback, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportDomTableExcel, exportDomTablePdf, printDomTable, safeExportFileName } from "@/utils/tableExport";

type TableExportSectionProps = {
  fileName: string;
  title?: string;
  disabled?: boolean;
  hidePdf?: boolean;
  className?: string;
  tableSelector?: string;
  children: React.ReactNode;
};

export function TableExportToolbar({
  getTable,
  fileName,
  title,
  disabled = false,
  hidePdf = false,
  className = "",
}: {
  getTable: () => HTMLTableElement | null;
  fileName: string;
  title?: string;
  disabled?: boolean;
  hidePdf?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState<"pdf" | "excel" | "print" | null>(null);
  const [message, setMessage] = useState("");

  const exportTitle = title || fileName;
  const safeName = safeExportFileName(fileName);

  const runExport = useCallback(
    async (kind: "pdf" | "excel" | "print") => {
      const table = getTable();
      if (!table) {
        setMessage("표를 찾을 수 없습니다.");
        return;
      }

      setBusy(kind);
      setMessage("");

      try {
        if (kind === "excel") {
          exportDomTableExcel(table, safeName);
          return;
        }
        if (kind === "print") {
          printDomTable(table, exportTitle);
          return;
        }
        const result = await exportDomTablePdf(table, safeName, exportTitle);
        setMessage(result.previewOpened ? "PDF가 생성되었습니다." : "PDF가 다운로드되었습니다.");
      } catch (error) {
        console.error(error);
        setMessage(kind === "pdf" ? "PDF 생성에 실패했습니다." : kind === "excel" ? "엑셀 생성에 실패했습니다." : "인쇄 준비에 실패했습니다.");
      } finally {
        setBusy(null);
      }
    },
    [exportTitle, getTable, safeName]
  );

  return (
    <div className={`erp-table-export-toolbar ${className}`.trim()}>
      <div className="erp-table-export-actions">
        {!hidePdf && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={disabled || busy !== null}
            onClick={() => runExport("pdf")}
          >
            {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            PDF
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          disabled={disabled || busy !== null}
          onClick={() => runExport("excel")}
        >
          {busy === "excel" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          엑셀
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          disabled={disabled || busy !== null}
          onClick={() => runExport("print")}
        >
          {busy === "print" ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
          인쇄
        </Button>
      </div>
      {message && <p className="erp-table-export-message">{message}</p>}
    </div>
  );
}

export function TableExportSection({
  fileName,
  title,
  disabled = false,
  hidePdf = false,
  className = "",
  tableSelector = "table",
  children,
}: TableExportSectionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const getTable = useCallback(() => rootRef.current?.querySelector(tableSelector) as HTMLTableElement | null, [tableSelector]);

  return (
    <div className={`erp-table-export-section ${className}`.trim()} ref={rootRef}>
      <TableExportToolbar
        getTable={getTable}
        fileName={fileName}
        title={title ?? fileName}
        disabled={disabled}
        hidePdf={hidePdf}
      />
      {children}
    </div>
  );
}
