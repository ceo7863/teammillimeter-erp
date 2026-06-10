import type { BankTransaction } from "../src/utils/bankTransactions.ts";
import {
  addBankTxTaxInvoiceLink,
  clearBankTxTaxInvoiceLinks,
  removeBankTxTaxInvoiceLink,
  resolveBankTxClientName,
} from "../src/utils/bankTaxInvoiceLink.ts";
import type { TaxInvoice } from "../src/utils/taxInvoices.ts";

const CLIENT_A = "\uACE0\uC591\uC0BC\uC1A1\uD55C\uAC15\uB4E4";
const CLIENT_B = "\uBAA8\uB450\uC758\uBE14\uB77C\uC778\uB4DC";
const WORKER_SUBJECT = "\uC2E0\uC7AC\uD544";
const COUPANG = "\uCF00\uD553";

function makeTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: "tx-1",
    transactionAt: "2026-05-29T00:00:00.000Z",
    withdrawal: 0,
    deposit: 1100000,
    balanceAfter: 0,
    description: COUPANG,
    counterpartyName: COUPANG,
    accountNumber: "123",
    bankName: "IBK",
    createdAt: "2026-05-29T00:00:00.000Z",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<TaxInvoice> = {}): TaxInvoice {
  return {
    id: "inv-1",
    issueDate: "2026-05-29",
    client: CLIENT_A,
    businessNo: "123-45-67890",
    flowType: "sales",
    documentType: "tax",
    supplyAmount: 1000000,
    vatAmount: 100000,
    totalAmount: 1100000,
    status: "issued",
    createdAt: "2026-05-29T00:00:00.000Z",
    createdBy: "test",
    ...overrides,
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

const invoiceA = makeInvoice({ id: "inv-a", client: CLIENT_A });
const invoiceB = makeInvoice({ id: "inv-b", client: CLIENT_B });
const taxInvoices = [invoiceA, invoiceB];

let tx = makeTx();
tx = addBankTxTaxInvoiceLink(tx, invoiceA);
assert(resolveBankTxClientName(tx) === CLIENT_A, "link should set invoice client");

tx = removeBankTxTaxInvoiceLink(tx, "inv-a", { manual: true, taxInvoices });
assert(!tx.linkedTaxInvoiceIds?.length, "unlink should clear invoice ids");
assert(tx.taxInvoiceAutoLinkDisabled === true, "manual unlink should disable auto-link");
assert(resolveBankTxClientName(tx) === null, "unlink should clear invoice-derived client");

tx = makeTx({ linkedPaymentVoucherId: "pv-1", linkedSubject: WORKER_SUBJECT });
tx = addBankTxTaxInvoiceLink(tx, invoiceB);
assert(resolveBankTxClientName(tx) === WORKER_SUBJECT, "payment voucher subject should be kept on link");

tx = removeBankTxTaxInvoiceLink(tx, "inv-b", { taxInvoices });
assert(resolveBankTxClientName(tx) === WORKER_SUBJECT, "payment voucher subject should survive unlink");

tx = makeTx();
tx = addBankTxTaxInvoiceLink(tx, invoiceA);
tx = addBankTxTaxInvoiceLink(tx, invoiceB);
assert(resolveBankTxClientName(tx) === CLIENT_A, "second link should not overwrite first client");

tx = removeBankTxTaxInvoiceLink(tx, "inv-a", { taxInvoices });
assert(resolveBankTxClientName(tx) === CLIENT_B, "remaining invoice should drive client label");

tx = makeTx();
tx = addBankTxTaxInvoiceLink(tx, invoiceA);
tx = clearBankTxTaxInvoiceLinks(tx, { taxInvoices });
assert(resolveBankTxClientName(tx) === null, "clear should remove invoice-derived client");

let withdrawalTx = makeTx({
  withdrawal: 212510,
  deposit: 0,
  description: COUPANG,
  counterpartyName: COUPANG,
});
withdrawalTx = addBankTxTaxInvoiceLink(withdrawalTx, invoiceA);
assert(resolveBankTxClientName(withdrawalTx) === CLIENT_A, "withdrawal link should set invoice client");
withdrawalTx = removeBankTxTaxInvoiceLink(withdrawalTx, "inv-a", { taxInvoices, removedInvoice: invoiceA });
assert(resolveBankTxClientName(withdrawalTx) === null, "withdrawal unlink should clear invoice client");

console.log("bank tax invoice unlink tests passed");
