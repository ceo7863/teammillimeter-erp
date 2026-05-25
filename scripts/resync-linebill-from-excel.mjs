/**
 * Sync ERP worker lineBill/lineSpend/lineMargin from Excel cols 11-13 and recalc amount.
 * Usage: node scripts/resync-linebill-from-excel.mjs [path-to-xlsm]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { getErpState, saveErpState } from "../server/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SALES_SHEET = "\uB9E4\uCD9C\uB0B4\uC5ED\uC11C";

function readDefaultExcelPath() {
  const importSource = fs.readFileSync(path.join(__dirname, "import-excel.mjs"), "utf8");
  const match = importSource.match(/const defaultPath =\s*\n\s*"([^"]+)"/);
  return match?.[1] || "";
}

function parseMoney(value) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function hasExplicitLineBill(line) {
  return line.lineBill != null && String(line.lineBill).trim() !== "";
}

function getWorkerLineBill(line) {
  if (hasExplicitLineBill(line)) return parseMoney(line.lineBill);
  const q = parseMoney(line.quantity || 1) || 1;
  const ca = parseMoney(line.chargeAmount) || parseMoney(line.unitCost);
  const meal = parseMoney(line.meal);
  const lodging = parseMoney(line.lodging);
  const expense = parseMoney(line.expense);
  const ot = parseMoney(line.overtimeHours) * (parseMoney(line.overtimeCost) || 30000);
  return q * ca + meal + lodging + expense + ot;
}

function getSaleTotalBill(sale) {
  const lines = (sale.workers || []).filter((line) => String(line.worker || "").trim());
  if (!lines.length) return sale.amount || 0;
  return lines.reduce((sum, line) => sum + getWorkerLineBill(line), 0);
}

function buildExcelLineLookup(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[SALES_SHEET], { header: 1, defval: "" }).slice(2);
  const lookup = new Map();

  rows.forEach((row) => {
    const voucherNo = String(row[0] ?? "").trim();
    const worker = String(row[14] ?? "").trim();
    if (!voucherNo || !worker) return;

    lookup.set(`${voucherNo}|${worker}`, {
      lineBill: String(parseMoney(row[11])),
      lineSpend: String(parseMoney(row[12])),
      lineMargin: String(parseMoney(row[13])),
    });
  });

  return lookup;
}

const inputPath = process.argv[2] || readDefaultExcelPath();
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error("Excel file not found:", inputPath || "(empty path)");
  process.exit(1);
}

const wb = XLSX.readFile(inputPath, { cellDates: false });
const excelLines = buildExcelLineLookup(wb);

const { data: state, version } = getErpState();
let updatedSales = 0;
let updatedLines = 0;
let amountChanges = 0;

state.sales = (state.sales || []).map((sale) => {
  const voucherNo = String(sale.voucherNo || sale.id || "").trim();
  if (!voucherNo || !sale.workers?.length) return sale;

  let changed = false;
  const workers = sale.workers.map((line) => {
    const worker = String(line.worker || "").trim();
    if (!worker) return line;

    const key = `${voucherNo}|${worker}`;
    const excel = excelLines.get(key);
    if (!excel) return line;

    const next = {
      ...line,
      lineBill: excel.lineBill,
      lineSpend: excel.lineSpend,
      lineMargin: excel.lineMargin,
    };

    if (
      String(line.lineBill ?? "") !== next.lineBill ||
      String(line.lineSpend ?? "") !== next.lineSpend ||
      String(line.lineMargin ?? "") !== next.lineMargin
    ) {
      updatedLines += 1;
      changed = true;
    }

    return next;
  });

  const amount = getSaleTotalBill({ ...sale, workers });
  if (changed || amount !== (sale.amount || 0)) {
    updatedSales += 1;
    if (amount !== (sale.amount || 0)) amountChanges += 1;
    return { ...sale, workers, amount };
  }

  return sale;
});

saveErpState(state, version, "excel-linebill-resync");

console.log("Excel lineBill resync complete");
console.log("  updated sales:", updatedSales);
console.log("  updated worker lines:", updatedLines);
console.log("  amount recalculated:", amountChanges);
