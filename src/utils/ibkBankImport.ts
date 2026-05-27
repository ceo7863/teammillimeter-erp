import * as XLSX from "xlsx";
import {
  buildImportFingerprint,
  makeBankTransactionId,
  parseBankAmount,
  type BankTransaction,
} from "./bankTransactions";

export type IbkBankImportRow = {
  transactionAt: string;
  withdrawal: number;
  deposit: number;
  balanceAfter: number;
  description: string;
  counterpartyAccount?: string;
  counterpartyBank?: string;
  memo?: string;
  transactionType?: string;
  counterpartyName?: string;
};

export type IbkBankImportPreview = {
  accountNumber: string;
  accountHolder?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Earliest transactionAt among parsed rows */
  earliestTransactionAt?: string;
  /** Latest transactionAt among parsed rows (data freshness anchor) */
  latestTransactionAt?: string;
  sourceFile: string;
  rows: IbkBankImportRow[];
  parsedTotals: { deposits: number; withdrawals: number; count: number };
  errors: string[];
};

export type IbkBankImportMergeResult = {
  next: BankTransaction[];
  added: number;
  skipped: number;
};

const HEADER_TRANSACTION_AT = "\uAC70\uB798\uC77C\uC2DC";
const SHEET_HINT = "\uAC70\uB798\uB0B4\uC5ED";

function sheetRows(wb: XLSX.WorkBook) {
  const name =
    wb.SheetNames.find((item) => item.includes(SHEET_HINT)) ||
    wb.SheetNames[0];
  if (!name) return { name: "", rows: [] as unknown[][] };
  return {
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }) as unknown[][],
  };
}

function findHeaderIndex(rows: unknown[][]) {
  return rows.findIndex((row) => {
    const cells = row.map((cell) => String(cell || "").trim());
    return cells.some((cell) => cell === HEADER_TRANSACTION_AT || cell.includes(HEADER_TRANSACTION_AT));
  });
}

function parseAccountInfoCell(text: string) {
  const accountMatch = text.match(/\uACC4\uC88C\uBC88\uD638\s*:\s*([0-9-]+)/);
  const holderMatch = text.match(/\uC608\uAE08\uC8FC\uBA85\s*:\s*(.+)/);
  const dateFromMatch = text.match(/\uC870\uD68C\uC2DC\uC791\uC77C\uC790\s*:\s*(\d{4}-\d{2}-\d{2})/);
  const dateToMatch = text.match(/\uC870\uD68C\uC885\uB8CC\uC77C\uC790\s*:\s*(\d{4}-\d{2}-\d{2})/);

  let accountHolder = holderMatch?.[1]?.trim();
  if (accountHolder) {
    accountHolder = accountHolder.split(/\uC608\uAE08\uC885\uB958/)[0]?.trim() || accountHolder;
    accountHolder = accountHolder.split(/\s{2,}/)[0]?.trim() || accountHolder;
  }

  return {
    accountNumber: accountMatch?.[1]?.trim() || "",
    accountHolder: accountHolder || undefined,
    dateFrom: dateFromMatch?.[1]?.trim() || undefined,
    dateTo: dateToMatch?.[1]?.trim() || undefined,
  };
}

