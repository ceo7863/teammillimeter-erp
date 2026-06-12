import { extractWorkerNameFromVehicleQuery } from "../server/erpChatVehicleExtract.mjs";

const cases = [
  { input: "\uBC15\uC900\uADDC \uCC28\uB7C9\uBC88\uD638", expected: "\uBC15\uC900\uADDC" },
  { input: "\uCC28\uB7C9\uBC88\uD638 \uBC15\uC900\uADDC", expected: "\uBC15\uC900\uADDC" },
  { input: "\uCC28\uBC88\uD638 \uBC15\uC900\uADDC", expected: "\uBC15\uC900\uADDC" },
  { input: "\uBC15\uC900\uADDC \uCC28\uBC88\uD638", expected: "\uBC15\uC900\uADDC" },
];

let passed = 0;
let failed = 0;

for (const { input, expected } of cases) {
  const actual = extractWorkerNameFromVehicleQuery(input);
  const ok = actual === expected;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}: "${input}" -> "${actual}" (expected "${expected}")`);
  if (ok) passed += 1;
  else failed += 1;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
