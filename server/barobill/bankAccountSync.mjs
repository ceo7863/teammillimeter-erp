import {
  assertBarobillBankCredentials,
  callBankAccountSoapRequest,
  extractLogBlocks,
  extractResultBlock,
  getBarobillBankConfigStatus,
  readXmlInt,
  readXmlTag,
} from "./bankAccountClient.mjs";
import { checkBankAccountScrapService } from "./bankAccountScrap.mjs";
import { getErrString } from "./client.mjs";

const COUNT_PER_PAGE = 100;
const ORDER_DIRECTION_DESC = 2;

function parseAmount(value) {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function parseBarobillTransDt(value) {
  const raw = String(value || "").replace(/\D/g, "");
  if (raw.length < 8) return "";
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const hour = raw.length >= 10 ? raw.slice(8, 10) : "00";
  const minute = raw.length >= 12 ? raw.slice(10, 12) : "00";
  const second = raw.length >= 14 ? raw.slice(12, 14) : "00";
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function buildMemo(block) {
  const parts = [
    readXmlTag(block, "Memo"),
    readXmlTag(block, "MgtRemark1"),
    readXmlTag(block, "MgtRemark2"),
  ].filter(Boolean);
  return parts.length ? parts.join(" ? ") : undefined;
}

export function mapBarobillLogToImportRow(block) {
  const transactionAt = parseBarobillTransDt(readXmlTag(block, "TransDT"));
  if (!transactionAt) return null;

  const withdrawal = parseAmount(readXmlTag(block, "Withdraw"));
  const deposit = parseAmount(readXmlTag(block, "Deposit"));
  const balanceAfter = parseAmount(readXmlTag(block, "Balance"));
  const description =
    readXmlTag(block, "TransRemark") ||
    readXmlTag(block, "TransType") ||
    readXmlTag(block, "TransOffice");

  if (withdrawal <= 0 && deposit <= 0 && !description) return null;

  return {
    transactionAt,
    withdrawal,
    deposit,
    balanceAfter,
    description: String(description || "").trim(),
    counterpartyBank: optionalText(readXmlTag(block, "TransOffice")),
    memo: buildMemo(block),
    transactionType: optionalText(readXmlTag(block, "TransType")),
    counterpartyName: optionalText(readXmlTag(block, "TransRemark")),
    transRefKey: optionalText(readXmlTag(block, "TransRefKey")),
  };
}

async function describeBarobillCode(code) {
  if (code >= 0) return null;
  try {
    const message = await getErrString(code);
    return message || `\uBC14\uB85C\uBE4C \uC624\uB958 (${code})`;
  } catch {
    return `\uBC14\uB85C\uBE4C \uC624\uB958 (${code})`;
  }
}

function parsePagedBankAccountLogEx(xml, resultTag) {
  const resultBlock = extractResultBlock(xml, resultTag);
  const currentPage = readXmlInt(resultBlock, "CurrentPage");
  const maxPageNum = readXmlInt(resultBlock, "MaxPageNum");
  const maxIndex = readXmlInt(resultBlock, "MaxIndex");

  if (currentPage < 0) {
    return { errorCode: currentPage, currentPage, maxPageNum, maxIndex, rows: [] };
  }
  if (maxIndex < 0) {
    return { errorCode: maxIndex, currentPage, maxPageNum, maxIndex, rows: [] };
  }

  const logBlocks = extractLogBlocks(resultBlock, "BankAccountLogEx");
  return { errorCode: null, currentPage, maxPageNum, maxIndex, rows: logBlocks };
}

async function fetchPeriodBankAccountPage({ bankAccountNum, startDate, endDate, currentPage }) {
  const { certKey, corpNum, userId } = assertBarobillBankCredentials();
  const operation = "GetPeriodBankAccountLogEx";
  const resultTag = `${operation}Result`;

  const xml = await callBankAccountSoapRequest(operation, {
    CERTKEY: certKey,
    CorpNum: corpNum,
    ID: userId,
    BankAccountNum: bankAccountNum,
    StartDate: startDate,
    EndDate: endDate,
    CountPerPage: String(COUNT_PER_PAGE),
    CurrentPage: String(currentPage),
    OrderDirection: String(ORDER_DIRECTION_DESC),
  });

  return parsePagedBankAccountLogEx(xml, resultTag);
}

export async function fetchPeriodBankAccountLogs({ bankAccountNum, startDate, endDate }) {
  const allBlocks = [];
  let currentPage = 1;
  let maxPageNum = 1;

  do {
    const page = await fetchPeriodBankAccountPage({ bankAccountNum, startDate, endDate, currentPage });
    if (page.errorCode !== null) {
      const detail = await describeBarobillCode(page.errorCode);
      const error = new Error(detail || `\uBC14\uB85C\uBE4C \uACC4\uC88C API \uC624\uB958 (${page.errorCode})`);
      error.errCode = page.errorCode;
      throw error;
    }

    allBlocks.push(...page.rows);
    maxPageNum = Math.max(1, page.maxPageNum || 1);
    currentPage += 1;
  } while (currentPage <= maxPageNum);

  return allBlocks;
}

function toBarobillDate(isoDate) {
  return String(isoDate || "").replace(/-/g, "").slice(0, 8);
}

function computeTransactionDateRange(rows) {
  if (!rows.length) {
    return { earliestTransactionAt: undefined, latestTransactionAt: undefined };
  }
  let earliest = rows[0].transactionAt;
  let latest = rows[0].transactionAt;
  for (const row of rows) {
    if (row.transactionAt.localeCompare(earliest) < 0) earliest = row.transactionAt;
    if (row.transactionAt.localeCompare(latest) > 0) latest = row.transactionAt;
  }
  return { earliestTransactionAt: earliest, latestTransactionAt: latest };
}

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const key = row.transRefKey
      ? `ref:${row.transRefKey}`
      : [
          row.transactionAt,
          row.withdrawal,
          row.deposit,
          row.balanceAfter,
          row.description,
        ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const { transRefKey: _ref, ...rest } = row;
    deduped.push(rest);
  }
  return deduped;
}

export function mapBarobillRowsToImportPreview(rows, meta = {}) {
  const accountNumber = meta.accountNumber || "";
  const parsedRows = rows.filter(Boolean);
  const { earliestTransactionAt, latestTransactionAt } = computeTransactionDateRange(parsedRows);

  return {
    accountNumber,
    accountHolder: meta.accountHolder,
    dateFrom: meta.dateFrom,
    dateTo: meta.dateTo,
    earliestTransactionAt,
    latestTransactionAt,
    sourceFile: "barobill-bank-api",
    rows: parsedRows,
    parsedTotals: parsedRows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.deposits += row.deposit;
        acc.withdrawals += row.withdrawal;
        return acc;
      },
      { count: 0, deposits: 0, withdrawals: 0 },
    ),
    errors: meta.errors || [],
  };
}

