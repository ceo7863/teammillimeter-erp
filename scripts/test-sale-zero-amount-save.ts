import assert from "node:assert/strict";
import {
  buildSaleFromForm,
  createWorkerLine,
  isSaleAmountSaveable,
  type SaleFormData,
} from "../src/utils/saleForm.ts";

assert.equal(isSaleAmountSaveable(0), true, "numeric zero must be saveable");
assert.equal(isSaleAmountSaveable("0"), true, "input zero must be saveable");
assert.equal(isSaleAmountSaveable(1), true, "positive totals remain saveable");
assert.equal(isSaleAmountSaveable(-1), false, "negative totals must stay blocked");
assert.equal(isSaleAmountSaveable(Number.NaN), false, "NaN must stay blocked");
assert.equal(isSaleAmountSaveable(undefined), false, "missing totals must stay blocked");

const zeroChargeLine = {
  ...createWorkerLine(0),
  worker: "Zero Worker",
  quantity: "1",
  unitCost: "0",
  chargeAmount: "0",
};
const form: SaleFormData = {
  date: "2026-07-28",
  client: "Zero Client",
  site: "Zero Site",
  paid: "0",
  memo: "",
  officeMemo: "",
  workers: [zeroChargeLine],
};
const payload = buildSaleFromForm(
  form,
  { name: "Tester", email: "tester@example.com" },
  [{ name: "Zero Worker", constructionCost: 0 }],
  [{ name: "Zero Client", constructionCost: 0 }],
);

assert.equal(payload.amount, 0, "zero-charge form must build a zero-amount sale");
assert.equal(payload.paid, 0);
assert.equal(isSaleAmountSaveable(payload.amount), true);

console.log("PASS: zero-amount sales vouchers can be created and edited; negative/invalid totals remain blocked.");
