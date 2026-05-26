import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { collectStatementPrintPages } from "./statementPagination";
import {
  applyStatementSingleA4PageLayout,
  cloneStatementDocument,
  fixStatementCloneImages,
  flattenStatementFitCells,
  prepareStatementSheetPrintClone,
  waitForStatementImages,
} from "./statementDocument";
import {
  A4_PORTRAIT_HEIGHT_PX,
  A4_PORTRAIT_WIDTH_PX,
  shouldCaptureStatementAsSingleA4Page,
} from "./statementSheetLayout";

type PdfOrientation = "portrait" | "landscape";

const PDF_JPEG_QUALITY = 0.92;

function canvasToPdfImageData(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/jpeg", PDF_JPEG_QUALITY);
}

function createStatementPdf(orientation: PdfOrientation) {
  return new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
}

export type StatementPdfOptions = {
  orientation?: PdfOrientation;
  previewWindow?: Window | null;
  /** 내역서 DOM이면 페이지별 표 헤더 반복 */
  paginate?: boolean;
  /** false면 다운로드/미리보기 없이 blob만 생성 */
  deliver?: boolean;
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

function finalizeStatementPdf(
  blob: Blob,
  fileName: string,
  pageCount: number,
  options: StatementPdfOptions
): { blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean } {
  const blobUrl = URL.createObjectURL(blob);
  const previewOpened =
    options.deliver === false ? false : deliverPdf(blobUrl, fileName, options.previewWindow).previewOpened;
  return { blobUrl, fileName, blob, pageCount, previewOpened };
}

async function captureStatementPage(pageElement: HTMLElement, options: { fullPage?: boolean } = {}) {
  const width = A4_PORTRAIT_WIDTH_PX;
  const contentHeight = Math.ceil(Math.max(pageElement.scrollHeight, pageElement.offsetHeight, A4_PORTRAIT_HEIGHT_PX));
  const height = options.fullPage ? A4_PORTRAIT_HEIGHT_PX : contentHeight;

  return html2canvas(pageElement, {
    scale: 1.5,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
  });
}

async function downloadPaginatedStatementPdf(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  const orientation: PdfOrientation = "portrait";
  const pages = await collectStatementPrintPages(element);
  const pdf = createStatementPdf(orientation);
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageElement = pages[pageIndex];
    flattenStatementFitCells(pageElement);
    fixStatementCloneImages(pageElement);
    pageElement.classList.remove("is-pdf-export-fixed");
    pageElement.classList.add("is-pdf-export", "is-a4-page");
    pageElement.style.position = "fixed";
    pageElement.style.left = "-12000px";
    pageElement.style.top = "0";
    pageElement.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
    pageElement.style.minHeight = `${A4_PORTRAIT_HEIGHT_PX}px`;
    pageElement.style.height = `${A4_PORTRAIT_HEIGHT_PX}px`;
    pageElement.style.maxHeight = `${A4_PORTRAIT_HEIGHT_PX}px`;
    pageElement.style.overflow = "hidden";
    pageElement.classList.add("is-pdf-export-fixed");
    pageElement.style.boxShadow = "none";
    document.body.appendChild(pageElement);

    try {
      await waitForStatementImages(pageElement);
      const canvas = await captureStatementPage(pageElement, { fullPage: true });
      const imgData = canvasToPdfImageData(canvas);

      if (pageIndex > 0) pdf.addPage("a4", orientation);
      pdf.addImage(imgData, "JPEG", 0, 0, pageWidthMm, pageHeightMm);
    } finally {
      pageElement.remove();
    }
  }

  const blob = pdf.output("blob");
  return finalizeStatementPdf(blob, fileName, pages.length || 1, options);
}

function createStatementExportClone(source: HTMLElement) {
  return cloneStatementDocument(source, { forPdf: true });
}

const STATEMENT_CAPTURE_SCALE = 2;

