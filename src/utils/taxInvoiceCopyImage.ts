import html2canvas from "html2canvas";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TaxInvoiceCopySheet } from "@/components/TaxInvoiceCopySheet";
import { A4_PORTRAIT_WIDTH_PX } from "@/utils/statementSheetLayout";
import type { TaxInvoiceCopySheetData } from "@/utils/taxInvoiceCopyData";

const JPEG_QUALITY = 0.92;
const CAPTURE_SCALE = 2;

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function waitForFonts() {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font loading errors
    }
  }
}

export async function downloadTaxInvoiceCopyJpg(data: TaxInvoiceCopySheetData, fileName: string) {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4_PORTRAIT_WIDTH_PX}px;overflow:visible;background:#fff;`;
  document.body.appendChild(host);

  let root: Root | null = null;
  try {
    root = createRoot(host);
    root.render(createElement(TaxInvoiceCopySheet, { data }));
    await waitForFonts();
    await waitForPaint();

    const sheet = host.querySelector("[data-tax-invoice-copy-root]") as HTMLElement | null;
    if (!sheet) {
      throw new Error("\uC138\uAE08\uACC4\uC0B0\uC11C \uC0AC\uBCF8 \uB80C\uB354\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }

    const naturalHeight = Math.ceil(Math.max(sheet.offsetHeight, sheet.scrollHeight, 400));
    const canvas = await html2canvas(sheet, {
      scale: CAPTURE_SCALE,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      width: A4_PORTRAIT_WIDTH_PX,
      height: naturalHeight,
      windowWidth: A4_PORTRAIT_WIDTH_PX,
      windowHeight: naturalHeight,
    });

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) {
      throw new Error("JPEG \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }

    const safeName = fileName.endsWith(".jpg") ? fileName : `${fileName}.jpg`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    root?.unmount();
    host.remove();
  }
}
