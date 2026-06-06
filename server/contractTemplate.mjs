import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "templates");

const bundledFontPath = path.join(templatesDir, "fonts", "NotoSansCJKkr-Regular.otf");

const FONT_CANDIDATES = [
  bundledFontPath,
  "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
  "C:\\Windows\\Fonts\\malgun.ttf",
  "C:\\Windows\\Fonts\\malgun.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
];

const DEFAULT_PDF_CONTENT = {
  "unit-price-agreement": {
    basicUnitPrice: "350,000",
    nightWorkRate: "30,000",
    mealAllowance: "30,000",
    accommodationFee: "100,000",
    vehicleRate: "1,000",
  },
};

/** A4 ?????  ???(?) ?? ?? (pdf-lib, ??? origin) */
const UNIT_PRICE_AGREEMENT = {
  id: "unit-price-agreement",
  title: "\uAC00\uAD6C\uC2DC\uACF5 \uB2E8\uAC00\uD611\uC57D\uC11C",
  fileName: "\uAC00\uAD6C\uC2DC\uACF5_\uB2E8\uAC00\uD611\uC57D\uC11C_A4_1\uC7A5.pdf",
  templatePath: path.join(templatesDir, "unit-price-agreement.pdf"),
  fields: {
    clientName: { x: 115, y: 385, size: 10.5, coverWidth: 92, coverHeight: 14 },
    contactName: { x: 115, y: 403, size: 10.5, coverWidth: 92, coverHeight: 14 },
    contactPhone: { x: 115, y: 421, size: 10.5, coverWidth: 92, coverHeight: 14 },
  },
  /** pdftotext bbox on unit-price-agreement.pdf  value cells only */
  contentFields: {
    basicUnitPrice: { x: 238, y: 139, size: 10.5, coverWidth: 54, coverHeight: 12, suffixWon: true },
    nightWorkRate: { x: 242, y: 175, size: 10.5, coverWidth: 48, coverHeight: 12, suffixWon: true },
    vehicleRate: { x: 393, y: 229, size: 10.5, coverWidth: 40, coverHeight: 12, suffixWon: true },
    mealAllowance: { x: 248, y: 265, size: 10.5, coverWidth: 48, coverHeight: 12, suffixWon: true },
    accommodationFee: { x: 294, y: 283, size: 10.5, coverWidth: 54, coverHeight: 12, suffixWon: true },
  },
  signatureRect: { x: 105, y: 428, width: 92, height: 22 },
  dateField: { x: 78, y: 501, size: 10.5, coverWidth: 200, coverHeight: 14 },
  staticTextRepairs: [
    {
      text: "\uAC00\uAD6C\uC2DC\uACF5 \uB2E8\uAC00\uD611\uC57D\uC11C",
      x: 198,
      y: 86,
      size: 15,
      coverWidth: 180,
      coverHeight: 22,
    },
    {
      text:
        "\uBCF8 \uD611\uC57D\uC11C\uB294 \uBC1C\uC8FC\uCC98\uC640 \uC2DC\uACF5\uC5C5\uCCB4 \uAC04 \uAC00\uAD6C\uC2DC\uACF5 \uB2E8\uAC00 \uAE30\uC900\uC744 \uC815\uD558\uAE30 \uC704\uD558\uC5EC \uC791\uC131\uB418\uC5C8\uC73C\uBA70, \uC591 \uB2F9\uC0AC\uC790\uAC00 \uC11C\uBA85\uD568\uC73C\uB85C\uC368 \uD6A8\uB825\uC774 \uBC1C\uC0DD\uD569\uB2C8\uB2E4.",
      x: 78,
      y: 328,
      size: 9,
      coverWidth: 455,
      coverHeight: 14,
    },
    {
      text:
        "\uC0C1\uAE30 \uB2E8\uAC00 \uBC0F \uAE30\uC900\uC740 \uD604\uC7A5 \uC5EC\uAC74, \uACF5\uC0AC \uB09C\uC774\uB3C4, \uC790\uC7AC \uC0AC\uC591 \uB4F1\uC5D0 \uB530\uB77C \uC0C1\uD638 \uD611\uC758 \uD6C4 \uC870\uC815\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      x: 78,
      y: 340,
      size: 9,
      coverWidth: 455,
      coverHeight: 14,
    },
    {
      text: "\uC791\uC131\uC77C :              \uB144              \uC6D4              \uC77C",
      x: 78,
      y: 501,
      size: 10,
      coverWidth: 200,
      coverHeight: 14,
    },
  ],
};

const TEMPLATE_REGISTRY = {
  [UNIT_PRICE_AGREEMENT.id]: UNIT_PRICE_AGREEMENT,
};

function resolveKoreanFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return {
        bytes: fs.readFileSync(candidate),
        path: candidate,
      };
    }
  }
  throw new Error("\uD55C\uAE00 \uD3F0\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. (Noto CJK \uB610\uB294 \uB9D1\uC740\uACE0\uB515 \uD544\uC694)");
}

