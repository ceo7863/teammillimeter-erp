import * as XLSX from "xlsx";
import { excelDateToISO } from "./excelDates";
import {
  makeTaxInvoiceId,
  normalizeTaxInvoiceStatus,
  parseTaxInvoiceAmount,
  type TaxInvoice,
  type TaxInvoiceFlowType,
  type TaxInvoiceStatus,
} from "./taxInvoices";

export type HometaxImportRow = {
  issueDate: string;
  invoiceNo: string;
  client: string;
  businessNo: string;
  flowType: TaxInvoiceFlowType;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  documentType: "tax" | "bill";
  status: TaxInvoiceStatus;
  memo?: string;
};

export type HometaxImportPreview = {
  flowType: TaxInvoiceFlowType;
  sourceFile: string;
  title: string;
  /** Earliest issueDate among parsed rows */
  earliestIssueDate?: string;
  /** Latest issueDate among parsed rows */
  latestIssueDate?: string;
  rows: HometaxImportRow[];
  fileTotals?: { total: number; supply: number; vat: number };
  parsedTotals: { total: number; supply: number; vat: number };
  errors: string[];
};

export type HometaxImportMergeResult = {
  next: TaxInvoice[];
  added: number;
  skipped: number;
};

const HEADER_ISSUE_DATE = "\uC791\uC131\uC77C\uC790";
const HEADER_INVOICE_NO = "\uC2B9\uC778\uBC88\uD638";

function sheetRows(wb: XLSX.WorkBook) {
  const name = wb.SheetNames.includes("\uC138\uAE08\uACC4\uC0B0\uC11C") ? "\uC138\uAE08\uACC4\uC0B0\uC11C" : wb.SheetNames[0];
  if (!name) return { name: "", rows: [] as unknown[][] };
  return {
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }) as unknown[][],
  };
}

function detectFlowType(rows: unknown[][], fileName: string): TaxInvoiceFlowType {
  const titleLine = rows
    .slice(0, 8)
    .map((row) => String(row?.[0] || ""))
    .join(" ");
  if (titleLine.includes("\uB9E4\uC785")) return "purchase";
  if (titleLine.includes("\uB9E4\uCD9C")) return "sales";
  if (fileName.includes("\uB9E4\uC785")) return "purchase";
  if (fileName.includes("\uB9E4\uCD9C")) return "sales";
  return "sales";
}

function findHeaderIndex(rows: unknown[][]) {
  return rows.findIndex((row) => {
    const first = String(row?.[0] || "").trim();
    const second = String(row?.[1] || "").trim();
    return first === HEADER_ISSUE_DATE && second.includes("\uC2B9\uC778");
  });
}

function parseFileTotals(rows: unknown[][]) {
  const row = rows[2];
  if (!row || String(row[0]).trim() !== "\uCD1D \uD569\uACC4\uAE08\uC561") return undefined;
  return {
    total: parseTaxInvoiceAmount(row[1]),
    supply: parseTaxInvoiceAmount(row[3]),
    vat: parseTaxInvoiceAmount(row[5]),
  };
}

function parseDocumentType(value: unknown): "tax" | "bill" {
  const text = String(value || "").trim();
  if (text === "\uACC4\uC0B0\uC11C" || (text.includes("\uACC4\uC0B0\uC11C") && !text.includes("\uC138\uAE08"))) return "bill";
  return "tax";
}

function buildMemo(itemName: unknown, note: unknown) {
  const parts = [String(itemName || "").trim(), String(note || "").trim()].filter(Boolean);
  return parts.length ? parts.join(" \u00B7 ") : undefined;
}

function resolveStatus(row: unknown[], supplyAmount: number, totalAmount: number): TaxInvoiceStatus {
  const kind = String(row[18] || "");
  const note = String(row[20] || "");
  const classification = String(row[17] || "");
  const haystack = `${kind} ${note} ${classification}`;
  if (/\uCDE8\uC18C|\uD3D0\uAE30|\uB9C8\uC774\uB108\uC2A4/.test(haystack)) return "cancelled";
  if (supplyAmount < 0 || totalAmount < 0) return "cancelled";
  return "issued";
}

