import type { BankTransaction } from "./bankTransactions";
import { hasManualClientClassificationOverride } from "./bankTransactions";
import { isCardCompanyDeposit } from "./bankTransactionFolders";
import type { ClientDepositMatchSource } from "./clientDepositAliases";
import { resolveBankDepositMatchSubject, resolveDepositSubjectClientMatch } from "./clientDepositAliases";
import type { PdfArchiveMeta } from "./pdfArchive";
import type { BankPaymentVoucherDraft } from "./bankReceivableMatch";
import { aggregateSaleBilling } from "./statementSheets";

export type SentStatementMatchCandidate = {
  pdfArchiveId: string;
  client: string;
  statementTotalAmount: number;
  sentAt: string;
  periodStart: string;
  periodEnd: string;
  score: number;
  reasons: string[];
  paymentAmount: number;
  paymentStatus: "confirmed" | "partial";
  statementRemainingAmount: number;
  shareLinkUrl?: string;
  statementSalesIds?: Array<string | number>;
};

export type StatementSaleForPayment = {
  salesId: number | string;
  statementAmount: number;
  saleDate?: string;
  site?: string;
  salesAmount?: number;
  workerCount?: number;
};

type SaleLikeForStatement = {
  id?: number | string;
  date?: string;
  client?: string;
  site?: string;
  amount?: number;
  worker?: string;
  workers?: unknown[];
};

type PaymentVoucherLike = {
  salesId?: number | string;
  finalAmount?: number;
  amount?: number;
  bankTransactionId?: string | number;
  linkedPdfArchiveId?: string;
};

function resolveStatementClientMatch(
  subject: string,
  clientName: string,
  tx: BankTransaction,
  clients?: ClientDepositMatchSource[],
) {
  const clientRecord = clients?.find((client) => String(client.name || "").trim() === String(clientName || "").trim());
  return resolveDepositSubjectClientMatch(subject, clientName, clientRecord, {
    linkedSubject: tx.linkedSubject,
    scores: { name: 40, linked: 28, alias: 36, manager: 34 },
  });
}

