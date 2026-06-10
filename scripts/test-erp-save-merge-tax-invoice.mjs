import { mergeBankTransactionRowForSave } from "../server/erpSaveMerge.mjs";

function assert(condition, message) {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

const prev = {
  id: "tx-1",
  linkedTaxInvoiceIds: ["inv-wrong"],
  linkedTaxInvoiceId: "inv-wrong",
};

const incoming = {
  id: "tx-1",
  linkedTaxInvoiceIds: undefined,
  linkedTaxInvoiceId: undefined,
  taxInvoiceAutoLinkDisabled: true,
};

const merged = mergeBankTransactionRowForSave(prev, incoming);
assert(!merged.linkedTaxInvoiceIds?.length, "manual unlink save should clear invoice ids");
assert(merged.taxInvoiceAutoLinkDisabled === true, "manual unlink save should keep auto-link disabled");

console.log("erp save merge tax invoice tests passed");
