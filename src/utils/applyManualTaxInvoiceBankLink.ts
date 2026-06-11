import type { BankTransaction } from "./bankTransactions";
import {
  addBankTxTaxInvoiceLink,
  clearBankTxTaxInvoiceLinks,
  getBankTxLinkedTaxInvoiceIds,
  removeBankTxTaxInvoiceLink,
  type TaxInvoiceMatchContext,
} from "./bankTaxInvoiceLink";
import { learnClientTaxInvoiceExactPayments } from "./taxInvoiceEvidenceAutoLink";
import { invalidateTaxInvoiceLinkPanelCaches } from "./taxInvoiceLinkPanel";
import {
  batchAutoLinkSplitTaxInvoiceEvidence,
  learnClientTaxInvoiceSplitPayments,
  shouldLearnTaxInvoiceSplitPayment,
  type TaxInvoiceSplitClientLike,
} from "./taxInvoiceSplitLink";
import type { TaxInvoice } from "./taxInvoices";

export type ApplyManualTaxInvoiceBankLinkInput = {
  bankTransactions: BankTransaction[];
  taxInvoices: TaxInvoice[];
  clients: TaxInvoiceSplitClientLike[];
  tx: BankTransaction;
  invoice?: TaxInvoice;
  invoiceId?: string;
  mode: "add" | "remove" | "clear";
  matchContext?: TaxInvoiceMatchContext;
};

export function applyManualTaxInvoiceBankLink(input: ApplyManualTaxInvoiceBankLinkInput) {
  const {
    bankTransactions,
    taxInvoices,
    clients,
    tx,
    invoice: invoiceOverride,
    invoiceId,
    mode,
    matchContext = {},
  } = input;
  const invoice =
    invoiceOverride || (invoiceId ? taxInvoices.find((row) => row.id === invoiceId) : undefined);
  const liveTx = bankTransactions.find((row) => row.id === tx.id) ?? tx;
  let nextRow: BankTransaction;

  if (mode === "clear" || !invoiceId) {
    nextRow = clearBankTxTaxInvoiceLinks(liveTx, { manual: true, taxInvoices, clients });
  } else if (mode === "remove") {
    const removedInvoice = invoiceId ? taxInvoices.find((row) => row.id === invoiceId) : undefined;
    nextRow = removeBankTxTaxInvoiceLink(liveTx, invoiceId, {
      manual: true,
      taxInvoices,
      removedInvoice,
      clients,
    });
  } else if (invoice) {
    nextRow = addBankTxTaxInvoiceLink(liveTx, invoice, { manual: true, clients });
  } else {
    return null;
  }

  let nextTransactions = bankTransactions.map((row) => (row.id === tx.id ? nextRow : row));
  let nextClients = clients;

  if (invoice) {
    nextClients = learnClientTaxInvoiceExactPayments(nextClients, invoice, nextRow);
    if (shouldLearnTaxInvoiceSplitPayment(liveTx, invoice, bankTransactions)) {
      nextClients = learnClientTaxInvoiceSplitPayments(nextClients, invoice);
    }
  }

  const invoicesForSplit =
    invoice && !taxInvoices.some((row) => row.id === invoice.id)
      ? [invoice, ...taxInvoices]
      : taxInvoices;

  if (mode !== "remove" && mode !== "clear" && invoice) {
    const splitResult = batchAutoLinkSplitTaxInvoiceEvidence(
      nextTransactions,
      invoicesForSplit,
      matchContext,
      nextClients,
    );
    if (splitResult.linkedCount > 0) {
      nextTransactions = splitResult.transactions;
      if (splitResult.clients !== nextClients) {
        nextClients = splitResult.clients;
      }
    }
  }

  invalidateTaxInvoiceLinkPanelCaches();
  return { nextRow, nextTransactions, nextClients, invoice };
}

export function unlinkAllBankTransactionsFromInvoice(input: {
  invoiceId: string;
  bankTransactions: BankTransaction[];
  taxInvoices: TaxInvoice[];
  clients: TaxInvoiceSplitClientLike[];
}) {
  const linked = bankTransactions.filter((row) => getBankTxLinkedTaxInvoiceIds(row).includes(input.invoiceId));
  if (!linked.length) {
    return { nextTransactions: input.bankTransactions, nextClients: input.clients };
  }

  let nextTransactions = input.bankTransactions;
  let nextClients = input.clients;
  for (const tx of linked) {
    const result = applyManualTaxInvoiceBankLink({
      bankTransactions: nextTransactions,
      taxInvoices: input.taxInvoices,
      clients: nextClients,
      tx,
      invoiceId: input.invoiceId,
      mode: "remove",
    });
    if (!result) continue;
    nextTransactions = result.nextTransactions;
    nextClients = result.nextClients;
  }
  return { nextTransactions, nextClients };
}