function parseTransactionAt(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (num: number) => String(num).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const normalized = text.replace(/\./g, "-").replace(/\//g, "-");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function isSummaryRow(row: unknown[]) {
  const first = String(row?.[0] ?? "").trim();
  const second = String(row?.[1] ?? "").trim();
  return first === "\uD569\uACC4" || second === "\uD569\uACC4";
}

function parseDataRow(row: unknown[], rowNumber: number): IbkBankImportRow | string {
  if (isSummaryRow(row)) return "";

  const transactionAt = parseTransactionAt(row[1]);
  if (!transactionAt) {
    const marker = String(row[1] ?? "").trim();
    if (!marker) return "";
    return `${rowNumber}\uD589: \uAC70\uB798\uC77C\uC2DC\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. (${marker})`;
  }

  const withdrawal = parseBankAmount(row[2]);
  const deposit = parseBankAmount(row[3]);
  const balanceAfter = parseBankAmount(row[4]);
  const description = String(row[5] ?? "").trim();

  if (withdrawal <= 0 && deposit <= 0 && !description) return "";

  return {
    transactionAt,
    withdrawal,
    deposit,
    balanceAfter,
    description,
    counterpartyAccount: optionalText(row[6]),
    counterpartyBank: optionalText(row[7]),
    memo: optionalText(row[8]),
    transactionType: optionalText(row[9]),
    counterpartyName: optionalText(row[12]),
  };
}

export function parseIbkBankWorkbook(wb: XLSX.WorkBook, sourceFile = "upload.xlsx"): IbkBankImportPreview {
  const { rows } = sheetRows(wb);
  if (!rows.length) {
    throw new Error("\uC5D1\uC140 \uC2DC\uD2B8\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
  }

  const accountInfo = parseAccountInfoCell(String(rows[1]?.[0] || ""));
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx < 0) {
    throw new Error("IBK \uAC70\uB798\uB0B4\uC5ED \uC5D1\uC140 \uD615\uC2F0\uC774 \uC544\uB2D9\uB2C8\uB2E4. (\uD5E4\uB354 \uD589\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4)");
  }

  const errors: string[] = [];
  const parsedRows: IbkBankImportRow[] = [];

  rows.slice(headerIdx + 1).forEach((row, index) => {
    const rowNumber = headerIdx + index + 2;
    const parsed = parseDataRow(row, rowNumber);
    if (!parsed) return;
    if (typeof parsed === "string") {
      errors.push(parsed);
      return;
    }
    parsedRows.push(parsed);
  });

  if (!parsedRows.length && errors.length) {
    throw new Error(errors[0] || "\uAC00\uC838\uC62C \uAC70\uB798 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  if (!parsedRows.length) {
    throw new Error("\uAC00\uC838\uC62C \uAC70\uB798 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const parsedTotals = parsedRows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.deposits += row.deposit;
      acc.withdrawals += row.withdrawal;
      return acc;
    },
    { count: 0, deposits: 0, withdrawals: 0 }
  );

  const { earliestTransactionAt, latestTransactionAt } = computeTransactionDateRange(parsedRows);

  return {
    accountNumber: accountInfo.accountNumber,
    accountHolder: accountInfo.accountHolder,
    dateFrom: accountInfo.dateFrom,
    dateTo: accountInfo.dateTo,
    earliestTransactionAt,
    latestTransactionAt,
    sourceFile,
    rows: parsedRows,
    parsedTotals,
    errors,
  };
}

function computeTransactionDateRange(rows: IbkBankImportRow[]) {
  if (!rows.length) {
    return { earliestTransactionAt: undefined, latestTransactionAt: undefined };
  }

  let earliest = rows[0].transactionAt;
  let latest = rows[0].transactionAt;

  for (const row of rows) {
    const at = row.transactionAt;
    if (at.localeCompare(earliest) < 0) earliest = at;
    if (at.localeCompare(latest) > 0) latest = at;
  }

  return { earliestTransactionAt: earliest, latestTransactionAt: latest };
}

export function parseIbkBankExcel(buffer: ArrayBuffer, fileName: string): IbkBankImportPreview {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  return parseIbkBankWorkbook(wb, fileName);
}

export async function parseIbkBankFile(file: File): Promise<IbkBankImportPreview> {
  const buffer = await file.arrayBuffer();
  return parseIbkBankExcel(buffer, file.name);
}

export function mergeIbkBankImport(
  existing: BankTransaction[],
  preview: IbkBankImportPreview,
  options?: { importBatchId?: string }
): IbkBankImportMergeResult {
  const known = new Set(
    existing.map((row) =>
      buildImportFingerprint({
        accountNumber: row.accountNumber,
        transactionAt: row.transactionAt,
        withdrawal: row.withdrawal,
        deposit: row.deposit,
        balanceAfter: row.balanceAfter,
        description: row.description,
      })
    )
  );

  const now = new Date().toISOString();
  const importBatchId = options?.importBatchId || makeBankTransactionId();
  const accountNumber = preview.accountNumber || "unknown";
  const additions: BankTransaction[] = [];
  let skipped = 0;

  preview.rows.forEach((row) => {
    const fingerprint = buildImportFingerprint({
      accountNumber,
      transactionAt: row.transactionAt,
      withdrawal: row.withdrawal,
      deposit: row.deposit,
      balanceAfter: row.balanceAfter,
      description: row.description,
    });

    if (known.has(fingerprint)) {
      skipped += 1;
      return;
    }

    known.add(fingerprint);
    additions.push({
      id: makeBankTransactionId(),
      transactionAt: row.transactionAt,
      withdrawal: row.withdrawal,
      deposit: row.deposit,
      balanceAfter: row.balanceAfter,
      description: row.description,
      counterpartyAccount: row.counterpartyAccount,
      counterpartyBank: row.counterpartyBank,
      memo: row.memo,
      transactionType: row.transactionType,
      counterpartyName: row.counterpartyName,
      accountNumber,
      bankName: "IBK",
      importBatchId,
      sourceFile: preview.sourceFile,
      createdAt: now,
    });
  });

  return {
    next: sortMergedTransactions([...additions, ...existing]),
    added: additions.length,
    skipped,
  };
}

function sortMergedTransactions(rows: BankTransaction[]) {
  return [...rows].sort((a, b) => {
    const dateDiff = String(b.transactionAt).localeCompare(String(a.transactionAt));
    if (dateDiff !== 0) return dateDiff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}