function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate.slice(0, 10)}T12:00:00`).getTime();
  const to = new Date(`${toDate.slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 999;
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function amountsMatch(expected: number, actual: number) {
  if (expected <= 0 || actual <= 0) return false;
  return Math.abs(expected - actual) <= Math.max(1000, Math.round(expected * 0.02));
}

export function buildPaidAmountBySaleId(paymentVouchers: PaymentVoucherLike[] = []) {
  const map = new Map<string, number>();
  for (const voucher of paymentVouchers) {
    if (voucher.salesId == null || voucher.salesId === "") continue;
    const key = String(voucher.salesId);
    map.set(key, (map.get(key) || 0) + Number(voucher.finalAmount ?? voucher.amount ?? 0));
  }
  return map;
}

export function resolveStatementPaidAmount(
  archiveId: string,
  paymentVouchers: PaymentVoucherLike[] = [],
  bankTransactions: Array<Pick<BankTransaction, "id" | "linkedPdfArchiveId">> = [],
) {
  const linkedTxIds = new Set(
    bankTransactions.filter((tx) => tx.linkedPdfArchiveId === archiveId).map((tx) => tx.id),
  );
  let sum = 0;
  for (const voucher of paymentVouchers) {
    const amount = Number(voucher.finalAmount ?? voucher.amount ?? 0);
    if (!amount) continue;
    if (voucher.linkedPdfArchiveId === archiveId) {
      sum += amount;
      continue;
    }
    const bankTxId = String(voucher.bankTransactionId || "");
    if (bankTxId && linkedTxIds.has(bankTxId)) sum += amount;
  }
  return sum;
}

export function resolveStatementPaymentAmount(deposit: number, statementTotal: number, paidSoFar = 0) {
  const remaining = Math.max(0, statementTotal - paidSoFar);
  if (remaining <= 0 || deposit <= 0) return null;

  if (deposit === remaining) {
    return {
      score: paidSoFar > 0 ? 48 : 50,
      reason: paidSoFar > 0 ? "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC794\uC561 \uC815\uD655 \uC77C\uCE58" : "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uCD1D\uD569\uACC4 \uC815\uD655 \uC77C\uCE58",
      paymentAmount: deposit,
      paymentStatus: "confirmed" as const,
    };
  }

  if (amountsMatch(deposit, remaining)) {
    return {
      score: paidSoFar > 0 ? 46 : 45,
      reason: paidSoFar > 0 ? "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC794\uC561 \uADFC\uC0AC \uC77C\uCE58" : "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uCD1D\uD569\uACC4 \uADFC\uC0AC \uC77C\uCE58",
      paymentAmount: deposit,
      paymentStatus: "confirmed" as const,
    };
  }

  if (deposit < remaining) {
    return {
      score: paidSoFar > 0 ? 40 : 38,
      reason: paidSoFar > 0 ? "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC794\uC561 \uBD80\uBD84 \uC785\uAE08" : "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uBD80\uBD84 \uC785\uAE08",
      paymentAmount: deposit,
      paymentStatus: "partial" as const,
    };
  }

  if (deposit > remaining) {
    return {
      score: 36,
      reason: "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC794\uC561 \uCD08\uACFC \uC785\uAE08",
      paymentAmount: remaining,
      paymentStatus: "confirmed" as const,
    };
  }

  return null;
}

function clientHasVat(
  clients: ClientDepositMatchSource[] | undefined,
  clientName: string,
  subtotal?: number,
  grandTotal?: number,
) {
  const client = clients?.find((row) => String(row.name || "").trim() === String(clientName || "").trim()) as
    | { vat?: string }
    | undefined;
  if (client?.vat === "Y") return true;
  if (client?.vat === "N") return false;
  if (subtotal != null && grandTotal != null && subtotal > 0) {
    return amountsMatch(grandTotal, Math.round(subtotal * 1.1));
  }
  return false;
}

function saleWorkerCount(sale: SaleLikeForStatement) {
  if (sale.workers?.length) return sale.workers.length;
  return String(sale.worker || "")
    .split(",")
    .filter(Boolean).length;
}

function buildStatementSaleRowFromAmount(sale: SaleLikeForStatement): StatementSaleForPayment | null {
  if (sale.id == null || sale.id === "") return null;
  const statementAmount = Number(sale.amount) || 0;
  if (statementAmount <= 0) return null;
  return {
    salesId: sale.id,
    statementAmount,
    saleDate: sale.date,
    site: sale.site,
    salesAmount: sale.amount,
    workerCount: saleWorkerCount(sale),
  };
}

function buildStatementSaleRow(sale: SaleLikeForStatement): StatementSaleForPayment | null {
  if (sale.id == null || sale.id === "") return null;
  const billing = aggregateSaleBilling(sale);
  if ((billing.totalConstructionCost || 0) > 0) {
    return {
      salesId: sale.id,
      statementAmount: billing.totalConstructionCost,
      saleDate: sale.date,
      site: sale.site,
      salesAmount: sale.amount,
      workerCount: saleWorkerCount(sale),
    };
  }
  return buildStatementSaleRowFromAmount(sale);
}

function saleMatchesStatementClient(sale: SaleLikeForStatement, clientName: string) {
  return String(sale.client || "").trim() === String(clientName || "").trim();
}

function filterSalesByStatementPeriod(sales: SaleLikeForStatement[], periodStart?: string, periodEnd?: string) {
  return sales.filter((sale) => {
    const date = String(sale.date || "");
    if (periodStart && date < periodStart) return false;
    if (periodEnd && date > periodEnd) return false;
    return true;
  });
}

function resolveStatementSalesBySaleAmount(
  archive: Pick<
    PdfArchiveMeta,
    "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
  >,
  sales: SaleLikeForStatement[] = [],
  clients?: ClientDepositMatchSource[],
): StatementSaleForPayment[] {
  const scopedSales = filterSalesByStatementPeriod(
    sales.filter((sale) => saleMatchesStatementClient(sale, archive.subjectName)),
    archive.periodStart,
    archive.periodEnd,
  );
  const rows = scopedSales
    .map((sale) => buildStatementSaleRowFromAmount(sale))
    .filter((row): row is StatementSaleForPayment => Boolean(row));
  if (!rows.length) return [];

  const subtotal = rows.reduce((sum, row) => sum + row.statementAmount, 0);
  const expectedTotal = archive.statementTotalAmount || 0;
  const inferredVat = clientHasVat(clients, archive.subjectName, subtotal, expectedTotal);
  if (amountsMatch(statementGrandTotal(subtotal, inferredVat), expectedTotal)) return rows;
  if (amountsMatch(subtotal, expectedTotal)) return rows;
  return [];
}

function statementGrandTotal(subtotal: number, hasVat: boolean) {
  const vatAmount = hasVat ? Math.round(subtotal * 0.1) : 0;
  return subtotal + vatAmount;
}

/** Archive meta or period/client/amount fallback resolves statement sales rows. */
export function resolveStatementSalesForArchive(
  archive: Pick<
    PdfArchiveMeta,
    "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
  >,
  sales: SaleLikeForStatement[] = [],
  clients?: ClientDepositMatchSource[],
): StatementSaleForPayment[] {
  const saleById = new Map(sales.map((sale) => [String(sale.id), sale]));

  if (archive.statementSalesIds?.length) {
    const rows = archive.statementSalesIds
      .map((id) => {
        const sale = saleById.get(String(id));
        if (!sale) return null;
        return buildStatementSaleRow(sale) || buildStatementSaleRowFromAmount(sale);
      })
      .filter((row): row is StatementSaleForPayment => Boolean(row));
    if (rows.length) return rows;
  }

  const periodRows = filterSalesByStatementPeriod(
    sales.filter((sale) => saleMatchesStatementClient(sale, archive.subjectName)),
    archive.periodStart,
    archive.periodEnd,
  )
    .map((sale) => buildStatementSaleRow(sale) || buildStatementSaleRowFromAmount(sale))
    .filter((row): row is StatementSaleForPayment => Boolean(row));

  if (!periodRows.length) return resolveStatementSalesBySaleAmount(archive, sales, clients);

  const subtotal = periodRows.reduce((sum, row) => sum + row.statementAmount, 0);
  const expectedTotal = archive.statementTotalAmount || 0;
  const inferredVat = clientHasVat(clients, archive.subjectName, subtotal, expectedTotal);
  if (amountsMatch(statementGrandTotal(subtotal, inferredVat), expectedTotal)) {
    return periodRows;
  }
  if (amountsMatch(subtotal, expectedTotal)) {
    return periodRows;
  }

  return resolveStatementSalesBySaleAmount(archive, sales, clients);
}

function saleDueAmount(
  row: StatementSaleForPayment,
  hasVat: boolean,
  paidBySaleId: Map<string, number>,
) {
  const gross = statementGrandTotal(row.statementAmount, hasVat);
  const paid = paidBySaleId.get(String(row.salesId)) || 0;
  return Math.max(0, gross - paid);
}

/** Allocate deposit to statement sales in ascending sale-date order (FIFO). */
export function allocatePaymentFifoBySaleDate(
  statementSales: StatementSaleForPayment[],
  paymentAmount: number,
  hasVat: boolean,
  paidBySaleId: Map<string, number>,
) {
  const sorted = [...statementSales].sort(
    (a, b) =>
      String(a.saleDate || "").localeCompare(String(b.saleDate || "")) ||
      String(a.salesId).localeCompare(String(b.salesId)),
  );

  let remaining = paymentAmount;
  const results: Array<
    StatementSaleForPayment & {
      finalAmount: number;
      supplyAmount: number;
      vatAmount: number;
      isPartialPayment: boolean;
    }
  > = [];

  for (const row of sorted) {
    if (remaining <= 0) break;
    const due = saleDueAmount(row, hasVat, paidBySaleId);
    if (due <= 0) continue;

    const finalAmount = Math.min(remaining, due);
    const isPartialPayment = finalAmount < due;
    remaining -= finalAmount;

    const supplyAmount = hasVat ? Math.max(0, Math.round(finalAmount / 1.1)) : finalAmount;
    const vatAmount = Math.max(0, finalAmount - supplyAmount);

    results.push({
      ...row,
      finalAmount,
      supplyAmount,
      vatAmount,
      isPartialPayment,
    });
  }

  return results;
}

export function listMatchableSentStatements(archives: PdfArchiveMeta[]) {
  return archives.filter(
    (row) =>
      row.sentViaLink &&
      row.category === "statement-client" &&
      row.paymentStatus !== "confirmed" &&
      (row.statementTotalAmount || 0) > 0,
  );
}

export function buildSentStatementMatchCandidates(
  tx: BankTransaction,
  archives: PdfArchiveMeta[],
  options: {
    linkedPdfArchiveIds?: Set<string>;
    minScore?: number;
    limit?: number;
    clients?: ClientDepositMatchSource[];
    paymentVouchers?: PaymentVoucherLike[];
    bankTransactions?: Array<Pick<BankTransaction, "id" | "linkedPdfArchiveId">>;
  } = {},
) {
  if (tx.deposit <= 0 || tx.linkedPaymentVoucherId || tx.linkedPdfArchiveId || isCardCompanyDeposit(tx)) {
    return [];
  }

  const deposit = tx.deposit;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const subject = resolveBankDepositMatchSubject(tx);
  const linkedPdfArchiveIds = options.linkedPdfArchiveIds || new Set<string>();
  const clients = options.clients;
  const paymentVouchers = options.paymentVouchers || [];
  const bankTransactions = options.bankTransactions || [];
  const minScore = options.minScore ?? 35;
  const limit = options.limit ?? 5;

  const candidates: Array<SentStatementMatchCandidate & { dayGap: number }> = [];

  for (const archive of listMatchableSentStatements(archives)) {
    if (linkedPdfArchiveIds.has(archive.id)) continue;
    if (archive.linkedBankTransactionId && archive.linkedBankTransactionId !== tx.id) continue;

    const paidSoFar = resolveStatementPaidAmount(archive.id, paymentVouchers, bankTransactions);
    const statementTotal = archive.statementTotalAmount || 0;
    const amountMatch = resolveStatementPaymentAmount(deposit, statementTotal, paidSoFar);
    if (!amountMatch) continue;

    const sentDate = String(archive.createdAt || "").slice(0, 10);
    let score = amountMatch.score;
    const reasons = [amountMatch.reason];

    const nameMatch = resolveStatementClientMatch(subject, archive.subjectName, tx, clients);
    if (!nameMatch.matched) continue;

    score += nameMatch.scoreBonus;
    reasons.push(nameMatch.reason);

    const dayGap = txDate && sentDate ? Math.abs(daysBetween(sentDate, txDate)) : 999;

    candidates.push({
      pdfArchiveId: archive.id,
      client: archive.subjectName,
      statementTotalAmount: statementTotal,
      sentAt: archive.createdAt,
      periodStart: archive.periodStart,
      periodEnd: archive.periodEnd,
      score,
      reasons,
      paymentAmount: amountMatch.paymentAmount,
      paymentStatus: amountMatch.paymentStatus,
      statementRemainingAmount: Math.max(0, statementTotal - paidSoFar),
      shareLinkUrl: archive.shareLinkUrl,
      statementSalesIds: archive.statementSalesIds,
      dayGap,
    });
  }

  return candidates
    .filter((row) => row.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.dayGap ?? 999) - (b.dayGap ?? 999) ||
        String(a.periodStart || "").localeCompare(String(b.periodStart || "")) ||
        b.statementTotalAmount - a.statementTotalAmount,
    )
    .slice(0, limit)
    .map(({ dayGap: _dayGap, ...row }) => row);
}

