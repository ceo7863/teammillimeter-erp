import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Link2, X } from "lucide-react";
import { TeamChatShareButton } from "@/components/TeamChatShareButton";
import { buildClientStatementTeamChatLink } from "@/utils/teamChatLinks";
import { Button } from "@/components/ui/button";
import { ClientStatementSheet } from "@/components/ClientStatementSheet";
import { StatementA4Preview } from "@/components/StatementA4Preview";
import { TableExportToolbar } from "@/components/TableExportSection";
import { DEFAULT_COMPANY_PROFILE, type CompanyProfile } from "@/utils/companyProfile";
import { archiveGeneratedPdf, archivePdfAndCreateShareLink, copyTextToClipboard, sharePdfBlob } from "@/utils/pdfArchive";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import { formatKRW, getUnpaid, todayISO } from "@/utils/receivables";
import { createPdfPreviewWindow, downloadPdfFromHtmlElement, revokePdfBlobUrl } from "@/utils/statementPdf";
import {
  prefetchStatementPdfForElement,
  resolveStatementPdfForElement,
} from "@/utils/statementPdfCache";
import {
  appendStatementGenerationLog,
  createStatementGenerationLog,
  formatStatementGenerationPeriod,
  type StatementGenerationLog,
} from "@/utils/statementGenerationLogs";
import {
  fileOrLinkPdfArchiveToFolders,
  fileStatementLogToFolder,
  type StatementFolder,
} from "@/utils/statementFolders";
import {
  buildClientStatementDetailDisplayRows,
  buildClientStatementRows,
  buildClientStatementSummary,
  buildClientStatementSummaryDisplayRows,
} from "@/utils/statementSheets";
import { saleMatchesDraftIds, type StatementDraft } from "@/utils/statementDraft";

type ClientStatementModalProps = {
  draft: StatementDraft | null;
  onClose: () => void;
  sales: Array<Record<string, unknown>>;
  clientMaster?: Array<Record<string, unknown>>;
  companyProfile?: CompanyProfile;
  statementGenerationLogs?: StatementGenerationLog[];
  setStatementGenerationLogs?: React.Dispatch<React.SetStateAction<StatementGenerationLog[]>>;
  statementFolders?: StatementFolder[];
  setStatementFolders?: React.Dispatch<React.SetStateAction<StatementFolder[]>>;
  currentUser?: ErpUser | null;
};

function matchesClientName(row: Record<string, unknown>, clientName: string) {
  const rowClient = String(row.client || "").trim() || "(\uBBF8\uC9C0\uC815)";
  return rowClient === clientName;
}

