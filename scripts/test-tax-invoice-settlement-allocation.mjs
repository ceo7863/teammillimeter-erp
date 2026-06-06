import assert from "node:assert/strict";
import { buildTaxInvoiceSettlementAllocation, getTaxInvoiceUnsettledAmount } from "../src/utils/taxInvoiceLinkPanel.ts";

const invMay = {
  id: "may",
  issueDate: "2026-05-20",
  client: "??(ALKO)",
  businessNo: "875-44-01275",
  flowType: "sales",
  documentType: "tax",
  supplyAmount: 2150000,
  vatAmount: 215000,
  totalAmount: 2365000,
  status: "issued",
  createdAt: "2026-06-06T00:00:00.000Z",
  createdBy: "test",
};

const invJun = {
  id: "jun",
  issueDate: "2026-06-05",
  client: "??(ALKO)",
  businessNo: "875-44-01275",
  flowType: "sales",
  documentType: "tax",
  supplyAmount: 880000,
  vatAmount: 88000,
  totalAmount: 968000,
  status: "issued",
  createdAt: "2026-06-06T00:00:00.000Z",
  createdBy: "test",
};

const txMay = {
  id: "tx-may",
  transactionAt: "2026-05-20T10:10:37",
  deposit: 2150000,
  withdrawal: 0,
  linkedTaxInvoiceId: "may",
};

const txJun = {
  id: "tx-jun",
  transactionAt: "2026-06-05T07:56:10",
  deposit: 1183000,
  withdrawal: 0,
  linkedTaxInvoiceId: "jun",
};

const invoices = [invMay, invJun];
const transactions = [txMay, txJun];

const allocation = buildTaxInvoiceSettlementAllocation(invoices, transactions);
assert.equal(allocation.get("may")?.unsettledAmount, 0);
assert.equal(allocation.get("jun")?.unsettledAmount, 0);
assert.equal(getTaxInvoiceUnsettledAmount(invMay, transactions, invoices), 0);
assert.equal(getTaxInvoiceUnsettledAmount(invJun, transactions, invoices), 0);

console.log("tax-invoice-settlement-allocation: ok");
