import type { BankTransaction } from "./bankTransactions";
import { isCardCompanyDeposit } from "./bankTransactionFolders";
import type { ClientDepositMatchSource } from "./clientDepositAliases";
import {
  findClientByDepositSubject,
  includesDepositName,
  resolveBankDepositMatchSubject,
  resolveDepositSubjectClientMatch,
} from "./clientDepositAliases";
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
  const result = resolveDepositSubjectClientMatch(subject, clientName, clientRecord, {
    linkedSubject: tx.linkedSubject,
  });
  if (result.matched) return result;

  const trimmedClientName = String(clientName || "").trim();
  const aliasClient = findClientByDepositSubject(clients || [], subject);
  if (trimmedClientName && aliasClient?.name && String(aliasClient.name).trim() === trimmedClientName) {
    return { matched: true, scoreBonus: 33, reason: "\uC608\uAE08\uC8FC \uBCC4\uCE59 \uC77C\uCE58" };
  }

  const ledgerClient = String(tx.ledgerClientName || "").trim();
  if (trimmedClientName && ledgerClient && ledgerClient === trimmedClientName) {
    return { matched: true, scoreBonus: 28, reason: "\uAC70\uB798\uCC98 \uD544\uB4DC \uC77C\uCE58" };
  }

  return result;
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

export function resolveDepositLinkAllocation(poolAmount: number, unpaid: number) {
  const pool = Math.round(Number(poolAmount) || 0);
  const debt = Math.round(Number(unpaid) || 0);
  if (pool <= 0 || debt <= 0) {
    return {
      paymentAmount: 0,
      vatType: "excluded" as const,
      vatAmount: 0,
      finalAmount: 0,
    };
  }

  const withVat = debt + Math.round(debt * 0.1);

  if (pool >= withVat) {
    return {
      paymentAmount: debt,
      vatType: "included" as const,
      vatAmount: withVat - debt,
      finalAmount: withVat,
    };
  }

  if (pool >= debt) {
    return {
      paymentAmount: debt,
      vatType: "excluded" as const,
      vatAmount: 0,
      finalAmount: debt,
    };
  }

  return {
    paymentAmount: pool,
    vatType: "excluded" as const,
    vatAmount: 0,
    finalAmount: pool,
  };
}

function resolveManualLinkPaymentDraft(deposit: number, unpaid: number) {
  const withVat = unpaid + Math.round(unpaid * 0.1);
  if (deposit === unpaid) {
    return {
      paymentAmount: unpaid,
      vatType: "excluded" as const,
      vatAmount: 0,
      finalAmount: unpaid,
    };
  }
  if (deposit === withVat) {
    return {
      paymentAmount: unpaid,
      vatType: "included" as const,
      vatAmount: withVat - unpaid,
      finalAmount: withVat,
    };
  }
  if (deposit < unpaid) {
    return {
      paymentAmount: deposit,
      vatType: "excluded" as const,
      vatAmount: 0,
      finalAmount: deposit,
    };
  }
  const vatAmount = Math.max(0, deposit - unpaid);
  return {
    paymentAmount: unpaid,
    vatType: (vatAmount > 0 ? "included" : "excluded") as "included" | "excluded",
    vatAmount,
    finalAmount: deposit,
  };
}

function scoreAmountProximity(deposit: number, unpaid: number) {
  const withVat = unpaid + Math.round(unpaid * 0.1);
  const targets = [unpaid, withVat];
  let best = { score: 2, reason: "\uAE08\uC561 \uBD88\uC77C\uCE58" };

  for (const target of targets) {
    const diff = Math.abs(deposit - target);
    if (diff === 0) {
      return { score: 45, reason: "\uBBF8\uC218\uAE08\uACFC \uC815\uD655 \uC77C\uCE58" };
    }
    const tolerance2 = Math.max(1000, Math.round(unpaid * 0.02));
    const tolerance5 = Math.max(5000, Math.round(unpaid * 0.05));
    const tolerance15 = Math.max(50000, Math.round(unpaid * 0.15));
    if (diff <= tolerance2) {
      best = { score: Math.max(best.score, 35), reason: "\uAE08\uC561 \uADFC\uC0AC \uC77C\uCE58" };
    } else if (diff <= tolerance5) {
      best = { score: Math.max(best.score, 22), reason: "\uAE08\uC561 \uC720\uC0AC" };
    } else if (diff <= tolerance15) {
      best = { score: Math.max(best.score, 12), reason: "\uAE08\uC561 \uCC28\uC774 \uC788\uC74C" };
    } else {
      const ratio = diff / Math.max(target, 1);
      if (ratio <= 0.3) {
        best = { score: Math.max(best.score, 8), reason: "\uAE08\uC561 \uCC28\uC774 \uC788\uC74C" };
      }
    }
  }

  return best;
}

