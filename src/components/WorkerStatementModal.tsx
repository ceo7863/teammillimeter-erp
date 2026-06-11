import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Link2, X } from "lucide-react";
import { TeamChatShareButton } from "@/components/TeamChatShareButton";
import { buildWorkerStatementTeamChatLink } from "@/utils/teamChatLinks";
import { Button } from "@/components/ui/button";
import { WorkerStatementSheet } from "@/components/WorkerStatementSheet";
import { StatementA4Preview } from "@/components/StatementA4Preview";
import { TableExportToolbar } from "@/components/TableExportSection";
import { archiveGeneratedPdf, archivePdfAndCreateShareLink, copyTextToClipboard } from "@/utils/pdfArchive";
import { createPdfPreviewWindow, revokePdfBlobUrl } from "@/utils/statementPdf";
import { downloadWorkerStatementSheetPdf } from "@/utils/statementExport";
import {
  buildStatementPdfCacheKey,
  prefetchStatementPdf,
  resolveStatementPdf,
} from "@/utils/statementPdfCache";
import { dedupeStatementRowMemos } from "@/utils/statementSheets";
import { findWorkerPortalAck, type WorkerPortalStatementAck } from "@/utils/workerPortalAcknowledgment";
import { formatMonthLabel } from "@/utils/workerMonthlyPayments";
import {
  buildWorkerStatementSummary,
  formatKRW,
  sortWorkerPaymentRowsByDateDesc,
  type WorkerMasterLike,
  type WorkerPaymentDetailRow,
} from "@/utils/workerPayments";