export async function fetchBarobillBankTransactionsInRange({ startDate, endDate, requestRefresh = false }) {
  const status = getBarobillBankConfigStatus();
  const errors = [];
  const notices = [];
  const { bankAccountNum, bankAccountDisplay } = assertBarobillBankCredentials();

  let scrapStatus = null;
  if (requestRefresh) {
    scrapStatus = await checkBankAccountScrapService(bankAccountNum);
    if (!scrapStatus.active) {
      errors.push(scrapStatus.message);
      return {
        preview: mapBarobillRowsToImportPreview([], {
          accountNumber: bankAccountDisplay,
          accountHolder: status.accountHolder,
          dateFrom: startDate,
          dateTo: endDate,
          errors,
        }),
        errors,
        notices,
        scrapStatus,
        collecting: false,
        startDate,
        endDate,
      };
    }

    if (scrapStatus.collecting) {
      notices.push(
        scrapStatus.message ||
          "\uBC14\uB85C\uBE4C\uC5D0\uC11C \uACC4\uC88C \uAC70\uB798\uB0B4\uC5AD\uC744 \uC218\uC9D1 \uC911\uC785\uB2C8\uB2E4. \uC774\uBBF8 \uC218\uC9D1\uB41C \uB0B4\uC5ED\uC740 \uAC00\uC838\uC635\uB2C8\uB2E4.",
      );
    } else if (scrapStatus.message && scrapStatus.code >= 0) {
      notices.push(scrapStatus.message);
    }
  }

  const start = toBarobillDate(startDate);
  const end = toBarobillDate(endDate);

  let blocks = [];
  try {
    blocks = await fetchPeriodBankAccountLogs({
      bankAccountNum,
      startDate: start,
      endDate: end,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    return {
      preview: mapBarobillRowsToImportPreview([], {
        accountNumber: bankAccountDisplay,
        dateFrom: startDate,
        dateTo: endDate,
        errors,
      }),
      errors,
      notices,
      scrapStatus,
      collecting: false,
      startDate,
      endDate,
    };
  }

  const mapped = [];
  for (const block of blocks) {
    const row = mapBarobillLogToImportRow(block);
    if (row) mapped.push(row);
  }

  const rows = dedupeRows(mapped);
  return {
    preview: mapBarobillRowsToImportPreview(rows, {
      accountNumber: bankAccountDisplay,
      dateFrom: startDate,
      dateTo: endDate,
      errors,
    }),
    errors,
    notices,
    scrapStatus,
    collecting: Boolean(scrapStatus?.collecting),
    startDate,
    endDate,
  };
}

export function countMergeAgainstExisting(existing, preview) {
  const known = new Set(
    (existing || []).map((row) =>
      [
        String(row.accountNumber || "").trim(),
        String(row.transactionAt || "").trim(),
        String(row.withdrawal || 0),
        String(row.deposit || 0),
        String(row.balanceAfter || 0),
        String(row.description || "").trim(),
      ].join("|"),
    ),
  );

  let added = 0;
  let skipped = 0;
  const accountNumber = preview.accountNumber || "unknown";

  for (const row of preview.rows) {
    const fingerprint = [
      accountNumber,
      row.transactionAt,
      row.withdrawal,
      row.deposit,
      row.balanceAfter,
      row.description,
    ].join("|");
    if (known.has(fingerprint)) {
      skipped += 1;
    } else {
      added += 1;
      known.add(fingerprint);
    }
  }

  return { added, skipped };
}