async function embedKoreanFont(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  const { bytes, path: fontPath } = resolveKoreanFont();
  const useSubset = !fontPath.toLowerCase().endsWith(".ttc");
  return pdfDoc.embedFont(bytes, { subset: useSubset });
}

function formatOverlayText(spec, text) {
  let value = String(text || "").trim();
  if (!value) return "";
  if (spec.suffixWon && !value.endsWith("\uC6D0")) value = `${value}\uC6D0`;
  return value;
}

function drawFieldWithCover(page, font, spec, text) {
  const value = formatOverlayText(spec, text);
  if (!value) return;
  const coverWidth = spec.coverWidth || 90;
  const coverHeight = spec.coverHeight || 14;
  page.drawRectangle({
    x: spec.x - 1,
    y: spec.y - 3,
    width: coverWidth,
    height: coverHeight,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  page.drawText(value, {
    x: spec.x,
    y: spec.y,
    size: spec.size || 10.5,
    font,
    color: rgb(0.08, 0.1, 0.14),
  });
}

export function getDefaultPdfContent(templateId) {
  const id = String(templateId || "").trim();
  const defaults = DEFAULT_PDF_CONTENT[id];
  return defaults ? { ...defaults } : null;
}

export function listContractTemplates() {
  return Object.values(TEMPLATE_REGISTRY).map((row) => ({
    id: row.id,
    title: row.title,
    fileName: row.fileName,
    defaultPdfContent: getDefaultPdfContent(row.id) || undefined,
  }));
}

export function getContractTemplate(templateId) {
  return TEMPLATE_REGISTRY[String(templateId || "").trim()] || null;
}

function drawStaticTextRepairs(page, font, template) {
  for (const spec of template.staticTextRepairs || []) {
    drawFieldWithCover(page, font, spec, spec.text);
  }
}

export async function fillContractTemplate(templateId, input = {}) {
  const template = getContractTemplate(templateId);
  if (!template) {
    return { ok: false, status: 400, error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uACC4\uC57D \uD15C\uD074\uB9BF\uC785\uB2C8\uB2E4." };
  }
  if (!fs.existsSync(template.templatePath)) {
    return { ok: false, status: 500, error: "\uACC4\uC57D \uD15C\uD074\uB9BF PDF\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const sourceBuffer = fs.readFileSync(template.templatePath);
  const pdfDoc = await PDFDocument.load(sourceBuffer);
  const font = await embedKoreanFont(pdfDoc);
  const page = pdfDoc.getPages()[0];

  drawStaticTextRepairs(page, font, template);
  drawFieldWithCover(page, font, template.fields.clientName, input.clientName);
  drawFieldWithCover(page, font, template.fields.contactName, input.contactName);
  drawFieldWithCover(page, font, template.fields.contactPhone, input.contactPhone);

  const defaultContent = getDefaultPdfContent(templateId) || {};
  const pdfContent = { ...defaultContent, ...(input.pdfContent || {}) };
  if (input.applyContentOverlay && template.contentFields) {
    for (const [key, spec] of Object.entries(template.contentFields)) {
      drawFieldWithCover(page, font, spec, pdfContent[key]);
    }
  }

  const buffer = Buffer.from(await pdfDoc.save());
  return {
    ok: true,
    buffer,
    template,
    fileName: template.fileName,
    title: template.title,
    signatureRect: template.signatureRect,
    dateField: template.dateField,
    pdfContent,
  };
}

export async function applySignatureToContractPdf(originalBuffer, signatureBuffer, options = {}) {
  const signatureRect = options.signatureRect || UNIT_PRICE_AGREEMENT.signatureRect;
  const dateField = options.dateField || UNIT_PRICE_AGREEMENT.dateField;
  const signedAt = options.signedAt ? new Date(options.signedAt) : new Date();

  const sourceDoc = await PDFDocument.load(originalBuffer);
  const pdfDoc = await PDFDocument.create();
  const copiedPages = await pdfDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
  copiedPages.forEach((page) => pdfDoc.addPage(page));

  const font = await embedKoreanFont(pdfDoc);
  const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
  const pngImage = await pdfDoc.embedPng(signatureBuffer);

  const sigWidth = signatureRect.width;
  const sigHeight = (pngImage.height / pngImage.width) * sigWidth;
  lastPage.drawImage(pngImage, {
    x: signatureRect.x,
    y: signatureRect.y + Math.max(0, (signatureRect.height - sigHeight) / 2),
    width: sigWidth,
    height: sigHeight,
  });

  const kst = new Date(signedAt.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const dateText = `${kst.getFullYear()}\uB144 ${String(kst.getMonth() + 1).padStart(2, "0")}\uC6D4 ${String(kst.getDate()).padStart(2, "0")}\uC77C`;
  if (dateField.coverWidth) {
    drawFieldWithCover(lastPage, font, dateField, dateText);
  } else {
    lastPage.drawText(dateText, {
      x: dateField.x,
      y: dateField.y,
      size: dateField.size || 10.5,
      font,
      color: rgb(0.08, 0.1, 0.14),
    });
  }

  return Buffer.from(await pdfDoc.save());
}
