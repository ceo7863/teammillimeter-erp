import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { getErpState } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "templates");

const bundledFontPath = path.join(templatesDir, "fonts", "NotoSansCJKkr-Regular.otf");
const logoPath = path.join(templatesDir, "team-mm-logo.png");

const FONT_CANDIDATES = [
  bundledFontPath,
  "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
  "C:\\Windows\\Fonts\\malgun.ttf",
  "C:\\Windows\\Fonts\\malgun.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
];

const PAGE = { width: 595.28, height: 841.89, margin: 46 };

const COLORS = {
  ink: rgb(0.059, 0.09, 0.165),
  muted: rgb(0.392, 0.455, 0.533),
  border: rgb(0.886, 0.906, 0.941),
  headerBg: rgb(0.973, 0.98, 0.988),
  accent: rgb(0.976, 0.451, 0.086),
  white: rgb(1, 1, 1),
  panelBg: rgb(0.984, 0.988, 0.992),
};

const DEFAULT_COMPANY = {
  name: "(\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130",
  businessNo: "505-88-03515",
  ceoName: "\uBC30\uC885\uC6D0",
  phone: "010-5797-7863",
  address: "\uACBD\uAE30\uB3C4 \uACE0\uC591\uC2DC \uB355\uC591\uAD6C \uC0BC\uB9C93\uAE38 5, B140\uD638",
  bizType: "\uAC74\uC124\uC5C5",
  bizClass: "\uAC00\uAD6C\uC2DC\uACF5",
};

const DEFAULT_PDF_CONTENT = {
  "unit-price-agreement": {
    basicUnitPrice: "350,000",
    nightWorkRate: "30,000",
    mealAllowance: "30,000",
    accommodationFee: "100,000",
    vehicleRate: "1,000",
  },
};

const UNIT_PRICE_AGREEMENT = {
  id: "unit-price-agreement",
  title: "\uAC00\uAD6C\uC2DC\uACF5 \uB2E8\uAC00\uD611\uC57D\uC11C",
  fileName: "\uAC00\uAD6C\uC2DC\uACF5_\uB2E8\uAC00\uD611\uC57D\uC11C_A4_1\uC7A5.pdf",
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

function loadCompanyProfile() {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const raw = data.companyProfile && typeof data.companyProfile === "object" ? data.companyProfile : {};
  return {
    name: String(raw.name || DEFAULT_COMPANY.name).trim() || DEFAULT_COMPANY.name,
    businessNo: String(raw.businessNo || DEFAULT_COMPANY.businessNo).trim(),
    ceoName: String(raw.ceoName || DEFAULT_COMPANY.ceoName).trim(),
    phone: String(raw.phone || DEFAULT_COMPANY.phone).trim(),
    address: String(raw.address || DEFAULT_COMPANY.address).trim(),
    bizType: String(raw.bizType || DEFAULT_COMPANY.bizType).trim(),
    bizClass: String(raw.bizClass || DEFAULT_COMPANY.bizClass).trim(),
  };
}

function formatWon(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.endsWith("\uC6D0") ? text : `${text}\uC6D0`;
}

function drawText(page, font, text, x, y, size, color = COLORS.ink) {
  const value = String(text || "").trim();
  if (!value) return;
  page.drawText(value, { x, y, size, font, color });
}

function wrapTextLines(font, text, maxWidth, size) {
  const value = String(text || "").trim();
  if (!value) return [];
  const lines = [];
  let current = "";
  for (const ch of value) {
    const next = current + ch;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(page, font, text, x, y, maxWidth, size, color, lineHeight) {
  const lines = wrapTextLines(font, text, maxWidth, size);
  let cursor = y;
  for (const line of lines) {
    drawText(page, font, line, x, cursor, size, color);
    cursor -= lineHeight;
  }
  return cursor;
}

function drawLine(page, x1, y1, x2, y2, thickness = 1, color = COLORS.border) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color,
  });
}

function drawRect(page, x, y, width, height, options = {}) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: options.fill || undefined,
    borderColor: options.border || undefined,
    borderWidth: options.borderWidth ?? 0,
  });
}

