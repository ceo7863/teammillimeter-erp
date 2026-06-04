import type { BankTransaction } from "./bankTransactions";
import { isCardCompanyDeposit } from "./bankTransactionFolders";
import type { ClientDepositMatchSource } from "./clientDepositAliases";
import { includesDepositName, resolveBankDepositMatchSubject, resolveDepositSubjectClientMatch } from "./clientDepositAliases";
import type { ReceivableRow } from "./receivables";
import { getUnpaid } from "./receivables";

export type BankDepositMatchCandidate = {
  salesId: number | string;
  client: string;
  site?: string;
  voucherNo?: string;
  saleDate: string;
  unpaid: number;
  salesAmount: number;
  paidAmount: number;
  score: number;
  reasons: string[];
  paymentAmount: number;
  vatType: "included" | "excluded";
  vatAmount: number;
  finalAmount: number;
};

export type BankPaymentVoucherDraft = {
  id: number;
  salesId: number | string;
  date: string;
  client: string;
  site: string;
  workerCount: number;
  totalSalesAmount: number;
  amount: number;
  vatType: "included" | "excluded";
  supplyAmount: number;
  vatAmount: number;
  finalAmount: number;
  memo: string;
  bankTransactionId: string;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  statementSalesIds?: Array<string | number>;
  linkedPdfArchiveId?: string;
  isPartialPayment?: boolean;
};


function clientRecordForName(clients: ClientDepositMatchSource[] | undefined, clientName: string) {
  return clients?.find((client) => String(client.name || "").trim() === String(clientName || "").trim());
}

function resolveClientNameMatch(
  subject: string,
  clientName: string,
  tx: BankTransaction,
  clients?: ClientDepositMatchSource[]
) {
  const clientRecord = clientRecordForName(clients, clientName);
  return resolveDepositSubjectClientMatch(subject, clientName, clientRecord, {
    linkedSubject: tx.linkedSubject,
  });
}

function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate.slice(0, 10)}T12:00:00`).getTime();
  const to = new Date(`${toDate.slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 999;
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function resolvePaymentAmount(deposit: number, unpaid: number) {
  if (unpaid <= 0) return null;

  const withVat = unpaid + Math.round(unpaid * 0.1);
  if (deposit === unpaid) {
    return {
      score: 45,
      reason: "\uBBF8\uC218\uAE08\uACFC \uC815\uD655 \uC77C\uCE58",
      paymentAmount: unpaid,
      vatType: "excluded" as const,
      vatAmount: 0,
      finalAmount: unpaid,
    };
  }
  if (deposit === withVat) {
    return {
      score: 45,
      reason: "\uBD80\uAC00\uC138 \uD3EC\uD568 \uAE08\uC561 \uC77C\uCE58",
      paymentAmount: unpaid,
      vatType: "included" as const,
      vatAmount: withVat - unpaid,
      finalAmount: withVat,
    };
  }
  if (deposit < unpaid && deposit >= unpaid * 0.95) {
    return {
      score: 30,
      reason: "\uBBF8\uC218\uAE08 \uC774\uD558 \uBD80\uBD84 \uC77C\uCE58",
      paymentAmount: deposit,
      vatType: "excluded" as const,
      vatAmount: 0,
      finalAmount: deposit,
    };
  }
  if (deposit > unpaid && deposit <= withVat + Math.max(1000, Math.round(unpaid * 0.02))) {
    const vatAmount = deposit - unpaid;
    return {
      score: 28,
      reason: "\uBD80\uAC00\uC138 \uD3EC\uD568 \uADFC\uC0AC \uAE08\uC561",
      paymentAmount: unpaid,
      vatType: "included" as const,
      vatAmount,
      finalAmount: deposit,
    };
  }
  return null;
}

export function buildBankDepositMatchCandidates(
  tx: BankTransaction,
  receivables: ReceivableRow[],
  options: {
    linkedSalesIds?: Set<string>;
    minScore?: number;
    limit?: number;
    clients?: ClientDepositMatchSource[];
  } = {}
) {
  if (tx.deposit <= 0 || tx.linkedPaymentVoucherId || isCardCompanyDeposit(tx)) return [];

  const deposit = tx.deposit;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const subject = resolveBankDepositMatchSubject(tx);
  const linkedSalesIds = options.linkedSalesIds || new Set<string>();
  const clients = options.clients;
  const minScore = options.minScore ?? 35;
  const limit = options.limit ?? 5;

  const candidates: BankDepositMatchCandidate[] = [];

  for (const row of receivables) {
    const unpaid = getUnpaid(row);
    if (unpaid <= 0) continue;
    if (linkedSalesIds.has(String(row.id))) continue;
    if (txDate && row.date && txDate < row.date) continue;

    const amountMatch = resolvePaymentAmount(deposit, unpaid);
    if (!amountMatch) continue;

    let score = amountMatch.score;
    const reasons = [amountMatch.reason];

    const nameMatch = resolveClientNameMatch(subject, row.client, tx, clients);
    if (!nameMatch.matched) continue;

    score += nameMatch.scoreBonus;
    reasons.push(nameMatch.reason);

    if (row.site && includesDepositName(subject, row.site)) {
      score += 10;
      reasons.push("\uD604\uC7A5\uBA85 \uC77C\uCE68");
    }

    const dayGap = daysBetween(row.date, txDate);
    if (dayGap >= 0 && dayGap <= 30) {
      score += 10;
      reasons.push("\uC785\uAE08 \uC2DC\uAE30 \uC801\uC808");
    } else if (dayGap <= 60) {
      score += 5;
    }

    candidates.push({
      salesId: row.id,
      client: row.client,
      site: row.site,
      voucherNo: row.voucherNo,
      saleDate: row.date,
      unpaid,
      salesAmount: row.salesAmount,
      paidAmount: row.paidAmount,
      score,
      reasons,
      paymentAmount: amountMatch.paymentAmount,
      vatType: amountMatch.vatType,
      vatAmount: amountMatch.vatAmount,
      finalAmount: amountMatch.finalAmount,
    });
  }

  return candidates
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || b.unpaid - a.unpaid)
    .slice(0, limit);
}

