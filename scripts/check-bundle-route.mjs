import fs from "fs";
import path from "path";

const assetsDir = path.join(process.cwd(), "dist", "assets");
const file = fs.readdirSync(assetsDir).find((name) => name.startsWith("index-") && name.endsWith(".js"));
const source = fs.readFileSync(path.join(assetsDir, file), "utf8");
console.log("file", file);
console.log("has /sign/", source.includes("/sign/"));
console.log("has /request/", source.includes("/request/"));
console.log("has client-site-request", source.includes("client-site-request"));
console.log("has page title", source.includes("\uD604\uC7A5 \uC811\uC218"));
console.log("has sign page import marker", source.includes("ClientContractSign"));
const signIdx = source.indexOf("/sign/");
console.log("sign context", signIdx >= 0 ? source.slice(signIdx - 60, signIdx + 80) : "missing");
const reqIdx = source.indexOf("request");
let count = 0;
for (let i = 0; i < source.length && count < 5; i += 1) {
  if (source.slice(i, i + 9) === "/request/") {
    console.log("request ctx", source.slice(i - 60, i + 80));
    count += 1;
  }
}