export function buildAllSentStatementDepositSuggestions(
  transactions: BankTransaction[],
  archives: PdfArchiveMeta[],
  clients?: ClientDepositMatchSource[],
  paymentVouchers: PaymentVoucherLike[] = [],
) {
  const linkedPdfArchiveIds = new Set(
    transactions.filter((row) => row.linkedPdfArchiveId).map((row) => String(row.linkedPdfArchiveId)),
  );

  return transactions
    .filter((row) => row.deposit > 0 && !row.linkedPaymentVoucherId)
    .map((tx) => ({
      tx,
      candidates: buildSentStatementMatchCandidates(tx, archives, {
        linkedPdfArchiveIds,
        clients,
        paymentVouchers,
        bankTransactions: transactions,
      }),
    }))
    .filter((row) => row.candidates.length > 0)
    .sort((a, b) => (b.candidates[0]?.score || 0) - (a.candidates[0]?.score || 0));
}

function createFallbackPaymentVoucher(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate,
  hasVat: boolean,
): BankPaymentVoucherDraft {
  const total = candidate.statementTotalAmount;
  const finalAmount = Math.max(1, Math.round(candidate.paymentAmount));
  const supplyAmount = hasVat ? Math.max(1, Math.round(finalAmount / 1.1)) : finalAmount;
  const vatAmount = Math.max(0, finalAmount - supplyAmount);
  const isPartialPayment = candidate.paymentStatus === "partial";

  return {
    id: Date.now() + Number(String(candidate.pdfArchiveId).replace(/\D/g, "").slice(-6) || 0),
    salesId: "",
    date: String(tx.transactionAt || "").slice(0, 10),
    client: candidate.client,
    site: "",
    workerCount: 0,
    totalSalesAmount: total,
    amount: supplyAmount,
    vatType: hasVat ? "included" : "excluded",
    supplyAmount,
    vatAmount,
    finalAmount,
    memo: `\uD1B5\uC7A5\uC785\uAE08(\uBCF4\uB0B8\uB0B4\uC5ED\uC11C) ${tx.description || tx.counterpartyName || ""}`.trim(),
    bankTransactionId: tx.id,
    statementPeriodStart: candidate.periodStart,
    statementPeriodEnd: candidate.periodEnd,
    statementSalesIds: candidate.statementSalesIds,
    linkedPdfArchiveId: candidate.pdfArchiveId,
    isPartialPayment,
  };
}

