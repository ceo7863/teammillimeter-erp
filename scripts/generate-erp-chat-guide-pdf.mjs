import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { ERP_CHAT_GUIDE_SECTIONS } from "../server/erpChatGuideContent.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "docs", "ERP-AI-Chat-Guide.pdf");

const FONT_CANDIDATES = [
  path.join(rootDir, "server", "templates", "fonts", "NotoSansCJKkr-Regular.otf"),
  "C:\\Windows\\Fonts\\malgun.ttf",
  "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
];

const PAGE = { width: 595.28, height: 841.89, margin: 48, bottom: 56 };
const COLORS = {
  ink: rgb(0.06, 0.09, 0.16),
  muted: rgb(0.35, 0.42, 0.5),
  accent: rgb(0.08, 0.35, 0.72),
  line: rgb(0.88, 0.9, 0.94),
  exampleBg: rgb(0.96, 0.98, 1),
};

function resolveKoreanFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
  }
  throw new Error("\uD55C\uAE00 \uD3F0\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
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
      current = ch === " " ? "" : ch;
    } else {
      current = next;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function formatKstDateLabel(date = new Date()) {
  const kst = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}\uB144 ${String(kst.getMonth() + 1).padStart(2, "0")}\uC6D4 ${String(kst.getDate()).padStart(2, "0")}\uC77C`;
}

class PdfWriter {
  constructor(pdfDoc, font) {
    this.pdfDoc = pdfDoc;
    this.font = font;
    this.page = pdfDoc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
    this.contentWidth = PAGE.width - PAGE.margin * 2;
  }

  ensureSpace(height) {
    if (this.y - height >= PAGE.bottom) return;
    this.page = this.pdfDoc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  drawText(text, size, color = COLORS.ink, gap = 6) {
    const lines = wrapTextLines(this.font, text, this.contentWidth, size);
    for (const line of lines) {
      this.ensureSpace(size + gap);
      this.page.drawText(line, {
        x: PAGE.margin,
        y: this.y,
        size,
        font: this.font,
        color,
      });
      this.y -= size + gap;
    }
  }

  drawHeading(text) {
    this.ensureSpace(28);
    this.y -= 8;
    this.page.drawText(text, {
      x: PAGE.margin,
      y: this.y,
      size: 13,
      font: this.font,
      color: COLORS.accent,
    });
    this.y -= 22;
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y + 8 },
      end: { x: PAGE.width - PAGE.margin, y: this.y + 8 },
      thickness: 0.8,
      color: COLORS.line,
    });
    this.y -= 6;
  }

  drawExample(text) {
    const size = 9.5;
    const lineHeight = 14;
    const padX = 10;
    const padY = 8;
    const lines = wrapTextLines(this.font, `\u25B8 ${text}`, this.contentWidth - padX * 2, size);
    const boxHeight = lines.length * lineHeight + padY * 2;
    this.ensureSpace(boxHeight + 4);
    const boxBottom = this.y - boxHeight;
    this.page.drawRectangle({
      x: PAGE.margin,
      y: boxBottom,
      width: this.contentWidth,
      height: boxHeight,
      color: COLORS.exampleBg,
      borderColor: COLORS.line,
      borderWidth: 0.6,
    });
    let cursor = this.y - padY - 2;
    for (const line of lines) {
      this.page.drawText(line, {
        x: PAGE.margin + padX,
        y: cursor,
        size,
        font: this.font,
        color: COLORS.ink,
      });
      cursor -= lineHeight;
    }
    this.y = boxBottom - 6;
  }
}

async function buildGuidePdf() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = resolveKoreanFont();
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const writer = new PdfWriter(pdfDoc, font);

  writer.drawText("TeamMillimeter ERP", 11, COLORS.muted, 4);
  writer.drawText("AI \uCC57\uBD07 \uC0AC\uC6A9 \uAC00\uC774\uB4DC", 22, COLORS.ink, 8);
  writer.drawText(
    `\uC791\uC131\uC77C: ${formatKstDateLabel()}  \u00B7  \uC790\uC5F0\uC5B4 \uBA85\uB839\uC5B4 \uBAA8\uC74C`,
    10,
    COLORS.muted,
    16,
  );

  writer.drawText(
    "ERP \uCC57\uBD07\uC740 \uBBF8\uC218, \uC77C\uC815, \uD604\uC7A5, \uACC4\uC0B0\uC11C, \uD1B5\uC7A5, \uB0B4\uC5ED\uC11C \uB4F1 \uC5C5\uBB34\uB97C \uB9D0\uB85C \uC694\uCCAD\uD558\uBA74 \uC870\uD68C\uD558\uAC70\uB098 \uD574\uB2F9 \uD654\uBA74\uC73C\uB85C \uC774\uB3D9\uD574 \uC90D\uB2C8\uB2E4. \uC544\uB798 \uC608\uC2DC\uB97C \uADF8\uB300\uB85C \uC785\uB825\uD558\uAC70\uB098 \uBE44\uC2AC\uD558\uAC8C \uB9D0\uD574\uB3C4 \uB429\uB2C8\uB2E4.",
    10.5,
    COLORS.ink,
    10,
  );

  for (const section of ERP_CHAT_GUIDE_SECTIONS) {
    writer.drawHeading(section.title);
    for (const paragraph of section.body || []) {
      writer.drawText(paragraph, 10, COLORS.ink, 8);
    }
    for (const example of section.examples || []) {
      writer.drawExample(example);
    }
    writer.y -= 4;
  }

  return pdfDoc.save();
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const bytes = await buildGuidePdf();
  fs.writeFileSync(outputPath, bytes);
  console.log(`PDF saved: ${outputPath}`);
  console.log(`Size: ${(bytes.length / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
