import { createPdfPreviewWindow, downloadPdfFromHtmlElement } from "@/utils/statementPdf";
import { fixStatementCloneImages, waitForStatementImages } from "@/utils/statementDocument";
import { safeExportFileName } from "@/utils/tableExport";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function printListDocument(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;
  fixStatementCloneImages(clone);

  const host = document.createElement("div");
  host.className = "erp-statement-print-host";
  const sheetPage = document.createElement("div");
  sheetPage.className = "erp-statement-print-sheet-page";
  sheetPage.appendChild(clone);
  host.appendChild(sheetPage);

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

export async function exportListDocumentPdf(root: HTMLElement, fileName: string) {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;width:794px;";
  const clone = root.cloneNode(true) as HTMLElement;
  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    const previewWindow = createPdfPreviewWindow();
    const pdfName = `${safeExportFileName(fileName)}_${todayISO()}.pdf`;

    return await downloadPdfFromHtmlElement(clone, pdfName, {
      orientation: "portrait",
      paginate: false,
      previewWindow,
    });
  } finally {
    container.remove();
  }
}

export const printWorkerListDocument = printListDocument;
export const exportWorkerListPdf = exportListDocumentPdf;
