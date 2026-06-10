import fs from "fs";

const bundle = process.argv[2] || "dist/assets/index-C_bYpOTl.js";
const text = fs.readFileSync(bundle, "utf8");
console.log("PageKeepAlive string in bundle:", text.includes("PageKeepAlive"));
console.log("workLog fn present:", text.includes("durationMinutes"));
