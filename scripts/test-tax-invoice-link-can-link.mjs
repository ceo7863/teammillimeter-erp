import assert from "node:assert/strict";
import { canLinkTaxInvoiceToTransaction } from "../src/utils/taxInvoiceLinkPanel.ts";

const KT_COUNTERPARTY = "(?)???";

const withdrawalTx = {
  id: "tx-kt",
  transactionAt: "2026-06-01T10:00:00",
  withdrawal: 9900,
  deposit: 0,
  counterpartyName: KT_COUNTERPARTY,
  description: KT_COUNTERPARTY,
};

const purchaseInvoice = {
  id: "inv-kt",
  issueDate: "2026-05-31",
  client: "???? ???",
  businessNo: "102-81-00000",
  flowType: "purchase",
  documentType: "tax",
  supplyAmount: 9000,
  vatAmount: 900,
  totalAmount: 9900,
  status: "issued",
  createdAt: "2026-06-01T00:00:00.000Z",
  createdBy: "test",
};

assert.equal(
  canLinkTaxInvoiceToTransaction(withdrawalTx, purchaseInvoice, 9900, { clients: [], workers: [] }),
  true,
  "manual link should allow connect when unsettled > 0 even without party match context",
);

assert.equal(
  canLinkTaxInvoiceToTransaction(withdrawalTx, purchaseInvoice, 0, { clients: [], workers: [] }),
  false,
  "zero unsettled should not be linkable",
);

const salesInvoice = { ...purchaseInvoice, id: "inv-sales", flowType: "sales" };
assert.equal(
  canLinkTaxInvoiceToTransaction(withdrawalTx, salesInvoice, 9900, { clients: [], workers: [] }),
  false,
  "sales invoice should not link to withdrawal",
);

console.log("tax-invoice-link-can-link: ok");
