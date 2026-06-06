import * as XLSX from "xlsx";
import crypto from "crypto";

const HEADER_TRANSACTION_AT = "\uAC70\uB798\uC77C\uC2DC";
const SHEET_HINT = "\uAC70\uB798\uB0B4\uC5ED";

function makeBankTransactionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `bank-tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseBankAmount(value) {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function buildImportFingerprint(row) {
  return [
    String(row.accountNumber || "").trim(),
    String(row.transactionAt || "").trim(),
    String(row.withdrawal || 0),
    String(row.deposit || 0),
    String(row.balanceAfter || 0),
    String(row.description || "").trim(),
  ].join("|");
}

function bankTransactionKeepScore(row) {
  let score = 0;
  if (row.linkedFixedExpensePaymentId) score += 100;
  if (row.linkedCompanyExpenseId) score += 100;
  if (row.linkedPaymentVoucherId) score += 100;
  if (row.ledgerAccountCode) score += 120;
  if (row.ledgerCategoryId) score += 50;
  if (row.folderId) score += 20;
  if (row.counterpartyName) score += 5;
  if (row.memo) score += 2;
  return score;
}

function mergeDuplicateBankTransactionRows(keeper, duplicate) {
  const keeperLedgerMs = Date.parse(keeper.ledgerConfirmedAt || "") || 0;
  const duplicateLedgerMs = Date.parse(duplicate.ledgerConfirmedAt || "") || 0;
  const preferDuplicateLedger = duplicateLedgerMs > keeperLedgerMs;
  const ledgerAccountCode = preferDuplicateLedger
    ? duplicate.ledgerAccountCode || keeper.ledgerAccountCode
    : keeper.ledgerAccountCode || duplicate.ledgerAccountCode;
  const ledgerStatus = preferDuplicateLedger
    ? duplicate.ledgerStatus || keeper.ledgerStatus
    : keeper.ledgerStatus || duplicate.ledgerStatus;
  const ledgerCategoryId = preferDuplicateLedger
    ? duplicate.ledgerCategoryId ?? keeper.ledgerCategoryId
    : keeper.ledgerCategoryId ?? duplicate.ledgerCategoryId;
  const ledgerConfirmedAt = preferDuplicateLedger
    ? duplicate.ledgerConfirmedAt || keeper.ledgerConfirmedAt
    : keeper.ledgerConfirmedAt || duplicate.ledgerConfirmedAt;
  const ledgerConfirmedBy = preferDuplicateLedger
    ? duplicate.ledgerConfirmedBy || keeper.ledgerConfirmedBy
    : keeper.ledgerConfirmedBy || duplicate.ledgerConfirmedBy;

  return {
    ...keeper,
    counterpartyName: keeper.counterpartyName || duplicate.counterpartyName,
    counterpartyAccount: keeper.counterpartyAccount || duplicate.counterpartyAccount,
    counterpartyBank: keeper.counterpartyBank || duplicate.counterpartyBank,
    memo: keeper.memo || duplicate.memo,
    transactionType: keeper.transactionType || duplicate.transactionType,
    ledgerStatus,
    ledgerCategoryId,
    ledgerAccountCode,
    ledgerConfirmedAt,
    ledgerConfirmedBy,
    ledgerMemo: keeper.ledgerMemo || duplicate.ledgerMemo,
    ledgerFixedExpenseId: keeper.ledgerFixedExpenseId || duplicate.ledgerFixedExpenseId,
    folderId: keeper.folderId || duplicate.folderId,
    linkedSubject: keeper.linkedSubject || duplicate.linkedSubject,
    linkedFixedExpensePaymentId: keeper.linkedFixedExpensePaymentId || duplicate.linkedFixedExpensePaymentId,
    linkedCompanyExpenseId: keeper.linkedCompanyExpenseId || duplicate.linkedCompanyExpenseId,
    linkedPaymentVoucherId: keeper.linkedPaymentVoucherId || duplicate.linkedPaymentVoucherId,
    classifiedAt: keeper.classifiedAt || duplicate.classifiedAt,
    sourceFile: keeper.sourceFile || duplicate.sourceFile,
  };
}

export { buildImportFingerprint };

export function dedupeBankTransactionsByFingerprint(transactions = []) {
  const groups = new Map();
  for (const row of transactions || []) {
    const fingerprint = buildImportFingerprint(row);
    if (!groups.has(fingerprint)) groups.set(fingerprint, []);
    groups.get(fingerprint).push(row);
  }

  const removed = [];
  const next = [];

  for (const [fingerprint, group] of groups) {
    if (group.length === 1) {
      next.push(group[0]);
      continue;
    }

    const sorted = [...group].sort((left, right) => {
      const scoreDiff = bankTransactionKeepScore(right) - bankTransactionKeepScore(left);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left.createdAt || left.transactionAt || "").localeCompare(
        String(right.createdAt || right.transactionAt || ""),
      );
    });

    let keeper = sorted[0];
    for (const duplicate of sorted.slice(1)) {
      keeper = mergeDuplicateBankTransactionRows(keeper, duplicate);
      removed.push({
        fingerprint,
        keptId: keeper.id,
        removedId: duplicate.id,
        description: duplicate.description,
        transactionAt: duplicate.transactionAt,
      });
    }
    next.push(keeper);
  }

  return {
    transactions: sortMergedTransactions(next),
    removed,
  };
}

function sheetRows(wb) {
  const name = wb.SheetNames.find((item) => item.includes(SHEET_HINT)) || wb.SheetNames[0];
  if (!name) return { rows: [] };
  return { rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }) };
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const cells = row.map((cell) => String(cell || "").trim());
    return cells.some((cell) => cell === HEADER_TRANSACTION_AT || cell.includes(HEADER_TRANSACTION_AT));
  });
}

function parseAccountInfoCell(text) {
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

function parseTransactionAt(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (num) => String(num).padStart(2, "0");
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

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function isSummaryRow(row) {
  const first = String(row?.[0] ?? "").trim();
  const second = String(row?.[1] ?? "").trim();
  return first === "\uD569\uACC4" || second === "\uD569\uACC4";
}

function parseDataRow(row, rowNumber) {
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

function computeTransactionDateRange(rows) {
  if (!rows.length) return { earliestTransactionAt: undefined, latestTransactionAt: undefined };
  let earliest = rows[0].transactionAt;
  let latest = rows[0].transactionAt;
  for (const row of rows) {
    if (row.transactionAt.localeCompare(earliest) < 0) earliest = row.transactionAt;
    if (row.transactionAt.localeCompare(latest) > 0) latest = row.transactionAt;
  }
  return { earliestTransactionAt: earliest, latestTransactionAt: latest };
}

export function parseIbkBankExcelBuffer(buffer, fileName = "upload.xlsx") {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const { rows } = sheetRows(wb);
  if (!rows.length) {
    throw new Error("\uC5D1\uC140 \uC2DC\uD2B8\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
  }

  const accountInfo = parseAccountInfoCell(String(rows[1]?.[0] || ""));
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx < 0) {
    throw new Error("IBK \uAC70\uB798\uB0B4\uC5ED \uC5D1\uC140 \uD615\uC2F0\uC774 \uC544\uB2D9\uB2C8\uB2E4. (\uD5E4\uB354 \uD589\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4)");
  }

  const errors = [];
  const parsedRows = [];

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
    { count: 0, deposits: 0, withdrawals: 0 },
  );

  const { earliestTransactionAt, latestTransactionAt } = computeTransactionDateRange(parsedRows);

  return {
    accountNumber: accountInfo.accountNumber,
    accountHolder: accountInfo.accountHolder,
    dateFrom: accountInfo.dateFrom,
    dateTo: accountInfo.dateTo,
    earliestTransactionAt,
    latestTransactionAt,
    sourceFile: fileName,
    rows: parsedRows,
    parsedTotals,
    errors,
  };
}

function sortMergedTransactions(rows) {
  return [...rows].sort((a, b) => {
    const dateDiff = String(b.transactionAt).localeCompare(String(a.transactionAt));
    if (dateDiff !== 0) return dateDiff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

export function mergeIbkBankImport(existing, preview, options = {}) {
  const known = new Set(
    (existing || []).map((row) =>
      buildImportFingerprint({
        accountNumber: row.accountNumber,
        transactionAt: row.transactionAt,
        withdrawal: row.withdrawal,
        deposit: row.deposit,
        balanceAfter: row.balanceAfter,
        description: row.description,
      }),
    ),
  );

  const now = new Date().toISOString();
  const importBatchId = options.importBatchId || makeBankTransactionId();
  const accountNumber = preview.accountNumber || "unknown";
  const additions = [];
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

  const merged = sortMergedTransactions([...additions, ...(existing || [])]);
  const deduped = dedupeBankTransactionsByFingerprint(merged);

  return {
    next: deduped.transactions,
    added: additions.length,
    skipped,
    deduped: deduped.removed.length,
  };
}
