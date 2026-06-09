import { importWithStaleChunkReload } from "./dynamicImport";

export type DocumentExtractResult = {
  text: string;
  previewUrl: string;
  source: "pdf-text" | "ocr";
};

const MIN_PDF_TEXT_CHARS = 24;

async function loadPdfJs() {
  const pdfjs = await importWithStaleChunkReload(() => import("pdfjs-dist/legacy/build/pdf.js"));
  const workerSrc = (
    await importWithStaleChunkReload(() => import("pdfjs-dist/legacy/build/pdf.worker.min.js?url"))
  ).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

async function renderPdfPageToDataUrl(pdfjs: Awaited<ReturnType<typeof loadPdfJs>>, page: unknown, scale = 1.5) {
  const viewport = (page as { getViewport: (opts: { scale: number }) => { width: number; height: number } }).getViewport({
    scale,
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  await (
    page as {
      render: (params: { canvasContext: CanvasRenderingContext2D; viewport: typeof viewport }) => {
        promise: Promise<void>;
      };
    }
  ).render({ canvasContext: context, viewport }).promise;
  return { dataUrl: canvas.toDataURL("image/png"), canvas };
}

async function extractPdfText(pdfjs: Awaited<ReturnType<typeof loadPdfJs>>, data: Uint8Array) {
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? String(item.str || "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) chunks.push(pageText);
  }
  const page = await doc.getPage(1);
  const rendered = await renderPdfPageToDataUrl(pdfjs, page);
  return { text: chunks.join("\n"), previewUrl: rendered.dataUrl, canvas: rendered.canvas };
}

async function ocrCanvas(canvas: HTMLCanvasElement) {
  const { createWorker } = await importWithStaleChunkReload(() => import("tesseract.js"));
  const worker = await createWorker("kor");
  try {
    const result = await worker.recognize(canvas);
    return String(result.data.text || "").trim();
  } finally {
    await worker.terminate();
  }
}

async function ocrImageFile(file: File) {
  const previewUrl = URL.createObjectURL(file);
  const image = await loadImage(previewUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  context.drawImage(image, 0, 0);
  const text = await ocrCanvas(canvas);
  return { text, previewUrl, source: "ocr" as const };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = url;
  });
}

export async function extractBusinessRegistrationDocument(file: File): Promise<DocumentExtractResult> {
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/")) {
    const result = await ocrImageFile(file);
    return { text: result.text, previewUrl: result.previewUrl, source: result.source };
  }

  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractPdfText(pdfjs, data);
    if (extracted.text.replace(/\s/g, "").length >= MIN_PDF_TEXT_CHARS) {
      return { text: extracted.text, previewUrl: extracted.previewUrl, source: "pdf-text" };
    }
    const ocrText = await ocrCanvas(extracted.canvas);
    return { text: ocrText || extracted.text, previewUrl: extracted.previewUrl, source: "ocr" };
  }

  throw new Error("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4. PDF \uB610\uB294 \uC774\uBBF8\uC9C0\uB97C \uC62C\uB824 \uC8FC\uC138\uC694.");
}

export function revokeDocumentPreviewUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}