export function findBestClientDepositReceivableMatch(
  tx: BankTransaction,
  receivables: ReceivableRow[],
  clientName: string,
  options: {
    linkedSalesIds?: Set<string>;
    clients?: ClientDepositMatchSource[];
    minScore?: number;
  } = {},
): BankDepositMatchCandidate | null {
  const trimmedClient = String(clientName || "").trim();
  if (!trimmedClient || tx.deposit <= 0 || tx.linkedPaymentVoucherId || isCardCompanyDeposit(tx)) {
    return null;
  }

  const clientReceivables = receivables.filter(
    (row) => String(row.client || "").trim() === trimmedClient,
  );
  if (!clientReceivables.length) return null;

  const candidates = buildBankDepositMatchCandidates(tx, clientReceivables, {
    linkedSalesIds: options.linkedSalesIds,
    clients: options.clients,
    minScore: options.minScore ?? 70,
    limit: 1,
  });
  return candidates[0] || null;
}

export function buildAllBankDepositSuggestions(
  transactions: BankTransaction[],
  receivables: ReceivableRow[],
  clients?: ClientDepositMatchSource[]
) {
  const linkedSalesIds = new Set(
    transactions.filter((row) => row.linkedSalesId).map((row) => String(row.linkedSalesId))
  );

  return transactions
    .filter((row) => row.deposit > 0 && !row.linkedPaymentVoucherId)
    .map((tx) => ({
      tx,
      candidates: buildBankDepositMatchCandidates(tx, receivables, { linkedSalesIds, clients }),
    }))
    .filter((row) => row.candidates.length > 0)
    .sort((a, b) => (b.candidates[0]?.score || 0) - (a.candidates[0]?.score || 0));
}

export function createPaymentVoucherFromBankMatch(
  tx: BankTransaction,
  candidate: BankDepositMatchCandidate,
  receivable: ReceivableRow,
  saleLike?: { workers?: unknown[]; worker?: string; amount?: number }
): BankPaymentVoucherDraft {
  const workerCount =
    saleLike?.workers?.length ||
    String(saleLike?.worker || "")
      .split(",")
      .filter(Boolean).length ||
    0;

  return {
    id: Date.now() + Number(String(receivable.id).replace(/\D/g, "").slice(-6) || 0),
    salesId: receivable.id,
    date: String(tx.transactionAt || "").slice(0, 10),
    client: receivable.client,
    site: String(receivable.site || ""),
    workerCount,
    totalSalesAmount: receivable.salesAmount,
    amount: candidate.paymentAmount,
    vatType: candidate.vatType,
    supplyAmount: candidate.paymentAmount,
    vatAmount: candidate.vatAmount,
    finalAmount: candidate.finalAmount,
    memo: `\uD1B5\uC7A5\uC785\uAE08 ${tx.description || tx.counterpartyName || ""}`.trim(),
    bankTransactionId: tx.id,
  };
}

