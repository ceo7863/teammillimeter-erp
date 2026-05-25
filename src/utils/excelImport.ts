import * as XLSX from "xlsx";
import { excelDateToISO } from "./excelDates";
import { dedupeMemoSegments } from "./statementSheets";
import { getSaleTotalBill, normalizeSaleRecord } from "./saleBilling";

function parseMoney(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function parseClients(wb: XLSX.WorkBook) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["거래처정보"], { header: 1, defval: "" }) as unknown[][];
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
        memo: dedupeMemoSegments([row[8], row[9]].map((value) => String(value || "").trim()).filter(Boolean).join(" / ")),
      },
    ];
  });
}

function parseWorkers(wb: XLSX.WorkBook) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["기본정보"], { header: 1, defval: "" }) as unknown[][];
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

function parseSales(wb: XLSX.WorkBook) {
  const vatLookup = wb.Sheets["입금내역검색"]
    ? buildPaymentVatLookupFromRows(
        XLSX.utils.sheet_to_json(wb.Sheets["입금내역검색"], { header: 1, defval: "" }) as unknown[][]
      )
    : new Map();
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["매출내역서"], { header: 1, defval: "" }) as unknown[][];
  const dataRows = rows.slice(2).filter((row) => row[0] !== "" && row[0] != null);
  const groups = new Map<string, unknown[][]>();

  dataRows.forEach((row) => {
    const voucherNo = String(row[0]).trim();
    if (!groups.has(voucherNo)) groups.set(voucherNo, []);
    groups.get(voucherNo)!.push(row);
  });

  const sales: Record<string, unknown>[] = [];
  const paymentVouchers: ExcelPaymentVoucher[] = [];

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

    const amount = getSaleTotalBill({ workers, amount: 0 });
    const saleId = Number(voucherNo) || Date.now() + sales.length;
    const workerLabel = workers.map((line) => line.worker).join(", ");

    sales.push(
      normalizeSaleRecord({
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
        memo: dedupeMemoSegments(workers.map((line) => line.memo).filter(Boolean).join(" / ")),
        createdBy: "엑셀 import",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );

    const savedSale = sales[sales.length - 1];

    const voucher = createExcelPaymentVoucher({
      saleId,
      paymentDateRaw: first[23],
      paidRaw: first[24],
      saleDate: date,
      client,
      site,
      amount: savedSale.amount,
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

export type ErpImportPayload = {
  clients: ReturnType<typeof parseClients>;
  workers: ReturnType<typeof parseWorkers>;
  sales: ReturnType<typeof parseSales>["sales"];
  paymentVouchers: ExcelPaymentVoucher[];
  importedAt: string;
  sourceFile: string;
};

export function parseErpWorkbook(wb: XLSX.WorkBook, sourceFile = "upload.xlsm"): ErpImportPayload {
  const { sales, paymentVouchers } = parseSales(wb);
  return {
    importedAt: new Date().toISOString(),
    sourceFile,
    clients: parseClients(wb),
    workers: parseWorkers(wb),
    sales,
    paymentVouchers,
  };
}

export async function parseErpExcelFile(file: File): Promise<ErpImportPayload> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  return parseErpWorkbook(wb, file.name);
}

export async function fetchBundledErpSeed(): Promise<ErpImportPayload | null> {
  try {
    const response = await fetch("/erp-seed.json");
    if (!response.ok) return null;
    return (await response.json()) as ErpImportPayload;
  } catch {
    return null;
  }
}
