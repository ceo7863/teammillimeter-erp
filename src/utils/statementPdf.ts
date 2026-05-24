import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { A4_PORTRAIT_HEIGHT_PX, A4_PORTRAIT_WIDTH_PX } from "./statementSheetLayout";

type PdfOrientation = "portrait" | "landscape";

export type StatementPdfOptions = {
  orientation?: PdfOrientation;
  previewWindow?: Window | null;
  /** 내역서 DOM이면 페이지별 표 헤더 반복 */
  paginate?: boolean;
};

export function revokePdfBlobUrl(url: string) {
  if (url) URL.revokeObjectURL(url);
}

export function createPdfPreviewWindow(): Window | null {
  const previewWindow = window.open("about:blank", "_blank");
  if (!previewWindow) return null;

  previewWindow.document.title = "PDF 생성 중";
  previewWindow.document.open();
  previewWindow.document.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/><title>PDF 생성 중</title></head>
<body style="font-family:Malgun Gothic,sans-serif;padding:32px;color:#334155;">PDF 생성 중입니다...</body></html>`);
  previewWindow.document.close();
  return previewWindow;
}

function escapePdfHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export function renderPdfInPreviewWindow(previewWindow: Window, blobUrl: string, fileName: string): boolean {
  try {
    previewWindow.document.title = fileName;
    previewWindow.document.open();
    previewWindow.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${escapePdfHtml(fileName)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #525659; }
  iframe, embed { display: block; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<iframe src="${blobUrl}" title="${escapePdfHtml(fileName)}"></iframe>
</body>
</html>`);
    previewWindow.document.close();
    previewWindow.focus();
    return true;
  } catch (error) {
    console.warn("PDF preview tab update failed", error);
    return false;
  }
}

export type DeliverPdfResult = {
  previewOpened: boolean;
};

export function deliverPdf(blobUrl: string, fileName: string, previewWindow?: Window | null): DeliverPdfResult {
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (previewWindow && !previewWindow.closed && renderPdfInPreviewWindow(previewWindow, blobUrl, fileName)) {
    return { previewOpened: true };
  }

  return { previewOpened: false };
}

function cloneNode<T extends Node>(node: T | null | undefined): T | null {
  return node ? (node.cloneNode(true) as T) : null;
}

function getStatementBodyRows(dataTable: Element | null): HTMLTableRowElement[] {
  if (!dataTable) return [];

  const rows = Array.from(dataTable.querySelectorAll("tbody tr")).filter((row) => !row.classList.contains("excel-filler-row")) as HTMLTableRowElement[];
  const dataRows = rows.filter((row) => !row.querySelector(".excel-empty-cell"));
  if (dataRows.length) return dataRows;

  const emptyRow = rows.find((row) => row.querySelector(".excel-empty-cell"));
  return emptyRow ? [emptyRow] : [];
}

function createMeasureHost(): HTMLElement {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-12000px";
  host.style.top = "0";
  host.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
  host.style.pointerEvents = "none";
  host.style.visibility = "hidden";
  document.body.appendChild(host);
  return host;
}