async function embedLogo(pdfDoc) {
  if (!fs.existsSync(logoPath)) return null;
  const bytes = fs.readFileSync(logoPath);
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

function buildPricingRows(pdfContent) {
  const c = pdfContent || {};
  return [
    { label: "\uAE30\uBCF8 \uC2DC\uACF5 \uB2E8\uAC00", value: `1\uD488\uB2F9 ${formatWon(c.basicUnitPrice)}` },
    { label: "\uD45C\uC900 \uADDC\uBB34\uC2DC\uAC04", value: "08:00 ~ 17:00" },
    { label: "\uC57C\uAC04\uC791\uC5C5", value: `\uC2DC\uAC04\uB2F9 ${formatWon(c.nightWorkRate)}` },
    { label: "\uC9C0\uBC29\uCD9C\uC7A5 \uC218\uB2F9", value: "\uD604\uC7A5\uB2F9 1\uC778 1\uD488 \uCD94\uAC00 \uC801\uC6A9" },
    { label: "\uCD9C\uC7A5 \uC801\uC6A9 \uC608\uC2DC", value: "3\uC77C \uACF5\uC0AC \uC2DC : \uAE30\uBCF8 3\uD488 + \uCD9C\uC7A5 1\uD488 = \uCD1D 4\uD488" },
    {
      label: "\uCC28\uB7C9\uACBD\uBE44",
      value: `2\uC778 1\uB300 \uAE30\uC900 / \uC11C\uC6B8\uD1A8\uAC8C\uC774\uD2B8 \uAE30\uC900 km\uB2F9 ${formatWon(c.vehicleRate)}`,
    },
    { label: "\uCC28\uB7C9\uACBD\uBE44 \uD3EC\uD568", value: "\uC720\uB958\uBE44, \uD86D\uD589\uB8CC, \uC8FC\uCC28\uBE44" },
    { label: "\uC2DD\uB300", value: `1\uC778 1\uC77C ${formatWon(c.mealAllowance)} (3\uC2DD \uAE30\uC900)` },
    {
      label: "\uC219\uBC15\uBE44",
      value: `2\uC778 1\uC2E4 \uAE30\uC900, 1\uBC15 ${formatWon(c.accommodationFee)} \uB0B4\uC678 \uC2E4\uBE44 \uC815\uC0B0`,
    },
    { label: "\uAE30\uD0C0 \uACBD\uBE44", value: "\uC5C5\uBB34 \uC218\uD589\uC5D0 \uD544\uC694\uD55C \uC2E4\uACBD\uBE44 \uBCC4\uB3C4 \uCCAD\uAD6C" },
  ];
}

async function buildUnitPriceAgreementPdf(input = {}) {
  const company = input.companyProfile || loadCompanyProfile();
  const defaultContent = getDefaultPdfContent("unit-price-agreement") || {};
  const pdfContent = { ...defaultContent, ...(input.pdfContent || {}) };

  const pdfDoc = await PDFDocument.create();
  const font = await embedKoreanFont(pdfDoc);
  const logo = await embedLogo(pdfDoc);
  const page = pdfDoc.addPage([PAGE.width, PAGE.height]);

  const contentLeft = PAGE.margin;
  const contentRight = PAGE.width - PAGE.margin;
  const contentWidth = contentRight - contentLeft;
  let cursorY = PAGE.height - PAGE.margin;

  if (logo) {
    const logoHeight = 42;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    page.drawImage(logo, {
      x: contentLeft,
      y: cursorY - logoHeight + 6,
      width: logoWidth,
      height: logoHeight,
    });
  }

  const companyX = contentLeft + 150;
  drawText(page, font, company.name, companyX, cursorY - 4, 11.5, COLORS.ink);
  drawText(
    page,
    font,
    `\uC0AC\uC5C5\uC790\uBC88\uD638 ${company.businessNo}`,
    companyX,
    cursorY - 18,
    8.5,
    COLORS.muted,
  );
  if (company.phone) {
    drawText(page, font, `Tel ${company.phone}`, companyX, cursorY - 30, 8.5, COLORS.muted);
  }
  if (company.address) {
    drawText(page, font, company.address, companyX, cursorY - 42, 8.5, COLORS.muted);
  }

  cursorY -= 58;
  drawRect(page, contentLeft, cursorY, contentWidth, 3, { fill: COLORS.accent });
  cursorY -= 22;

  const title = UNIT_PRICE_AGREEMENT.title;
  const titleWidth = font.widthOfTextAtSize(title, 17);
  drawText(page, font, title, contentLeft + (contentWidth - titleWidth) / 2, cursorY, 17, COLORS.ink);
  cursorY -= 10;
  drawLine(page, contentLeft, cursorY, contentRight, cursorY, 1.6, COLORS.ink);
  cursorY -= 18;

  const tableTop = cursorY;
  const colSplit = contentLeft + 118;
  const rowHeight = 21.5;
  const rows = buildPricingRows(pdfContent);
  const tableHeight = rowHeight * (rows.length + 1);

  drawRect(page, contentLeft, tableTop - tableHeight, contentWidth, tableHeight, {
    border: COLORS.border,
    borderWidth: 1,
  });
  drawRect(page, contentLeft, tableTop - rowHeight, contentWidth, rowHeight, { fill: COLORS.headerBg });
  drawLine(page, colSplit, tableTop, colSplit, tableTop - tableHeight, 1, COLORS.border);
  drawText(page, font, "\uAD6C\uBD84", contentLeft + 12, tableTop - 15, 9.5, COLORS.ink);
  drawText(page, font, "\uAE30\uC900", colSplit + 12, tableTop - 15, 9.5, COLORS.ink);

  rows.forEach((row, index) => {
    const rowTop = tableTop - rowHeight * (index + 1);
    const rowBottom = rowTop - rowHeight;
    if (index % 2 === 1) {
      drawRect(page, contentLeft + 0.5, rowBottom + 0.5, contentWidth - 1, rowHeight - 1, { fill: COLORS.panelBg });
    }
    drawLine(page, contentLeft, rowBottom, contentRight, rowBottom, 0.8, COLORS.border);
    drawText(page, font, row.label, contentLeft + 12, rowBottom + 7, 9.2, COLORS.ink);
    drawText(page, font, row.value, colSplit + 12, rowBottom + 7, 9.2, COLORS.ink);
  });

  cursorY = tableTop - tableHeight - 16;
  const terms = [
    "\u203B \uC0C1\uAE30 \uAE08\uC561\uC740 \uBD80\uAC00\uAC00\uCE58\uC138 \uBCC4\uB3C4 \uAE30\uC900\uC774\uBA70, \uBCC4\uB3C4 \uC11C\uBA74 \uD569\uC758\uAC00 \uC5C6\uB294 \uD55C \uBCF8 \uB2E8\uAC00\uB97C \uC801\uC6A9\uD55C\uB2E4.",
    "\u203B \uBCF8 \uD611\uC57D\uC11C\uB294 \uC804\uC790\uBB38\uC11C \uBC0F \uC804\uC790\uC11C\uBA85 \uAD00\uB828 \uBC95\uB839\uC5D0 \uB530\uB77C \uC804\uC790\uC11C\uBA85\uC73C\uB85C \uCCB4\uACB0\uD560 \uC218 \uC788\uC73C\uBA70, \uC804\uC790\uC11C\uBA85\uB41C \uBB38\uC11C\uB294 \uC790\uD544\uC11C\uBA85 \uB610\uB294 \uB0A0\uC778\uD55C \uBB38\uC11C\uC640 \uB3D9\uC77C\uD55C \uD6A8\uB825\uC744 \uAC00\uC9C4\uB2E4.",
  ];
  const termSize = 8.6;
  const termLineHeight = 12.5;
  for (const line of terms) {
    cursorY = drawWrappedText(page, font, line, contentLeft, cursorY, contentWidth, termSize, COLORS.muted, termLineHeight);
    cursorY -= 4;
  }

  cursorY -= 8;
  const panelTop = cursorY;
  const panelHeight = 152;
  const panelBottom = panelTop - panelHeight;
  const panelMid = contentLeft + contentWidth / 2;

  drawRect(page, contentLeft, panelBottom, contentWidth, panelHeight, {
    fill: COLORS.white,
    border: COLORS.border,
    borderWidth: 1,
  });
  drawLine(page, panelMid, panelTop, panelMid, panelBottom, 1, COLORS.border);
  drawRect(page, contentLeft, panelTop - 24, contentWidth, 24, { fill: COLORS.headerBg });
  drawLine(page, contentLeft, panelTop - 24, contentRight, panelTop - 24, 1, COLORS.border);
  drawText(page, font, "\uBC1C\uC8FC\uCC98", contentLeft + 12, panelTop - 16, 10, COLORS.ink);
  drawText(page, font, "\uC2DC\uACF5\uC5C5\uCCB4", panelMid + 12, panelTop - 16, 10, COLORS.ink);

  const clientName = String(input.clientName || "").trim();
  const contactName = String(input.contactName || "").trim();
  const contactPhone = String(input.contactPhone || "").trim();
  const leftFields = [
    { label: "\uD68C\uC0AC\uBA85", value: clientName },
    { label: "\uB2F4\uB2F9\uC790", value: contactName },
    { label: "\uC5F0\uB77D\uCC98", value: contactPhone },
    { label: "\uC11C\uBA85", value: "" },
  ];
  const rightFields = [
    { label: "\uD68C\uC0AC\uBA85", value: company.name },
    { label: "\uB2F4\uB2F9\uC790", value: `\uB300\uD45C\uC790 : ${company.ceoName}` },
    { label: "\uC0AC\uC5C5\uC790\uBC88\uD638", value: company.businessNo },
    { label: "\uC5F0\uB77D\uCC98", value: company.phone },
    { label: "\uC18C\uC0AC\uC704\uCE58", value: company.address },
    { label: "\uC5C5\uD0DC", value: `${company.bizType} / ${company.bizClass}` },
  ];

  let leftY = panelTop - 40;
  leftFields.forEach((field) => {
    drawText(page, font, field.label, contentLeft + 12, leftY, 8.5, COLORS.muted);
    drawText(page, font, field.value, contentLeft + 58, leftY, 9.3, COLORS.ink);
    leftY -= 22;
  });

  let rightY = panelTop - 40;
  rightFields.forEach((field) => {
    drawText(page, font, field.label, panelMid + 12, rightY, 8.5, COLORS.muted);
    const valueX = field.label === "\uC18C\uC0AC\uC704\uCE58" ? panelMid + 58 : panelMid + 72;
    const size = field.label === "\uC18C\uC0AC\uC704\uCE58" ? 8.5 : 9.3;
    drawText(page, font, field.value, valueX, rightY, size, COLORS.ink);
    rightY -= field.label === "\uC18C\uC0AC\uC704\uCE58" ? 18 : 22;
  });

  const signatureRect = {
    x: contentLeft + 58,
    y: panelBottom + 28,
    width: 120,
    height: 28,
  };
  drawLine(page, signatureRect.x, signatureRect.y, signatureRect.x + signatureRect.width, signatureRect.y, 0.8, COLORS.border);

  const dateField = {
    x: contentLeft,
    y: panelBottom - 28,
    size: 9.5,
    coverWidth: 220,
    coverHeight: 14,
  };
  drawText(page, font, "\uC791\uC131\uC77C :", contentLeft, dateField.y, dateField.size, COLORS.muted);
  drawText(page, font, "          \uB144          \uC6D4          \uC77C", contentLeft + 42, dateField.y, dateField.size, COLORS.ink);

  if (logo) {
    const footerLogoHeight = 16;
    const footerLogoWidth = (logo.width / logo.height) * footerLogoHeight;
    page.drawImage(logo, {
      x: contentRight - footerLogoWidth,
      y: PAGE.margin - 6,
      width: footerLogoWidth,
      height: footerLogoHeight,
      opacity: 0.85,
    });
  }

  const buffer = Buffer.from(await pdfDoc.save());
  return {
    ok: true,
    buffer,
    template: UNIT_PRICE_AGREEMENT,
    fileName: UNIT_PRICE_AGREEMENT.fileName,
    title: UNIT_PRICE_AGREEMENT.title,
    signatureRect,
    dateField,
    pdfContent,
  };
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
    color: COLORS.ink,
  });
}

export async function fillContractTemplate(templateId, input = {}) {
  const template = getContractTemplate(templateId);
  if (!template) {
    return { ok: false, status: 400, error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uACC4\uC57D \uD15C\uD074\uB9BF\uC785\uB2C8\uB2E4." };
  }

  if (templateId === "unit-price-agreement") {
    return buildUnitPriceAgreementPdf(input);
  }

  return { ok: false, status: 400, error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uACC4\uC57D \uD15C\uD774\uD2B8\uC785\uB2C8\uB2E4." };
}

export async function applySignatureToContractPdf(originalBuffer, signatureBuffer, options = {}) {
  const signatureRect = options.signatureRect || { x: 104, y: 156, width: 120, height: 28 };
  const dateField = options.dateField || { x: 46, y: 128, size: 9.5, coverWidth: 220, coverHeight: 14 };
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
  drawFieldWithCover(lastPage, font, dateField, dateText);

  return Buffer.from(await pdfDoc.save());
}
