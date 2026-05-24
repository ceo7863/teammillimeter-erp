/**
 * 엑셀 매출내역 Ver.2026 → ERP seed JSON
 * Usage: node scripts/import-excel.mjs [path-to-xlsm]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath =
  "c:\\Users\\User\\Documents\\팀밀리미터\\OneDrive\\매출내역프로그램\\(주)팀밀리미터_매출내역_Ver.2026.xlsm";

function parseMoney(value) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function getWorkerLineBill(line) {
  const stored = parseMoney(line.lineBill);
  if (stored) return stored;
  const q = parseMoney(line.quantity || 1) || 1;
  const ca = parseMoney(line.chargeAmount) || parseMoney(line.unitCost);
  const meal = parseMoney(line.meal);
  const lodging = parseMoney(line.lodging);
  const expense = parseMoney(line.expense);
  const ot = parseMoney(line.overtimeHours) * (parseMoney(line.overtimeCost) || 30000);
  return q * ca + meal + lodging + expense + ot;
}

function getSaleTotalBillFromWorkers(workers) {
  return workers.reduce((sum, line) => sum + getWorkerLineBill(line), 0);
}

function excelSerialToISO(serial) {
  const utc = new Date(Math.round((serial - 25569) * 86400000));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function excelDateToISO(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialToISO(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return excelSerialToISO(Math.floor(value.getTime() / 86400000) + 25569);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text;
}

function parseClients(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["거래처정보"], { header: 1, defval: "" });
  return rows.slice(1).flatMap((row, index) => {
    const name = String(row[0] || "").trim();
    if (!name) return [];
    return [
      {
        id: index + 1,
        name,
        businessNo: String(row[1] || "").trim(),
        manager: String(row[2] || "").trim(),
        phone: String(row[3] || "").trim(),
        constructionCost: parseMoney(row[4]),
        overtimeCost: parseMoney(row[5]) || 30000,
        vat: String(row[6] || "Y").trim() || "Y",
        mealIncluded: String(row[7] || "N").trim() || "N",
        memo: [row[8], row[9]].filter(Boolean).join(" / "),
      },
    ];
  });
}

function parseWorkers(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["기본정보"], { header: 1, defval: "" });
  return rows.slice(1).flatMap((row, index) => {
    const name = String(row[1] || "").trim();
    if (!name) return [];
    const feeRaw = parseMoney(row[7]);
    return [
      {
        id: index + 1,
        name,
        bank: String(row[2] || "").trim(),
        account: String(row[3] || "").trim(),
        phone: String(row[4] || "").trim(),
        constructionCost: parseMoney(row[5]),
        overtimeCost: parseMoney(row[6]) || 30000,
        feeRate: feeRaw > 1 ? feeRaw / 100 : feeRaw,
        memo: "",
      },
    ];
  });
}

function buildPaymentVatLookupKey(saleDate, client, site, bill) {
  return `${saleDate}|${client}|${site}|${bill}`;
}

function buildPaymentVatLookupFromRows(rows) {
  const lookup = new Map();
  rows.slice(8).forEach((row) => {
    if (row[0] === "" || row[0] == null) return;
    const saleDate = excelDateToISO(row[0]);
    const client = String(row[1] || "").trim();
    const site = String(row[2] || "").trim();
    const bill = parseMoney(row[4]);
    if (!saleDate || !client) return;
    lookup.set(buildPaymentVatLookupKey(saleDate, client, site, bill), {
      vatAmount: parseMoney(row[7]),
      paidAmount: parseMoney(row[6]),
      paymentDate: excelDateToISO(row[5]) || undefined,
    });
  });
  return lookup;
}

function resolvePaymentVat(finalPaid, bill, lookup) {
  if (lookup) {
    const vatAmount = Math.max(0, lookup.vatAmount);
    const supplyAmount = Math.max(0, finalPaid - vatAmount);
    return {
      vatAmount,
      supplyAmount,
      finalAmount: finalPaid,
      vatType: vatAmount > 0 ? "included" : "excluded",
    };
  }

  if (finalPaid > bill && bill > 0) {
    const vatAmount = Math.round(finalPaid - bill);
    return {
      vatAmount,
      supplyAmount: Math.max(0, finalPaid - vatAmount),
      finalAmount: finalPaid,
      vatType: "included",
    };
  }

  return {
    vatAmount: 0,
    supplyAmount: finalPaid,
    finalAmount: finalPaid,
    vatType: "excluded",
  };
}

function createExcelPaymentVoucher(input) {
  const finalPaid = parseMoney(input.paidRaw);
  if (finalPaid <= 0) return null;

  const lookupKey = buildPaymentVatLookupKey(input.saleDate, input.client, input.site, input.amount);
  const lookup = input.vatLookup?.get(lookupKey);
  const paymentDate = excelDateToISO(input.paymentDateRaw) || lookup?.paymentDate || input.saleDate;
  const { vatAmount, supplyAmount, finalAmount, vatType } = resolvePaymentVat(finalPaid, input.amount, lookup);

  return {
    id: 1_000_000_000 + input.saleId,
    salesId: input.saleId,
    date: paymentDate,
    client: input.client,
    site: input.site,
    workerCount: input.workerCount,
    totalSalesAmount: input.amount,
    amount: supplyAmount,
    vatType,
    supplyAmount,
    vatAmount,
    finalAmount,
    memo: "엑셀 import",
  };
}

function parseSales(wb) {
  const vatLookup = wb.Sheets["입금내역검색"]
    ? buildPaymentVatLookupFromRows(XLSX.utils.sheet_to_json(wb.Sheets["입금내역검색"], { header: 1, defval: "" }))
    : new Map();
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["매출내역서"], { header: 1, defval: "" });
  const dataRows = rows.slice(2).filter((row) => row[0] !== "" && row[0] != null);
  const groups = new Map();

  dataRows.forEach((row) => {
    const voucherNo = String(row[0]).trim();
    if (!groups.has(voucherNo)) groups.set(voucherNo, []);
    groups.get(voucherNo).push(row);
  });

  const sales = [];
  const paymentVouchers = [];

  groups.forEach((groupRows, voucherNo) => {
    const first = groupRows[0];
    const date = excelDateToISO(first[1]);
    const client = String(first[2] || "").trim();
    const site = String(first[3] || "").trim();
    if (!client || !date) return;

    const workers = groupRows
      .filter((row) => String(row[14] || "").trim())
      .map((row, index) => ({
        no: index + 1,
        worker: String(row[14] || "").trim(),
        quantity: String(parseMoney(row[4]) || 1),
        unitCost: String(parseMoney(row[20]) || ""),
        chargeAmount: String(parseMoney(row[9]) || ""),
        lineBill: String(parseMoney(row[11])),
        lineSpend: String(parseMoney(row[12])),
        lineMargin: String(parseMoney(row[13])),
        feeRate: String(parseMoney(row[22]) > 1 ? parseMoney(row[22]) / 100 : parseMoney(row[22])),
        meal: String(parseMoney(row[5]) || ""),
        expense: String(parseMoney(row[6]) || ""),
        overtimeHours: String(parseMoney(row[7]) || ""),
        lodging: String(parseMoney(row[8]) || ""),
        overtimeCost: String(parseMoney(row[21]) || 30000),
        memo: String(row[15] || "").trim(),
      }));

    const amount = getSaleTotalBillFromWorkers(workers);
    const saleId = Number(voucherNo) || Date.now() + sales.length;
    const workerLabel = workers.map((line) => line.worker).join(", ");

    sales.push({
      id: saleId,
      voucherNo,
      date,
      client,
      site,
      worker: workerLabel,
      workers,
      amount,
      paid: 0,
      basePaid: 0,
      memo: workers.map((line) => line.memo).filter(Boolean).join(" / "),
      createdBy: "엑셀 import",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const voucher = createExcelPaymentVoucher({
      saleId,
      paymentDateRaw: first[23],
      paidRaw: first[24],
      saleDate: date,
      client,
      site,
      amount,
      workerCount: workers.length,
      vatLookup,
    });
    if (voucher) paymentVouchers.push(voucher);
  });

  return {
    sales: sales.sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id)),
    paymentVouchers: paymentVouchers.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id),
  };
}

const inputPath = process.argv[2] || defaultPath;
if (!fs.existsSync(inputPath)) {
  console.error("파일을 찾을 수 없습니다:", inputPath);
  process.exit(1);
}

console.log("Reading", inputPath);
const wb = XLSX.readFile(inputPath, { cellDates: false });
const { sales, paymentVouchers } = parseSales(wb);
const payload = {
  importedAt: new Date().toISOString(),
  sourceFile: path.basename(inputPath),
  clients: parseClients(wb),
  workers: parseWorkers(wb),
  sales,
  paymentVouchers,
};

const outDir = path.join(__dirname, "..", "public");
const outFile = path.join(outDir, "erp-seed.json");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(payload));

console.log("Clients:", payload.clients.length);
console.log("Workers:", payload.workers.length);
console.log("Sales:", payload.sales.length);
console.log("Payment vouchers:", payload.paymentVouchers.length);
console.log("Written:", outFile);
