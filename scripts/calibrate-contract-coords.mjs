import fs from "fs";
import { fillContractTemplate } from "../server/contractTemplate.mjs";

const tests = [
  { clientName: "A??", contactName: "B??", contactPhone: "010-1111-2222" },
];

for (const coords of [
  { clientName: { x: 132, y: 255 }, contactName: { x: 132, y: 230 }, contactPhone: { x: 132, y: 205 } },
  { clientName: { x: 132, y: 235 }, contactName: { x: 132, y: 210 }, contactPhone: { x: 132, y: 185 } },
  { clientName: { x: 132, y: 215 }, contactName: { x: 132, y: 190 }, contactPhone: { x: 132, y: 165 } },
]) {
  // patch coords temporarily via direct import - skip
}

const result = await fillContractTemplate("unit-price-agreement", tests[0]);
fs.writeFileSync("scripts/_contract-filled-local.pdf", result.buffer);
console.log("written", result.buffer.length);
