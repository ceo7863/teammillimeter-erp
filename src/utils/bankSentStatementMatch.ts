import type { BankTransaction } from "./bankTransactions";
import { isCardCompanyDeposit } from "./bankTransactionFolders";
import type { ClientDepositMatchSource } from "./clientDepositAliases";
import { includesDepositName, resolveDepositSubjectClientMatch } from "./clientDepositAliases";
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
  shareLinkUrl?: string;
  statementSalesIds?: Array<string | number>;
};

export type StatementSaleForPayment = {
  salesId: number | string;
  statementAmount: number;
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

function resolveStatementClientMatch(
  subject: string,
  clientName: string,
  tx: BankTransaction,
  clients?: ClientDepositMatchSource[]
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

function resolveStatementPaymentAmount(deposit: number, total: number) {
  if (total <= 0) return null;

  if (deposit === total) {
    return {
      score: 50,
      reason: "\uB0B4\uC5ED\uC11C \uCD1D\uD569\uACC4 \uC815\uD655 \uC77C\uCE58",
      paymentAmount: total,
      paymentStatus: "confirmed" as const,
    };
  }
  if (deposit < total && deposit >= total * 0.95) {
    return {
      score: 36,
      reason: "\uB0B4\uC5ED\uC11C \uAE08\uC561 \uBD80\uBD84 \uC77C\uCE58",
      paymentAmount: deposit,
      paymentStatus: "partial" as const,
    };
  }
  if (deposit > total && deposit <= total + Math.max(1000, Math.round(total * 0.02))) {
    return {
      score: 42,
      reason: "\uB0B4\uC5ED\uC11C \uCD1D\uD569\uACC4 \uADFC\uC0AC \uAE08\uC561",
      paymentAmount: total,
      paymentStatus: "confirmed" as const,
    };
  }
  return null;
}

function clientHasVat(
  clients: ClientDepositMatchSource[] | undefined,
  clientName: string,
  subtotal?: number,
  grandTotal?: number
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
  clients?: ClientDepositMatchSource[]
): StatementSaleForPayment[] {
  const scopedSales = filterSalesByStatementPeriod(
    sales.filter((sale) => saleMatchesStatementClient(sale, archive.subjectName)),
    archive.periodStart,
    archive.periodEnd
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

function amountsMatch(expected: number, actual: number) {
  if (expected <= 0 || actual <= 0) return false;
  return Math.abs(expected - actual) <= Math.max(1000, Math.round(expected * 0.02));
}

/** Archive meta or period/client/amount fallback resolves statement sales rows. */
export function resolveStatementSalesForArchive(
  archive: Pick<
    PdfArchiveMeta,
    "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
  >,
  sales: SaleLikeForStatement[] = [],
  clients?: ClientDepositMatchSource[]
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
    archive.periodEnd
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

function distributeAmountByWeight(
  items: Array<{ key: string; weight: number }>,
  totalAmount: number
): Map<string, number> {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0 || totalAmount <= 0) return new Map();

  const allocations = items.map((item) => {
    const exact = (totalAmount * item.weight) / totalWeight;
    const floor = Math.floor(exact);
    return { key: item.key, floor, fraction: exact - floor };
  });

  let remainder = totalAmount - allocations.reduce((sum, row) => sum + row.floor, 0);
  const sorted = [...allocations].sort((a, b) => b.fraction - a.fraction);
  const result = new Map<string, number>();
  sorted.forEach((row, index) => {
    const extra = index < remainder ? 1 : 0;
    result.set(row.key, row.floor + extra);
  });
  return result;
}

function splitPaymentAcrossStatementSales(
  statementSales: StatementSaleForPayment[],
  paymentAmount: number,
  hasVat: boolean
) {
  const subtotal = statementSales.reduce((sum, row) => sum + row.statementAmount, 0);
  if (subtotal <= 0) return [];

  const finalBySale = distributeAmountByWeight(
    statementSales.map((row) => ({ key: String(row.salesId), weight: row.statementAmount })),
    paymentAmount
  );

  return statementSales.map((row) => {
    const finalAmount = finalBySale.get(String(row.salesId)) || 0;
    const supplyAmount = hasVat ? Math.max(0, Math.round(finalAmount / 1.1)) : finalAmount;
    const vatAmount = Math.max(0, finalAmount - supplyAmount);
    return {
      ...row,
      finalAmount,
      supplyAmount,
      vatAmount,
    };
  }).filter((row) => row.finalAmount > 0);
}

export function listMatchableSentStatements(archives: PdfArchiveMeta[]) {
  return archives.filter(
    (row) =>
      row.sentViaLink &&
      row.category === "statement-client" &&
      row.paymentStatus !== "confirmed" &&
      row.paymentStatus !== "partial" &&
      (row.statementTotalAmount || 0) > 0
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
  } = {}
) {
  if (tx.deposit <= 0 || tx.linkedPaymentVoucherId || tx.linkedPdfArchiveId || isCardCompanyDeposit(tx)) {
    return [];
  }

  const deposit = tx.deposit;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const subject = `${tx.counterpartyName || ""} ${tx.description || ""}`.trim();
  const linkedPdfArchiveIds = options.linkedPdfArchiveIds || new Set<string>();
  const clients = options.clients;
  const minScore = options.minScore ?? 35;
  const limit = options.limit ?? 5;

  const candidates: SentStatementMatchCandidate[] = [];

  for (const archive of listMatchableSentStatements(archives)) {
    if (linkedPdfArchiveIds.has(archive.id)) continue;
    if (archive.linkedBankTransactionId && archive.linkedBankTransactionId !== tx.id) continue;

    const sentDate = String(archive.createdAt || "").slice(0, 10);
    if (txDate && sentDate && txDate < sentDate) continue;

    const amountMatch = resolveStatementPaymentAmount(deposit, archive.statementTotalAmount || 0);
    if (!amountMatch) continue;

    let score = amountMatch.score;
    const reasons = [amountMatch.reason];

    const nameMatch = resolveStatementClientMatch(subject, archive.subjectName, tx, clients);
    if (!nameMatch.matched) continue;

    score += nameMatch.scoreBonus;
    reasons.push(nameMatch.reason);

    const dayGap = daysBetween(sentDate, txDate);
    if (dayGap >= 0 && dayGap <= 30) {
      score += 10;
      reasons.push("\uB9C1\uD06C \uBC1C\uC1A1 \uD6C4 \uC785\uAE08");
    } else if (dayGap <= 60) {
      score += 5;
    }

    candidates.push({
      pdfArchiveId: archive.id,
      client: archive.subjectName,
      statementTotalAmount: archive.statementTotalAmount || 0,
      sentAt: archive.createdAt,
      periodStart: archive.periodStart,
      periodEnd: archive.periodEnd,
      score,
      reasons,
      paymentAmount: amountMatch.paymentAmount,
      paymentStatus: amountMatch.paymentStatus,
      shareLinkUrl: archive.shareLinkUrl,
      statementSalesIds: archive.statementSalesIds,
    });
  }

  return candidates
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || b.statementTotalAmount - a.statementTotalAmount)
    .slice(0, limit);
}

export function buildAllSentStatementDepositSuggestions(
  transactions: BankTransaction[],
  archives: PdfArchiveMeta[],
  clients?: ClientDepositMatchSource[]
) {
  const linkedPdfArchiveIds = new Set(
    transactions.filter((row) => row.linkedPdfArchiveId).map((row) => String(row.linkedPdfArchiveId))
  );

  return transactions
    .filter((row) => row.deposit > 0 && !row.linkedPaymentVoucherId)
    .map((tx) => ({
      tx,
      candidates: buildSentStatementMatchCandidates(tx, archives, { linkedPdfArchiveIds, clients }),
    }))
    .filter((row) => row.candidates.length > 0)
    .sort((a, b) => (b.candidates[0]?.score || 0) - (a.candidates[0]?.score || 0));
}

function createFallbackPaymentVoucher(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate,
  hasVat: boolean
): BankPaymentVoucherDraft {
  const total = candidate.statementTotalAmount;
  const ratio = total > 0 ? candidate.paymentAmount / total : 1;
  const finalAmount = Math.max(1, Math.round(candidate.paymentAmount));
  const supplyAmount = hasVat ? Math.max(1, Math.round(finalAmount / 1.1)) : finalAmount;
  const vatAmount = Math.max(0, finalAmount - supplyAmount);

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
  };
}

export function createPaymentVouchersFromSentStatementMatch(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate,
  options: {
    sales?: SaleLikeForStatement[];
    clients?: ClientDepositMatchSource[];
    archive?: Pick<
      PdfArchiveMeta,
      "subjectName" | "periodStart" | "periodEnd" | "statementTotalAmount" | "statementSalesIds"
    >;
  } = {}
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

  if (!statementSales.length) {
    return [createFallbackPaymentVoucher(tx, candidate, hasVat)];
  }

  const splits = splitPaymentAcrossStatementSales(statementSales, candidate.paymentAmount, hasVat);
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
  }));
}

/** @deprecated Returns first voucher only; prefer createPaymentVouchersFromSentStatementMatch. */
export function createPaymentVoucherFromSentStatementMatch(
  tx: BankTransaction,
  candidate: SentStatementMatchCandidate,
  options?: Parameters<typeof createPaymentVouchersFromSentStatementMatch>[2]
): BankPaymentVoucherDraft {
  return createPaymentVouchersFromSentStatementMatch(tx, candidate, options)[0];
}

export function getSentStatementPaymentStatusLabel(status?: PdfArchiveMeta["paymentStatus"]) {
  if (status === "confirmed") return "\uC785\uAE08\uD655\uC778";
  if (status === "partial") return "\uBD80\uBD84\uC785\uAE08";
  return "\uC785\uAE08\uB300\uAE30";
}
