#!/usr/bin/env node
/**
 * Generates PNG PWA icons from SVG sources (192 + 512).
 * Requires: npm install sharp (dev) or npx sharp available.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const pairs = [
  ["icon.svg", ["icon-192.png", "icon-512.png"]],
  ["icon-chat.svg", ["icon-chat-192.png", "icon-chat-512.png"]],
];

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("Run: npm install --save-dev sharp");
    process.exit(1);
  }

  for (const [svgName, pngNames] of pairs) {
    const svgPath = path.join(publicDir, svgName);
    const svg = fs.readFileSync(svgPath);
    const sizes = [192, 512];
    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      const out = path.join(publicDir, pngNames[i]);
      await sharp(svg, { density: Math.ceil((size / 512) * 144) })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toFile(out);
      console.log("wrote", pngNames[i]);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