export function isBankTransactionLinked(tx: BankTransaction) {
  return Boolean(tx.linkedPaymentVoucherId || tx.linkedSalesId);
}

export function isBankMatchAutoLinked(tx?: Pick<BankTransaction, "matchAutoLinked"> | null) {
  return tx?.matchAutoLinked === true;
}

export function isBankMatchManualLinked(
  tx?: Pick<BankTransaction, "matchAutoLinked" | "linkedPaymentVoucherId"> | null
) {
  if (!tx?.linkedPaymentVoucherId) return false;
  return !isBankMatchAutoLinked(tx);
}

type PaymentVoucherAutoLinkSource = {
  salesId?: number | string;
  bankTransactionId?: string;
  statementSalesIds?: Array<string | number>;
};

function collectLinkedSaleIdsFromVouchers(
  paymentVouchers: PaymentVoucherAutoLinkSource[],
  bankTxIds: Set<string>,
  _sales: Array<{ id?: string | number; paid?: number }> = [],
) {
  const saleIds = new Set<string>();
  const vouchersByBankTx = new Map<string, PaymentVoucherAutoLinkSource[]>();

  paymentVouchers.forEach((voucher) => {
    const bankId = String(voucher.bankTransactionId || "");
    if (!bankId || !bankTxIds.has(bankId)) return;
    const list = vouchersByBankTx.get(bankId) || [];
    list.push(voucher);
    vouchersByBankTx.set(bankId, list);
  });

  vouchersByBankTx.forEach((vouchers) => {
    const paidSaleIds = new Set(
      vouchers.map((voucher) => String(voucher.salesId || "")).filter(Boolean),
    );
    vouchers.forEach((voucher) => {
      if (voucher.salesId != null && voucher.salesId !== "") {
        saleIds.add(String(voucher.salesId));
      }
      voucher.statementSalesIds?.forEach((id) => {
        if (id == null || id === "") return;
        const key = String(id);
        if (paidSaleIds.has(key)) saleIds.add(key);
      });
    });
  });

  return saleIds;
}

export function buildAutoLinkedSaleIdSet(
  paymentVouchers: PaymentVoucherAutoLinkSource[] = [],
  bankTransactions: Array<Pick<BankTransaction, "id" | "matchAutoLinked" | "linkedPaymentVoucherId">> = [],
  sales: Array<{ id?: string | number; paid?: number }> = [],
) {
  const autoTxIds = new Set(
    bankTransactions.filter((tx) => isBankMatchAutoLinked(tx)).map((tx) => String(tx.id))
  );
  return collectLinkedSaleIdsFromVouchers(paymentVouchers, autoTxIds, sales);
}

export function buildManualLinkedSaleIdSet(
  paymentVouchers: PaymentVoucherAutoLinkSource[] = [],
  bankTransactions: Array<Pick<BankTransaction, "id" | "matchAutoLinked" | "linkedPaymentVoucherId">> = [],
  sales: Array<{ id?: string | number; paid?: number }> = [],
) {
  const manualTxIds = new Set(
    bankTransactions.filter((tx) => isBankMatchManualLinked(tx)).map((tx) => String(tx.id))
  );
  return collectLinkedSaleIdsFromVouchers(paymentVouchers, manualTxIds, sales);
}

export function isSaleAutoLinkedPaid(
  saleId: number | string | undefined | null,
  autoLinkedSaleIds: Set<string>
) {
  if (saleId == null || saleId === "") return false;
  return autoLinkedSaleIds.has(String(saleId));
}

export function isSaleManualLinkedPaid(
  saleId: number | string | undefined | null,
  manualLinkedSaleIds: Set<string>
) {
  if (saleId == null || saleId === "") return false;
  return manualLinkedSaleIds.has(String(saleId));
}

export function getBankMatchStatusLabel(tx: BankTransaction) {
  if (tx.linkedPaymentVoucherId && tx.linkedPdfArchiveId) return "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC785\uAE08\uD655\uC778";
  if (tx.linkedPaymentVoucherId) return "\uC785\uAE08 \uC5F0\uACB0\uC644\uB8CC";
  if (tx.deposit > 0) return "\uBBF8\uC5F0\uACB0";
  return "-";
}
