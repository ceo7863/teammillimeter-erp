import fs from "fs";

const text = fs.readFileSync(process.argv[2] || "dist/assets/index-C_bYpOTl.js", "utf8");
const i = text.indexOf("function P6");
console.log(text.slice(i, i + 200));