/** Manual ERP link modal: client-matched receivables without requiring exact deposit amount. */
export function buildBankDepositManualLinkCandidates(
  tx: BankTransaction,
  receivables: ReceivableRow[],
  options: {
    linkedSalesIds?: Set<string>;
    minScore?: number;
    limit?: number;
    clients?: ClientDepositMatchSource[];
    depositAmount?: number;
  } = {},
) {
  const depositAmount = Math.round(Number(options.depositAmount ?? tx.deposit) || 0);
  if (depositAmount <= 0 || isCardCompanyDeposit(tx)) return [];

  const deposit = depositAmount;
  const txDate = String(tx.transactionAt || "").slice(0, 10);
  const subject = resolveBankDepositMatchSubject(tx);
  const linkedSalesIds = options.linkedSalesIds || new Set<string>();
  const clients = options.clients;
  const minScore = options.minScore ?? 0;
  const limit = options.limit ?? 30;

  const candidates: BankDepositMatchCandidate[] = [];

  for (const row of receivables) {
    const unpaid = getUnpaid(row);
    if (unpaid <= 0) continue;
    if (linkedSalesIds.has(String(row.id))) continue;
    if (txDate && row.date && txDate < row.date) continue;

    const nameMatch = resolveClientNameMatch(subject, row.client, tx, clients);
    if (!nameMatch.matched) continue;

    let score = nameMatch.scoreBonus;
    const reasons = [nameMatch.reason];

    const exactAmountMatch = resolvePaymentAmount(deposit, unpaid);
    if (exactAmountMatch) {
      score += exactAmountMatch.score;
      reasons.push(exactAmountMatch.reason);
    } else {
      const proximity = scoreAmountProximity(deposit, unpaid);
      score += proximity.score;
      reasons.push(proximity.reason);
    }

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

    const paymentDraft = exactAmountMatch
      ? {
          paymentAmount: exactAmountMatch.paymentAmount,
          vatType: exactAmountMatch.vatType,
          vatAmount: exactAmountMatch.vatAmount,
          finalAmount: exactAmountMatch.finalAmount,
        }
      : resolveManualLinkPaymentDraft(deposit, unpaid);

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
      paymentAmount: paymentDraft.paymentAmount,
      vatType: paymentDraft.vatType,
      vatAmount: paymentDraft.vatAmount,
      finalAmount: paymentDraft.finalAmount,
    });
  }

  return candidates
    .filter((row) => row.score >= minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(b.saleDate || "").localeCompare(String(a.saleDate || "")) ||
        b.unpaid - a.unpaid,
    )
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

export type CalendarEntryPaymentState = {
  unpaid: number;
  paid: number;
  hasUnpaid: boolean;
  isPartialPaid: boolean;
};

/** Calendar stripe/badge: honor bank auto/manual links, not only sale.paid fields. */
export function resolveCalendarEntryPaymentState(
  sale: {
    id?: number | string;
    amount?: number;
    salesAmount?: number;
    paid?: number;
    paidAmount?: number;
  },
  options: {
    autoLinkedSaleIds?: Set<string>;
    manualLinkedSaleIds?: Set<string>;
  } = {},
): CalendarEntryPaymentState {
  const unpaid = getUnpaid(sale);
  const amount = Number(sale.amount ?? sale.salesAmount ?? 0) || 0;
  const explicitPaid = Number(sale.paid ?? sale.paidAmount ?? NaN);
  const paid =
    Number.isFinite(explicitPaid) && explicitPaid >= 0 ? explicitPaid : Math.max(0, amount - unpaid);

  const autoLinked = isSaleAutoLinkedPaid(sale.id, options.autoLinkedSaleIds ?? new Set());
  const manualLinked = isSaleManualLinkedPaid(sale.id, options.manualLinkedSaleIds ?? new Set());

  if (autoLinked || manualLinked) {
    if (unpaid > 0 && paid > 0) {
      return { unpaid, paid, hasUnpaid: false, isPartialPaid: true };
    }
    return { unpaid: 0, paid: Math.max(paid, amount), hasUnpaid: false, isPartialPaid: false };
  }

  const hasUnpaid = unpaid > 0 && paid <= 0;
  const isPartialPaid = unpaid > 0 && paid > 0;
  return { unpaid, paid, hasUnpaid, isPartialPaid };
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

type PaymentVoucherBankLinkSource = {
  bankTransactionId?: string | number;
  salesId?: string | number;
  finalAmount?: number;
  amount?: number;
};

export function sumLinkedDepositAmountForBankTx(
  bankTransactionId: string | number,
  paymentVouchers: PaymentVoucherBankLinkSource[],
) {
  const bankId = String(bankTransactionId);
  return paymentVouchers
    .filter((voucher) => String(voucher.bankTransactionId || "") === bankId)
    .reduce((sum, voucher) => sum + Math.round(Number(voucher.finalAmount ?? voucher.amount ?? 0)), 0);
}

export function collectLinkedSalesIdsForBankTx(
  bankTransactionId: string | number,
  paymentVouchers: PaymentVoucherBankLinkSource[],
) {
  const bankId = String(bankTransactionId);
  const ids = new Set<string>();
  for (const voucher of paymentVouchers) {
    if (String(voucher.bankTransactionId || "") !== bankId) continue;
    if (voucher.salesId != null && voucher.salesId !== "") ids.add(String(voucher.salesId));
  }
  return ids;
}

export function resolveBankDepositLinkRemaining(
  tx: Pick<BankTransaction, "id" | "deposit">,
  paymentVouchers: PaymentVoucherBankLinkSource[],
) {
  const total = Math.round(Number(tx.deposit) || 0);
  return Math.max(0, total - sumLinkedDepositAmountForBankTx(tx.id, paymentVouchers));
}