async function captureStatementExportCanvas(clone: HTMLElement) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4_PORTRAIT_WIDTH_PX}px;overflow:visible;background:#fff;`;
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await waitForStatementImages(clone);

    const naturalHeight = Math.ceil(Math.max(clone.offsetHeight, clone.scrollHeight, A4_PORTRAIT_HEIGHT_PX));
    const singleA4Page = shouldCaptureStatementAsSingleA4Page(naturalHeight);
    if (singleA4Page) {
      applyStatementSingleA4PageLayout(clone);
    } else {
      clone.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
      clone.style.minWidth = `${A4_PORTRAIT_WIDTH_PX}px`;
      clone.style.boxSizing = "border-box";
      clone.style.boxShadow = "none";
      clone.style.margin = "0";
    }
    const captureHeight = singleA4Page ? A4_PORTRAIT_HEIGHT_PX : naturalHeight;

    const canvas = await html2canvas(clone, {
      scale: STATEMENT_CAPTURE_SCALE,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      width: A4_PORTRAIT_WIDTH_PX,
      height: captureHeight,
      windowWidth: A4_PORTRAIT_WIDTH_PX,
      windowHeight: captureHeight,
    });
    return { canvas, singleA4Page };
  } finally {
    host.remove();
  }
}

function scaleCanvasToSingleA4Page(sourceCanvas: HTMLCanvasElement) {
  const output = document.createElement("canvas");
  output.width = A4_PORTRAIT_WIDTH_PX * STATEMENT_CAPTURE_SCALE;
  output.height = A4_PORTRAIT_HEIGHT_PX * STATEMENT_CAPTURE_SCALE;
  const ctx = output.getContext("2d");
  if (!ctx) return sourceCanvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, output.width, output.height);

  const fitScale = Math.min(output.width / sourceCanvas.width, output.height / sourceCanvas.height);
  const drawWidth = sourceCanvas.width * fitScale;
  const drawHeight = sourceCanvas.height * fitScale;
  const offsetX = (output.width - drawWidth) / 2;
  const offsetY = (output.height - drawHeight) / 2;
  ctx.drawImage(sourceCanvas, offsetX, offsetY, drawWidth, drawHeight);
  return output;
}

/** Capture on-screen statement as one A4 page image (WYSIWYG, always single page). */
export async function captureStatementPrintCanvas(root: HTMLElement) {
  const clone = prepareStatementSheetPrintClone(root);
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4_PORTRAIT_WIDTH_PX}px;overflow:visible;background:#fff;`;
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await waitForStatementImages(clone);

    const naturalHeight = Math.ceil(Math.max(clone.offsetHeight, clone.scrollHeight, A4_PORTRAIT_HEIGHT_PX));
    const fitsSinglePage = shouldCaptureStatementAsSingleA4Page(naturalHeight);

    if (fitsSinglePage) {
      applyStatementSingleA4PageLayout(clone);
      return html2canvas(clone, {
        scale: STATEMENT_CAPTURE_SCALE,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        width: A4_PORTRAIT_WIDTH_PX,
        height: A4_PORTRAIT_HEIGHT_PX,
        windowWidth: A4_PORTRAIT_WIDTH_PX,
        windowHeight: A4_PORTRAIT_HEIGHT_PX,
      });
    }

    const sourceCanvas = await html2canvas(clone, {
      scale: STATEMENT_CAPTURE_SCALE,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      width: A4_PORTRAIT_WIDTH_PX,
      height: naturalHeight,
      windowWidth: A4_PORTRAIT_WIDTH_PX,
      windowHeight: naturalHeight,
    });
    return scaleCanvasToSingleA4Page(sourceCanvas);
  } finally {
    host.remove();
  }
}

/** Statement sheet → single A4 PDF (same capture path as print). */
export async function downloadStatementSinglePagePdf(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  const orientation = options.orientation ?? "portrait";
  const canvas = await captureStatementPrintCanvas(element);
  const pdf = createStatementPdf(orientation);
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const imgData = canvasToPdfImageData(canvas);
  pdf.addImage(imgData, "JPEG", 0, 0, pageWidthMm, pageHeightMm);

  const blob = pdf.output("blob");
  return finalizeStatementPdf(blob, fileName, 1, options);
}

function addCanvasPagesToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  orientation: PdfOrientation,
  options: { singleA4Page?: boolean } = {}
) {
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const imgData = canvasToPdfImageData(canvas);
  const renderWidthMm = pageWidthMm;
  const renderHeightMm = (canvas.height / canvas.width) * renderWidthMm;

  if (options.singleA4Page || renderHeightMm <= pageHeightMm + 0.5) {
    pdf.addImage(imgData, "JPEG", 0, 0, renderWidthMm, pageHeightMm);
    return 1;
  }

  const fitScale = pageHeightMm / renderHeightMm;
  if (fitScale >= 0.88) {
    pdf.addImage(imgData, "JPEG", 0, 0, renderWidthMm * fitScale, pageHeightMm);
    return 1;
  }

  let pageIndex = 0;
  let offsetMm = 0;

  while (offsetMm < renderHeightMm - 0.5) {
    if (pageIndex > 0) pdf.addPage("a4", orientation);
    pdf.addImage(imgData, "JPEG", 0, -offsetMm, renderWidthMm, renderHeightMm);
    offsetMm += pageHeightMm;
    pageIndex += 1;
  }

  return pageIndex;
}

async function downloadStatementWysiwygPdf(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  const orientation = options.orientation ?? "portrait";
  const clone = createStatementExportClone(element);
  const { canvas, singleA4Page } = await captureStatementExportCanvas(clone);
  const pdf = createStatementPdf(orientation);
  const pageCount = addCanvasPagesToPdf(pdf, canvas, orientation, { singleA4Page });

  const blob = pdf.output("blob");
  return finalizeStatementPdf(blob, fileName, pageCount, options);
}

function prepareStatementDomForCapture(root: HTMLElement) {
  root.style.position = "static";
  root.style.left = "auto";
  root.style.top = "auto";
  root.style.zIndex = "auto";
  root.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
  root.style.minWidth = `${A4_PORTRAIT_WIDTH_PX}px`;
  root.style.boxShadow = "none";
  root.classList.add("is-pdf-export");
  flattenStatementFitCells(root);
}

async function downloadFlatStatementPdf(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  const isStatement = element.matches("[data-pdf-export-root]");
  const orientation = options.orientation ?? (isStatement ? "portrait" : "landscape");

  await waitForStatementImages(element);

  const canvas = await html2canvas(element, {
    scale: 1.5,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    width: isStatement ? A4_PORTRAIT_WIDTH_PX : undefined,
    windowWidth: isStatement ? A4_PORTRAIT_WIDTH_PX : undefined,
    onclone: (clonedDoc) => {
      const cloned = clonedDoc.querySelector("[data-pdf-export-root]") as HTMLElement | null;
      if (cloned) {
        prepareStatementDomForCapture(cloned);
      }
    },
  });

  const pdf = createStatementPdf(orientation);
  const margin = 8;
  const printableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const printableHeight = pdf.internal.pageSize.getHeight() - margin * 2;

  const imgData = canvasToPdfImageData(canvas);
  const imgHeight = (canvas.height * printableWidth) / canvas.width;

  let pageIndex = 0;
  let remaining = imgHeight;

  while (remaining > 0) {
    if (pageIndex > 0) pdf.addPage("a4", orientation);
    const y = margin - pageIndex * printableHeight;
    pdf.addImage(imgData, "JPEG", margin, y, printableWidth, imgHeight);
    remaining -= printableHeight;
    pageIndex += 1;
  }

  const blob = pdf.output("blob");
  return finalizeStatementPdf(blob, fileName, pageIndex, options);
}

/** DOM 내역서 → A4 PDF (기본: 화면과 동일 DOM, A4 세로 자동 분할) */
export async function downloadPdfFromHtmlElement(
  element: HTMLElement,
  fileName: string,
  options: StatementPdfOptions = {}
): Promise<{ blobUrl: string; fileName: string; blob: Blob; pageCount: number; previewOpened: boolean }> {
  if (element.matches("[data-pdf-export-root]")) {
    if (options.paginate !== false) {
      return downloadPaginatedStatementPdf(element, fileName, options);
    }
    return downloadStatementWysiwygPdf(element, fileName, options);
  }

  return downloadFlatStatementPdf(element, fileName, options);
}