function getMonthEndISO(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]), 0);
  return `${monthKey}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildStatementTotals(rows: WorkerPaymentDetailRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.basePay += row.basePay || 0;
      acc.overtime += row.overtime || 0;
      acc.lodging += row.lodging || 0;
      acc.meal += row.meal || 0;
      acc.expense += row.expense || 0;
      acc.totalPay += row.totalPay || 0;
      return acc;
    },
    { count: 0, basePay: 0, overtime: 0, lodging: 0, meal: 0, expense: 0, totalPay: 0 },
  );
}

type WorkerStatementModalProps = {
  workerName: string;
  monthKey: string;
  rows: WorkerPaymentDetailRow[];
  workerInfo?: WorkerMasterLike;
  workerPortalStatementAcks?: WorkerPortalStatementAck[];
  onClose: () => void;
};

export function WorkerStatementModal({
  workerName,
  monthKey,
  rows,
  workerInfo = {},
  workerPortalStatementAcks = [],
  onClose,
}: WorkerStatementModalProps) {
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [statementShareLink, setStatementShareLink] = useState("");
  const workerPrintRef = useRef<HTMLDivElement>(null);
  const pdfBlobUrlRef = useRef("");

  const displayRows = useMemo(
    () => sortWorkerPaymentRowsByDateDesc(dedupeStatementRowMemos(rows)),
    [rows],
  );
  const summary = useMemo(() => buildWorkerStatementSummary(rows, workerInfo), [rows, workerInfo]);
  const totals = useMemo(() => buildStatementTotals(rows), [rows]);
  const periodStart = `${monthKey}-01`;
  const periodEnd = getMonthEndISO(monthKey);
  const periodLabel = formatMonthLabel(monthKey);
  const safeName = workerName.replace(/[\\/:*?"<>|]/g, "_");
  const exportFileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uC2DC\uACF5\uC790_${safeName}_${monthKey}`;
  const exportTitle = `${periodLabel} ${workerName} \uC2DC\uACF5\uB0B4\uC5ED\uC11C`;
  const hasRows = displayRows.length > 0;
  const portalAck = useMemo(
    () =>
      workerInfo.id != null
        ? findWorkerPortalAck(workerPortalStatementAcks, workerInfo.id, monthKey)
        : null,
    [monthKey, workerInfo.id, workerPortalStatementAcks],
  );
  const portalAckConfirmed = Boolean(portalAck);

  useEffect(() => () => revokePdfBlobUrl(pdfBlobUrlRef.current), []);

  useEffect(() => {
    if (!hasRows) return;
    const timer = window.setTimeout(() => {
      const element = workerPrintRef.current;
      if (!element) return;
      const fileName = `${exportFileName}.pdf`;
      const cacheKey = buildStatementPdfCacheKey([
        "worker-payment",
        workerName,
        monthKey,
        displayRows.length,
      ]);
      prefetchStatementPdf(cacheKey, () =>
        downloadWorkerStatementSheetPdf(element, fileName, { deliver: false }),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [displayRows.length, exportFileName, hasRows, monthKey, workerName]);

  const shareWorkerStatementDownloadLink = async () => {
    if (!hasRows) {
      setPdfMessage("\uB9C1\uD06C\uB85C \uBCF4\uB0BC \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const element = workerPrintRef.current;
    if (!element) {
      setPdfMessage("PDF \uCD9C\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    const fileName = `${exportFileName}.pdf`;
    const cacheKey = buildStatementPdfCacheKey(["worker-payment", workerName, monthKey, displayRows.length]);

    setPdfGenerating(true);
    setPdfMessage("PDF \uC0DD\uC131 \uBC0F \uB9C1\uD06C \uC900\uBE44 \uC911...");
    setStatementShareLink("");

    try {
      const { result, fromCache } = await resolveStatementPdf(cacheKey, () =>
        downloadWorkerStatementSheetPdf(element, fileName, { deliver: false }),
      );
      pdfBlobUrlRef.current = result.blobUrl;
      setPdfMessage(fromCache ? "\uC11C\uBC84 \uC5C5\uB85C\uB4DC \uBC0F \uB9C1\uD06C \uC0DD\uC131 \uC911..." : "PDF \uC0DD\uC131 \uBC0F \uB9C1\uD06C \uC900\uBE44 \uC911...");

      const { shareLink } = await archivePdfAndCreateShareLink(result, {
        category: "statement-worker",
        subjectName: workerName,
        periodStart,
        periodEnd,
        statementTotalAmount: totals.totalPay,
        paymentStatus: "pending",
      });

      if (shareLink?.url) {
        setStatementShareLink(shareLink.url);
        const copied = await copyTextToClipboard(shareLink.url);
        setPdfMessage(
          copied
            ? "PDF\uAC00 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC6B4\uB85C\uB4DC \uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
            : "PDF\uAC00 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC544\uB798 \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD574 \uC8FC\uC138\uC694.",
        );
      } else {
        setPdfMessage("\uB9C1\uD06C\uBCF4\uB0B4\uAE30\uB294 \uC11C\uBC84 \uC5F0\uB3D9 \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4. PDF\uB294 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
      }
    } catch (error) {
      console.error(error);
      setPdfMessage(error instanceof Error ? error.message : "\uB9C1\uD06C\uBCF4\uB0B4\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
      setStatementShareLink("");
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleCopyStatementShareLink = async () => {
    if (!statementShareLink) return;
    try {
      const copied = await copyTextToClipboard(statementShareLink);
      setPdfMessage(copied ? "\uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : "\uB9C1\uD06C \uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      console.error(error);
      setPdfMessage("\uB9C1\uD06C \uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  };

  const generateWorkerPdf = async () => {
    if (!hasRows) {
      setPdfMessage("PDF\uB85C \uBCF4\uB0BC \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const element = workerPrintRef.current;
    if (!element) {
      setPdfMessage("PDF \uCD9C\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }

    const fileName = `${exportFileName}.pdf`;
    revokePdfBlobUrl(pdfBlobUrlRef.current);
    setPdfGenerating(true);
    setPdfMessage("PDF \uC0DD\uC131 \uC911\uC785\uB2C8\uB2E4...");
    pdfBlobUrlRef.current = "";

    const previewWindow = createPdfPreviewWindow();
    if (!previewWindow) {
      setPdfMessage("\uD31D\uC5C5\uC774 \uCC28\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uD31D\uC5C5 \uD5C8\uC6A9 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
    }

    try {
      const result = await downloadWorkerStatementSheetPdf(element, fileName, {
        previewWindow,
      });
      pdfBlobUrlRef.current = result.blobUrl;
      await archiveGeneratedPdf(result, {
        category: "statement-worker",
        subjectName: workerName,
        periodStart,
        periodEnd,
      });
      setPdfMessage(
        result.previewOpened
          ? "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uC5C8\uACE0 \uC0C8 \uD0ED\uC5D0\uC11C \uC5F4\uB838\uC2B5\uB2C8\uB2E4."
          : "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
      );
    } catch (error) {
      console.error(error);
      previewWindow?.close();
      setPdfMessage("PDF \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--statement"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-statement-modal-title"
      >
        <div className="erp-client-statement-modal-head">
          <div className="min-w-0">
            <h2 id="worker-statement-modal-title" className="text-base font-bold text-slate-900 md:text-lg">
              {"\uC2DC\uACF5\uB0B4\uC5ED\uC11C"}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">{workerName}</p>
            <p className="text-xs text-slate-500">
              {periodLabel} {"\u00B7"} {displayRows.length}
              {"\uAC74 \u00B7 \uC2E4\uC218\uB839 "}
              {formatKRW(summary.netPay)}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {!hasRows ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {"\uD574\uB2F9 \uC6D4\uC5D0 \uC2DC\uACF5 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
          </p>
        ) : (
          <>
            <div className="erp-statement-action-bar mt-4">
              <div className="erp-statement-action-group">
                <Button className="rounded-xl" disabled={pdfGenerating} onClick={() => void generateWorkerPdf()}>
                  <Download size={16} className="mr-1" />
                  {pdfGenerating ? "\uC0DD\uC131 \uC911..." : "PDF \uC0DD\uC131"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="erp-statement-share-link-btn rounded-xl"
                  disabled={pdfGenerating}
                  onClick={() => void shareWorkerStatementDownloadLink()}
                >
                  <Link2 size={16} className="mr-1" />
                  {pdfGenerating ? "..." : "\uB9C1\uD06C\uBCF4\uB0B4\uAE30"}
                </Button>
                <TeamChatShareButton
                  payload={{
                    link: buildWorkerStatementTeamChatLink({
                      workerName,
                      startDate: periodStart,
                      endDate: periodEnd,
                    }),
                  }}
                />
                <TableExportToolbar
                  className="erp-statement-export-toolbar"
                  getTable={() => workerPrintRef.current?.querySelector(".excel-data-table") as HTMLTableElement | null}
                  getExportRoot={() => workerPrintRef.current as HTMLElement | null}
                  fileName={exportFileName}
                  title={exportTitle}
                  hidePdf
                  disabled={!hasRows}
                />
              </div>
            </div>

            {pdfMessage && <p className="mt-3 text-sm text-slate-600">{pdfMessage}</p>}
            {statementShareLink && (
              <div className="erp-statement-share-link-row mt-3">
                <a
                  href={statementShareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="erp-statement-share-link-url"
                >
                  {statementShareLink}
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => void handleCopyStatementShareLink()}
                >
                  <Copy size={14} className="mr-1" />
                  {"\uB9C1\uD06C \uBCF5\uC0AC"}
                </Button>
              </div>
            )}

            <div className="erp-statement-preview-wrap mt-4 max-h-[min(70vh,720px)] overflow-auto">
              <StatementA4Preview
                layoutVersion={`w:${displayRows.length}:${displayRows.map((row) => row.id).join(",")}`}
              >
                <WorkerStatementSheet
                  ref={workerPrintRef}
                  workerName={workerName}
                  workerInfo={workerInfo}
                  periodStart={periodStart}
                  periodEnd={periodEnd}
                  summary={summary}
                  rows={displayRows}
                  totals={totals}
                  emptyMessage={"\uD45C\uC2DC\uD560 \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                  portalAckConfirmed={portalAckConfirmed}
                  portalSignatureDataUrl={portalAck?.signatureDataUrl}
                  portalSignatureConfirmedAt={portalAck?.confirmedAt}
                />
              </StatementA4Preview>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