function buildStatementPageElement(
  source: HTMLElement,
  options: {
    showFullHeader: boolean;
    bodyRows: HTMLTableRowElement[];
    showTableFooter: boolean;
  }
) {
  const sheet = document.createElement("div");
  sheet.className = `erp-statement-sheet is-pdf-capture ${options.showFullHeader ? "is-pdf-first-page" : "is-pdf-continuation-page"}`.trim();
  sheet.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
  sheet.style.minHeight = "auto";
  sheet.style.boxShadow = "none";

  const header = cloneNode(source.querySelector(".excel-sheet-header"));
  if (header) {
    sheet.appendChild(header);
  } else {
    const title = cloneNode(source.querySelector(".excel-sheet-title"));
    if (title) sheet.appendChild(title);
  }

  if (options.showFullHeader) {
    const recipient = cloneNode(source.querySelector(".excel-client-recipient"));
    const metaTable = cloneNode(source.querySelector(".excel-header-table"));
    if (recipient) sheet.appendChild(recipient);
    if (metaTable) sheet.appendChild(metaTable);
  } else {
    const recipient = cloneNode(source.querySelector(".excel-client-recipient"));
    if (recipient) sheet.appendChild(recipient);
    const continuation = document.createElement("div");
    continuation.className = "excel-pdf-continuation-note";
    continuation.textContent = "아래 내역 계속";
    sheet.appendChild(continuation);
  }

  const sourceTable = source.querySelector(".excel-data-table");
  const colgroup = cloneNode(sourceTable?.querySelector("colgroup"));
  const thead = cloneNode(sourceTable?.querySelector("thead"));
  const tfoot = cloneNode(sourceTable?.querySelector("tfoot"));

  const tableShell = document.createElement("div");
  tableShell.className = "excel-data-table-shell";
  const table = document.createElement("table");
  table.className = "excel-data-table";
  if (colgroup) table.appendChild(colgroup);
  if (thead) table.appendChild(thead);
  const tbody = document.createElement("tbody");
  options.bodyRows.forEach((row) => tbody.appendChild(row.cloneNode(true)));
  table.appendChild(tbody);
  if (options.showTableFooter && tfoot) table.appendChild(tfoot);
  tableShell.appendChild(table);
  sheet.appendChild(tableShell);

  if (options.showTableFooter) {
    const brand = cloneNode(source.querySelector(".excel-footer-brand"));
    if (brand) sheet.appendChild(brand);
  }

  return sheet;
}

function measurePageHeight(host: HTMLElement, pageElement: HTMLElement) {
  host.replaceChildren(pageElement);
  return pageElement.getBoundingClientRect().height;
}

function splitBodyRowsIntoGroups(rows: HTMLTableRowElement[]): HTMLTableRowElement[][] {
  const groups: HTMLTableRowElement[][] = [];
  let current: HTMLTableRowElement[] = [];

  rows.forEach((row) => {
    if (!row.classList.contains("excel-worker-sub-row") && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(row);
  });

  if (current.length) groups.push(current);
  return groups;
}

function fixRowspanForChunk(rows: HTMLTableRowElement[]) {
  const clones = rows.map((row) => row.cloneNode(true) as HTMLTableRowElement);
  const siteRowIndex = clones.findIndex((row) => !row.classList.contains("excel-worker-sub-row"));

  if (siteRowIndex >= 0) {
    const siteRow = clones[siteRowIndex];
    const dateCell = siteRow.querySelector("td[rowspan], .excel-date-cell-rowspan, .excel-date-cell");
    if (dateCell) {
      dateCell.setAttribute("rowspan", String(clones.length - siteRowIndex));
    }
  }

  return clones;
}

function canFitPage(
  host: HTMLElement,
  source: HTMLElement,
  bodyRows: HTMLTableRowElement[],
  showFullHeader: boolean,
  showTableFooter: boolean
) {
  const page = buildStatementPageElement(source, {
    showFullHeader,
    bodyRows: fixRowspanForChunk(bodyRows),
    showTableFooter,
  });
  return measurePageHeight(host, page) <= A4_PORTRAIT_HEIGHT_PX;
}

function paginateStatementRows(source: HTMLElement, host: HTMLElement, rows: HTMLTableRowElement[]) {
  if (!rows.length) {
    return [[]];
  }

  const groups = splitBodyRowsIntoGroups(rows);
  const pages: HTMLTableRowElement[][] = [];
  let pending: HTMLTableRowElement[] = [];

  const flushPending = () => {
    if (!pending.length) return;
    pages.push(pending);
    pending = [];
  };

  groups.forEach((group, groupIndex) => {
    const isLastGroup = groupIndex === groups.length - 1;

    const tryMerge = (extra: HTMLTableRowElement[], showFooter: boolean) =>
      canFitPage(host, source, [...pending, ...extra], pages.length === 0 && pending.length === 0, showFooter);

    if (tryMerge(group, isLastGroup && pending.length + group.length === rows.length)) {
      pending.push(...group);
      return;
    }

    flushPending();

    if (canFitPage(host, source, group, pages.length === 0, isLastGroup)) {
      pending = [...group];
      return;
    }

    let offset = 0;
    while (offset < group.length) {
      let bestCount = 1;

      for (let tryCount = 1; tryCount <= group.length - offset; tryCount += 1) {
        const slice = group.slice(offset, offset + tryCount);
        const isLastSlice = offset + tryCount >= group.length;
        const isLastPage = isLastGroup && isLastSlice;
        const showFullHeader = pages.length === 0 && offset === 0;

        if (canFitPage(host, source, slice, showFullHeader, isLastPage)) {
          bestCount = tryCount;
        } else {
          break;
        }
      }

      pages.push(group.slice(offset, offset + bestCount));
      offset += bestCount;
    }
  });

  flushPending();

  return pages.map((pageRows) => fixRowspanForChunk(pageRows));
}

async function captureStatementPage(pageElement: HTMLElement) {
  return html2canvas(pageElement, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    width: A4_PORTRAIT_WIDTH_PX,
    windowWidth: A4_PORTRAIT_WIDTH_PX,
  });
}

