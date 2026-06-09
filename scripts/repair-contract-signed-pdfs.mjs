/**
 * Regenerate signed contract PDFs from stored originals + signature PNG.
 * Fixes Korean text corruption caused by copyPages during signing.
 *
 * Usage:
 *   node scripts/repair-contract-signed-pdfs.mjs
 *   node scripts/repair-contract-signed-pdfs.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { applySignatureToContractPdf } from "../server/contractTemplate.mjs";
import { getErpState, saveErpState } from "../server/db.mjs";
import { config } from "../server/config.mjs";

const dryRun = process.argv.includes("--dry-run");

function contractFilePath(storageKey) {
  return path.join(config.clientContractsDir, storageKey);
}

const { data, version } = getErpState();
const contracts = Array.isArray(data.clientContracts) ? data.clientContracts : [];
let repaired = 0;
let skipped = 0;
let failed = 0;

for (const contract of contracts) {
  if (contract.status !== "signed") {
    skipped += 1;
    continue;
  }
  const originalPath = contract.originalStorageKey ? contractFilePath(contract.originalStorageKey) : "";
  const signaturePath = contract.signatureStorageKey ? contractFilePath(contract.signatureStorageKey) : "";
  const signedPath = contract.signedStorageKey ? contractFilePath(contract.signedStorageKey) : "";
  if (!originalPath || !fs.existsSync(originalPath) || !signaturePath || !fs.existsSync(signaturePath) || !signedPath) {
    skipped += 1;
    continue;
  }

  try {
    const originalBuffer = fs.readFileSync(originalPath);
    const signatureBuffer = fs.readFileSync(signaturePath);
    const signedBuffer = await applySignatureToContractPdf(originalBuffer, signatureBuffer, {
      signatureRect: contract.signatureRect,
      dateField: contract.dateField,
      signedAt: contract.signedAt || new Date().toISOString(),
    });
    if (dryRun) {
      console.log(`would repair ${contract.id} ${contract.clientName} (${signedBuffer.length} bytes)`);
    } else {
      fs.writeFileSync(signedPath, signedBuffer);
      console.log(`repaired ${contract.id} ${contract.clientName}`);
    }
    repaired += 1;
  } catch (error) {
    failed += 1;
    console.error(`failed ${contract.id}:`, error?.message || error);
  }
}

console.log(JSON.stringify({ dryRun, repaired, skipped, failed, version }, null, 2));

if (!dryRun && repaired > 0) {
  saveErpState(data, version, "repair-contract-signed-pdfs");
}
