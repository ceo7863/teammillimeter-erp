import fs from "fs";
import path from "path";

const assetsDir = path.join(process.cwd(), "dist", "assets");
const file = fs.readdirSync(assetsDir).find((name) => name.startsWith("index-") && name.endsWith(".js"));
const source = fs.readFileSync(path.join(assetsDir, file), "utf8");

const titleIdx = source.indexOf("\uD604\uC7A5 \uC811\uC218");
console.log("titleIdx", titleIdx);
console.log("title context", source.slice(titleIdx - 300, titleIdx + 300));

const regexCandidates = source.match(/\/\^\\\/[^"]+\/\)/g) || [];
console.log("regex count", regexCandidates.length);
for (const item of regexCandidates.slice(0, 10)) {
  console.log("regex", item);
}
