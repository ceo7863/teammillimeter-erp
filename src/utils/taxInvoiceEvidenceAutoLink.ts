import type { BankTransaction } from "./bankTransactions";
import {
  batchAutoLinkTaxInvoiceEvidence,
  type TaxInvoiceMatchContext,
} from "./bankTaxInvoiceLink";
import { appendDepositNameAlias } from "./clientDepositAliases";
import {
  batchAutoLinkSplitTaxInvoiceEvidence,
  learnClientTaxInvoiceSplitPayments,
  type TaxInvoiceSplitClientLike,
} from "./taxInvoiceSplitLink";
import type { TaxInvoice } from "./taxInvoices";
import { normalizeBusinessRegistrationNo } from "./bankTaxInvoiceLink";

export type TaxInvoiceLearnClientLike = TaxInvoiceSplitClientLike & {
  taxInvoiceExactPayments?: boolean;
};

function normalizePartyKey(value: string) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/(\u3231|\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\(\uC720\)|\uC720\uD55C|\uC720\uD55C\uD68C\uC0AC|co\.?ltd|corp|inc)/gi, "")
    .replace(/[\uFF08\uFF09()]/g, "")
    .toLowerCase();
}

function resolveInvoiceClient(client: TaxInvoiceLearnClientLike, invoice: TaxInvoice) {
  const invBiz = normalizeBusinessRegistrationNo(invoice.businessNo);
  const invName = normalizePartyKey(invoice.client);
  const clientBiz = normalizeBusinessRegistrationNo(client.businessNo);
  const clientName = normalizePartyKey(client.name);
  const bizMatch = Boolean(invBiz && clientBiz && invBiz === clientBiz);
  const nameMatch = Boolean(
    invName && clientName && (invName.includes(clientName) || clientName.includes(invName)),
  );
  return bizMatch || nameMatch;
}

function collectTxDepositAliasCandidates(tx: BankTransaction) {
  return [tx.counterpartyName, tx.description, tx.memo]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export function learnClientTaxInvoiceExactPayments(
  clients: TaxInvoiceLearnClientLike[],
  invoice: TaxInvoice,
  tx: BankTransaction,
): TaxInvoiceLearnClientLike[] {
  let changed = false;
  const aliasCandidates = collectTxDepositAliasCandidates(tx);

  const next = clients.map((client) => {
    if (!resolveInvoiceClient(client, invoice)) return client;

    let updated: TaxInvoiceLearnClientLike = client;
    if (!client.taxInvoiceExactPayments) {
      updated = { ...updated, taxInvoiceExactPayments: true };
      changed = true;
    }

    let aliases = String(updated.depositNameAliases || "");
    for (const alias of aliasCandidates) {
      const merged = appendDepositNameAlias(aliases, alias);
      if (merged !== aliases) {
        aliases = merged;
        updated = { ...updated, depositNameAliases: merged };
        changed = true;
      }
    }

    return updated;
  });

  return changed ? next : clients;
}

function learnClientsFromNewExactLinks(
  clients: TaxInvoiceLearnClientLike[],
  before: BankTransaction[],
  after: BankTransaction[],
  invoices: TaxInvoice[],
) {
  let next = clients;
  for (const afterTx of after) {
    if (!afterTx.linkedTaxInvoiceId) continue;
    const beforeTx = before.find((row) => row.id === afterTx.id);
    if (beforeTx?.linkedTaxInvoiceId) continue;
    const invoice = invoices.find((row) => row.id === afterTx.linkedTaxInvoiceId);
    if (!invoice) continue;
    next = learnClientTaxInvoiceExactPayments(next, invoice, afterTx);
    next = learnClientTaxInvoiceSplitPayments(next, invoice);
  }
  return next;
}

export function buildTaxInvoiceEvidenceAutoLinkKey(
  transactions: BankTransaction[],
  invoices: TaxInvoice[],
) {
  const unlinked = transactions
    .filter((row) => !row.linkedTaxInvoiceId && !row.taxInvoiceAutoLinkDisabled)
    .map((row) => row.id)
    .sort()
    .join(",");
  const issued = invoices
    .filter((row) => row.status === "issued")
    .map((row) => `${row.id}:${row.totalAmount}`)
    .sort()
    .join(",");
  return `${unlinked}|${issued}`;
}

export function runTaxInvoiceEvidenceAutoLink(input: {
  bankTransactions: BankTransaction[];
  taxInvoices: TaxInvoice[];
  clients: TaxInvoiceLearnClientLike[];
  workers?: TaxInvoiceMatchContext["workers"];
}) {
  const context: TaxInvoiceMatchContext = {
    clients: input.clients,
    workers: input.workers,
  };

  const exact = batchAutoLinkTaxInvoiceEvidence(input.bankTransactions, input.taxInvoices, {
    context,
  });

  let clients = learnClientsFromNewExactLinks(
    input.clients,
    input.bankTransactions,
    exact.transactions,
    input.taxInvoices,
  );

  const split = batchAutoLinkSplitTaxInvoiceEvidence(
    exact.transactions,
    input.taxInvoices,
    context,
    clients,
  );

  return {
    transactions: split.transactions,
    clients: split.clients,
    exactLinkedCount: exact.linkedCount,
    splitLinkedCount: split.linkedCount,
    linkedCount: exact.linkedCount + split.linkedCount,
    clientsChanged: split.clients !== input.clients || clients !== input.clients,
  };
}
