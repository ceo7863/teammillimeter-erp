import React, { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { PdfArchivePage } from "@/components/PdfArchivePage";
import { ChevronDown, ChevronRight, Copy, Download, Eye, FileText, Files, FolderInput, History, Link2, RotateCcw, Search, Trash2 } from "lucide-react";
import { TeamChatShareButton } from "@/components/TeamChatShareButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientStatementSheet } from "@/components/ClientStatementSheet";
import { WorkerStatementSheet } from "@/components/WorkerStatementSheet";
import { StatementA4Preview } from "@/components/StatementA4Preview";
import { TableExportToolbar } from "@/components/TableExportSection";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { DEFAULT_COMPANY_PROFILE, type CompanyProfile } from "@/utils/companyProfile";
import { confirmDelete } from "@/utils/confirmDelete";
import { archiveGeneratedPdf, archivePdfAndCreateShareLink, copyTextToClipboard, getPdfArchiveRecord, listPdfArchives, openPdfBlobInNewTab, sharePdfBlob } from "@/utils/pdfArchive";
import { isApiModeEnabled, type ErpUser } from "@/utils/erpApi";
import type { TaxInvoice } from "@/utils/taxInvoices";
import type { ClientMasterLike } from "@/utils/clientMaster";
import { isClientActive } from "@/utils/clientMaster";
import { normalizeClientContacts } from "@/utils/clientContacts";
import { createPdfPreviewWindow, downloadPdfFromHtmlElement, revokePdfBlobUrl } from "@/utils/statementPdf";
import {
  prefetchStatementPdfForElement,
  resolveStatementPdfForElement,
} from "@/utils/statementPdfCache";
import {
  appendStatementGenerationLog,
  appendStatementGenerationLogs,
  createStatementGenerationLog,
  removeStatementGenerationLog,
  formatStatementGenerationDateTime,
  formatStatementGenerationPeriod,
  formatStatementGenerationTypeLabel,
  formatStatementGenerationViewLabel,
  type StatementGenerationLog,
} from "@/utils/statementGenerationLogs";
import {
  fileStatementLogToFolder,
  fileStatementLogsToFolders,
  autoFileGenerationLogsToFolders,
  filterAndSortStatementFolders,
  findFolderItemByLogId,
  findMatchingPdfArchive,
  getStatementFolderStats,
  isGenerationLogFullyFiled,
  fileOrLinkPdfArchiveToFolders,
  makeStatementFolderId,
  removeStatementFolderItem,
  removeStatementFolder,
  type StatementFolder,
  type StatementFolderItem,
  type StatementFolderSort,
} from "@/utils/statementFolders";
import {
  buildClientStatementTeamChatLink,
  buildWorkerStatementTeamChatLink,
} from "@/utils/teamChatLinks";
import {
  buildClientStatementDetailDisplayRows,
  buildClientStatementRows,
  buildClientStatementSummary,
  buildClientStatementSummaryDisplayRows,
  dedupeStatementRowMemos,
  listClientsWithStatementRows,
} from "@/utils/statementSheets";
import {
  buildWorkerStatementSummary,
  listWorkersWithPaymentRows,
  sortWorkerPaymentRowsByDate,
  type SaleLike,
} from "@/utils/workerPayments";
import type { WorkerMonthlyPaymentRecord } from "@/utils/workerMonthlyPayments";
import type { WorkerPayWithVatLearnRule } from "@/utils/workerMonthlyActualPayments";
import { getUnpaid, parseMoney, todayISO } from "@/utils/receivables";
import {
  clearStatementDraftStash,
  peekStatementDraft,
  saleMatchesDraftIds,
  type StatementDraft,
} from "@/utils/statementDraft";
import {
  readStoredStatementTab,
  storeStatementTab,
  type StatementHubTab,
} from "@/utils/statementHub";

const L = {
  pageTitle: "\uB0B4\uC5ED\uC11C",
  pageDesc: "\uB0B4\uC5ED\uC11C \uC0DD\uC131\u00B7PDF, \uC0DD\uC131 \uAE30\uB85D\u00B7\uC5C5\uCCB4 \uD3F4\uB354, PDF \uBCF4\uAD00\uD568\uC744 \uD55C \uBA54\uB274\uC5D0\uC11C \uC804\uD658\uD569\uB2C8\uB2E4.",
  tabCreate: "\uB0B4\uC5ED\uC11C \uC0DD\uC131",
  tabArchive: "\uC0DD\uC131 \uAE30\uB85D \u00B7 \uD3F4\uB354",
  tabPdf: "PDF \uBCF4\uAD00\uD568",
  archiveTabDesc: "\uCD5C\uADFC \uC0DD\uC131 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uAC70\uB098 \uC5C5\uCCB4\uBCC4 \uD3F4\uB354\uC5D0\uC11C \uC800\uC7A5\uB41C \uB0B4\uC5ED\uC11C\uB97C \uAD00\uB9AC\uD529\uB2C8\uB2E4.",
  historyEmpty: "\uC544\uC9C1 \uC0DD\uC131 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uB0B4\uC5ED\uC11C \uC0DD\uC131 \uD0ED\uC5D0\uC11C \uB0B4\uC5ED\uC11C\uB97C \uB9CC\uB4E0 \uB4A4 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.",
  step1: "\uC870\uAC74 \uC120\uD0DD",
  step2: "\uB0B4\uC5ED\uC11C \uD655\uC778 \u00B7 \uB0B4\uBCF4\uB0B4\uAE30",
  tabClient: "\uAC70\uB798\uCC98 \u00B7 \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C",
  tabWorker: "\uC2DC\uACF5\uC790 \u00B7 \uC2DC\uACF5\uB0B4\uC5ED\uC11C",
  startDate: "\uC2DC\uC791\uC77C",
  endDate: "\uC885\uB8CC\uC77C",
  client: "\uAC70\uB798\uCC98",
  worker: "\uC2DC\uACF5\uC790",
  searchClient: "\uAC70\uB798\uCC98 \uAC80\uC0C9",
  searchWorker: "\uC2DC\uACF5\uC790 \uAC80\uC0C9",
  resetPeriod: "\uAE30\uAC04 \uCD08\uAE30\uD654",
  generate: "\uB0B4\uC5ED\uC11C \uC0DD\uC131",
  batchGenerate: "\uC77C\uAD04 \uC0DD\uC131",
  batchGenerateEmptyWorker: "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uAC70\uB798 \uB0B4\uC5ED\uC774 \uC788\uB294 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  batchGenerateEmptyClient: "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uAC70\uB798 \uB0B4\uC5ED\uC774 \uC788\uB294 \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  batchGenerateConfirmWorker: (count: number, period: string) =>
    `\uC120\uD0DD \uAE30\uAC04(${period})\uC5D0 \uAC70\uB798\uAC00 \uC788\uB294 \uC2DC\uACF5\uC790 ${count}\uBA85\uC758 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uC0DD\uC131 \uAE30\uB85D\uC744 \uCD94\uAC00\uD560\uAE4C\uC694?`,
  batchGenerateConfirmClient: (count: number, period: string) =>
    `\uC120\uD0DD \uAE30\uAC04(${period})\uC5D0 \uAC70\uB798\uAC00 \uC788\uB294 \uAC70\uB798\uCC98 ${count}\uACF3\uC758 \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C \uC0DD\uC131 \uAE30\uB85D\uC744 \uCD94\uAC00\uD560\uAE4C\uC694?`,
  batchGenerateDoneWorker: (count: number) =>
    `${count}\uBA85\uC758 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uC0DD\uC131 \uAE30\uB85D\uC774 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCD5C\uADFC \uC0DD\uC131 \uAE30\uB85D\uC5D0\uC11C \uBD88\uB7EC\uC624\uAE30\uB85C \uAC01 \uB0B4\uC5ED\uC11C\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
  batchGenerateDoneClient: (count: number) =>
    `${count}\uACF3\uC758 \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C \uC0DD\uC131 \uAE30\uB85D\uC774 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCD5C\uADFC \uC0DD\uC131 \uAE30\uB85D\uC5D0\uC11C \uBD88\uB7EC\uC624\uAE30\uB85C \uAC01 \uB0B4\uC5ED\uC11C\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`,
  historyTitle: "\uCD5C\uADFC \uB0B4\uC5ED\uC11C \uC0DD\uC131 \uAE30\uB85D (10\uAC74)",
  restore: "\uBD88\uB7EC\uC624\uAE30",
  remove: "\uC0AD\uC81C",
  removeConfirm: "\uC774 \uB0B4\uC5ED\uC11C \uC0DD\uC131 \uAE30\uB85D\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?",
  fileToFolder: "\uD3F4\uB354",
  fileToFolderDone: "\uC644\uB8CC",
  fileLinkPdf: "PDF",
  batchFileToFolder: "\uC77C\uAD04 \uC815\uB9AC",
  batchFileConfirm: (count: number) =>
    `\uC544\uC9C1 \uD3F4\uB354\uC5D0 \uC815\uB9AC\uB418\uC9C0 \uC54A\uC740 \uB0B4\uC5ED\uC11C ${count}\uAC74\uC744 \uAC70\uB798\uCC98\u00B7\uC2DC\uACF5\uC790 \uD3F4\uB354\uB85C \uC77C\uAD04 \uC815\uB9AC\uD560\uAE4C\uC694?`,
  batchFileDone: (filed: number, pdfLinked: number, skipped: number) =>
    `${filed}\uAC74\uC744 \uC5C5\uCCB4 \uD3F4\uB354\uB85C \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4.${pdfLinked ? ` PDF \uC5F0\uACB0 ${pdfLinked}\uAC74.` : ""}${skipped ? ` \uC774\uBBF8 \uC815\uB9AC\uB428 ${skipped}\uAC74 \uC81C\uC678.` : ""}`,
  batchFileEmpty: "\uC815\uB9AC\uD560 \uB0B4\uC5ED\uC11C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC774\uBBF8 \uBAA8\uB450 \uD3F4\uB354\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  foldersTitle: "\uC5C5\uCCB4\uBCC4 \uB0B4\uC5ED\uC11C \uD3F4\uB354",
  foldersClientTitle: "\uAC70\uB798\uCC98",
  foldersWorkerTitle: "\uC2DC\uACF5\uC790",
  foldersDesc: "\uCD5C\uADFC \uC0DD\uC131 \uAE30\uB85D\uC5D0\uC11C \uC815\uB9AC\uD558\uBA74 \uC5C5\uCCB4\uBCC4 \uD3F4\uB354\uAC00 \uC0DD\uC131\uB429\uB2C8\uB2E4.",
  folderEmpty: "\uC544\uC9C1 \uD3F4\uB354\uC5D0 \uC800\uC7A5\uB41C \uB0B4\uC5ED\uC11C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  folderPdfLinked: "\uC5C5\uCCB4 \uD3F4\uB354\uB85C \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4. PDF\uAC00 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  folderMetaOnly: "\uC5C5\uCCB4 \uD3F4\uB354\uB85C \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4. PDF\uAC00 \uC5C6\uC73C\uBA74 \uB0B4\uC5ED\uC11C\uB97C \uBD88\uB7EC\uC628 \uB4A4 PDF \uC0DD\uC131 \uC2DC \uC790\uB3D9 \uC5F0\uACB0\uB429\uB2C8\uB2E4.",
  folderSaveFailed: "\uD3F4\uB354 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  folderAlreadyFiled: "\uC774\uBBF8 \uD3F4\uB354\uC5D0 \uC800\uC7A5\uB41C \uAE30\uB85D\uC785\uB2C8\uB2E4.",
  folderOpenPdf: "PDF",
  folderOpenStatement: "\uB0B4\uC5ED\uC11C \uC5F4\uAE30",
  folderNoPdf: "\uBBF8\uC5F0\uACB0",
  folderSearch: "\uC5C5\uCCB4\u00B7\uAE30\uAC04\u00B7\uB2F4\uB2F9\uC790 \uAC80\uC0C9",
  folderFilterAll: "\uC804\uCCB4",
  folderFilterClient: "\uAC70\uB798\uCC98",
  folderFilterWorker: "\uC2DC\uACF5\uC790",
  folderSortUpdated: "\uCD5C\uADFC \uC218\uC815",
  folderSortName: "\uC774\uB984\uC21C",
  folderSortItems: "\uB0B4\uC5ED \uB9CE\uC740\uC21C",
  folderExpandAll: "\uD3BC\uCE58\uAE30",
  folderCollapseAll: "\uC811\uAE30",
  folderStats: (folders: number, items: number, clients: number, workers: number) =>
    `\uCD1D ${folders}\uAC1C \uC5C5\uCCB4 \u00B7 ${items}\uAC74 \u00B7 \uAC70\uB798\uCC98 ${clients} \u00B7 \uC2DC\uACF5\uC790 ${workers}`,
  folderNoMatch: "\uAC80\uC0C9 \uC870\uAC74\uC5D0 \uB9DE\uB294 \uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  folderColumnEmptyClient: "\uAC70\uB798\uCC98 \uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  folderColumnEmptyWorker: "\uC2DC\uACF5\uC790 \uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  folderRemoveItem: "\uD3F4\uB764\uC5D0\uC11C \uC81C\uAC70",
  folderRemoveConfirm: "\uC774 \uB0B4\uC5ED\uC11C\uB97C \uD3F4\uB764\uC5D0\uC11C \uC81C\uAC70\uD560\uAE4C\uC694?",
  folderRemoveFolder: "\uD3F4\uB354 \uC0AD\uC81C",
  folderRemoveFolderConfirm: (name: string, count: number) =>
    `"${name}" \uD3F4\uB354\uC640 \uC548\uC758 \uB0B4\uC5ED ${count}\uAC74\uC744 \uBAA8\uB450 \uC0AD\uC81C\uD560\uAE4C\uC694?`,
  folderFolderRemoved: "\uD3F4\uB354\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.",
  folderRemoved: "\uD3F4\uB764\uC5D0\uC11C \uC81C\uAC70\uD588\uC2B5\uB2C8\uB2E4.",
  folderLastUpdated: "\uCD5C\uADFC",
  emptyTitle: "\uC544\uC9C1 \uC0DD\uC131\uB41C \uB0B4\uC5ED\uC11C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyBodyPrefix: "\uC640 \uAE30\uAC04\uC744 \uC120\uD0DD\uD55C \uB2E4\uC74C ",
  emptyBodySuffix: "\uC744 \uB20C\uB7EC \uC8FC\uC138\uC694.",
  clientSheetTitle: "\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C",
  workerSheetTitle: "\uC2DC\uACF5\uB0B4\uC5ED\uC11C(\uAC1C\uC778)",
  summary: "\uC694\uC57D",
  detail: "\uC0C1\uC138",
  pdfGenerating: "PDF \uC0DD\uC131 \uC911...",
  pdfGenerate: "PDF \uC0DD\uC131",
  shareLink: "\uB9C1\uD06C\uBCF4\uB0B4\uAE30",
  shareLinkPreparing: "PDF \uC0DD\uC131 \uBC0F \uB9C1\uD06C \uC900\uBE44 \uC911...",
  shareLinkReady: "PDF\uAC00 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC6B4\uB85C\uB4DC \uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCE74\uD1A1 \uB4F1\uC5D0 \uBD99\uC5EC \uB123\uC73C\uC138\uC694.",
  shareLinkCopy: "\uB9C1\uD06C \uBCF5\uC0AC",
  shareLinkCopied: "\uB9C1\uD06C\uAC00 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  shareKakao: "\uCE74\uD1A1",
  shareKakaoPreparing: "\uCE74\uD1A1 \uBCF4\uB0B4\uAE30 \uC900\uBE44 \uC911...",
  count: "\uAC74\uC218",
  total: "\uD569\uACC4",
  vat: "\uBD80\uAC00\uC138",
  grandTotal: "\uCD1D\uD569\uACC4",
  grossPay: "\uC9C0\uAE09\uD569\uACC4",
  fee: "\uC218\uC218\uB8CC",
  netPay: "\uC2E4\uC218\uB839",
  noManager: "\uB2F4\uB2F9\uC790 \uC5C6\uC74C",
  noPhone: "\uC5F0\uB77D\uCC98 \uC5C6\uC74C",
  noBank: "\uC740\uD589 \uBBF8\uB4F1\uB85D",
  emptyClientRows: "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uD574\uB2F9 \uAC70\uB798\uCC98 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyWorkerRows: "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uD574\uB2F9 \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  detailHint: "\uD604\uC7A5\uBCC4 \uCD1D\uC2DC\uACF5\uBE44 \u00B7 \uC2DC\uACF5\uC790\uBCC4 \uCCAD\uAD6C\uB2E8\uAC00(\uC6D0\uC2DC\uACF5\uBE44) \uC0C1\uC138 \uD45C\uC2DC",
  summaryHint: "\uC804\uD45C\uBCC4 \uC694\uC57D \u00B7 \uD604\uC7A5 \uC544\uB798 \uC2DC\uACF5\uC790\uBA85(\uCCAD\uAD6C\uB2E8\uAC00) \uD45C\uC2DC",
  countUnit: "\uAC74",
  peopleUnit: "\uBA85",
  unpaidOnlyBadge: "\uBBF8\uC218 \uC804\uD45C\uB9CC",
  unpaidOnlyHint: (count: number) => `\uBBF8\uC218 \uC804\uD45C ${count}${"\uAC74"}\uB9CC \uD3EC\uD568\uD569\uB2C8\uB2E4.`,
  noUnpaidRows: "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uBBF8\uC218 \uC804\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

function PageTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h1 className="erp-text-page-title">{title}</h1>
      <p className="mt-1 erp-text-body text-slate-500">{desc}</p>
    </div>
  );
}

function StatementStepBadge({ step, label }: { step: number; label: string }) {
  return (
    <div className="erp-statement-step-badge">
      <span className="erp-statement-step-num">{step}</span>
      <span className="erp-statement-step-label">{label}</span>
    </div>
  );
}

function StatementMetricChip({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="erp-statement-metric-chip">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input({
  className = "",
  lang,
  type,
  value,
  onChange,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  if (type === "date") {
    return <KoreanDateInput className={className} value={value ?? ""} onChange={onChange} {...props} />;
  }
  const skipKoLang = type === "number";
  return (
    <input
      {...props}
      type={type}
      value={value}
      onChange={onChange}
      lang={lang ?? (skipKoLang ? undefined : "ko")}
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

function calculateWorkerLine(line: {
  quantity?: string;
  unitCost?: string;
  meal?: string;
  lodging?: string;
  accommodation?: string;
  room?: string;
  expense?: string;
  extraExpense?: string;
  overtimeHours?: string;
  overtimeCost?: string;
}) {
  const quantity = parseMoney(line.quantity || "1") || 1;
  const unitCost = parseMoney(line.unitCost);
  const meal = parseMoney(line.meal);
  const lodging = parseMoney(line.lodging || line.accommodation || line.room);
  const expense = parseMoney(line.expense || line.extraExpense);
  const overtime = parseMoney(line.overtimeHours) * (parseMoney(line.overtimeCost) || 30000);
  const spend = quantity * unitCost + meal + lodging + expense + overtime;
  return { spend };
}

function matchesClientName(row: Record<string, unknown>, clientName: string) {
  const rowClient = String(row.client || "").trim() || "(\uBBF8\uC9C0\uC815)";
  return rowClient === clientName;
}

function matchesStatementContactFilter(row: Record<string, unknown>, contactFilter: "" | "unset" | string) {
  const rowContactId = String(row.contactId || "").trim();
  if (!contactFilter) return true;
  if (contactFilter === "unset") return !rowContactId;
  return rowContactId === String(contactFilter).trim();
}

function formatKRW(value: number) {
  return `${Math.round(value || 0).toLocaleString("ko-KR")}\uC6D0`;
}

const STATEMENT_TAB_ITEMS: Array<{ key: StatementHubTab; labelKey: "tabCreate" | "tabArchive" | "tabPdf" }> = [
  { key: "create", labelKey: "tabCreate" },
  { key: "archive", labelKey: "tabArchive" },
  { key: "pdf", labelKey: "tabPdf" },
];

function FolderSearchInput({
  query,
  setQuery,
  placeholder,
}: {
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="erp-statement-folder-search">
      <Search size={14} className="shrink-0 text-slate-400" />
      <input
        lang="ko"
        className="erp-input w-full bg-transparent outline-none"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

type PendingWorkerStatementFilter = {
  workerName: string;
  startDate: string;
  endDate: string;
  autoGenerate?: boolean;
};

type StatementsPageProps = {
  sales: Array<Record<string, unknown>>;
  clientMaster?: Array<Record<string, unknown>>;
  workerMaster?: Array<Record<string, unknown>>;
  companyProfile?: CompanyProfile;
  statementGenerationLogs?: StatementGenerationLog[];
  setStatementGenerationLogs?: React.Dispatch<React.SetStateAction<StatementGenerationLog[]>>;
  statementFolders?: StatementFolder[];
  setStatementFolders?: React.Dispatch<React.SetStateAction<StatementFolder[]>>;
  currentUser?: ErpUser | null;
  draft?: StatementDraft | null;
  onDraftConsumed?: () => void;
  pendingWorkerStatementFilter?: PendingWorkerStatementFilter | null;
  onPendingWorkerStatementFilterConsumed?: () => void;
  pendingPdfArchiveNav?: { query?: string; startDate?: string; endDate?: string } | null;
  onPendingPdfArchiveNavConsumed?: () => void;
  bankTransactions?: ComponentProps<typeof PdfArchivePage>["bankTransactions"];
  workerPaymentRecords?: WorkerMonthlyPaymentRecord[];
  workerPayWithVatLearnRules?: WorkerPayWithVatLearnRule[];
  isPageActive?: boolean;
  taxInvoices?: TaxInvoice[];
  setTaxInvoices?: React.Dispatch<React.SetStateAction<TaxInvoice[]>>;
  erpVersion?: number;
  onTaxInvoiceIssued?: (payload: {
    taxInvoices: TaxInvoice[];
    version?: number;
    message?: string;
  }) => void | Promise<void>;
};

export function StatementsPage({
  sales,
  clientMaster = [],
  workerMaster = [],
  companyProfile = DEFAULT_COMPANY_PROFILE,
  statementGenerationLogs = [],
  setStatementGenerationLogs,
  statementFolders = [],
  setStatementFolders,
  currentUser = null,
  draft = null,
  onDraftConsumed,
  pendingWorkerStatementFilter = null,
  onPendingWorkerStatementFilterConsumed,
  pendingPdfArchiveNav = null,
  onPendingPdfArchiveNavConsumed,
  bankTransactions = [],
  workerPaymentRecords = [],
  workerPayWithVatLearnRules = [],
  isPageActive = true,
  taxInvoices = [],
  setTaxInvoices,
  erpVersion = 0,
  onTaxInvoiceIssued,
}: StatementsPageProps) {
  const [statementType, setStatementType] = useState("client");
  const [clientStatementView, setClientStatementView] = useState<"summary" | "detail">("summary");
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [statementShareLink, setStatementShareLink] = useState("");
  const pdfBlobUrlRef = useRef("");
  const restoringHistoryRef = useRef(false);
  const [client, setClient] = useState("");
  const [clientContactFilter, setClientContactFilter] = useState<"" | "unset" | string>("");
  const [worker, setWorker] = useState("");
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const [clientStatementGenerated, setClientStatementGenerated] = useState(false);
  const [clientStatementIssuedDate, setClientStatementIssuedDate] = useState("");
  const [workerStatementGenerated, setWorkerStatementGenerated] = useState(false);
  const [statementHint, setStatementHint] = useState("");
  const [folderMessage, setFolderMessage] = useState("");
  const [filingLogId, setFilingLogId] = useState("");
  const [batchFiling, setBatchFiling] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [folderQuery, setFolderQuery] = useState("");
  const [folderSort, setFolderSort] = useState<StatementFolderSort>("updated");
  const [activePageTab, setActivePageTab] = useState<StatementHubTab>(() => readStoredStatementTab());
  const [mountedPdfTab, setMountedPdfTab] = useState(() => readStoredStatementTab() === "pdf");

  useEffect(() => {
    if (activePageTab === "pdf") setMountedPdfTab(true);
    storeStatementTab(activePageTab);
  }, [activePageTab]);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const unpaidOnlyRef = useRef(false);
  const restrictedSaleIdsRef = useRef<Array<string | number>>([]);
  const appliedDraftTokenRef = useRef("");
  const autoGeneratePendingRef = useRef(false);
  const autoShareLinkPendingRef = useRef(false);
  const [autoGenerateTick, setAutoGenerateTick] = useState(0);
  const [pendingAutoShareLink, setPendingAutoShareLink] = useState(false);
  const onDraftConsumedRef = useRef(onDraftConsumed);
  onDraftConsumedRef.current = onDraftConsumed;
  const clientPrintRef = useRef<HTMLDivElement>(null);
  const workerPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => revokePdfBlobUrl(pdfBlobUrlRef.current), []);

  const clearUnpaidFilter = () => {
    unpaidOnlyRef.current = false;
    restrictedSaleIdsRef.current = [];
    setUnpaidOnly(false);
  };

  const applyUnpaidFilter = (enabled: boolean, saleIds: Array<string | number> = []) => {
    unpaidOnlyRef.current = enabled;
    restrictedSaleIdsRef.current = saleIds.length ? [...saleIds] : enabled ? restrictedSaleIdsRef.current : [];
    setUnpaidOnly(enabled || saleIds.length > 0);
  };

  const matchesStatementSaleFilter = (row: Record<string, unknown>) => {
    const saleIds = restrictedSaleIdsRef.current;
    if (saleIds.length) return saleMatchesDraftIds(row as { id?: string | number }, saleIds);
    if (unpaidOnly || unpaidOnlyRef.current) return getUnpaid(row as never) > 0;
    return true;
  };

  const applyStatementDraft = (incoming: StatementDraft) => {
    const token = JSON.stringify(incoming);
    if (appliedDraftTokenRef.current === token) return;
    appliedDraftTokenRef.current = token;

    restoringHistoryRef.current = true;
    setActivePageTab("create");
    setStatementHint("");
    setPdfMessage("");
    setStatementShareLink("");
    setStatementType("client");
    setClient(incoming.client);
    setClientContactFilter("");
    setDateFilter({ startDate: incoming.startDate, endDate: incoming.endDate });
    applyUnpaidFilter(incoming.unpaidOnly, incoming.saleIds || []);
    setClientStatementView("summary");
    setWorkerStatementGenerated(false);
    setClientStatementGenerated(false);
    setClientStatementIssuedDate("");
    autoGeneratePendingRef.current = Boolean(incoming.autoGenerate);
    autoShareLinkPendingRef.current = Boolean(incoming.autoShareLink);

    window.setTimeout(() => {
      restoringHistoryRef.current = false;
      if (autoGeneratePendingRef.current) {
        setAutoGenerateTick((tick) => tick + 1);
      }
    }, 0);
  };

  useEffect(() => {
    if (!pendingWorkerStatementFilter?.workerName) return;
    restoringHistoryRef.current = true;
    setActivePageTab("create");
    setStatementType("worker");
    setWorker(pendingWorkerStatementFilter.workerName);
    setDateFilter({
      startDate: pendingWorkerStatementFilter.startDate || "",
      endDate: pendingWorkerStatementFilter.endDate || "",
    });
    setWorkerStatementGenerated(false);
    setClientStatementGenerated(false);
    setStatementHint("");
    setPdfMessage("");
    setStatementShareLink("");
    autoGeneratePendingRef.current = Boolean(pendingWorkerStatementFilter.autoGenerate);

    window.setTimeout(() => {
      restoringHistoryRef.current = false;
      if (autoGeneratePendingRef.current) {
        setAutoGenerateTick((tick) => tick + 1);
      }
    }, 0);

    onPendingWorkerStatementFilterConsumed?.();
  }, [pendingWorkerStatementFilter, onPendingWorkerStatementFilterConsumed]);

  useEffect(() => {
    const effectiveDraft = draft ?? peekStatementDraft();
    if (!effectiveDraft) return;
    applyStatementDraft(effectiveDraft);
  }, [draft]);

  useEffect(() => {
    if (draft) return;
    const stashed = peekStatementDraft();
    if (!stashed) return;
    applyStatementDraft(stashed);
  }, []);

  useEffect(() => {
    if (restoringHistoryRef.current) return;
    if (restrictedSaleIdsRef.current.length) return;
    setClientStatementGenerated(false);
    setClientStatementIssuedDate("");
    setStatementHint("");
    setPdfMessage("");
    setStatementShareLink("");
  }, [client, clientContactFilter, dateFilter.startDate, dateFilter.endDate, unpaidOnly]);

  useEffect(() => {
    if (restoringHistoryRef.current) return;
    setWorkerStatementGenerated(false);
    setStatementHint("");
    setPdfMessage("");
    setStatementShareLink("");
  }, [worker, dateFilter.startDate, dateFilter.endDate]);

  useEffect(() => {
    setStatementHint("");
    setPdfMessage("");
    setStatementShareLink("");
    setClientContactFilter("");
  }, [statementType]);

  const hasClientSelection = Boolean(client && client !== "\uC804\uCCB4");
  const hasWorkerSelection = Boolean(worker && worker !== "\uC804\uCCB4");

  const inactiveClientNames = useMemo(
    () =>
      new Set(
        clientMaster
          .filter((row) => !isClientActive(row as ClientMasterLike))
          .map((row) => String(row.name || "").trim())
          .filter(Boolean),
      ),
    [clientMaster],
  );

  const clientOptions = useMemo(
    () =>
      [...new Set(sales.map((row) => String(row.client || "")).filter(Boolean))].filter(
        (name) => !inactiveClientNames.has(name),
      ),
    [sales, inactiveClientNames],
  );
  const selectedStatementClient = useMemo(
    () => clientMaster.find((row) => String(row?.name || "").trim() === String(client || "").trim()) || null,
    [clientMaster, client],
  );
  const statementClientContacts = useMemo(
    () => normalizeClientContacts(selectedStatementClient),
    [selectedStatementClient],
  );
  useEffect(() => {
    if (!clientContactFilter) return;
    if (clientContactFilter === "unset") return;
    const matched = statementClientContacts.some((row) => String(row.id || "").trim() === String(clientContactFilter || "").trim());
    if (matched) return;
    setClientContactFilter("");
  }, [statementClientContacts, clientContactFilter]);
  const workerOptions = [
    ...new Set(
      sales
        .flatMap((row) => {
          const workers = row.workers as Array<{ worker?: string }> | undefined;
          if (workers?.length) return workers.map((line) => line.worker);
          return String(row.worker || "")
            .split(",")
            .map((name) => name.trim());
        })
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    ),
  ];

  const shouldFilterUnpaid = unpaidOnly || unpaidOnlyRef.current || restrictedSaleIdsRef.current.length > 0;

  const dateFilteredSales = sales.filter((row) => {
    const date = String(row.date || "");
    const startMatch = dateFilter.startDate ? date >= dateFilter.startDate : true;
    const endMatch = dateFilter.endDate ? date <= dateFilter.endDate : true;
    return startMatch && endMatch;
  });

  const filteredClientSales = hasClientSelection
    ? dateFilteredSales
        .filter((row) => matchesClientName(row, client))
        .filter((row) => matchesStatementContactFilter(row, clientContactFilter))
        .filter((row) => matchesStatementSaleFilter(row))
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(a.id || 0) - Number(b.id || 0))
    : [];

  const clientRows = hasClientSelection ? buildClientStatementRows(filteredClientSales as never[]) : [];
  const clientSummaryDisplayRows = hasClientSelection ? buildClientStatementSummaryDisplayRows(filteredClientSales as never[]) : [];
  const clientDetailDisplayRows = hasClientSelection ? buildClientStatementDetailDisplayRows(filteredClientSales as never[]) : [];
  const clientDisplayRows = clientStatementView === "detail" ? clientDetailDisplayRows : clientSummaryDisplayRows;

  const selectedClientInfo = clientMaster.find((row) => row.name === client) || {};
  const clientStatementSummary = buildClientStatementSummary(clientRows, selectedClientInfo as never);

  const workerRows = hasWorkerSelection
    ? dateFilteredSales
        .flatMap((sale) => {
          const workers = sale.workers as Array<Record<string, unknown>> | undefined;
          const lines = (workers?.length
            ? workers
            : String(sale.worker || "")
                .split(",")
                .map((name) => ({
                  worker: name.trim(),
                  quantity: "1",
                  unitCost: String(sale.amount || 0),
                  chargeAmount: String(sale.amount || 0),
                  meal: "",
                  overtimeHours: "",
                  overtimeCost: "30000",
                  memo: "",
                }))
          ).filter((line) => String(line.worker || "").trim());

          return lines.map((line) => {
            const calculated = calculateWorkerLine(line as never);
            const quantity = parseMoney(String(line.quantity || "1")) || 1;
            const unitCost = parseMoney(String(line.unitCost || ""));
            const meal = parseMoney(String(line.meal || ""));
            const lodging = parseMoney(String(line.lodging || line.accommodation || line.room || ""));
            const expense = parseMoney(String(line.expense || line.extraExpense || ""));
            const overtime = parseMoney(String(line.overtimeHours || "")) * (parseMoney(String(line.overtimeCost || "")) || 30000);
            const basePay = quantity * unitCost;

            return {
              id: `${sale.id}-${line.worker}-${line.no || ""}`,
              date: sale.date,
              client: sale.client,
              site: sale.site,
              worker: line.worker,
              quantity,
              unitCost,
              basePay,
              meal,
              lodging,
              expense,
              overtime,
              totalPay: calculated.spend,
              amount: calculated.spend,
              memo: String(line.memo || ""),
            };
          });
        })
        .filter((row) => row.worker === worker)
    : [];

  const selectedWorkerInfo = workerMaster.find((row) => row.name === worker) || {};

  const workerStatementSheetRows = useMemo(
    () =>
      sortWorkerPaymentRowsByDate(
        dedupeStatementRowMemos(
          workerRows.map((row) => ({
            id: String(row.id),
            saleId: "",
            voucherNo: "",
            date: String(row.date || ""),
            client: String(row.client || ""),
            site: String(row.site || ""),
            worker: String(row.worker || ""),
            quantity: row.quantity || 0,
            unitCost: row.unitCost || 0,
            basePay: row.basePay || 0,
            meal: row.meal || 0,
            lodging: row.lodging || 0,
            expense: row.expense || 0,
            overtime: row.overtime || 0,
            totalPay: row.totalPay || 0,
            feeRate: 0,
            fee: 0,
            netPay: row.totalPay || 0,
            memo: String(row.memo || ""),
          })),
        ),
      ),
    [workerRows],
  );

  const workerStatementSummary = buildWorkerStatementSummary(workerStatementSheetRows, selectedWorkerInfo as never);
  const workerStatementPeriodStart =
    dateFilter.startDate || String(workerStatementSheetRows[0]?.date || "");
  const workerStatementPeriodEnd =
    dateFilter.endDate || String(workerStatementSheetRows[workerStatementSheetRows.length - 1]?.date || "");
  const clientTotals = clientStatementSummary;

  useEffect(() => {
    if (statementType !== "client" || !clientStatementGenerated || !hasClientSelection) return;
    const timer = window.setTimeout(() => {
      const element = clientPrintRef.current;
      if (!element) return;
      const safeName = String(client).replace(/[\\/:*?"<>|]/g, "_");
      const periodLabel = `${dateFilter.startDate || "\uC804\uCCB4"}_${dateFilter.endDate || "\uC804\uCCB4"}`;
      const fileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${safeName}_${periodLabel}.pdf`;
      prefetchStatementPdfForElement(
        element,
        ["client", client, dateFilter.startDate, dateFilter.endDate, clientStatementView, clientRows.length],
        () => downloadPdfFromHtmlElement(element, fileName, { orientation: "portrait", deliver: false })
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    statementType,
    clientStatementGenerated,
    hasClientSelection,
    client,
    dateFilter.startDate,
    dateFilter.endDate,
    clientStatementView,
    clientRows.length,
  ]);

  useEffect(() => {
    if (statementType !== "worker" || !workerStatementGenerated || !hasWorkerSelection) return;
    const timer = window.setTimeout(() => {
      const element = workerPrintRef.current;
      if (!element) return;
      const safeName = String(worker).replace(/[\\/:*?"<>|]/g, "_");
      const periodLabel = `${dateFilter.startDate || "\uC804\uCCB4"}_${dateFilter.endDate || "\uC804\uCCB4"}`;
      const fileName = `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uC2DC\uACF5\uC790_${safeName}_${periodLabel}.pdf`;
      prefetchStatementPdfForElement(
        element,
        ["worker", worker, dateFilter.startDate, dateFilter.endDate, workerRows.length],
        () => downloadPdfFromHtmlElement(element, fileName, { orientation: "portrait", deliver: false })
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    statementType,
    workerStatementGenerated,
    hasWorkerSelection,
    worker,
    dateFilter.startDate,
    dateFilter.endDate,
    workerRows.length,
  ]);

  const workerTotals = workerRows.reduce(
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
    { count: 0, basePay: 0, overtime: 0, lodging: 0, meal: 0, expense: 0, totalPay: 0 }
  );

  const workersWithStatementData = useMemo(
    () => listWorkersWithPaymentRows(sales as SaleLike[], dateFilter, workerMaster as never[]),
    [sales, dateFilter, workerMaster]
  );

  const clientsWithStatementData = useMemo(
    () => listClientsWithStatementRows(sales as SaleLike[], dateFilter),
    [sales, dateFilter]
  );

  const statementClient = hasClientSelection ? client : "";
  const statementWorkerName = hasWorkerSelection ? worker : "";

  const autoFileGenerationLog = (log: StatementGenerationLog) => {
    if (!setStatementFolders) return;
    const filedBy = currentUser?.name || currentUser?.loginId || "";
    setStatementFolders((prev) => fileStatementLogToFolder(prev, log, { filedBy }));
    const folderId = makeStatementFolderId(log.statementType, log.subjectName);
    setExpandedFolderIds((prev) => (prev.includes(folderId) ? prev : [folderId, ...prev]));
    setFolderMessage(L.folderMetaOnly);
  };

  const autoFileGenerationLogs = (logs: StatementGenerationLog[]) => {
    if (!setStatementFolders || !logs.length) return;
    const filedBy = currentUser?.name || currentUser?.loginId || "";
    setStatementFolders((prev) => autoFileGenerationLogsToFolders(prev, logs, filedBy).folders);
    setExpandedFolderIds((prev) =>
      Array.from(new Set([...logs.map((log) => makeStatementFolderId(log.statementType, log.subjectName)), ...prev]))
    );
  };

  const recordGenerationLog = (type: "client" | "worker", subjectName: string, rowCount: number) => {
    if (!setStatementGenerationLogs) return null;
    const log = createStatementGenerationLog({
      statementType: type,
      subjectName,
      startDate: dateFilter.startDate,
      endDate: dateFilter.endDate,
      clientStatementView: type === "client" ? clientStatementView : undefined,
      rowCount,
      createdBy: currentUser?.name || currentUser?.loginId || "",
    });
    setStatementGenerationLogs((prev) => appendStatementGenerationLog(prev, log));
    autoFileGenerationLog(log);
    return log;
  };

  useEffect(() => {
    if (!autoGeneratePendingRef.current) return;

    if (statementType === "client" && hasClientSelection) {
      autoGeneratePendingRef.current = false;

      const rows = dateFilteredSales
        .filter((row) => matchesClientName(row, client))
        .filter((row) => matchesStatementContactFilter(row, clientContactFilter))
        .filter((row) => matchesStatementSaleFilter(row));

      if (!rows.length) {
        setStatementHint(shouldFilterUnpaid ? L.noUnpaidRows : "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uD574\uB2F9 \uAC70\uB798\uCC98 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        setClientStatementGenerated(false);
        return;
      }

      setStatementHint(shouldFilterUnpaid ? L.unpaidOnlyHint(rows.length) : "");
      setPdfMessage("");
      setClientStatementIssuedDate(todayISO());
      setClientStatementGenerated(true);
      recordGenerationLog("client", client, rows.length);
      clearStatementDraftStash();
      onDraftConsumedRef.current?.();
      if (autoShareLinkPendingRef.current) {
        autoShareLinkPendingRef.current = false;
        setPendingAutoShareLink(true);
      }
      return;
    }

    if (statementType === "worker" && hasWorkerSelection) {
      autoGeneratePendingRef.current = false;

      if (!workerRows.length) {
        setStatementHint("\uC120\uD0DD \uAE30\uAC04\uC5D0 \uD574\uB2F9 \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        setWorkerStatementGenerated(false);
        return;
      }

      setStatementHint("");
      setPdfMessage("");
      setStatementShareLink("");
      setWorkerStatementGenerated(true);
      recordGenerationLog("worker", worker, workerRows.length);
    }
  }, [autoGenerateTick]);

  const handleGenerateStatement = () => {
    const isClient = statementType === "client";

    if (isClient) {
      if (!hasClientSelection) {
        setStatementHint("\uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      if (!clientRows.length) {
        setStatementHint(shouldFilterUnpaid ? L.noUnpaidRows : "\uC120\uD0DD \uAE30\uAC04\uC5D0 \uD574\uB2F9 \uAC70\uB798\uCC98 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        return;
      }
      setStatementHint(shouldFilterUnpaid ? L.unpaidOnlyHint(clientRows.length) : "");
      setPdfMessage("");
      setStatementShareLink("");
      setClientStatementIssuedDate(todayISO());
      setClientStatementGenerated(true);
      recordGenerationLog("client", client, clientRows.length);
      return;
    }

    if (!hasWorkerSelection) {
      setStatementHint("\uC2DC\uACF5\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (!workerRows.length) {
      setStatementHint("\uC120\uD0DD \uAE30\uAC04\uC5D0 \uD574\uB2F9 \uC2DC\uACF5\uC790 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    setStatementHint("");
    setPdfMessage("");
    setStatementShareLink("");
    setWorkerStatementGenerated(true);
    recordGenerationLog("worker", worker, workerRows.length);
  };

  const handleBatchGenerateWorkerStatements = () => {
    if (!setStatementGenerationLogs) return;

    const targets = workersWithStatementData;
    if (!targets.length) {
      setStatementHint(L.batchGenerateEmptyWorker);
      return;
    }

    const period = formatStatementGenerationPeriod(dateFilter.startDate, dateFilter.endDate);
    if (!window.confirm(L.batchGenerateConfirmWorker(targets.length, period))) return;

    const createdBy = currentUser?.name || currentUser?.loginId || "";
    const nextLogs = targets.map(({ name, rowCount }) =>
      createStatementGenerationLog({
        statementType: "worker",
        subjectName: name,
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        rowCount,
        createdBy,
      })
    );

    setStatementGenerationLogs((prev) => appendStatementGenerationLogs(prev, nextLogs));
    autoFileGenerationLogs(nextLogs);
    setFolderMessage(L.batchGenerateDoneWorker(targets.length));
    setPdfMessage("");
    setActivePageTab("archive");
  };

  const handleBatchGenerateClientStatements = () => {
    if (!setStatementGenerationLogs) return;

    const targets = clientsWithStatementData;
    if (!targets.length) {
      setStatementHint(L.batchGenerateEmptyClient);
      return;
    }

    const period = formatStatementGenerationPeriod(dateFilter.startDate, dateFilter.endDate);
    if (!window.confirm(L.batchGenerateConfirmClient(targets.length, period))) return;

    const createdBy = currentUser?.name || currentUser?.loginId || "";
    const nextLogs = targets.map(({ name, rowCount }) =>
      createStatementGenerationLog({
        statementType: "client",
        subjectName: name,
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        clientStatementView: clientStatementView,
        rowCount,
        createdBy,
      })
    );

    setStatementGenerationLogs((prev) => appendStatementGenerationLogs(prev, nextLogs));
    autoFileGenerationLogs(nextLogs);
    setFolderMessage(L.batchGenerateDoneClient(targets.length));
    setPdfMessage("");
    setActivePageTab("archive");
  };

  const handleFileLogToFolder = async (log: StatementGenerationLog) => {
    if (!setStatementFolders) return;
    const existing = findFolderItemByLogId(statementFolders, log.id);
    if (existing?.item.pdfArchiveId) {
      setFolderMessage(L.folderAlreadyFiled);
      return;
    }

    setFilingLogId(log.id);
    setFolderMessage("");
    try {
      const pdfRecords = await listPdfArchives();
      const matchedPdf = findMatchingPdfArchive(pdfRecords, log);
      const filedBy = currentUser?.name || currentUser?.loginId || "";
      setStatementFolders((prev) => fileStatementLogToFolder(prev, log, { pdfArchiveId: matchedPdf?.id, filedBy }));
      setExpandedFolderIds((prev) => {
        const folderId = makeStatementFolderId(log.statementType, log.subjectName);
        return prev.includes(folderId) ? prev : [folderId, ...prev];
      });
      if (existing && matchedPdf) {
        setFolderMessage(L.folderPdfLinked);
      } else if (existing && !matchedPdf) {
        setFolderMessage(L.folderMetaOnly);
      } else {
        setFolderMessage(matchedPdf ? L.folderPdfLinked : L.folderMetaOnly);
      }
    } catch (error) {
      console.error(error);
      setFolderMessage(L.folderSaveFailed);
    } finally {
      setFilingLogId("");
    }
  };

  const handleBatchFileLogsToFolder = async () => {
    if (!setStatementFolders) return;
    if (!fileableGenerationLogs.length) {
      setFolderMessage(L.batchFileEmpty);
      return;
    }
    if (!window.confirm(L.batchFileConfirm(fileableGenerationLogs.length))) return;

    setBatchFiling(true);
    setFolderMessage("");
    try {
      const pdfRecords = await listPdfArchives();
      const filedBy = currentUser?.name || currentUser?.loginId || "";
      const result = fileStatementLogsToFolders(statementFolders, fileableGenerationLogs, pdfRecords, filedBy);
      setStatementFolders(result.folders);
      setExpandedFolderIds((prev) => Array.from(new Set([...result.folderIds, ...prev])));
      setFolderMessage(L.batchFileDone(result.filed, result.pdfLinked, result.skipped));
    } catch (error) {
      console.error(error);
      setFolderMessage(L.folderSaveFailed);
    } finally {
      setBatchFiling(false);
    }
  };

  const handleOpenFolderPdf = async (pdfArchiveId: string) => {
    const previewWindow = createPdfPreviewWindow();
    if (!previewWindow) {
      setFolderMessage("\uD31D\uC5C5\uC774 \uCC28\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uD31D\uC5C5 \uD5C8\uC6A9 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    try {
      const record = await getPdfArchiveRecord(pdfArchiveId);
      if (!record) {
        previewWindow.close();
        setFolderMessage("\uD574\uB2F9 PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        return;
      }
      openPdfBlobInNewTab(record.blob, record.fileName, previewWindow);
      setFolderMessage("");
    } catch (error) {
      previewWindow.close();
      console.error(error);
      setFolderMessage("PDF \uBBF8\uB9AC\uBCF4\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  };

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolderIds((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]));
  };

  const folderStats = useMemo(() => getStatementFolderStats(statementFolders), [statementFolders]);
  const fileableGenerationLogs = useMemo(
    () => statementGenerationLogs.filter((log) => !isGenerationLogFullyFiled(statementFolders, log.id)),
    [statementGenerationLogs, statementFolders]
  );
  const filteredClientFolders = useMemo(
    () => filterAndSortStatementFolders(statementFolders, { query: folderQuery, type: "client", sort: folderSort }),
    [statementFolders, folderQuery, folderSort]
  );
  const filteredWorkerFolders = useMemo(
    () => filterAndSortStatementFolders(statementFolders, { query: folderQuery, type: "worker", sort: folderSort }),
    [statementFolders, folderQuery, folderSort]
  );
  const visibleFilteredFolders = useMemo(
    () => [...filteredClientFolders, ...filteredWorkerFolders],
    [filteredClientFolders, filteredWorkerFolders]
  );

  const expandVisibleFolders = () => {
    setExpandedFolderIds((prev) => Array.from(new Set([...prev, ...visibleFilteredFolders.map((folder) => folder.id)])));
  };

  const collapseVisibleFolders = () => {
    const visibleIds = new Set(visibleFilteredFolders.map((folder) => folder.id));
    setExpandedFolderIds((prev) => prev.filter((id) => !visibleIds.has(id)));
  };

  const restoreStatementSnapshot = (input: {
    statementType: StatementGenerationLog["statementType"];
    subjectName: string;
    startDate: string;
    endDate: string;
    clientStatementView?: StatementGenerationLog["clientStatementView"];
    createdAt?: string;
  }) => {
    restoringHistoryRef.current = true;
    setActivePageTab("create");
    setStatementHint("");
    setPdfMessage("");
    setStatementType(input.statementType);
    setDateFilter({ startDate: input.startDate, endDate: input.endDate });
    setClientContactFilter("");
    clearUnpaidFilter();

    if (input.statementType === "client") {
      setClient(input.subjectName);
      setClientStatementView(input.clientStatementView || "summary");
      setClientStatementIssuedDate(input.createdAt?.slice(0, 10) || todayISO());
      setClientStatementGenerated(true);
      setWorkerStatementGenerated(false);
    } else {
      setWorker(input.subjectName);
      setWorkerStatementGenerated(true);
      setClientStatementGenerated(false);
      setClientStatementIssuedDate("");
    }

    window.setTimeout(() => {
      restoringHistoryRef.current = false;
    }, 0);
  };

  const openFolderStatement = (item: StatementFolderItem) => {
    const log = statementGenerationLogs.find((row) => row.id === item.generationLogId);
    const snapshot = log ?? item;
    restoreStatementSnapshot({
      statementType: snapshot.statementType,
      subjectName: snapshot.subjectName,
      startDate: snapshot.startDate,
      endDate: snapshot.endDate,
      clientStatementView: snapshot.clientStatementView,
      createdAt: log?.createdAt ?? item.logCreatedAt,
    });
  };

  const removeFolderItem = (folderId: string, itemId: string) => {
    if (!setStatementFolders) return;
    if (!confirmDelete(L.folderRemoveConfirm)) return;
    setStatementFolders((prev) => removeStatementFolderItem(prev, folderId, itemId));
    setFolderMessage(L.folderRemoved);
  };

  const removeFolder = (folder: StatementFolder) => {
    if (!setStatementFolders) return;
    if (!confirmDelete(L.folderRemoveFolderConfirm(folder.folderName, folder.items.length))) return;
    setStatementFolders((prev) => removeStatementFolder(prev, folder.id));
    setExpandedFolderIds((prev) => prev.filter((id) => id !== folder.id));
    setFolderMessage(L.folderFolderRemoved);
  };

  const renderFolderList = (folders: StatementFolder[], emptyLabel: string) => {
    if (!folders.length) {
      return <p className="erp-statement-folder-empty">{emptyLabel}</p>;
    }

    return (
      <div className="erp-statement-folder-list">
        {folders.map((folder) => {
          const expanded = expandedFolderIds.includes(folder.id);
          return (
            <div key={folder.id} className="erp-statement-folder">
              <div className="erp-statement-folder-head-row">
                <button type="button" className="erp-statement-folder-head" onClick={() => toggleFolderExpanded(folder.id)}>
                  {expanded ? <ChevronDown size={13} className="shrink-0 text-slate-500" /> : <ChevronRight size={13} className="shrink-0 text-slate-500" />}
                  <span className="erp-statement-folder-name">{folder.folderName}</span>
                  <span className="erp-statement-folder-meta">
                    {folder.items.length}
                    {"\uAC74 \u00B7 "}
                    {formatStatementGenerationDateTime(folder.updatedAt).split(" ")[0]}
                  </span>
                </button>
                {setStatementFolders ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="erp-statement-folder-delete-btn rounded-lg text-red-600 hover:text-red-700"
                    title={L.folderRemoveFolder}
                    aria-label={L.folderRemoveFolder}
                    onClick={() => removeFolder(folder)}
                  >
                    <Trash2 size={12} />
                  </Button>
                ) : null}
              </div>
              {expanded && (
                <div className="erp-statement-folder-items">
                  {folder.items.map((item) => {
                    const metaParts = [
                      formatStatementGenerationPeriod(item.startDate, item.endDate),
                      item.clientStatementView ? formatStatementGenerationViewLabel(item.clientStatementView) : "",
                      `${item.rowCount}\uAC74`,
                      formatStatementGenerationDateTime(item.logCreatedAt),
                      item.filedBy || "",
                    ].filter(Boolean);
                    return (
                      <div
                        key={item.id}
                        className="erp-statement-folder-item erp-statement-folder-item--link"
                        role="button"
                        tabIndex={0}
                        title={L.folderOpenStatement}
                        onClick={() => openFolderStatement(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openFolderStatement(item);
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="erp-statement-folder-item-meta">{metaParts.join(" · ")}</div>
                        </div>
                        <div className="erp-statement-folder-item-actions">
                          {item.pdfArchiveId ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="erp-statement-history-btn rounded-lg"
                              title={L.folderOpenPdf}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenFolderPdf(item.pdfArchiveId!);
                              }}
                            >
                              <Eye size={12} />
                            </Button>
                          ) : (
                            <span className="erp-statement-folder-no-pdf">{L.folderNoPdf}</span>
                          )}
                          {setStatementFolders && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="erp-statement-history-btn rounded-lg text-red-600 hover:text-red-700"
                              title={L.folderRemoveItem}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeFolderItem(folder.id, item.id);
                              }}
                            >
                              <Trash2 size={12} />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const deleteGenerationLog = (log: StatementGenerationLog) => {
    if (!setStatementGenerationLogs) return;
    if (!window.confirm(L.removeConfirm)) return;
    setStatementGenerationLogs((prev) => removeStatementGenerationLog(prev, log.id));
  };

  const restoreGenerationLog = (log: StatementGenerationLog) => {
    restoreStatementSnapshot(log);
  };

  const generateStatementPdf = async (type: string) => {
    const isClient = type === "client";
    const element = isClient ? clientPrintRef.current : workerPrintRef.current;

    if (isClient && !clientStatementGenerated) {
      setPdfMessage("PDF \uC0DD\uC131 \uC804\uC5D0 \uB0B4\uC5ED\uC11C \uC0DD\uC131\uC744 \uBA38\uC800 \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (!isClient && !workerStatementGenerated) {
      setPdfMessage("PDF \uC0DD\uC131 \uC804\uC5D0 \uB0B4\uC5ED\uC11C \uC0DD\uC131\uC744 \uBA38\uC800 \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (isClient && !hasClientSelection) {
      setPdfMessage("PDF \uC0DD\uC131 \uC804\uC5D0 \uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (!isClient && !hasWorkerSelection) {
      setPdfMessage("PDF \uC0DD\uC131 \uC804\uC5D0 \uC2DC\uACF5\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (!element) {
      setPdfMessage("PDF \uCD9C\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    const safeName = String(isClient ? client : worker).replace(/[\\/:*?"<>|]/g, "_");
    const periodLabel = `${dateFilter.startDate || "\uC804\uCCB4"}_${dateFilter.endDate || "\uC804\uCCB4"}`;
    const fileName = isClient
      ? `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${safeName}_${periodLabel}.pdf`
      : `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uC2DC\uACF5\uC790_${safeName}_${periodLabel}.pdf`;

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
        category: isClient ? "statement-client" : "statement-worker",
        subjectName: isClient ? client : worker,
        periodStart: dateFilter.startDate,
        periodEnd: dateFilter.endDate,
        statementView: isClient ? clientStatementView : undefined,
      });
      if (setStatementFolders) {
        const filedBy = currentUser?.name || currentUser?.loginId || "";
        setStatementFolders((prev) => fileOrLinkPdfArchiveToFolders(prev, statementGenerationLogs, archived, filedBy));
      }
      setPdfMessage(
        result.previewOpened
          ? "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uC5C8\uACE0 \uC0C8 \uD0ED\uC5D0\uC11C \uC5F4\uB838\uC2B5\uB2C8\uB2E4. \uBCF4\uAD00\uD568\uC5D0\uB3C4 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
          : "PDF\uAC00 \uB2E4\uC6B4\uB85C\uB4DC\uB418\uACE0 \uBCF4\uAD00\uD568\uC5D0 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
      );
    } catch (error) {
      console.error(error);
      previewWindow?.close();
      setPdfMessage("PDF \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const shareStatementDownloadLink = async () => {
    const isClient = statementType === "client";
    const element = isClient ? clientPrintRef.current : workerPrintRef.current;
    const subjectName = isClient ? client : worker;
    const statementGenerated = isClient ? clientStatementGenerated : workerStatementGenerated;
    const hasSelection = isClient ? hasClientSelection : hasWorkerSelection;

    if (!statementGenerated) {
      setPdfMessage("\uB9C1\uD06C \uBCF4\uB0B4\uAE30 \uC804\uC5D0 \uB0B4\uC5ED\uC11C \uC0DD\uC131\uC744 \uBA38\uC800 \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (!hasSelection) {
      setPdfMessage(
        isClient
          ? "\uB9C1\uD06C \uBCF4\uB0B4\uAE30 \uC804\uC5D0 \uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694."
          : "\uB9C1\uD06C \uBCF4\uB0B4\uAE30 \uC804\uC5D0 \uC2DC\uACF5\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694."
      );
      return;
    }
    if (!element) {
      setPdfMessage("PDF \uCD9C\uB825 \uC601\uC5ED\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    const safeName = String(subjectName).replace(/[\\/:*?"<>|]/g, "_");
    const periodLabel = `${dateFilter.startDate || "\uC804\uCCB4"}_${dateFilter.endDate || "\uC804\uCCB4"}`;
    const fileName = isClient
      ? `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${safeName}_${periodLabel}.pdf`
      : `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uC2DC\uACF5\uC790_${safeName}_${periodLabel}.pdf`;

    setPdfGenerating(true);
    setPdfMessage(L.shareLinkPreparing);
    setStatementShareLink("");

    try {
      const { result, fromCache } = await resolveStatementPdfForElement(
        element,
        isClient
          ? ["client", subjectName, dateFilter.startDate, dateFilter.endDate, clientStatementView, clientRows.length]
          : ["worker", subjectName, dateFilter.startDate, dateFilter.endDate, workerRows.length],
        () =>
          downloadPdfFromHtmlElement(element, fileName, {
            orientation: "portrait",
            deliver: false,
          }),
        { bypassCache: true }
      );
      pdfBlobUrlRef.current = result.blobUrl;
      setPdfMessage(fromCache ? "\uC11C\uBC84 \uC5C5\uB85C\uB4DC \uBC0F \uB9C1\uD06C \uC0DD\uC131 \uC911..." : L.shareLinkPreparing);

      const statementTotalAmount = isClient ? clientTotals.grandTotal : workerTotals.totalPay;
      const { archived, shareLink } = await archivePdfAndCreateShareLink(result, {
        category: isClient ? "statement-client" : "statement-worker",
        subjectName,
        periodStart: dateFilter.startDate,
        periodEnd: dateFilter.endDate,
        statementView: isClient ? clientStatementView : undefined,
        statementTotalAmount,
        paymentStatus: "pending",
        statementSalesIds: isClient ? filteredClientSales.map((row) => row.id).filter((id) => id != null && id !== "") : undefined,
      });
      if (setStatementFolders) {
        const filedBy = currentUser?.name || currentUser?.loginId || "";
        setStatementFolders((prev) => fileOrLinkPdfArchiveToFolders(prev, statementGenerationLogs, archived, filedBy));
      }

      if (shareLink?.url) {
        setStatementShareLink(shareLink.url);
        const copied = await copyTextToClipboard(shareLink.url);
        setPdfMessage(copied ? L.shareLinkReady : `${L.shareLinkReady} (\uC790\uB3D9 \uBCF5\uC0AC\uAC00 \uC9C0\uC6D0\uB418\uC9C0 \uC54A\uC544 \uC544\uB798 \uB9C1\uD06C\uB97C \uC9C1\uC811 \uBCF5\uC0AC\uD574 \uC8FC\uC138\uC694.)`);
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

  useEffect(() => {
    if (!pendingAutoShareLink || statementType !== "client" || !clientStatementGenerated) return;
    if (!hasClientSelection || !clientRows.length || !clientPrintRef.current) return;
    setPendingAutoShareLink(false);
    const timer = window.setTimeout(() => {
      void shareStatementDownloadLink();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [pendingAutoShareLink, statementType, clientStatementGenerated, hasClientSelection, clientRows.length]);

  const handleCopyStatementShareLink = async () => {
    if (!statementShareLink) return;
    try {
      const copied = await copyTextToClipboard(statementShareLink);
      setPdfMessage(copied ? L.shareLinkCopied : "\uB9C1\uD06C \uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      console.error(error);
      setPdfMessage("\uB9C1\uD06C \uBCF5\uC0AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  };

  const shareClientStatementPdf = async () => {
    const element = clientPrintRef.current;

    if (!clientStatementGenerated) {
      setPdfMessage("카톡 보내기 전에 내역서 생성을 먼저 실행해 주세요.");
      return;
    }
    if (!hasClientSelection) {
      setPdfMessage("카톡 보내기 전에 거래처를 선택해 주세요.");
      return;
    }
    if (!element) {
      setPdfMessage("PDF 출력 영역을 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
      return;
    }

    const safeName = String(client).replace(/[\\/:*?"<>|]/g, "_");
    const periodLabel = `${dateFilter.startDate || "전체"}_${dateFilter.endDate || "전체"}`;
    const fileName = `시공내역서_거래처_${safeName}_${periodLabel}.pdf`;

    revokePdfBlobUrl(pdfBlobUrlRef.current);
    setPdfGenerating(true);
    setPdfMessage(L.shareKakaoPreparing);
    pdfBlobUrlRef.current = "";

    try {
      const result = await downloadPdfFromHtmlElement(element, fileName, {
        orientation: "portrait",
        deliver: false,
      });
      pdfBlobUrlRef.current = result.blobUrl;
      const archived = await archiveGeneratedPdf(result, {
        category: "statement-client",
        subjectName: client,
        periodStart: dateFilter.startDate,
        periodEnd: dateFilter.endDate,
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
      setPdfMessage("카톡 보내기에 실패했습니다.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const isClientStatement = statementType === "client";
  const statementGenerated = isClientStatement ? clientStatementGenerated : workerStatementGenerated;
  const activeSubject = isClientStatement ? statementClient : statementWorkerName;
  const periodLabel = formatStatementGenerationPeriod(dateFilter.startDate, dateFilter.endDate);
  const exportFileName = isClientStatement
    ? `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uAC70\uB798\uCC98_${statementClient || "\uBBF8\uC120\uD0DD"}_${clientStatementView}`
    : `\uC2DC\uACF5\uB0B4\uC5ED\uC11C_\uC2DC\uACF5\uC790_${statementWorkerName || "\uBBF8\uC120\uD0DD"}`;
  const exportTitle = isClientStatement
    ? `\uAC70\uB798\uCC98 \uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C (${clientStatementView === "detail" ? "\uC0C1\uC138" : "\uC694\uC57D"})`
    : "\uC2DC\uACF5\uC790 \uC2DC\uACF5\uB0B4\uC5ED\uC11C";
  const canGenerate = isClientStatement ? hasClientSelection : hasWorkerSelection;
  const hasStatementData = isClientStatement ? clientRows.length > 0 : workerRows.length > 0;
  const statementTeamChatSharePayload = useMemo(() => {
    if (!statementGenerated || !activeSubject) return null;
    const link = isClientStatement
      ? buildClientStatementTeamChatLink({
          client: activeSubject,
          startDate: dateFilter.startDate || String(clientRows[0]?.date || ""),
          endDate: dateFilter.endDate || String(clientRows[clientRows.length - 1]?.date || ""),
        })
      : buildWorkerStatementTeamChatLink({
          workerName: activeSubject,
          startDate: workerStatementPeriodStart,
          endDate: workerStatementPeriodEnd,
        });
    return {
      link,
      body: statementShareLink ? `PDF \uB9C1\uD06C: ${statementShareLink}` : undefined,
    };
  }, [
    activeSubject,
    clientRows,
    dateFilter.endDate,
    dateFilter.startDate,
    isClientStatement,
    statementGenerated,
    statementShareLink,
    workerStatementPeriodEnd,
    workerStatementPeriodStart,
  ]);
  const archiveTabBadgeCount = statementGenerationLogs.length + statementFolders.length;

  return (
    <div className="erp-page erp-statement-page">
      {activePageTab !== "pdf" ? <PageTitle title={L.pageTitle} desc={L.pageDesc} /> : null}

      <Card className="erp-statement-hub-card mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4">
            <div className="erp-statement-page-tabs flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
              {STATEMENT_TAB_ITEMS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActivePageTab(tab.key)}
                  className={`erp-text-body rounded-xl px-4 py-2 font-bold ${activePageTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                >
                  {L[tab.labelKey]}
                  {tab.key === "archive" && archiveTabBadgeCount > 0 && (
                    <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.625rem] font-bold text-slate-700">
                      {archiveTabBadgeCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activePageTab === "create" ? (
              <>
          <StatementStepBadge step={1} label={L.step1} />

          <div className="erp-statement-type-tabs">
            <button
              type="button"
              onClick={() => {
                clearUnpaidFilter();
                setClientContactFilter("");
                setStatementType("client");
              }}
              className={`erp-statement-type-tab ${statementType === "client" ? "is-active" : ""}`}
            >
              {L.tabClient}
            </button>
            <button
              type="button"
              onClick={() => {
                clearUnpaidFilter();
                setClientContactFilter("");
                setStatementType("worker");
              }}
              className={`erp-statement-type-tab ${statementType === "worker" ? "is-active" : ""}`}
            >
              {L.tabWorker}
            </button>
          </div>

          <div className="erp-statement-filters">
            <Field label={L.startDate}>
              <Input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => {
                  clearUnpaidFilter();
                  setDateFilter((prev) => ({ ...prev, startDate: e.target.value }));
                }}
              />
            </Field>
            <Field label={L.endDate}>
              <Input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => {
                  clearUnpaidFilter();
                  setDateFilter((prev) => ({ ...prev, endDate: e.target.value }));
                }}
              />
            </Field>
            {isClientStatement ? (
              <Field label={L.client}>
                <AutocompleteInput
                  value={client}
                  options={clientOptions}
                  onChange={(value) => {
                    clearUnpaidFilter();
        setClient(String(value || "").trim());
                    setClientContactFilter("");
                  }}
                  placeholder={L.searchClient}
                  limit={15}
                  renderSub={(name) => {
                    const info = clientMaster.find((row) => row.name === name);
                    return info ? `${info.manager || L.noManager} \u00B7 ${info.phone || L.noPhone}` : "";
                  }}
                />
              </Field>
            ) : (
              <Field label={L.worker}>
                <AutocompleteInput
                  value={worker}
                  options={workerOptions}
                  onChange={(value) => setWorker(value)}
                  placeholder={L.searchWorker}
                  limit={15}
                  renderSub={(name) => {
                    const info = workerMaster.find((row) => row.name === name);
                    return info ? `${info.phone || L.noPhone} \u00B7 ${info.bank || L.noBank}` : "";
                  }}
                />
              </Field>
            )}
            {isClientStatement ? (
              <Field label="담당자 (선택)">
                <select
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3"
                  value={clientContactFilter}
                  onChange={(event) => setClientContactFilter(event.target.value as "" | "unset" | string)}
                >
                  <option value="">전체</option>
                  <option value="unset">담당 미지정</option>
                  {statementClientContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name || "(이름 없음)"}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <div className="erp-statement-filter-actions">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  clearUnpaidFilter();
                  setClientContactFilter("");
                  setDateFilter({ startDate: "", endDate: "" });
                }}
              >
                {L.resetPeriod}
              </Button>
              <Button className="rounded-xl" onClick={handleGenerateStatement} disabled={!canGenerate}>
                <FileText size={16} className="mr-1" />
                {L.generate}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={isClientStatement ? handleBatchGenerateClientStatements : handleBatchGenerateWorkerStatements}
                disabled={
                  isClientStatement ? clientsWithStatementData.length === 0 : workersWithStatementData.length === 0
                }
                title={
                  isClientStatement
                    ? clientsWithStatementData.length
                      ? `\uAE30\uAC04 \uB0B4 \uAC70\uB798 \uC788\uB294 \uAC70\uB798\uCC98 ${clientsWithStatementData.length}\uACF3`
                      : L.batchGenerateEmptyClient
                    : workersWithStatementData.length
                      ? `\uAE30\uAC04 \uB0B4 \uAC70\uB798 \uC788\uB294 \uC2DC\uACF5\uC790 ${workersWithStatementData.length}\uBA85`
                      : L.batchGenerateEmptyWorker
                }
              >
                <Files size={16} className="mr-1" />
                {L.batchGenerate}
              </Button>
            </div>
          </div>

          {(unpaidOnly || unpaidOnlyRef.current || restrictedSaleIdsRef.current.length > 0) && (
            <p className="erp-statement-unpaid-badge mt-3 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 erp-text-caption font-semibold text-amber-800">
              {L.unpaidOnlyBadge}
            </p>
          )}

          {statementHint && <p className="erp-statement-hint">{statementHint}</p>}
              </>
            ) : activePageTab === "archive" ? (
              <p className="erp-text-caption text-slate-500">{L.archiveTabDesc}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {mountedPdfTab ? (
        <div className={activePageTab === "pdf" ? "" : "hidden"} aria-hidden={activePageTab !== "pdf"}>
          <PdfArchivePage
            isActive={isPageActive && activePageTab === "pdf"}
            bankTransactions={bankTransactions}
            clients={clientMaster as ClientMasterLike[]}
            currentUser={currentUser}
            taxInvoices={taxInvoices}
            setTaxInvoices={setTaxInvoices}
            erpVersion={erpVersion}
            onTaxInvoiceIssued={onTaxInvoiceIssued}
            pendingNav={pendingPdfArchiveNav}
            onPendingNavConsumed={onPendingPdfArchiveNavConsumed}
          />
        </div>
      ) : null}

      {activePageTab === "archive" && (
        <>
      <Card className="erp-statement-history-card mb-3 rounded-2xl shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <History size={15} className="text-slate-500" />
                <h3 className="erp-text-body font-bold text-slate-900">{L.historyTitle}</h3>
              </div>
              {statementGenerationLogs.length > 0 && setStatementFolders ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="erp-statement-history-btn rounded-lg"
                  disabled={Boolean(filingLogId) || batchFiling || fileableGenerationLogs.length === 0}
                  title={
                    fileableGenerationLogs.length
                      ? `\uC815\uB9AC \uAC00\uB2A5 ${fileableGenerationLogs.length}\uAC74`
                      : L.batchFileEmpty
                  }
                  onClick={handleBatchFileLogsToFolder}
                >
                  <FolderInput size={12} className="mr-1" />
                  {batchFiling ? "..." : L.batchFileToFolder}
                </Button>
              ) : null}
            </div>
            {statementGenerationLogs.length === 0 ? (
              <p className="erp-text-caption text-slate-500">{L.historyEmpty}</p>
            ) : (
            <div className="erp-statement-history-list">
              {statementGenerationLogs.map((log) => {
                const filed = findFolderItemByLogId(statementFolders, log.id);
                const folderButtonLabel =
                  filingLogId === log.id
                    ? "..."
                    : filed?.item.pdfArchiveId
                      ? L.fileToFolderDone
                      : filed
                        ? L.fileLinkPdf
                        : L.fileToFolder;
                const metaParts = [
                  formatStatementGenerationPeriod(log.startDate, log.endDate),
                  `${log.rowCount}\uAC74`,
                  log.clientStatementView ? formatStatementGenerationViewLabel(log.clientStatementView) : "",
                  formatStatementGenerationDateTime(log.createdAt),
                  log.createdBy || "",
                ].filter(Boolean);
                return (
                <div
                  key={log.id}
                  className="erp-statement-history-item erp-statement-history-item--link"
                  role="button"
                  tabIndex={0}
                  title={L.folderOpenStatement}
                  onClick={() => restoreGenerationLog(log)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      restoreGenerationLog(log);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="erp-statement-history-title">
                      <span className="text-slate-500">{formatStatementGenerationTypeLabel(log.statementType)}</span>
                      <span className="font-semibold text-slate-900">{log.subjectName}</span>
                    </div>
                    <div className="erp-statement-history-meta">{metaParts.join(" · ")}</div>
                  </div>
                  <div className="erp-statement-history-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="erp-statement-history-btn rounded-lg"
                      title={L.fileToFolder}
                      disabled={Boolean(filingLogId) || batchFiling || Boolean(filed?.item.pdfArchiveId)}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleFileLogToFolder(log);
                      }}
                    >
                      <FolderInput size={12} className="mr-0.5" />
                      {folderButtonLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="erp-statement-history-btn rounded-lg"
                      title={L.restore}
                      onClick={(event) => {
                        event.stopPropagation();
                        restoreGenerationLog(log);
                      }}
                    >
                      <RotateCcw size={12} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="erp-statement-history-btn rounded-lg text-red-600 hover:text-red-700"
                      title={L.remove}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteGenerationLog(log);
                      }}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>
            )}
            {folderMessage && <p className="mt-2 erp-text-caption font-semibold text-slate-600">{folderMessage}</p>}
          </CardContent>
        </Card>

      <Card className="erp-statement-folders-card mb-3 rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="mb-2">
            <h3 className="erp-text-body font-bold text-slate-900">{L.foldersTitle}</h3>
            {statementFolders.length > 0 && (
              <p className="mt-1 erp-text-caption font-semibold text-slate-600">
                {L.folderStats(folderStats.folderCount, folderStats.itemCount, folderStats.clientFolders, folderStats.workerFolders)}
              </p>
            )}
          </div>

          {statementFolders.length === 0 ? (
            <p className="erp-text-caption text-slate-500">{L.folderEmpty}</p>
          ) : (
            <>
              <div className="erp-statement-folder-toolbar">
                <FolderSearchInput query={folderQuery} setQuery={setFolderQuery} placeholder={L.folderSearch} />
                <div className="erp-statement-folder-toolbar-row">
                  <select
                    className="erp-statement-folder-sort erp-input rounded-lg border px-2 py-1 erp-text-caption"
                    value={folderSort}
                    onChange={(event) => setFolderSort(event.target.value as StatementFolderSort)}
                  >
                    <option value="updated">{L.folderSortUpdated}</option>
                    <option value="name">{L.folderSortName}</option>
                    <option value="items">{L.folderSortItems}</option>
                  </select>
                  <div className="erp-statement-folder-bulk-actions">
                    <Button type="button" variant="outline" size="sm" className="erp-statement-history-btn rounded-lg" onClick={expandVisibleFolders}>
                      {L.folderExpandAll}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="erp-statement-history-btn rounded-lg" onClick={collapseVisibleFolders}>
                      {L.folderCollapseAll}
                    </Button>
                  </div>
                </div>
              </div>

              {visibleFilteredFolders.length === 0 ? (
                <p className="erp-text-caption text-slate-500">{L.folderNoMatch}</p>
              ) : (
                <div className="erp-statement-folder-split">
                  <section className="erp-statement-folder-column">
                    <div className="erp-statement-folder-column-head">
                      <h4 className="erp-statement-folder-column-title">{L.foldersClientTitle}</h4>
                      <span className="erp-statement-folder-column-count">{filteredClientFolders.length}</span>
                    </div>
                    <div className="erp-statement-folder-column-body">
                      {renderFolderList(filteredClientFolders, L.folderColumnEmptyClient)}
                    </div>
                  </section>
                  <section className="erp-statement-folder-column">
                    <div className="erp-statement-folder-column-head">
                      <h4 className="erp-statement-folder-column-title">{L.foldersWorkerTitle}</h4>
                      <span className="erp-statement-folder-column-count">{filteredWorkerFolders.length}</span>
                    </div>
                    <div className="erp-statement-folder-column-body">
                      {renderFolderList(filteredWorkerFolders, L.folderColumnEmptyWorker)}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
        </>
      )}

      {activePageTab === "create" && (!statementGenerated ? (
        <Card className="erp-statement-empty-card rounded-2xl border-dashed shadow-sm">
          <CardContent className="erp-statement-empty-body">
            <FileText size={28} className="text-slate-400" />
            <h3 className="erp-text-section font-black text-slate-800">{L.emptyTitle}</h3>
            <p className="erp-text-body text-slate-500">
              {isClientStatement ? L.client : L.worker}
              {L.emptyBodyPrefix}
              <b>{L.generate}</b>
              {L.emptyBodySuffix}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="erp-statement-result-card rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-5">
            <StatementStepBadge step={2} label={L.step2} />

            <div className="erp-statement-result-head">
              <div className="erp-statement-result-title">
                <h2 className="erp-text-section font-black">
                  {isClientStatement ? L.clientSheetTitle : L.workerSheetTitle}
                </h2>
                <p className="erp-text-body text-slate-500">
                  <b className="text-slate-700">{activeSubject}</b>
                  <span className="mx-2 text-slate-300">|</span>
                  {periodLabel}
                </p>
              </div>

              <div className="erp-statement-result-metrics">
                {isClientStatement ? (
                  <>
                    <StatementMetricChip label={L.count} value={`${clientRows.length}${L.countUnit} \u00B7 ${clientTotals.staffCount}${L.peopleUnit}`} />
                    <StatementMetricChip label={L.total} value={formatKRW(clientTotals.subtotal)} />
                    <StatementMetricChip label={L.vat} value={formatKRW(clientTotals.vatAmount)} />
                    <StatementMetricChip label={L.grandTotal} value={formatKRW(clientTotals.grandTotal)} tone="text-emerald-700" />
                  </>
                ) : (
                  <>
                    <StatementMetricChip label={L.count} value={`${workerTotals.count}${L.countUnit}`} />
                    <StatementMetricChip label={L.grossPay} value={formatKRW(workerStatementSummary.grossPay)} />
                    <StatementMetricChip label={L.fee} value={formatKRW(workerStatementSummary.fee)} tone="text-red-600" />
                    <StatementMetricChip label={L.netPay} value={formatKRW(workerStatementSummary.netPay)} tone="text-emerald-700" />
                  </>
                )}
              </div>
            </div>

            <div className="erp-statement-action-bar">
              {isClientStatement && (
                <div className="erp-statement-view-toggle">
                  <button
                    type="button"
                    onClick={() => setClientStatementView("summary")}
                    className={`erp-statement-view-btn ${clientStatementView === "summary" ? "is-active" : ""}`}
                  >
                    {L.summary}
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientStatementView("detail")}
                    className={`erp-statement-view-btn ${clientStatementView === "detail" ? "is-active" : ""}`}
                  >
                    {L.detail}
                  </button>
                </div>
              )}

              <div className="erp-statement-action-group">
                <Button className="rounded-xl" disabled={pdfGenerating || !hasStatementData} onClick={() => generateStatementPdf(statementType)}>
                  <Download size={16} className="mr-1" />
                  {pdfGenerating ? L.pdfGenerating : L.pdfGenerate}
                </Button>
                {statementGenerated && (
                  <Button
                    type="button"
                    variant="outline"
                    className="erp-statement-share-link-btn rounded-xl"
                    disabled={pdfGenerating || !hasStatementData}
                    onClick={() => void shareStatementDownloadLink()}
                  >
                    <Link2 size={16} className="mr-1" />
                    {pdfGenerating ? "..." : L.shareLink}
                  </Button>
                )}
                {isClientStatement && (
                  <Button
                    className="erp-pdf-archive-kakao-btn rounded-xl"
                    disabled={pdfGenerating || !hasStatementData || !clientStatementGenerated}
                    title="카카오톡 보내기"
                    onClick={shareClientStatementPdf}
                  >
                    {pdfGenerating ? "..." : L.shareKakao}
                  </Button>
                )}
                {statementTeamChatSharePayload ? (
                  <TeamChatShareButton payload={statementTeamChatSharePayload} />
                ) : null}
                <TableExportToolbar
                  className="erp-statement-export-toolbar"
                  getTable={() =>
                    (isClientStatement ? clientPrintRef.current : workerPrintRef.current)?.querySelector(".excel-data-table") as HTMLTableElement | null
                  }
                  getExportRoot={() => (isClientStatement ? clientPrintRef.current : workerPrintRef.current) as HTMLElement | null}
                  fileName={exportFileName}
                  title={exportTitle}
                  hidePdf
                  disabled={!hasStatementData}
                />
              </div>
            </div>

            {(pdfMessage || isClientStatement || statementShareLink) && (
              <div className="erp-statement-status-row">
                {isClientStatement && (
                  <p className="erp-text-caption text-slate-500">
                    {clientStatementView === "detail" ? L.detailHint : L.summaryHint}
                  </p>
                )}
                {pdfMessage && <p className="erp-statement-pdf-message">{pdfMessage}</p>}
                {statementShareLink && (
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
                      {L.shareLinkCopy}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="erp-statement-preview-wrap">
              <StatementA4Preview
                layoutVersion={
                  isClientStatement
                    ? `c:${clientStatementView}:${clientDisplayRows.length}:${clientDisplayRows.map((row) => row.id).join(",")}`
                    : `w:${workerStatementSheetRows.length}:${workerStatementSheetRows.map((row) => row.id).join(",")}`
                }
              >
                {isClientStatement ? (
                  <ClientStatementSheet
                    ref={clientPrintRef}
                    clientName={statementClient || L.client}
                    clientInfo={selectedClientInfo as never}
                    companyProfile={companyProfile}
                    periodStart={dateFilter.startDate || String(clientRows[0]?.date || "")}
                    periodEnd={dateFilter.endDate || String(clientRows[clientRows.length - 1]?.date || "")}
                    issuedDate={clientStatementGenerated ? clientStatementIssuedDate : undefined}
                    summary={clientStatementSummary}
                    rows={clientDisplayRows}
                    emptyMessage={L.emptyClientRows}
                  />
                ) : (
                  <WorkerStatementSheet
                    ref={workerPrintRef}
                    workerName={statementWorkerName || L.worker}
                    workerInfo={selectedWorkerInfo as never}
                    companyProfile={companyProfile}
                    periodStart={workerStatementPeriodStart}
                    periodEnd={workerStatementPeriodEnd}
                    summary={workerStatementSummary}
                    rows={workerStatementSheetRows}
                    totals={workerTotals}
                    emptyMessage={L.emptyWorkerRows}
                  />
                )}
              </StatementA4Preview>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