export function ClientStatementModal({
  draft,
  onClose,
  sales,
  clientMaster = [],
  companyProfile = DEFAULT_COMPANY_PROFILE,
  statementGenerationLogs = [],
  setStatementGenerationLogs,
  setStatementFolders,
  currentUser = null,
}: ClientStatementModalProps) {
  const [clientStatementView, setClientStatementView] = useState<"summary" | "detail">("summary");
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [statementShareLink, setStatementShareLink] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const clientPrintRef = useRef<HTMLDivElement>(null);
  const pdfBlobUrlRef = useRef("");
  const loggedDraftTokenRef = useRef("");

  useEffect(() => () => revokePdfBlobUrl(pdfBlobUrlRef.current), []);

  const filteredSales = useMemo(() => {
    if (!draft) return [];
    const saleIds = draft.saleIds || [];
    return sales
      .filter((row) => matchesClientName(row, draft.client))
      .filter((row) => {
        const date = String(row.date || "");
        const startMatch = draft.startDate ? date >= draft.startDate : true;
        const endMatch = draft.endDate ? date <= draft.endDate : true;
        return startMatch && endMatch;
      })
      .filter((row) => {
        if (saleIds.length) return saleMatchesDraftIds(row as { id?: string | number }, saleIds);
        if (draft.unpaidOnly) return getUnpaid(row as never) > 0;
        return true;
      })
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(a.id || 0) - Number(b.id || 0));
  }, [draft, sales]);

  const clientRows = draft ? buildClientStatementRows(filteredSales as never[]) : [];
  const clientSummaryDisplayRows = draft ? buildClientStatementSummaryDisplayRows(filteredSales as never[]) : [];
  const clientDetailDisplayRows = draft ? buildClientStatementDetailDisplayRows(filteredSales as never[]) : [];
  const clientDisplayRows = clientStatementView === "detail" ? clientDetailDisplayRows : clientSummaryDisplayRows;
  const selectedClientInfo = clientMaster.find((row) => row.name === draft?.client) || {};
  const clientStatementSummary = buildClientStatementSummary(clientRows, selectedClientInfo as never);
  const periodLabel = draft ? formatStatementGenerationPeriod(draft.startDate, draft.endDate) : "";
  const exportFileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${draft?.client || "\uBBF8\uC120\uD0DD"}_${clientStatementView}`;
  const exportTitle = `\uAC70\uB798\uCC98 \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C (${clientStatementView === "detail" ? "\uC0C1\uC138" : "\uC694\uC57D"})`;
  const hasStatementData = clientRows.length > 0;

  useEffect(() => {
    if (!draft || !filteredSales.length || !setStatementGenerationLogs) return;
    const token = JSON.stringify(draft);
    if (loggedDraftTokenRef.current === token) return;
    loggedDraftTokenRef.current = token;
    setIssuedDate(todayISO());

    const log = createStatementGenerationLog({
      statementType: "client",
      subjectName: draft.client,
      startDate: draft.startDate,
      endDate: draft.endDate,
      clientStatementView: "summary",
      rowCount: filteredSales.length,
      createdBy: currentUser?.name || currentUser?.loginId || "",
    });
    setStatementGenerationLogs((prev) => appendStatementGenerationLog(prev, log));

    if (setStatementFolders) {
      const filedBy = currentUser?.name || currentUser?.loginId || "";
      setStatementFolders((prev) => fileStatementLogToFolder(prev, log, { filedBy }));
    }
  }, [draft, filteredSales.length, setStatementGenerationLogs, setStatementFolders, currentUser]);

  useEffect(() => {
    if (!draft) {
      loggedDraftTokenRef.current = "";
      setClientStatementView("summary");
      setPdfMessage("");
      setStatementShareLink("");
      setIssuedDate("");
    }
  }, [draft]);

  useEffect(() => {
    if (!draft || !hasStatementData) return;
    const timer = window.setTimeout(() => {
      const element = clientPrintRef.current;
      if (!element) return;
      const safeName = String(draft.client).replace(/[\\/:*?"<>|]/g, "_");
      const fileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${safeName}_${draft.startDate || "\uC804\uCCB4"}_${draft.endDate || "\uC804\uCCB4"}.pdf`;
      prefetchStatementPdfForElement(
        element,
        ["client-modal", draft.client, draft.startDate, draft.endDate, clientStatementView, filteredSales.length],
        () => downloadPdfFromHtmlElement(element, fileName, { orientation: "portrait", deliver: false })
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, hasStatementData, clientStatementView, filteredSales.length]);

  if (!draft) return null;

  const generatePdf = async () => {
    const element = clientPrintRef.current;
    if (!hasStatementData) {
      setPdfMessage("\uC0DD\uC131\uD560 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (!element) {
      setPdfMessage("PDF \uCD9C\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }

    const safeName = String(draft.client).replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${safeName}_${draft.startDate || "\uC804\uCCB4"}_${draft.endDate || "\uC804\uCCB4"}.pdf`;

    revokePdfBlobUrl(pdfBlobUrlRef.current);
    setPdfGenerating(true);
    setPdfMessage("PDF \uC0DD\uC131 \uC911\uC785\uB2C8\uB2E4...");
    pdfBlobUrlRef.current = "";

    const previewWindow = createPdfPreviewWindow();
    if (!previewWindow) {
      setPdfMessage("\uD31D\uC5C5\uC774 \uCC28\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uD31D\uC5C5 \uD5C8\uC6A9 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
    }

    try {
      const result = await downloadPdfFromHtmlElement(element, fileName, {
        orientation: "portrait",
        previewWindow,
      });
      pdfBlobUrlRef.current = result.blobUrl;
      const archived = await archiveGeneratedPdf(result, {
        category: "statement-client",
        subjectName: draft.client,
        periodStart: draft.startDate,
        periodEnd: draft.endDate,
        statementView: clientStatementView,
      });
      if (setStatementFolders) {
        const filedBy = currentUser?.name || currentUser?.loginId || "";
        setStatementFolders((prev) => fileOrLinkPdfArchiveToFolders(prev, statementGenerationLogs, archived, filedBy));
      }
      setPdfMessage(
        result.previewOpened
          ? "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uC5C8\uACE0 \uC0C8 \uD0ED\uC5D0\uC11C \uC5F4\uB838\uC2B5\uB2C8\uB2E4. \uBCF4\uAD00\uD568\uC5D0\uB3C4 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
          : "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uACE0 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
      );
    } catch (error) {
      console.error(error);
      previewWindow?.close();
      setPdfMessage("PDF \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const shareKakao = async () => {
    const element = clientPrintRef.current;
    if (!hasStatementData || !element) {
      setPdfMessage("\uCE74\uD1A1 \uBCF4\uB0B4\uAE30 \uC804\uC5D0 \uB0B4\uC5ED\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    const safeName = String(draft.client).replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${safeName}_${draft.startDate || "\uC804\uCCB4"}_${draft.endDate || "\uC804\uCCB4"}.pdf`;

    revokePdfBlobUrl(pdfBlobUrlRef.current);
    setPdfGenerating(true);
    setPdfMessage("\uCE74\uD1A1 \uBCF4\uB0B4\uAE30 \uC900\uBE44 \uC911...");
    pdfBlobUrlRef.current = "";

    try {
      const result = await downloadPdfFromHtmlElement(element, fileName, {
        orientation: "portrait",
        deliver: false,
      });
      pdfBlobUrlRef.current = result.blobUrl;
      const archived = await archiveGeneratedPdf(result, {
        category: "statement-client",
        subjectName: draft.client,
        periodStart: draft.startDate,
        periodEnd: draft.endDate,
        statementView: clientStatementView,
      });
      if (setStatementFolders) {
        const filedBy = currentUser?.name || currentUser?.loginId || "";
        setStatementFolders((prev) => fileOrLinkPdfArchiveToFolders(prev, statementGenerationLogs, archived, filedBy));
      }
      const shareResult = await sharePdfBlob(result.blob, fileName);
      setPdfMessage(shareResult.message);
    } catch (error) {
      console.error(error);
      setPdfMessage("\uCE74\uD1A1 \uBCF4\uB0B4\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const shareStatementDownloadLink = async () => {
    const element = clientPrintRef.current;
    if (!hasStatementData) {
      setPdfMessage("\uB9C1\uD06C \uBCF4\uB0B4\uAE30 \uC804\uC5D0 \uB0B4\uC5ED\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (!element) {
      setPdfMessage("PDF \uCD9C\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }

    const safeName = String(draft.client).replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${safeName}_${draft.startDate || "\uC804\uCCB4"}_${draft.endDate || "\uC804\uCCB4"}.pdf`;

    setPdfGenerating(true);
    setPdfMessage("PDF \uC0DD\uC131 \uBC0F \uB9C1\uD06C \uC900\uBE44 \uC911...");
    setStatementShareLink("");

    try {
      const { result, fromCache } = await resolveStatementPdfForElement(
        element,
        ["client-modal", draft.client, draft.startDate, draft.endDate, clientStatementView, filteredSales.length],
        () =>
          downloadPdfFromHtmlElement(element, fileName, {
            orientation: "portrait",
            deliver: false,
          }),
        { bypassCache: true }
      );
      pdfBlobUrlRef.current = result.blobUrl;
      setPdfMessage(fromCache ? "\uC11C\uBC84 \uC5C5\uB85C\uB4DC \uBC0F \uB9C1\uD06C \uC0DD\uC131 \uC911..." : "PDF \uC0DD\uC131 \uBC0F \uB9C1\uD06C \uC900\uBE44 \uC911...");

      const { archived, shareLink } = await archivePdfAndCreateShareLink(result, {
        category: "statement-client",
        subjectName: draft.client,
        periodStart: draft.startDate,
        periodEnd: draft.endDate,
        statementView: clientStatementView,
        statementTotalAmount: clientStatementSummary.grandTotal,
        paymentStatus: "pending",
        statementSalesIds: filteredSales.map((row) => row.id).filter((id) => id != null && id !== "") as Array<string | number>,
      });
      if (setStatementFolders) {
        const filedBy = currentUser?.name || currentUser?.loginId || "";
        setStatementFolders((prev) => fileOrLinkPdfArchiveToFolders(prev, statementGenerationLogs, archived, filedBy));
      }

      if (shareLink?.url) {
        setStatementShareLink(shareLink.url);
        const copied = await copyTextToClipboard(shareLink.url);
        setPdfMessage(
          copied
            ? "PDF\uAC00 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC6B4\uB85C\uB4DC \uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCE74\uD1A1 \uB4F1\uC5D0 \uBD99\uC5EC \uB123\uC73C\uC138\uC694."
            : "PDF\uAC00 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC6B4\uB85C\uB4DC \uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. (\uC790\uB3D9 \uBCF5\uC0AC\uAC00 \uC9C0\uC6D0\uB418\uC9C0 \uC54A\uC544 \uC544\uB798 \uB9C1\uD06C\uB97C \uC9C1\uC811 \uBCF5\uC0AC\uD574 \uC8FC\uC138\uC694.)",
        );
      } else {
        setPdfMessage("\uB9C1\uD06C \uBCF4\uB0B4\uAE30\uB294 \uC11C\uBC84 \uC5F0\uB3D9 \uBAA8\uB4DC\uC5D0\uC11C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4. PDF\uB294 \uBCF4\uB0B8\uB0B4\uC5ED\uC11C\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
      }
    } catch (error) {
      console.error(error);
      setPdfMessage(error instanceof Error ? error.message : "\uB9C1\uD06C \uBCF4\uB0B4\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
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

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--statement"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-statement-modal-title"
      >
        <div className="erp-client-statement-modal-head">
          <div className="min-w-0">
            <h2 id="client-statement-modal-title" className="text-base font-bold text-slate-900 md:text-lg">
              {"\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C"}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-700">{draft.client}</p>
            <p className="text-xs text-slate-500">
              {periodLabel} {"\u00B7"} {filteredSales.length}
              {"\uAC74"}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {!hasStatementData ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {"\uC120\uD0DD\uD55C \uC870\uAC74\uC5D0 \uD574\uB2F9\uD558\uB294 \uC804\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
          </p>
        ) : (
          <>
            <div className="erp-statement-action-bar mt-4">
              <div className="erp-statement-view-toggle">
                <button
                  type="button"
                  onClick={() => setClientStatementView("summary")}
                  className={`erp-statement-view-btn ${clientStatementView === "summary" ? "is-active" : ""}`}
                >
                  {"\uC694\uC57D"}
                </button>
                <button
                  type="button"
                  onClick={() => setClientStatementView("detail")}
                  className={`erp-statement-view-btn ${clientStatementView === "detail" ? "is-active" : ""}`}
                >
                  {"\uC0C1\uC138"}
                </button>
              </div>

              <div className="erp-statement-action-group">
                <Button className="rounded-xl" disabled={pdfGenerating} onClick={() => void generatePdf()}>
                  <Download size={16} className="mr-1" />
                  {pdfGenerating ? "\uC0DD\uC131 \uC911..." : "PDF \uC0DD\uC131"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="erp-statement-share-link-btn rounded-xl"
                  disabled={pdfGenerating}
                  onClick={() => void shareStatementDownloadLink()}
                >
                  <Link2 size={16} className="mr-1" />
                  {pdfGenerating ? "..." : "\uB9C1\uD06C\uBCF4\uB0B4\uAE30"}
                </Button>
                <Button
                  type="button"
                  className="erp-pdf-archive-kakao-btn rounded-xl"
                  disabled={pdfGenerating}
                  onClick={() => void shareKakao()}
                >
                  {pdfGenerating ? "..." : "\uCE74\uD1A1 \uBCF4\uB0B4\uAE30"}
                </Button>
                <TeamChatShareButton
                  payload={{
                    link: buildClientStatementTeamChatLink({
                      client: draft.client,
                      startDate: draft.startDate,
                      endDate: draft.endDate,
                    }),
                  }}
                />
                <TableExportToolbar
                  className="erp-statement-export-toolbar"
                  getTable={() => clientPrintRef.current?.querySelector(".excel-data-table") as HTMLTableElement | null}
                  getExportRoot={() => clientPrintRef.current as HTMLElement | null}
                  fileName={exportFileName}
                  title={exportTitle}
                  hidePdf
                  disabled={!hasStatementData}
                />
              </div>
            </div>

            {pdfMessage || statementShareLink ? (
              <div className="erp-statement-status-row mt-3">
                {pdfMessage ? <p className="erp-statement-pdf-message">{pdfMessage}</p> : null}
                {statementShareLink ? (
                  <div className="erp-statement-share-link-row">
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
                ) : null}
              </div>
            ) : null}

            <div className="erp-statement-preview-wrap erp-client-statement-modal-preview">
              <StatementA4Preview
                layoutVersion={`modal:c:${clientStatementView}:${clientDisplayRows.length}:${clientDisplayRows.map((row) => row.id).join(",")}`}
              >
                <ClientStatementSheet
                  ref={clientPrintRef}
                  clientName={draft.client}
                  clientInfo={selectedClientInfo as never}
                  companyProfile={companyProfile}
                  periodStart={draft.startDate || String(clientRows[0]?.date || "")}
                  periodEnd={draft.endDate || String(clientRows[clientRows.length - 1]?.date || "")}
                  issuedDate={issuedDate || undefined}
                  summary={clientStatementSummary}
                  rows={clientDisplayRows}
                  emptyMessage={"\uC120\uD0DD\uD55C \uAE30\uAC04\uC5D0 \uD574\uB2F9 \uAC70\uB798\uCC98 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                />
              </StatementA4Preview>
            </div>

            <div className="erp-client-statement-modal-metrics mt-3">
              <span>
                {"\uC2DC\uACF5\uBE44 "}
                {formatKRW(clientStatementSummary.totalConstructionCost)}
              </span>
              <span>
                {"\uACF5\uAE09\uAC00 "}
                {formatKRW(clientStatementSummary.subtotal)}
              </span>
              <span>
                {"\uD569\uACC4 "}
                {formatKRW(clientStatementSummary.grandTotal)}
              </span>
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            {"\uB2EB\uAE30"}
          </Button>
        </div>
      </div>
    </div>
  );
}
