import {
  buildBusinessRegSuggestions,
  extractImportedBizClassCandidates,
  extractImportedBizTypeCandidates,
} from "../src/utils/businessRegImport.ts";

const samples = [
  `\uC0AC\uC5C5\uC758 \uC885\uB958\n\uC5C5\uD0DC    \uC885\uBAA9\n\uC11C\uBE44\uC2A4\uC5C5    \uC804\uBB38, \uACFC\uD559 \uBC0F \uAE30\uC220\uC11C\uBE44\uC2A4\uC5C5`,
  `\uC0AC\uC5C5\uC758\uC885\uB958\n\uC5C5\uD0DC \uC885\uBAA9\n\uC11C\uBE44\uC2A4\uC5C5 \uC778\uD14C\uB9AC\uC5B4\uB514\uC790\uC778\uC5C5`,
  `\uC5C5\uD0DC : . : \uC11C\uBE44\uC2A4\uC5C5  \uC885\uBAA9 : \uC778\uD14C\uB9AC\uC5B4\uB514\uC790\uC778\uC5C5\n\uC131\uBA85 : \uD64D\uAE38\uB3D9`,
  `\uC5C5\uD0DC \uC885\uBAA9 \uC11C\uBE44\uC2A4\uC5C5 \uC778\uD14C\uB9AC\uC5B4\uB514\uC790\uC778\uC5C5`,
  `\uC5C5 \uD0DC : \uC11C\uBE44\uC2A4\uC5C5\n\uC885 \uBAA9 : \uC778\uD14C\uB9AC\uC5B4\uB514\uC790\uC778\uC5C5`,
];

for (const [index, text] of samples.entries()) {
  const suggestions = buildBusinessRegSuggestions(text);
  console.log(`--- sample ${index + 1} ---`);
  console.log("bizType:", suggestions.bizType || "(none)");
  console.log("bizClass:", suggestions.bizClass || "(none)");
  console.log(
    "type candidates:",
    extractImportedBizTypeCandidates(text).map((row) => row.value),
  );
  console.log(
    "class candidates:",
    extractImportedBizClassCandidates(text).map((row) => row.value),
  );
}
