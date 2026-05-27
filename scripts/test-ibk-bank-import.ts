import fs from "fs";
import path from "path";
import { parseIbkBankExcel } from "../src/utils/ibkBankImport.ts";

function findSampleFile() {
  const downloads = "c:/Users/User/Downloads";
  const match = fs
    .readdirSync(downloads)
    .find((name) => name.endsWith("20260527.xlsx") && name.includes("\uAC70\uB798"));
  if (!match) throw new Error("Sample IBK Excel file not found in Downloads");
  return path.join(downloads, match);
}

const samplePath = findSampleFile();
const fileBuffer = fs.readFileSync(samplePath);
const preview = parseIbkBankExcel(
  fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength),
  path.basename(samplePath)
);

console.log(
  JSON.stringify(
    {
      samplePath,
      accountNumber: preview.accountNumber,
      accountHolder: preview.accountHolder,
      dateFrom: preview.dateFrom,
      latestTransactionAt: preview.latestTransactionAt,
      earliestTransactionAt: preview.earliestTransactionAt,
      rowCount: preview.rows.length,
      deposits: preview.parsedTotals.deposits,
      withdrawals: preview.parsedTotals.withdrawals,
      errors: preview.errors.length,
      first: preview.rows[0],
      last: preview.rows[preview.rows.length - 1],
    },
    null,
    2
  )
);

if (preview.rows.length < 220 || preview.rows.length > 230) {
  console.error("Unexpected row count:", preview.rows.length);
  process.exit(1);
}

if (!preview.accountNumber.includes("969-046529-04-015")) {
  console.error("Unexpected account number:", preview.accountNumber);
  process.exit(1);
}

console.log("OK");