export type StatementPaymentCoverageStatus = "confirmed" | "partial" | "pending";

/** Merge existing paid-by-sale map with newly created voucher drafts (explicit salesId only). */
export function buildPaidAmountBySaleIdAfterVouchers(
  paidBySaleIdBefore: Map<string, number>,
  vouchers: PaymentVoucherLike[] = [],
) {
  const map = new Map(paidBySaleIdBefore);
  for (const voucher of vouchers) {
    if (voucher.salesId == null || voucher.salesId === "") continue;
    const key = String(voucher.salesId);
    map.set(key, (map.get(key) || 0) + Number(voucher.finalAmount ?? voucher.amount ?? 0));
  }
  return map;
}

/**
 * Confirmed only when every statement sale is fully covered by stored/explicit salesId allocations.
 * Incomplete single-salesId or empty-salesId drafts never become confirmed.
 */
export function resolveArchivePaymentStatusFromSaleCoverage(options: {
  statementSales: StatementSaleForPayment[];
  hasVat: boolean;
  paidBySaleId: Map<string, number>;
  appliedAmount?: number;
}): StatementPaymentCoverageStatus {
  const { statementSales, hasVat, paidBySaleId } = options;
  const appliedAmount = Math.max(0, Number(options.appliedAmount || 0));

  if (!statementSales.length) {
    if (appliedAmount > 0) return "partial";
    return "pending";
  }

  let unpaidCount = 0;
  let fullyPaidCount = 0;
  for (const row of statementSales) {
    const due = saleDueAmount(row, hasVat, paidBySaleId);
    if (due <= 0) fullyPaidCount += 1;
    else unpaidCount += 1;
  }

  if (unpaidCount === 0 && fullyPaidCount > 0) return "confirmed";
  if (fullyPaidCount > 0 || appliedAmount > 0) return "partial";
  return "pending";
}

/**
 * Prefer sale-coverage when statement sales + vouchers are known.
 * Falls back to deposit-total matching only when sales cannot be resolved (never "confirmed" then).
 */
export function resolveArchivePaymentStatusAfterApply(
  statementTotal: number,
  paidSoFar: number,
  appliedAmount: number,
  options?: {
    statementSales?: StatementSaleForPayment[];
    hasVat?: boolean;
    paidBySaleIdBefore?: Map<string, number>;
    newVouchers?: PaymentVoucherLike[];
  },
): StatementPaymentCoverageStatus {
  const statementSales = options?.statementSales || [];
  if (statementSales.length || options?.newVouchers) {
    const paidBefore = options?.paidBySaleIdBefore || new Map<string, number>();
    const paidAfter = buildPaidAmountBySaleIdAfterVouchers(paidBefore, options?.newVouchers || []);
    const hasIncompleteVoucher = (options?.newVouchers || []).some(
      (voucher) => voucher.salesId == null || voucher.salesId === "",
    );
    const coverage = resolveArchivePaymentStatusFromSaleCoverage({
      statementSales,
      hasVat: Boolean(options?.hasVat),
      paidBySaleId: paidAfter,
      appliedAmount,
    });
    if (hasIncompleteVoucher && coverage === "confirmed") return "partial";
    return coverage;
  }

  const nextPaid = paidSoFar + appliedAmount;
  if (appliedAmount <= 0) return "pending";
  // Without resolvable statement sales, never mark confirmed from totals alone.
  if (nextPaid >= statementTotal || amountsMatch(nextPaid, statementTotal)) return "partial";
  return "partial";
}

