#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const files = process.argv.slice(2);
const DIM_RE = /\b\d{2,4}(?:\.\d+)?\s*(?:mm|MM)?\b/g;
const ROOM_RE = /(\uC8FC\uBC29|\uAC70\uC2E4|\uCE68\uC2E4|\uD604\uAD00|\uBD99\uBC15|\uC218\uB0A9|\uBC1C\uC8FC|\uC2DC\uACF5|\uB3C4\uBA74|\uC785\uBA74|\uCE21\uBA74|\uD3C9\uBA74)/g;

function pdfPageCount(buf) {
  const s = buf.toString("latin1");
  const m = s.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  if (m) return Number(m[1]);
  return (s.match(/\/Type\s*\/Page\b/g) || []).length;
}

function pdfHasImages(buf) {
  const s = buf.toString("latin1");
  return /\/Subtype\s*\/Image/.test(s);
}

async function analyzePptx(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  let text = "";
  let shapeCount = 0;
  let picCount = 0;
  const mediaFiles = Object.keys(zip.files).filter((n) => n.startsWith("ppt/media/"));
  for (const name of slideNames) {
    const xml = await zip.file(name).async("string");
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    text += texts.join(" ") + "\n";
    shapeCount += (xml.match(/<p:sp\b/g) || []).length;
    picCount += (xml.match(/<p:pic\b/g) || []).length;
  }
  const dims = [...new Set(text.match(DIM_RE) || [])];
  const rooms = [...new Set(text.match(ROOM_RE) || [])];
  return {
    type: "pptx",
    slides: slideNames.length,
    shapeCount,
    picCount,
    mediaFiles: mediaFiles.length,
    textLen: text.trim().length,
    dims: dims.slice(0, 20),
    rooms,
    sampleText: text.replace(/\s+/g, " ").trim().slice(0, 500),
  };
}

function analyzePdfBasic(filePath) {
  const buf = fs.readFileSync(filePath);
  const latin = buf.toString("latin1");
  const textChunks = [...latin.matchAll(/\(([^\\)]{2,80})\)/g)].map((m) => m[1]).join(" ");
  const dims = [...new Set(textChunks.match(DIM_RE) || [])];
  const rooms = [...new Set(textChunks.match(ROOM_RE) || [])];
  return {
    type: "pdf",
    pages: pdfPageCount(buf),
    hasEmbeddedImages: pdfHasImages(buf),
    textLen: textChunks.trim().length,
    dims: dims.slice(0, 20),
    rooms,
    sampleText: textChunks.replace(/\s+/g, " ").trim().slice(0, 500),
  };
}

for (const filePath of files) {
  if (!fs.existsSync(filePath)) {
    console.log(JSON.stringify({ file: path.basename(filePath), error: "not found" }));
    continue;
  }
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  let info;
  try {
    info = ext === ".pptx" ? await analyzePptx(filePath) : ext === ".pdf" ? analyzePdfBasic(filePath) : { error: "unsupported" };
  } catch (e) {
    info = { error: String(e.message || e) };
  }
  console.log(JSON.stringify({ file: path.basename(filePath), sizeKB: Math.round(stat.size / 1024), ...info }));
}