function parseDataRow(row: unknown[], flowType: TaxInvoiceFlowType, rowNumber: number): HometaxImportRow | string {
  const invoiceNo = String(row[1] || "").trim();
  if (!invoiceNo) return "";

  const issueDate = excelDateToISO(row[0]);
  if (!issueDate) return `${rowNumber}\uD589: \uC791\uC131\uC77C\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`;

  const client =
    flowType === "purchase"
      ? String(row[6] || "").trim()
      : String(row[11] || "").trim();
  const businessNo =
    flowType === "purchase"
      ? String(row[4] || "").trim()
      : String(row[9] || "").trim();

  if (!client) return `${rowNumber}\uD589: \uAC70\uB798\uCC98 \uC0C1\uD638\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`;

  const totalAmount = parseTaxInvoiceAmount(row[14]);
  const supplyAmount = parseTaxInvoiceAmount(row[15]);
  const vatAmount = parseTaxInvoiceAmount(row[16]);
  const documentType = parseDocumentType(row[17]);
  const status = resolveStatus(row, supplyAmount, totalAmount);

  return {
    issueDate,
    invoiceNo,
    client,
    businessNo,
    flowType,
    supplyAmount: Math.abs(supplyAmount),
    vatAmount: Math.abs(vatAmount),
    totalAmount: Math.abs(totalAmount),
    documentType,
    status: normalizeTaxInvoiceStatus(status),
    memo: buildMemo(row[26], row[20]),
  };
}

export function parseHometaxTaxInvoiceWorkbook(wb: XLSX.WorkBook, sourceFile = "upload.xls"): HometaxImportPreview {
  const { rows } = sheetRows(wb);
  if (!rows.length) {
    throw new Error("\uC5D1\uC140 \uC2DC\uD2B8\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
  }

  const flowType = detectFlowType(rows, sourceFile);
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx < 0) {
    throw new Error("\uD648\uD0DD\uC2A4 \uC138\uAE08\uACC4\uC0B0\uC11C \uBAA9\uB85D \uD615\uC2DD\uC774 \uC544\uB2D9\uB2C8\uB2E4. (\uD5E4\uB354 \uD589\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4)");
  }

  const title = String(rows[4]?.[0] || rows[headerIdx - 1]?.[0] || "").trim();
  const errors: string[] = [];
  const parsedRows: HometaxImportRow[] = [];

  rows.slice(headerIdx + 1).forEach((row, index) => {
    const rowNumber = headerIdx + index + 2;
    const parsed = parseDataRow(row, flowType, rowNumber);
    if (!parsed) return;
    if (typeof parsed === "string") {
      errors.push(parsed);
      return;
    }
    parsedRows.push(parsed);
  });

  if (!parsedRows.length && errors.length) {
    throw new Error(errors[0] || "\uAC00\uC838\uC62C \uACC4\uC0B0\uC11C \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  if (!parsedRows.length) {
    throw new Error("\uAC00\uC838\uC62C \uACC4\uC0B0\uC11C \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const parsedTotals = parsedRows.reduce(
    (acc, row) => {
      if (row.status === "cancelled") return acc;
      acc.total += row.totalAmount;
      acc.supply += row.supplyAmount;
      acc.vat += row.vatAmount;
      return acc;
    },
    { total: 0, supply: 0, vat: 0 }
  );

  const { earliestIssueDate, latestIssueDate } = computeIssueDateRange(parsedRows);

  return {
    flowType,
    sourceFile,
    title,
    earliestIssueDate,
    latestIssueDate,
    rows: parsedRows,
    fileTotals: parseFileTotals(rows),
    parsedTotals,
    errors,
  };
}

function computeIssueDateRange(rows: HometaxImportRow[]) {
  if (!rows.length) {
    return { earliestIssueDate: undefined, latestIssueDate: undefined };
  }

  let earliest = rows[0].issueDate;
  let latest = rows[0].issueDate;

  for (const row of rows) {
    const date = row.issueDate;
    if (date.localeCompare(earliest) < 0) earliest = date;
    if (date.localeCompare(latest) > 0) latest = date;
  }

  return { earliestIssueDate: earliest, latestIssueDate: latest };
}

export async function parseHometaxTaxInvoiceFile(file: File): Promise<HometaxImportPreview> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  return parseHometaxTaxInvoiceWorkbook(wb, file.name);
}

export function mergeHometaxTaxInvoices(
  existing: TaxInvoice[],
  preview: HometaxImportPreview,
  author: { name: string; loginId?: string }
): HometaxImportMergeResult {
  const known = new Set(
    existing
      .map((row) => String(row.invoiceNo || "").trim())
      .filter(Boolean)
  );

  const now = new Date().toISOString();
  const additions: TaxInvoice[] = [];
  let skipped = 0;

  preview.rows.forEach((row) => {
    if (known.has(row.invoiceNo)) {
      skipped += 1;
      return;
    }
    known.add(row.invoiceNo);
    additions.push({
      id: makeTaxInvoiceId(),
      issueDate: row.issueDate,
      client: row.client,
      businessNo: row.businessNo,
      flowType: row.flowType,
      documentType: row.documentType,
      supplyAmount: row.supplyAmount,
      vatAmount: row.vatAmount,
      totalAmount: row.totalAmount,
      invoiceNo: row.invoiceNo,
      memo: row.memo,
      status: row.status,
      createdAt: now,
      createdBy: author.name,
      createdByLoginId: author.loginId,
    });
  });

  return {
    next: [...additions, ...existing],
    added: additions.length,
    skipped,
  };
}
