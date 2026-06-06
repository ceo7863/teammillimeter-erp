import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "./config.mjs";

function previewsDir() {
  return path.join(config.clientContractsDir, "previews");
}

function readPageCount(pdfPath) {
  const result = spawnSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  if (result.status !== 0) return 1;
  const match = String(result.stdout || "").match(/Pages:\s+(\d+)/i);
  return match ? Math.max(1, Number.parseInt(match[1], 10)) : 1;
}

export function renderContractPdfPreview({ pdfPath, cacheKey, page = 1, dpi = 144 }) {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return { ok: false, status: 404, error: "PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  if (!Number.isFinite(page) || page < 1) page = 1;

  const safeKey = String(cacheKey || "preview").replace(/[^\w.-]+/g, "_");
  fs.mkdirSync(previewsDir(), { recursive: true });
  const outBase = path.join(previewsDir(), `${safeKey}-p${page}`);
  const pngPath = `${outBase}.png`;
  const metaPath = `${outBase}.meta.json`;
  const sourceMtime = fs.statSync(pdfPath).mtimeMs;
  const pageCount = readPageCount(pdfPath);
  const targetPage = Math.min(page, pageCount);

  if (fs.existsSync(pngPath) && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.sourceMtime === sourceMtime && meta.page === targetPage && meta.dpi === dpi) {
        return { ok: true, path: pngPath, page: targetPage, pageCount };
      }
    } catch {
      /* regenerate */
    }
  }

  const render = spawnSync(
    "pdftoppm",
    ["-png", "-f", String(targetPage), "-l", String(targetPage), "-r", String(dpi), "-singlefile", pdfPath, outBase],
    { encoding: "utf8" },
  );
  if (render.status !== 0 || !fs.existsSync(pngPath)) {
    return {
      ok: false,
      status: 500,
      error: String(render.stderr || render.stdout || "pdftoppm failed").trim() || "PDF \uBBF8\uB9AC\uBCF4\uAE30 \uC0DD\uC131 \uC2E4\uD328",
    };
  }

  fs.writeFileSync(metaPath, JSON.stringify({ sourceMtime, page: targetPage, dpi, pageCount }));
  return { ok: true, path: pngPath, page: targetPage, pageCount };
}
