import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const pdfPath = process.argv[2] || "scripts/_contract-test.pdf";
const data = new Uint8Array(fs.readFileSync(pdfPath));

const cMapUrl = pathToFileURL(path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "cmaps/")).href;
const standardFontDataUrl = pathToFileURL(
  path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts/"),
).href;

const doc = await pdfjsLib.getDocument({
  data,
  useSystemFonts: true,
  cMapUrl,
  cMapPacked: true,
  standardFontDataUrl,
}).promise;
const page = await doc.getPage(1);
const content = await page.getTextContent();
const text = content.items.map((item) => item.str).join("");
console.log(text);
console.log("---items---");
for (const item of content.items) {
  if (item.str && item.str.trim()) console.log(JSON.stringify(item.str), item.transform?.slice(4, 6));
}