/** Effective display/status from saved vouchers (does not mutate archives). */
export function deriveSentStatementPaymentStatus(options: {
  archive: Pick<
    PdfArchiveMeta,
    | "id"
    | "subjectName"
    | "periodStart"
    | "periodEnd"
    | "statementTotalAmount"
    | "statementSalesIds"
    | "paymentStatus"
  >;
  sales?: SaleLikeForStatement[];
  clients?: ClientDepositMatchSource[];
  paymentVouchers?: PaymentVoucherLike[];
}): StatementPaymentCoverageStatus {
  const archive = options.archive;
  const statementSales = resolveStatementSalesForArchive(archive, options.sales || [], options.clients);
  const linkedVouchers = (options.paymentVouchers || []).filter(
    (voucher) => String(voucher.linkedPdfArchiveId || "") === String(archive.id),
  );
  const paidBySaleId = buildPaidAmountBySaleId(
    linkedVouchers.length ? linkedVouchers : options.paymentVouchers || [],
  );
  const appliedAmount = [...paidBySaleId.values()].reduce((sum, value) => sum + value, 0);
  const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
  const hasVat = clientHasVat(
    options.clients,
    archive.subjectName,
    subtotal,
    archive.statementTotalAmount || 0,
  );
  return resolveArchivePaymentStatusFromSaleCoverage({
    statementSales,
    hasVat,
    paidBySaleId,
    appliedAmount,
  });
}

/** Read-only inconsistency: archive marked confirmed but sales allocations incomplete. */
export function listInconsistentConfirmedSentStatements(options: {
  archives: PdfArchiveMeta[];
  sales?: SaleLikeForStatement[];
  clients?: ClientDepositMatchSource[];
  paymentVouchers?: PaymentVoucherLike[];
}) {
  const rows: Array<{
    pdfArchiveId: string;
    client: string;
    storedPaymentStatus?: PdfArchiveMeta["paymentStatus"];
    effectivePaymentStatus: StatementPaymentCoverageStatus;
    statementSalesCount: number;
    allocatedSalesCount: number;
    statementTotalAmount: number;
  }> = [];

  for (const archive of options.archives) {
    if (archive.category !== "statement-client" || !archive.sentViaLink) continue;
    if (archive.paymentStatus !== "confirmed") continue;
    const statementSales = resolveStatementSalesForArchive(archive, options.sales || [], options.clients);
    const linkedVouchers = (options.paymentVouchers || []).filter(
      (voucher) => String(voucher.linkedPdfArchiveId || "") === String(archive.id),
    );
    const paidBySaleId = buildPaidAmountBySaleId(
      linkedVouchers.length ? linkedVouchers : options.paymentVouchers || [],
    );
    const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
    const hasVat = clientHasVat(options.clients, archive.subjectName, subtotal, archive.statementTotalAmount || 0);
    const effectivePaymentStatus = resolveArchivePaymentStatusFromSaleCoverage({
      statementSales,
      hasVat,
      paidBySaleId,
      appliedAmount: [...paidBySaleId.values()].reduce((sum, value) => sum + value, 0),
    });
    if (effectivePaymentStatus === "confirmed") continue;
    const allocatedSalesCount = statementSales.filter((row) => (paidBySaleId.get(String(row.salesId)) || 0) > 0).length;
    rows.push({
      pdfArchiveId: archive.id,
      client: archive.subjectName,
      storedPaymentStatus: archive.paymentStatus,
      effectivePaymentStatus,
      statementSalesCount: statementSales.length,
      allocatedSalesCount,
      statementTotalAmount: archive.statementTotalAmount || 0,
    });
  }
  return rows;
}

export function createPaymentVouchersFromSentStatementMatch(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate,
  options: {
    sales?: SaleLikeForStatement[];
    clients?: ClientDepositMatchSource[];
    paymentVouchers?: PaymentVoucherLike[];
    archive?: Pick<
      PdfArchiveMeta,
      "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
    >;
  } = {},
): BankPaymentVoucherDraft[] {
  const archiveMeta =
    options.archive ||
    ({
      subjectName: candidate.client,
      periodStart: candidate.periodStart,
      periodEnd: candidate.periodEnd,
      statementTotalAmount: candidate.statementTotalAmount,
      statementSalesIds: candidate.statementSalesIds,
    } satisfies Pick<
      PdfArchiveMeta,
      "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
    >);

  const statementSales = resolveStatementSalesForArchive(archiveMeta, options.sales || [], options.clients);
  const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
  const hasVat = clientHasVat(options.clients, candidate.client, subtotal, candidate.statementTotalAmount);
  const statementSalesIds = statementSales.map((row) => row.salesId);
  const paidBySaleId = buildPaidAmountBySaleId(options.paymentVouchers || []);

  if (!statementSales.length) {
    return [createFallbackPaymentVoucher(tx, candidate, hasVat)];
  }

  const splits = allocatePaymentFifoBySaleDate(
    statementSales,
    candidate.paymentAmount,
    hasVat,
    paidBySaleId,
  );
  if (!splits.length) {
    // Statement sales are known but nothing left to allocate (already covered / zero due).
    // Never invent a phantom empty-salesId voucher on retry.
    return [];
  }

  const baseId = Date.now() + Number(String(candidate.pdfArchiveId).replace(/\D/g, "").slice(-6) || 0);
  const memo = `\uD1B5\uC7A5\uC785\uAE08(\uBCF4\uB0B8\uB0B4\uC5ED\uC11C) ${tx.description || tx.counterpartyName || ""}`.trim();

  return splits.map((row, index) => ({
    id: baseId + index,
    salesId: row.salesId,
    date: String(tx.transactionAt || "").slice(0, 10),
    client: candidate.client,
    site: String(row.site || ""),
    workerCount: row.workerCount || 0,
    totalSalesAmount: row.salesAmount || row.statementAmount,
    amount: row.supplyAmount,
    vatType: hasVat ? ("included" as const) : ("excluded" as const),
    supplyAmount: row.supplyAmount,
    vatAmount: row.vatAmount,
    finalAmount: row.finalAmount,
    memo,
    bankTransactionId: tx.id,
    statementPeriodStart: archiveMeta.periodStart,
    statementPeriodEnd: archiveMeta.periodEnd,
    statementSalesIds,
    linkedPdfArchiveId: candidate.pdfArchiveId,
    isPartialPayment: row.isPartialPayment || candidate.paymentStatus === "partial",
  }));
}

