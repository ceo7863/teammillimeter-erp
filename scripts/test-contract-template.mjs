import fs from "fs";
import { fillContractTemplate } from "../server/contractTemplate.mjs";

const result = await fillContractTemplate("unit-price-agreement", {
  clientName: "\uD0A4\uB9AD\uB354\uB9C8\uC774\uBE14",
  contactName: "\uAE40\uD61C",
  contactPhone: "010-5775-4630",
});
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
fs.writeFileSync("/tmp/server-filled.pdf", result.buffer);
console.log("ok", result.buffer.length);
