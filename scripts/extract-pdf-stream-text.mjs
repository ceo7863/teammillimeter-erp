import fs from "fs";
import zlib from "zlib";

const pdfPath = process.argv[2] || "server/templates/unit-price-agreement.pdf";
const data = fs.readFileSync(pdfPath);
const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let match;
while ((match = streamRe.exec(data))) {
  let chunk;
  try {
    chunk = zlib.inflateSync(match[1]);
  } catch {
    continue;
  }
  const raw = chunk.toString("latin1");
  const utf16 = [];
  for (let i = 0; i < chunk.length - 1; i += 2) {
    const code = chunk.readUInt16BE(i);
    if (code >= 0xac00 && code <= 0xd7a3) utf16.push(String.fromCharCode(code));
  }
  if (utf16.length > 10) {
    console.log("utf16be chars:", utf16.join("").slice(0, 500));
  }
  const cidMatches = [...raw.matchAll(/\(([^\\)]{4,})\)/g)].map((m) => m[1]);
  if (cidMatches.length) {
    console.log("paren strings:", cidMatches.slice(0, 30).join(" | "));
  }
}
