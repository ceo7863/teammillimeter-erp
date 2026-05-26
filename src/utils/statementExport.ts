import { exportStatementExcelFromPayload } from "@/utils/statementExcel";
import { collectStatementPrintPages } from "@/utils/statementPagination";
import {
  createPdfPreviewWindow,
  downloadPdfFromHtmlElement,
} from "@/utils/statementPdf";
import { fixStatementCloneImages, waitForStatementImages } from "@/utils/statementDocument";
import { safeExportFileName } from "@/utils/tableExport";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportStatementSheetExcel(root: HTMLElement, fileName: string) {
  await exportStatementExcelFromPayload(root, fileName);
}

export async function printStatementSheet(root: HTMLElement) {
  const pages = await collectStatementPrintPages(root);
  const host = document.createElement("div");
  host.className = "erp-statement-print-host";

  pages.forEach((page) => {
    fixStatementCloneImages(page);
    const sheetPage = document.createElement("div");
    sheetPage.className = "erp-statement-print-sheet-page";
    sheetPage.appendChild(page);
    host.appendChild(sheetPage);
  });

  document.body.appendChild(host);
  document.body.classList.add("erp-statement-printing");
  await waitForStatementImages(host);

  const cleanup = () => {
    host.remove();
    document.body.classList.remove("erp-statement-printing");
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.print();
  window.setTimeout(cleanup, 1500);
}

export async function exportStatementSheetPdf(root: HTMLElement, fileName: string) {
  const previewWindow = createPdfPreviewWindow();
  const pdfName = `${safeExportFileName(fileName)}_${todayISO()}.pdf`;

  if (root.matches("[data-pdf-export-root]")) {
    return downloadPdfFromHtmlElement(root, pdfName, {
      orientation: "portrait",
      paginate: true,
      previewWindow,
    });
  }

  return downloadPdfFromHtmlElement(root, pdfName, {
    orientation: "portrait",
    previewWindow,
  });
}
