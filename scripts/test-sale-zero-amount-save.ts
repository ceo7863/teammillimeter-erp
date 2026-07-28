/**
 * Zero-amount sales voucher save regressions.
 * Usage: npx tsx scripts/test-sale-zero-amount-save.ts
 */
import assert from "node:assert/strict";
import { snapshotSaleForAudit } from "../src/utils/auditLog.ts";
import {
  buildSaleFromForm,
  createWorkerLine,
  isSaleAmountSaveable,
  validateSaleFormMasterRefs,
  type SaleFormData,
} from "../src/utils/saleForm.ts";

let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

function baseForm(overrides: Partial<SaleFormData> = {}): SaleFormData {
  return {
    date: "2026-07-28",
    client: "Zero Client",
    site: "Zero Site",
    paid: "0",
    memo: "",
    officeMemo: "",
    workers: [
      {
        ...createWorkerLine(0),
        worker: "Zero Worker",
        quantity: "1",
        unitCost: "0",
        chargeAmount: "0",
      },
    ],
    ...overrides,
  };
}

const activeWorkers = [{ name: "Zero Worker", constructionCost: 0, isActive: true }];
const activeClients = [{ name: "Zero Client", constructionCost: 0, isActive: true }];

check("isSaleAmountSaveable: zero / positive / negative / NaN", () => {
  assert.equal(isSaleAmountSaveable(0), true);
  assert.equal(isSaleAmountSaveable("0"), true);
  assert.equal(isSaleAmountSaveable(1), true);
  assert.equal(isSaleAmountSaveable(150000), true);
  assert.equal(isSaleAmountSaveable(-1), false);
  assert.equal(isSaleAmountSaveable("-10"), false);
  assert.equal(isSaleAmountSaveable(Number.NaN), false);
  assert.equal(isSaleAmountSaveable(undefined), false);
  assert.equal(isSaleAmountSaveable(null), false);
  assert.equal(isSaleAmountSaveable("abc"), false);
});

check("zero create: buildSaleFromForm yields amount 0 and is saveable", () => {
  const payload = buildSaleFromForm(baseForm(), { name: "Tester", email: "t@example.com" }, activeWorkers, activeClients);
  assert.equal(payload.amount, 0);
  assert.equal(payload.paid, 0);
  assert.equal(isSaleAmountSaveable(payload.amount), true);
  assert.equal(String(payload.client).trim().length > 0, true);
  assert.equal(String(payload.site).trim().length > 0, true);
});

check("zero edit: existing voucher rebuilt at 0 remains saveable", () => {
  const existing = {
    id: "sale-zero-1",
    date: "2026-07-01",
    client: "Zero Client",
    site: "Zero Site",
    amount: 0,
    paid: 0,
    basePaid: 0,
    workers: [{ worker: "Zero Worker", quantity: "1", unitCost: "0", chargeAmount: "0" }],
  };
  const form = baseForm({
    workers: [
      {
        ...createWorkerLine(0),
        worker: "Zero Worker",
        quantity: "1",
        unitCost: "0",
        chargeAmount: "0",
        memo: "edited",
      },
    ],
    memo: "zero edit",
  });
  const payload = buildSaleFromForm(form, { name: "Editor" }, activeWorkers, activeClients);
  assert.equal(payload.amount, 0);
  assert.equal(isSaleAmountSaveable(payload.amount), true);
  assert.equal(payload.memo, "zero edit");
  void existing;
});

check("save button gate: client+site+zero amount+worker enables save", () => {
  const payload = buildSaleFromForm(baseForm(), null, activeWorkers, activeClients);
  const canSave = Boolean(
    String(payload.client || "").trim()
      && String(payload.site || "").trim()
      && isSaleAmountSaveable(payload.amount)
      && (payload.workers || []).some((line: { worker?: string }) => String(line.worker || "").trim()),
  );
  assert.equal(canSave, true);
});

check("positive amount still saveable", () => {
  const form = baseForm({
    workers: [
      {
        ...createWorkerLine(0),
        worker: "Zero Worker",
        quantity: "1",
        unitCost: "100000",
        chargeAmount: "100000",
      },
    ],
  });
  const payload = buildSaleFromForm(form, null, [{ name: "Zero Worker", constructionCost: 100000 }], activeClients);
  assert.ok(payload.amount > 0);
  assert.equal(isSaleAmountSaveable(payload.amount), true);
});

check("negative / invalid amounts blocked", () => {
  assert.equal(isSaleAmountSaveable(-1), false);
  assert.equal(isSaleAmountSaveable(Number.POSITIVE_INFINITY), false);
  assert.equal(isSaleAmountSaveable("12abc"), false);
});

check("required fields: missing client / site / active worker blocked", () => {
  const noClient = buildSaleFromForm(baseForm({ client: "" }), null, activeWorkers, activeClients);
  assert.equal(Boolean(noClient.client && noClient.site && isSaleAmountSaveable(noClient.amount)), false);

  const noSite = buildSaleFromForm(baseForm({ site: "" }), null, activeWorkers, activeClients);
  assert.equal(Boolean(noSite.client && noSite.site && isSaleAmountSaveable(noSite.amount)), false);

  const noWorker = validateSaleFormMasterRefs(
    baseForm({ workers: [{ ...createWorkerLine(0), worker: "" }] }),
    activeClients,
    activeWorkers,
  );
  assert.match(noWorker, /활성 시공자/);

  const inactiveWorker = validateSaleFormMasterRefs(baseForm(), activeClients, [
    { name: "Zero Worker", isActive: false },
  ]);
  assert.match(inactiveWorker, /비활성 시공자/);
});

check("audit log snapshot records zero-amount create/update", () => {
  const created = buildSaleFromForm(baseForm(), { name: "Auditor" }, activeWorkers, activeClients);
  const createSnap = snapshotSaleForAudit({ id: "new-1", ...created });
  assert.equal(createSnap.amount, 0);
  assert.equal(createSnap.client, "Zero Client");
  assert.equal(createSnap.site, "Zero Site");

  const before = snapshotSaleForAudit({
    id: "sale-1",
    client: "Zero Client",
    site: "Zero Site",
    amount: 100000,
    basePaid: 0,
    workers: [],
  });
  const after = snapshotSaleForAudit({
    id: "sale-1",
    ...created,
    amount: 0,
  });
  assert.equal(before.amount, 100000);
  assert.equal(after.amount, 0);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll zero-amount sales voucher tests passed.");
