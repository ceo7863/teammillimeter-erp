import fs from "fs";

const bundlePath = process.argv[2] || "dist/assets/index-C_bYpOTl.js";
const text = fs.readFileSync(bundlePath, "utf8");
const idx = text.indexOf("durationMinutes");
console.log("durationMinutes idx", idx);
console.log(text.slice(idx - 100, idx + 200));