/** Build explicit FIFO vouchers and coverage-based payment status together. */
export function buildSentStatementPaymentApplication(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate,
  options: {
    sales?: SaleLikeForStatement[];
    clients?: ClientDepositMatchSource[];
    paymentVouchers?: PaymentVoucherLike[];
    archive?: Pick<
      PdfArchiveMeta,
      "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
    >;
  } = {},
) {
  const archiveMeta =
    options.archive ||
    ({
      subjectName: candidate.client,
      periodStart: candidate.periodStart,
      periodEnd: candidate.periodEnd,
      statementTotalAmount: candidate.statementTotalAmount,
      statementSalesIds: candidate.statementSalesIds,
    } satisfies Pick<
      PdfArchiveMeta,
      "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
    >);
  const statementSales = resolveStatementSalesForArchive(archiveMeta, options.sales || [], options.clients);
  const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
  const hasVat = clientHasVat(options.clients, candidate.client, subtotal, candidate.statementTotalAmount);
  const paidSoFar = resolveStatementPaidAmount(
    candidate.pdfArchiveId,
    options.paymentVouchers || [],
    [],
  );
  const paidBySaleIdBefore = buildPaidAmountBySaleId(options.paymentVouchers || []);
  const vouchers = createPaymentVouchersFromSentStatementMatch(tx, candidate, options);
  const appliedAmount = vouchers.reduce((sum, voucher) => sum + Number(voucher.finalAmount || 0), 0);
  const paymentStatus = resolveArchivePaymentStatusAfterApply(
    candidate.statementTotalAmount,
    paidSoFar,
    appliedAmount,
    {
      statementSales,
      hasVat,
      paidBySaleIdBefore,
      newVouchers: vouchers,
    },
  );
  return { vouchers, paymentStatus, statementSales, hasVat, appliedAmount, paidSoFar };
}

/** @deprecated Returns first voucher only; prefer createPaymentVouchersFromSentStatementMatch. */
export function createPaymentVoucherFromSentStatementMatch(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate,
  options?: Parameters<typeof createPaymentVouchersFromSentStatementMatch>[2],
): BankPaymentVoucherDraft {
  return createPaymentVouchersFromSentStatementMatch(tx, candidate, options)[0];
}

export function getSentStatementPaymentStatusLabel(status?: PdfArchiveMeta["paymentStatus"]) {
  if (status === "confirmed") return "\uC785\uAE08\uD655\uC778";
  if (status === "partial") return "\uBD80\uBD84\uC785\uAE08";
  return "\uC785\uAE08\uB300\uAE30";
}

export function bankTxHasPartialPaymentVoucher(
  tx: Pick<BankTransaction, "id">,
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }> = [],
) {
  return paymentVouchers.some(
    (voucher) => String(voucher.bankTransactionId || "") === tx.id && voucher.isPartialPayment,
  );
}

export type SentStatementAutoLinkDraft = {
  txId: string;
  client: string;
  pdfArchiveId: string;
  paymentStatus: "confirmed" | "partial" | "pending";
  primaryVoucherId: number | string;
  primarySalesId?: number | string;
  vouchers: BankPaymentVoucherDraft[];
};

/** Default score floor for automatic sent-statement deposit linking. Do not lower without evidence. */
export const DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE = 75;
/** Reject auto-link when |transactionDate - statementCreatedAt| exceeds this many days. */
export const DEFAULT_SENT_STATEMENT_MAX_DATE_GAP_DAYS = 45;
/** Require top score to beat the runner-up by at least this many points when both clear the floor. */
export const DEFAULT_SENT_STATEMENT_AMBIGUITY_MIN_SCORE_GAP = 5;
/** Re-evaluate unmatched deposits this many days back on each bank sync (not only newly added rows). */
export const DEFAULT_AUTO_DEPOSIT_RETRY_LOOKBACK_DAYS = 30;

export type SentStatementAutoLinkSkipReason =
  | "alreadyLinked"
  | "cardCompany"
  | "manualOverride"
  | "noCandidate"
  | "belowThreshold"
  | "dateOutOfRange"
  | "ambiguous"
  | "failed";

export type SentStatementAutoLinkDiagnostics = {
  evaluated: number;
  linked: number;
  alreadyLinked: number;
  noCandidate: number;
  belowThreshold: number;
  dateOutOfRange: number;
  ambiguous: number;
  manualOverride: number;
  cardCompany: number;
  failed: number;
};

export type SentStatementAutoLinkEvaluationItem = {
  txId: string;
  client?: string;
  score?: number;
  reason: "linked" | SentStatementAutoLinkSkipReason;
  periodStart?: string;
  periodEnd?: string;
  transactionDate?: string;
  statementCreatedAt?: string;
  dateEligible?: boolean;
  uniqueTopCandidate?: boolean;
};

export function createEmptySentStatementAutoLinkDiagnostics(): SentStatementAutoLinkDiagnostics {
  return {
    evaluated: 0,
    linked: 0,
    alreadyLinked: 0,
    noCandidate: 0,
    belowThreshold: 0,
    dateOutOfRange: 0,
    ambiguous: 0,
    manualOverride: 0,
    cardCompany: 0,
    failed: 0,
  };
}

