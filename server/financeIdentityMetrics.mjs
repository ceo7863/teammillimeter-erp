/**
 * Read-only finance identity + legacy bank↔worker link metrics.
 * Never mutates customer ledgers.
 */
import {
  classifyBankToCashTransfer,
  computeLegacyApDatasetHash,
  readApLedgerMeta,
} from "./apLedgerCutover.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function trimId(value) {
  return String(value ?? "").trim();
}

function isActiveDisbursement(row) {
  if (!row) return false;
  if (row.reversalOfDisbursementId) return false;
  if (row.status === "reversed") return false;
  if (row.reversedEffectiveDate) return false;
  return true;
}

/**
 * Eight bank↔worker link metrics (historical ~58 = legacyBankWorkerLinkRowCount).
 */
export function measureBankWorkerLinkMetrics(data = {}) {
  const bankTransactions = asArray(data.bankTransactions);
  const monthly = asArray(data.workerMonthlyActualVouchers);
  const disbursements = asArray(data.disbursements);

  const monthlyIds = new Set(monthly.map((row) => trimId(row?.id)).filter(Boolean));

  const linkedRows = bankTransactions.filter((tx) =>
    Boolean(trimId(tx?.linkedWorkerMonthlyPaymentVoucherId)),
  );

  const legacyBankWorkerLinkRowCount = linkedRows.length;
  const legacyBankWorkerLinkedTransactionUniqueCount = new Set(
    linkedRows.map((tx) => trimId(tx?.id)).filter(Boolean),
  ).size;

  const payoutBankTxIds = new Set();
  for (const voucher of monthly) {
    for (const entry of asArray(voucher?.entries)) {
      if (entry?.kind !== "bank") continue;
      const bankTransactionId = trimId(entry?.bankTransactionId);
      if (bankTransactionId) payoutBankTxIds.add(bankTransactionId);
    }
  }
  const legacyPayoutReferencingBankUniqueCount = payoutBankTxIds.size;

  const activeDisbursementBankIds = new Set();
  for (const row of disbursements) {
    if (!isActiveDisbursement(row)) continue;
    const bankTransactionId = trimId(row?.bankTransactionId);
    if (bankTransactionId) activeDisbursementBankIds.add(bankTransactionId);
  }

  let duplicateLegacyBankWorkerLinkCount = 0;
  let orphanLegacyBankWorkerLinkCount = 0;
  let invalidDirectionWorkerLinkCount = 0;
  for (const tx of linkedRows) {
    const txId = trimId(tx?.id);
    if (txId && activeDisbursementBankIds.has(txId)) {
      duplicateLegacyBankWorkerLinkCount += 1;
    }
    const voucherId = trimId(tx?.linkedWorkerMonthlyPaymentVoucherId);
    if (voucherId && !monthlyIds.has(voucherId)) {
      orphanLegacyBankWorkerLinkCount += 1;
    }
    const deposit = money(tx?.deposit);
    const withdrawal = money(tx?.withdrawal);
    if (deposit > 0 && !(withdrawal > 0)) {
      invalidDirectionWorkerLinkCount += 1;
    }
  }

  let canonicalDisbursementBankLinkCount = 0;
  for (const row of disbursements) {
    if (!isActiveDisbursement(row)) continue;
    if (trimId(row?.bankTransactionId)) canonicalDisbursementBankLinkCount += 1;
  }

  let cashTransferBankLinkCount = 0;
  for (const tx of bankTransactions) {
    const transfer = classifyBankToCashTransfer(tx);
    if (transfer?.kind === "BANK_TO_CASH_TRANSFER") cashTransferBankLinkCount += 1;
  }

  return {
    legacyBankWorkerLinkRowCount,
    legacyBankWorkerLinkedTransactionUniqueCount,
    legacyPayoutReferencingBankUniqueCount,
    duplicateLegacyBankWorkerLinkCount,
    orphanLegacyBankWorkerLinkCount,
    invalidDirectionWorkerLinkCount,
    canonicalDisbursementBankLinkCount,
    cashTransferBankLinkCount,
    /** Continuity alias for older probe field names. */
    bankWorkerLinkCount: legacyBankWorkerLinkRowCount,
  };
}

/**
 * Full finance identity snapshot used by probe scripts and cutover readiness.
 */
export function measureFinanceIdentityMetrics(data = {}) {
  const monthly = asArray(data.workerMonthlyActualVouchers);
  const payouts = asArray(data.workerPayoutVouchers);
  const paymentVouchers = asArray(data.paymentVouchers);
  const receipts = asArray(data.receipts);
  const receiptAllocations = asArray(data.receiptAllocations);
  const disbursements = asArray(data.disbursements);
  const disbursementAllocations = asArray(data.disbursementAllocations);
  const sales = asArray(data.sales);
  const clients = asArray(data.clients);
  const statements = asArray(data.statementGenerationLogs);

  const apMeta = readApLedgerMeta(data);
  const cutover = data.apLedgerCutover || data.bankSyncMeta?.apLedgerCutover || {};
  const bankWorker = measureBankWorkerLinkMetrics(data);

  const cutoverActivated = Boolean(
    apMeta.apLedgerActivatedAt || cutover.activated || cutover.cutoverActivated,
  );
  const disbursementWriteEnabled = Boolean(
    apMeta.disbursementWriteEnabled ||
      cutover.disbursementWriteEnabled ||
      process.env.DISBURSEMENT_WRITE_ENABLED === "1",
  );

  return {
    paymentVoucherCount: paymentVouchers.length,
    receiptCount: receipts.length,
    receiptAllocationCount: receiptAllocations.length,
    monthlyActualCount: monthly.length,
    payoutHistoryCount: payouts.length,
    openingBalanceCount: asArray(apMeta.apOpeningBalances).length,
    disbursementCount: disbursements.length,
    disbursementAllocationCount: disbursementAllocations.length,
    saleCount: sales.length,
    clientCount: clients.length,
    statementLogCount: statements.length,
    cutoverActivated,
    disbursementWriteEnabled,
    legacyDatasetHash: computeLegacyApDatasetHash(data),
    ...bankWorker,
  };
}