async function downloadPaginatedStatementPdf(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  const orientation = options.orientation ?? "portrait";
  const dataTable = element.querySelector(".excel-data-table");
  const bodyRows = getStatementBodyRows(dataTable);
  const host = createMeasureHost();

  let pageChunks: HTMLTableRowElement[][];
  try {
    pageChunks = paginateStatementRows(element, host, bodyRows);
  } finally {
    host.remove();
  }

  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const margin = 8;
  const printableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const printableHeight = pdf.internal.pageSize.getHeight() - margin * 2;

  for (let pageIndex = 0; pageIndex < pageChunks.length; pageIndex += 1) {
    const isFirstPage = pageIndex === 0;
    const isLastPage = pageIndex === pageChunks.length - 1;
    const pageElement = buildStatementPageElement(element, {
      showFullHeader: isFirstPage,
      bodyRows: pageChunks[pageIndex],
      showTableFooter: isLastPage,
    });

    pageElement.style.position = "fixed";
    pageElement.style.left = "-12000px";
    pageElement.style.top = "0";
    document.body.appendChild(pageElement);

    try {
      const canvas = await captureStatementPage(pageElement);
      const imgData = canvas.toDataURL("image/png");
      let imgHeight = (canvas.height * printableWidth) / canvas.width;
      let imgWidth = printableWidth;

      if (imgHeight > printableHeight) {
        const scale = printableHeight / imgHeight;
        imgHeight = printableHeight;
        imgWidth = printableWidth * scale;
      }

      if (pageIndex > 0) pdf.addPage("a4", orientation);
      pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
    } finally {
      pageElement.remove();
    }
  }

  const blob = pdf.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const delivery = deliverPdf(blobUrl, fileName, options.previewWindow);

  return { blobUrl, fileName, blob, pageCount: pageChunks.length || 1, previewOpened: delivery.previewOpened };
}

async function downloadFlatStatementPdf(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  const orientation = options.orientation ?? "landscape";

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    onclone: (clonedDoc) => {
      const cloned = clonedDoc.querySelector("[data-pdf-export-root]") as HTMLElement | null;
      if (cloned) {
        cloned.style.position = "static";
        cloned.style.left = "auto";
        cloned.style.top = "auto";
        cloned.style.zIndex = "auto";
        cloned.classList.add("is-pdf-capture");
      }
    },
  });

  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const margin = 8;
  const printableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const printableHeight = pdf.internal.pageSize.getHeight() - margin * 2;

  const imgData = canvas.toDataURL("image/png");
  const imgHeight = (canvas.height * printableWidth) / canvas.width;

  let pageIndex = 0;
  let remaining = imgHeight;

  while (remaining > 0) {
    if (pageIndex > 0) pdf.addPage("a4", orientation);
    const y = margin - pageIndex * printableHeight;
    pdf.addImage(imgData, "PNG", margin, y, printableWidth, imgHeight);
    remaining -= printableHeight;
    pageIndex += 1;
  }

  const blob = pdf.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const delivery = deliverPdf(blobUrl, fileName, options.previewWindow);

  return { blobUrl, fileName, blob, pageCount: pageIndex, previewOpened: delivery.previewOpened };
}

/** DOM 내역서 → A4 PDF (내역서는 페이지별 표 제목·헤더 반복) */
export async function downloadPdfFromHtmlElement(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  const usePagination = options.paginate !== false && element.matches("[data-pdf-export-root]");

  if (usePagination) {
    return downloadPaginatedStatementPdf(element, fileName, options);
  }

  return downloadFlatStatementPdf(element, fileName, options);
}
