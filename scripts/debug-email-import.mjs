import {
  extractImportedEmailCandidates,
  normalizeImportedEmail,
  suggestImportedEmail,
} from "../src/utils/businessRegImport.ts";
import { isValidEmail } from "../src/utils/clientMaster.ts";

const samples = [
  `\uC774\uBA54\uC77C : sales@company com`,
  `\uC774\uBA54\uC77C : info@example`,
  `contact@myshop`,
  `admin @ test.co.kr`,
  `hello@domain\nco.kr`,
  `billing@company,com`,
  `sales@`,
  `sales@\ncompany.com`,
];

for (const text of samples) {
  const suggested = suggestImportedEmail(text);
  const candidates = extractImportedEmailCandidates(text).map((row) => row.email);
  console.log("---");
  console.log("input:", text.replace(/\n/g, "\\n"));
  console.log("suggested:", suggested || "(none)", isValidEmail(suggested || "") ? "[valid]" : "[partial]");
  console.log("candidates:", candidates);
}
