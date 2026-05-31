import React, { useCallback, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveGeneratedPdf, type PdfArchiveCategory, type PdfArchiveStatementView } from "@/utils/pdfArchive";
import { exportStatementSheetExcel, exportStatementSheetPdf, printStatementSheet } from "@/utils/statementExport";
import {
  downloadParsedTableExcel,
  exportDomTableExcel,
  exportDomTablePdf,
  exportParsedTablePdf,
  printDomTable,
  printParsedTable,
  safeExportFileName,
  type ParsedTable,
} from "@/utils/tableExport";

type PdfArchiveMetaInput = {
  category: PdfArchiveCategory;
  subjectName: string;
  periodStart?: string;
  periodEnd?: string;
  statementView?: PdfArchiveStatementView;
};

type TableExportSectionProps = {
  fileName: string;
  title?: string;
  disabled?: boolean;
  hidePdf?: boolean;
  className?: string;
  toolbarTabIndex?: number;
  tableSelector?: string;
  /** 내역서 전체([data-pdf-export-root])를 화면과 동일하게 내보낼 때 */
  exportRootSelector?: string;
  pdfArchiveMeta?: PdfArchiveMetaInput;
  getParsedTable?: () => ParsedTable | null;
  children: React.ReactNode;
};

export function TableExportToolbar({
  getTable,
  getExportRoot,
  getParsedTable,
  fileName,
  title,
  disabled = false,
  hidePdf = false,
  className = "",
  pdfArchiveMeta,
  toolbarTabIndex,
}: {
  getTable: () => HTMLTableElement | null;
  getExportRoot?: () => HTMLElement | null;
  getParsedTable?: () => ParsedTable | null;
  fileName: string;
  title?: string;
  disabled?: boolean;
  hidePdf?: boolean;
  className?: string;
  pdfArchiveMeta?: PdfArchiveMetaInput;
  toolbarTabIndex?: number;
}) {
  const [busy, setBusy] = useState<"pdf" | "excel" | "print" | null>(null);
  const [message, setMessage] = useState("");

  const exportTitle = title || fileName;
  const safeName = safeExportFileName(fileName);

  const runExport = useCallback(
    async (kind: "pdf" | "excel" | "print") => {
      const exportRoot = getExportRoot?.() || null;
      const table = getTable();
      const parsedTable = getParsedTable?.() || null;

      if (!exportRoot && !table && !parsedTable) {
        setMessage("표를 찾을 수 없습니다.");
        return;
      }

      setBusy(kind);
      setMessage("");

      try {
        if (exportRoot) {
          if (kind === "excel") {
            await exportStatementSheetExcel(exportRoot, safeName);
            return;
          }
          if (kind === "print") {
            await printStatementSheet(exportRoot);
            return;
          }
          const result = await exportStatementSheetPdf(exportRoot, safeName);
          if (pdfArchiveMeta) {
            try {
              await archiveGeneratedPdf(result, pdfArchiveMeta);
              setMessage(
                result.previewOpened
                  ? "PDF가 생성되었고 보관함에 저장되었습니다."
                  : "PDF가 다운로드·보관함 저장되었습니다."
              );
            } catch (archiveError) {
              console.error(archiveError);
              setMessage("PDF는 생성되었으나 보관함 저장에 실패했습니다.");
            }
          } else {
            setMessage(result.previewOpened ? "PDF가 생성되었습니다." : "PDF가 다운로드되었습니다.");
          }
          return;
        }

        if (parsedTable) {
          if (kind === "excel") {
            downloadParsedTableExcel(parsedTable, safeName);
            return;
          }
          if (kind === "print") {
            printParsedTable(parsedTable, exportTitle);
            return;
          }
          const result = await exportParsedTablePdf(parsedTable, safeName, exportTitle);
          setMessage(result.previewOpened ? "PDF가 생성되었습니다." : "PDF가 다운로드되었습니다.");
          return;
        }

        if (kind === "excel") {
          exportDomTableExcel(table!, safeName);
          return;
        }
        if (kind === "print") {
          printDomTable(table!, exportTitle);
          return;
        }
        const result = await exportDomTablePdf(table!, safeName, exportTitle);
        setMessage(result.previewOpened ? "PDF가 생성되었습니다." : "PDF가 다운로드되었습니다.");
      } catch (error) {
        console.error(error);
        setMessage(kind === "pdf" ? "PDF 생성에 실패했습니다." : kind === "excel" ? "엑셀 생성에 실패했습니다." : "인쇄 준비에 실패했습니다.");
      } finally {
        setBusy(null);
      }
    },
    [exportTitle, getExportRoot, getParsedTable, getTable, pdfArchiveMeta, safeName]
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
            tabIndex={toolbarTabIndex}
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
          tabIndex={toolbarTabIndex}
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
          tabIndex={toolbarTabIndex}
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
  exportRootSelector,
  pdfArchiveMeta,
  toolbarTabIndex,
  getParsedTable,
  children,
}: TableExportSectionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const getTable = useCallback(() => rootRef.current?.querySelector(tableSelector) as HTMLTableElement | null, [tableSelector]);
  const getExportRoot = useCallback(
    () => (exportRootSelector ? (rootRef.current?.querySelector(exportRootSelector) as HTMLElement | null) : null),
    [exportRootSelector]
  );

  return (
    <div className={`erp-table-export-section ${className}`.trim()} ref={rootRef}>
      <TableExportToolbar
        getTable={getTable}
        getExportRoot={exportRootSelector ? getExportRoot : undefined}
        getParsedTable={getParsedTable}
        fileName={fileName}
        title={title ?? fileName}
        disabled={disabled}
        hidePdf={hidePdf}
        pdfArchiveMeta={pdfArchiveMeta}
        toolbarTabIndex={toolbarTabIndex}
      />
      {children}
    </div>
  );
}
