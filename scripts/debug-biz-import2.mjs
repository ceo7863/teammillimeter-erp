import {
  normalizeImportedBizField,
  buildBusinessRegSuggestions,
} from "../src/utils/businessRegImport.ts";

const text = `?? : . : ????  ?? : ????????
?? : ???`;

const inline = text.replace(/\r/g, "").match(
  /\uC5C5\s*\uD0DC\s*[:?.]?\s*([\s\S]{2,40}?)\s*(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)\s*[:?.]?\s*([\s\S]{2,60}?)(?=\s*(?:\uC131\s*\uBA85|\uB300\s*\uD45C|\uC8FC\s*\uC18C|\uC774\s*\uBA54|\uC18C\s*\uC7AC|\uAC1C\s*\uC5C5)|$)/i,
);
console.log("inline match:", inline?.slice(1));
console.log("normalized type:", normalizeImportedBizField(inline?.[1] || ""));
console.log("normalized class:", normalizeImportedBizField(inline?.[2] || ""));
console.log("suggestions:", buildBusinessRegSuggestions(text));

const text2 = `??? ??
??    ??
????    ??, ?? ? ??????`;
console.log("text2 suggestions:", buildBusinessRegSuggestions(text2));
