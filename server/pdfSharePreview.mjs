import { execFile, execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function sortPreviewFiles(files) {
  return files
    .filter((file) => /\.jpe?g$/i.test(file))
    .sort((left, right) => {
      const leftNum = Number(left.match(/-(\d+)\.jpe?g$/i)?.[1] || 0);
      const rightNum = Number(right.match(/-(\d+)\.jpe?g$/i)?.[1] || 0);
      return leftNum - rightNum;
    });
}

export function isPdfPreviewToolAvailable() {
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function renderPdfSharePreviewImages(pdfPath, options = {}) {
  const dpi = options.dpi || 144;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-share-"));
  const prefix = path.join(tmpDir, "page");

  try {
    await execFileAsync("pdftoppm", ["-jpeg", "-r", String(dpi), pdfPath, prefix], {
      maxBuffer: 20 * 1024 * 1024,
    });

    const files = sortPreviewFiles(fs.readdirSync(tmpDir));
    if (!files.length) {
      throw new Error("pdftoppm produced no images");
    }

    return files.map((file) => {
      const buffer = fs.readFileSync(path.join(tmpDir, file));
      return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
