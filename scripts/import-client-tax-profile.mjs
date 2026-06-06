/**
 * Barobill client list xls -> ERP client tax fields
 * Usage: node scripts/import-client-tax-profile.mjs [path-to-xls] [--dry-run]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { getErpState, saveErpState } from "../server/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHEET_KEY = "\uAC70\uB798\uCC98";
const HEADER_SEQ = "\uC21C\uBC88";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBizNo(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function compactName(value) {
  return String(value || "")
    .trim()
    .replace(/\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C\uD68C\uC0AC|\u321C/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s._,\-]/g, "")
    .toLowerCase();
}

function parseClientRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames.find((name) => name.includes(SHEET_KEY)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const headerIndex = rows.findIndex((row) => String(row[0] || "").trim() === HEADER_SEQ);
  const start = headerIndex >= 0 ? headerIndex + 1 : 4;

  return rows.slice(start).flatMap((row) => {
    const name = String(row[3] || "").trim();
    const businessNo = normalizeBizNo(row[1]);
    if (!name) return [];
    const phone = String(row[10] || row[11] || "").trim();
    return [
      {
        name,
        businessNo,
        ceoName: String(row[4] || "").trim(),
        address: String(row[5] || "").trim(),
        bizType: String(row[6] || "").trim(),
        bizClass: String(row[7] || "").trim(),
        email: String(row[13] || "").trim(),
        phone,
        memoNote: String(row[14] || "").trim(),
      },
    ];
  });
}

function scoreClientMatch(erpClient, imported) {
  const erpBiz = digitsOnly(erpClient.businessNo);
  const importBiz = digitsOnly(imported.businessNo);

  if (erpBiz.length === 10 && importBiz.length === 10) {
    return erpBiz === importBiz ? 100 : 0;
  }
  if (erpBiz && importBiz && erpBiz === importBiz) return 100;
  if (erpBiz.length === 10) return 0;

  const erpName = compactName(erpClient.name);
  const importName = compactName(imported.name);
  if (!erpName || !importName) return 0;
  if (erpName === importName) return 90;
  if (importName.includes(erpName) || erpName.includes(importName)) return 80;

  return 0;
}

function findBestImportMatch(erpClient, importedRows, usedIndexes) {
  let best = null;
  let bestScore = 0;
  let bestIndex = -1;
  for (let i = 0; i < importedRows.length; i += 1) {
    if (usedIndexes.has(i)) continue;
    const score = scoreClientMatch(erpClient, importedRows[i]);
    if (score > bestScore) {
      bestScore = score;
      best = importedRows[i];
      bestIndex = i;
    }
  }
  if (bestIndex >= 0 && bestScore >= 80) {
    usedIndexes.add(bestIndex);
    return best;
  }
  return null;
}

function mergeClientTaxFields(existing, imported) {
  const next = { ...existing };
  const businessNo = normalizeBizNo(imported.businessNo);
  const ceoName = String(imported.ceoName || "").trim();
  const address = String(imported.address || "").trim();
  const bizType = String(imported.bizType || "").trim();
  const bizClass = String(imported.bizClass || "").trim();
  const email = String(imported.email || "").trim();
  const phone = String(imported.phone || "").trim();

  if (businessNo) next.businessNo = businessNo;
  if (ceoName) next.ceoName = ceoName;
  if (address) next.address = address;
  if (bizType) next.bizType = bizType;
  if (bizClass) next.bizClass = bizClass;
  if (email) next.email = email;
  if (phone && !next.phone) next.phone = phone;
  return next;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const filePath = path.resolve(fileArg || path.join(process.env.USERPROFILE || "", "Downloads", "\uAC70\uB798\uCC98\uBAA9\uB85D(1~39).xls"));

  const importedRows = parseClientRows(filePath);
  const state = getErpState();
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];

  const updated = [];
  const unmatchedErp = [];
  const usedIndexes = new Set();

  const nextClients = clients.map((client) => {
    const match = findBestImportMatch(client, importedRows, usedIndexes);
    if (!match) {
      unmatchedErp.push(client.name);
      return client;
    }
    const merged = mergeClientTaxFields(client, match);
    updated.push({
      erpName: client.name,
      importName: match.name,
      businessNo: merged.businessNo,
      ceoName: merged.ceoName,
      email: merged.email,
    });
    return merged;
  });

  const unmatchedImport = importedRows.filter((_, index) => !usedIndexes.has(index));

  console.log(`\n=== client tax import ${dryRun ? "(dry-run)" : ""} ===`);
  console.log(`file: ${filePath}`);
  console.log(`xls ${importedRows.length} / erp ${clients.length}`);
  console.log(`matched ${updated.length}`);

  updated.forEach((row) => {
    console.log(`- ${row.erpName} <- ${row.importName} | ${row.businessNo} | ${row.ceoName} | ${row.email || "(no email)"}`);
  });

  if (unmatchedErp.length) {
    console.log(`\nerp only (${unmatchedErp.length}): ${unmatchedErp.join(", ")}`);
  }
  if (unmatchedImport.length) {
    console.log(`\nxls only (${unmatchedImport.length}):`);
    unmatchedImport.forEach((row) => console.log(`- ${row.name} (${row.businessNo})`));
  }

  if (dryRun) {
    console.log("\n(dry-run: not saved)");
    return;
  }

  const saved = saveErpState({ ...state.data, clients: nextClients }, state.version, "import-client-tax-profile");
  console.log(`\nsaved version ${saved.version}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
