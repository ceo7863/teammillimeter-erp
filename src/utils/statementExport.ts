import { exportStatementExcelFromPayload } from "@/utils/statementExcel";
import { captureStatementPrintCanvas, createPdfPreviewWindow, downloadPdfFromHtmlElement } from "@/utils/statementPdf";
import { safeExportFileName } from "@/utils/tableExport";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportStatementSheetExcel(root: HTMLElement, fileName: string) {
  await exportStatementExcelFromPayload(root, fileName);
}

export async function printStatementSheet(root: HTMLElement) {
  const canvas = await captureStatementPrintCanvas(root);
  const dataUrl = canvas.toDataURL("image/png");

  const host = document.createElement("div");
  host.className = "erp-statement-print-host erp-statement-print-host--image";
  const page = document.createElement("div");
  page.className = "erp-statement-print-page";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "";
  page.appendChild(img);
  host.appendChild(page);
  document.body.appendChild(host);
  document.body.classList.add("erp-statement-printing");

  await new Promise<void>((resolve) => {
    if (img.complete) {
      resolve();
      return;
    }
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });

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
  return downloadPdfFromHtmlElement(root, `${safeExportFileName(fileName)}_${todayISO()}.pdf`, {
    orientation: "portrait",
    previewWindow,
    paginate: root.matches("[data-pdf-export-root]"),
  });
}