function bumpDiagnostic(
  diagnostics: SentStatementAutoLinkDiagnostics,
  reason: keyof SentStatementAutoLinkDiagnostics,
) {
  diagnostics[reason] += 1;
}

function ymdKst(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function subtractDaysYmd(ymd: string, days: number) {
  const base = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(base.getTime())) return "";
  base.setDate(base.getDate() - Math.max(0, days));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Recent unmatched deposits eligible for periodic auto-link retry (excludes card / already linked). */
export function selectRecentUnlinkedDepositIds(
  bankTransactions: BankTransaction[],
  options: { lookbackDays?: number; asOfDate?: string | Date } = {},
): string[] {
  const lookbackDays = options.lookbackDays ?? DEFAULT_AUTO_DEPOSIT_RETRY_LOOKBACK_DAYS;
  const asOf = ymdKst(options.asOfDate || new Date());
  const fromDate = subtractDaysYmd(asOf, lookbackDays);
  const ids: string[] = [];

  for (const tx of bankTransactions) {
    if (Number(tx.deposit || 0) <= 0) continue;
    if (tx.linkedPaymentVoucherId || tx.linkedPdfArchiveId) continue;
    if (isCardCompanyDeposit(tx)) continue;
    const txDate = String(tx.transactionAt || "").slice(0, 10);
    if (!txDate || (fromDate && txDate < fromDate) || txDate > asOf) continue;
    ids.push(tx.id);
  }

  return ids;
}

export function isSentStatementCandidateDateEligible(
  tx: Pick<BankTransaction, "transactionAt">,
  candidate: Pick<SentStatementMatchCandidate, "periodStart" | "sentAt">,
  options: { maxDateGapDays?: number } = {},
): { ok: boolean; reason?: "dateOutOfRange" } {
  const maxDateGapDays = options.maxDateGapDays ?? DEFAULT_SENT_STATEMENT_MAX_DATE_GAP_DAYS;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const periodStart = String(candidate.periodStart || "").slice(0, 10);
  const sentAt = String(candidate.sentAt || "").slice(0, 10);

  if (txDate && periodStart && txDate < periodStart) {
    return { ok: false, reason: "dateOutOfRange" };
  }

  if (txDate && sentAt) {
    const gap = Math.abs(daysBetween(sentAt, txDate));
    if (gap > maxDateGapDays) {
      return { ok: false, reason: "dateOutOfRange" };
    }
  }

  return { ok: true };
}

export function resolveUniqueAutoLinkCandidate(
  candidates: SentStatementMatchCandidate[],
  options: {
    minScore?: number;
    ambiguityMinScoreGap?: number;
    tx?: Pick<BankTransaction, "transactionAt">;
    maxDateGapDays?: number;
  } = {},
):
  | { status: "link"; candidate: SentStatementMatchCandidate }
  | { status: SentStatementAutoLinkSkipReason; candidate?: SentStatementMatchCandidate } {
  const minScore = options.minScore ?? DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE;
  const ambiguityMinScoreGap =
    options.ambiguityMinScoreGap ?? DEFAULT_SENT_STATEMENT_AMBIGUITY_MIN_SCORE_GAP;

  if (!candidates.length) return { status: "noCandidate" };

  const dateEligible = candidates.filter((candidate) => {
    if (!options.tx) return true;
    return isSentStatementCandidateDateEligible(options.tx, candidate, {
      maxDateGapDays: options.maxDateGapDays,
    }).ok;
  });

  if (!dateEligible.length) {
    return { status: "dateOutOfRange", candidate: candidates[0] };
  }

  const ranked = [...dateEligible].sort(
    (a, b) =>
      b.score - a.score ||
      String(a.periodStart || "").localeCompare(String(b.periodStart || "")) ||
      b.statementTotalAmount - a.statementTotalAmount,
  );
  const top = ranked[0];
  if (!top || top.score < minScore) {
    return { status: "belowThreshold", candidate: top };
  }

  const contenders = ranked.filter((row) => row.score >= minScore);
  if (contenders.length > 1) {
    const second = contenders[1];
    const gap = top.score - second.score;
    if (gap < ambiguityMinScoreGap) {
      return { status: "ambiguous", candidate: top };
    }
  }

  return { status: "link", candidate: top };
}

/**
 * Evaluate high-confidence sent-statement auto-links with diagnostics.
 * Does not mutate ERP state; callers apply drafts idempotently.
 */
export function evaluateHighConfidenceSentStatementAutoLinks(options: {
  bankTransactions: BankTransaction[];
  archives: PdfArchiveMeta[];
  clients?: ClientDepositMatchSource[];
  sales?: SaleLikeForStatement[];
  paymentVouchers?: PaymentVoucherLike[];
  onlyTransactionIds?: Set<string>;
  minScore?: number;
  maxDateGapDays?: number;
  ambiguityMinScoreGap?: number;
}): {
  drafts: SentStatementAutoLinkDraft[];
  diagnostics: SentStatementAutoLinkDiagnostics;
  items: SentStatementAutoLinkEvaluationItem[];
} {
  const {
    bankTransactions,
    archives,
    clients,
    sales,
    paymentVouchers = [],
    onlyTransactionIds,
    minScore = DEFAULT_SENT_STATEMENT_AUTO_LINK_MIN_SCORE,
    maxDateGapDays = DEFAULT_SENT_STATEMENT_MAX_DATE_GAP_DAYS,
    ambiguityMinScoreGap = DEFAULT_SENT_STATEMENT_AMBIGUITY_MIN_SCORE_GAP,
  } = options;

  const linkedBankIds = new Set(
    paymentVouchers.map((voucher) => String(voucher.bankTransactionId || "")).filter(Boolean),
  );
  const drafts: SentStatementAutoLinkDraft[] = [];
  const items: SentStatementAutoLinkEvaluationItem[] = [];
  const diagnostics = createEmptySentStatementAutoLinkDiagnostics();
  let workingVouchers = [...paymentVouchers];

  const scopedTransactions = onlyTransactionIds
    ? bankTransactions.filter((tx) => onlyTransactionIds.has(tx.id))
    : bankTransactions;

  for (const tx of scopedTransactions) {
    if (Number(tx.deposit || 0) <= 0) continue;

    diagnostics.evaluated += 1;
    const transactionDate = String(tx.transactionAt || "").slice(0, 10);

    if (tx.linkedPaymentVoucherId || tx.linkedPdfArchiveId || linkedBankIds.has(tx.id)) {
      bumpDiagnostic(diagnostics, "alreadyLinked");
      items.push({ txId: tx.id, reason: "alreadyLinked", transactionDate });
      continue;
    }

    if (isCardCompanyDeposit(tx)) {
      bumpDiagnostic(diagnostics, "cardCompany");
      items.push({ txId: tx.id, reason: "cardCompany", transactionDate });
      continue;
    }

    if (hasManualClientClassificationOverride(tx)) {
      bumpDiagnostic(diagnostics, "manualOverride");
      items.push({ txId: tx.id, reason: "manualOverride", transactionDate });
      continue;
    }

    const candidates = buildSentStatementMatchCandidates(tx, archives, {
      linkedPdfArchiveIds: new Set(
        bankTransactions.filter((row) => row.linkedPdfArchiveId).map((row) => String(row.linkedPdfArchiveId)),
      ),
      clients,
      paymentVouchers: workingVouchers,
      bankTransactions,
      minScore: 0,
      limit: 8,
    });

    const decision = resolveUniqueAutoLinkCandidate(candidates, {
      minScore,
      ambiguityMinScoreGap,
      tx,
      maxDateGapDays,
    });

    if (decision.status !== "link") {
      bumpDiagnostic(diagnostics, decision.status);
      items.push({
        txId: tx.id,
        reason: decision.status,
        client: decision.candidate?.client,
        score: decision.candidate?.score,
        periodStart: decision.candidate?.periodStart,
        periodEnd: decision.candidate?.periodEnd,
        transactionDate,
        statementCreatedAt: decision.candidate?.sentAt,
        dateEligible: decision.status !== "dateOutOfRange",
        uniqueTopCandidate: decision.status !== "ambiguous",
      });
      continue;
    }

    const candidate = decision.candidate;
    try {
      const archive = archives.find((row) => row.id === candidate.pdfArchiveId);
      // Idempotency: never create a second voucher set for the same bank tx in one pass.
      if (workingVouchers.some((voucher) => String(voucher.bankTransactionId || "") === tx.id)) {
        bumpDiagnostic(diagnostics, "alreadyLinked");
        items.push({ txId: tx.id, reason: "alreadyLinked", transactionDate });
        continue;
      }

      const application = buildSentStatementPaymentApplication(tx, candidate, {
        sales,
        clients,
        archive,
        paymentVouchers: workingVouchers,
      });
      const vouchers = application.vouchers;
      if (!vouchers.length) {
        bumpDiagnostic(diagnostics, "failed");
        items.push({
          txId: tx.id,
          reason: "failed",
          client: candidate.client,
          score: candidate.score,
          transactionDate,
        });
        continue;
      }

      const paymentStatus = application.paymentStatus;
      const primaryVoucher = vouchers[0];

      drafts.push({
        txId: tx.id,
        client: candidate.client,
        pdfArchiveId: candidate.pdfArchiveId,
        paymentStatus,
        primaryVoucherId: primaryVoucher.id,
        primarySalesId: vouchers.length === 1 ? primaryVoucher.salesId : undefined,
        vouchers,
      });

      workingVouchers = [...workingVouchers, ...vouchers];
      linkedBankIds.add(tx.id);
      bumpDiagnostic(diagnostics, "linked");
      items.push({
        txId: tx.id,
        reason: "linked",
        client: candidate.client,
        score: candidate.score,
        periodStart: candidate.periodStart,
        periodEnd: candidate.periodEnd,
        transactionDate,
        statementCreatedAt: candidate.sentAt,
        dateEligible: true,
        uniqueTopCandidate: true,
      });
    } catch {
      bumpDiagnostic(diagnostics, "failed");
      items.push({
        txId: tx.id,
        reason: "failed",
        client: candidate.client,
        score: candidate.score,
        transactionDate,
      });
    }
  }

  return { drafts, diagnostics, items };
}

/** 보낸내역서 ↔ 통장입금 고신뢰 매칭(기본 score ≥ 75)을 일괄 생성합니다. */
export function buildHighConfidenceSentStatementAutoLinks(options: {
  bankTransactions: BankTransaction[];
  archives: PdfArchiveMeta[];
  clients?: ClientDepositMatchSource[];
  sales?: SaleLikeForStatement[];
  paymentVouchers?: PaymentVoucherLike[];
  onlyTransactionIds?: Set<string>;
  minScore?: number;
  maxDateGapDays?: number;
  ambiguityMinScoreGap?: number;
}): SentStatementAutoLinkDraft[] {
  return evaluateHighConfidenceSentStatementAutoLinks(options).drafts;
}
