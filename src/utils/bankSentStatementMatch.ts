import type { BankTransaction } from "./bankTransactions";
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

function resolveStatementPaymentAmount(deposit: number, statementTotal: number, paidSoFar = 0) {
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

export function resolveArchivePaymentStatusAfterApply(
  statementTotal: number,
  paidSoFar: number,
  appliedAmount: number,
): "confirmed" | "partial" {
  const nextPaid = paidSoFar + appliedAmount;
  if (nextPaid >= statementTotal || amountsMatch(nextPaid, statementTotal)) return "confirmed";
  return "partial";
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
    return [createFallbackPaymentVoucher(tx, candidate, hasVat)];
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
