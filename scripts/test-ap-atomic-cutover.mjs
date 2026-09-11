/**
 * Atomic AP cutover + opening balance approval gates.
 * Run: node --import tsx scripts/test-ap-atomic-cutover.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-ap-atomic-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.JWT_SECRET = "atomic-cutover-test";

const { initDb, saveErpState, getErpState } = await import("../server/db.mjs");
const {
  previewApAtomicCutover,
  activateApAtomicCutover,
  setEmergencyDisbursementWritePause,
  CONFIRMATION_PHRASE,
  ZERO_START_PHRASE,
} = await import("../server/apAtomicCutover.mjs");
const {
  computeLegacyApDatasetHash,
  countLegacyApRows,
  isDisbursementWriteAllowed,
  isLegacyApWriterFrozen,
} = await import("../server/apLedgerCutover.mjs");
const {
  listNewLedgerPayables,
  createAndPostDisbursement,
  reverseDisbursement,
  getWorkerApBalance,
  listContractorPayablesFromSales,
} = await import("../server/disbursements.mjs");

initDb();
function seed(extra = {}) {
  const state = getErpState();
  saveErpState(
    {
      ...(state.data || {}),
      workers: [
        { id: "w1", name: "WorkerA" },
        { id: "w2", name: "WorkerB" },
      ],
      sales: [
        { id: "s-old", date: "2026-09-01", client: "C", amount: 1, workers: [{ name: "WorkerA", lineSpend: 1_000_000 }] },
        { id: "s-new", date: "2026-09-15", client: "C", amount: 1, workers: [{ name: "WorkerA", lineSpend: 2_000_000 }] },
      ],
      workerMonthlyActualVouchers: [{ id: "m1", entries: [{ amount: 10 }] }],
      workerPayoutVouchers: [{ id: "p1", paidAmount: 10 }],
      disbursements: [],
      disbursementAllocations: [],
      bankSyncMeta: {},
      ...extra,
    },
    state.version,
    "test",
    { allowDisbursementMutation: true, allowWorkerApLegacyMutation: true },
  );
}
seed();

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("PASS:", name);
  } catch (error) {
    failed += 1;
    console.error("FAIL:", name);
    console.error(error);
  }
}

function openingRows(overrides = {}) {
  return [
    {
      workerId: "w1",
      workerNameSnapshot: "WorkerA",
      openingAmount: 5_000_000,
      effectiveDate: "2026-09-10",
      memo: "approved",
      reviewed: true,
      approvedBy: "ceo",
      operationId: "ob-w1",
      ...overrides,
    },
  ];
}

function basePreviewInput(extra = {}) {
  return {
    apLedgerCutoverWorkDate: "2026-09-10",
    openingBalancePolicy: "APPROVED_WORKER_OPENING_BALANCES",
    operationId: "preview-batch",
    approvedBy: "ceo",
    reviewedWorkerIds: ["w1"],
    openingBalances: openingRows(),
    listPayables: () => listContractorPayablesFromSales(getErpState().data.sales || []),
    ...extra,
  };
}

check("preview mutation 0", () => {
  const before = computeLegacyApDatasetHash(getErpState().data);
  const version = getErpState().version;
  const preview = previewApAtomicCutover(basePreviewInput());
  assert.equal(preview.ok, true);
  assert.ok(preview.previewToken);
  assert.equal(preview.mutation, 0);
  assert.equal(getErpState().version, version);
  assert.equal(computeLegacyApDatasetHash(getErpState().data), before);
  assert.equal(countLegacyApRows(getErpState().data).apOpeningBalances, 0);
});

check("ZERO_START without confirmation blocked", () => {
  const preview = previewApAtomicCutover({
    ...basePreviewInput(),
    openingBalancePolicy: "ZERO_START",
    openingBalances: [],
    zeroStartExplicitConfirmation: false,
  });
  assert.equal(preview.ok, false);
  assert.ok(preview.errors.some((e) => e.code === "ZERO_START_CONFIRMATION_REQUIRED"));
});

check("ZERO_START with confirmation preview ok", () => {
  const preview = previewApAtomicCutover({
    apLedgerCutoverWorkDate: "2026-09-10",
    openingBalancePolicy: "ZERO_START",
    openingBalances: [],
    zeroStartExplicitConfirmation: true,
    zeroStartConfirmation: ZERO_START_PHRASE,
    operationId: "z1",
    allWorkersReviewed: true,
    reviewedWorkerIds: ["w1", "w2"],
  });
  assert.equal(preview.ok, true, JSON.stringify(preview.errors));
});

check("duplicate worker blocked", () => {
  const preview = previewApAtomicCutover(
    basePreviewInput({
      openingBalances: [...openingRows(), ...openingRows({ operationId: "ob-dup" })],
    }),
  );
  assert.equal(preview.ok, false);
  assert.ok(preview.errors.some((e) => e.code === "DUPLICATE_WORKER"));
});

check("unknown worker blocked", () => {
  const preview = previewApAtomicCutover(
    basePreviewInput({
      openingBalances: openingRows({ workerId: "missing" }),
      reviewedWorkerIds: ["missing"],
    }),
  );
  assert.equal(preview.ok, false);
  assert.ok(preview.errors.some((e) => e.code === "WORKER_NOT_FOUND"));
});

check("negative opening blocked", () => {
  const preview = previewApAtomicCutover(
    basePreviewInput({ openingBalances: openingRows({ openingAmount: -1 }) }),
  );
  assert.equal(preview.ok, false);
  assert.ok(preview.errors.some((e) => e.code === "OPENING_AMOUNT_NEGATIVE"));
});

check("missing review blocked", () => {
  const preview = previewApAtomicCutover(
    basePreviewInput({
      reviewedWorkerIds: [],
      openingBalances: openingRows({ reviewed: false }),
    }),
  );
  assert.equal(preview.ok, false);
  assert.ok(preview.errors.some((e) => e.code === "REVIEW_REQUIRED"));
});

check("wrong confirmation blocked", () => {
  const preview = previewApAtomicCutover(basePreviewInput());
  assert.throws(
    () =>
      activateApAtomicCutover(
        {
          ...basePreviewInput(),
          operationId: "bad-confirm",
          confirmation: "nope",
          previewToken: preview.previewToken,
          expectedVersion: preview.summary.erpVersion,
        },
        "ceo",
      ),
    (err) => err.code === "CONFIRMATION_REQUIRED",
  );
  assert.equal(countLegacyApRows(getErpState().data).apOpeningBalances, 0);
});

check("expired preview token blocked", () => {
  const preview = previewApAtomicCutover(basePreviewInput());
  // craft expired token by activating with mangled token
  assert.throws(
    () =>
      activateApAtomicCutover(
        {
          ...basePreviewInput(),
          operationId: "expired",
          confirmation: CONFIRMATION_PHRASE,
          previewToken: "not.a.token",
          expectedVersion: preview.summary.erpVersion,
        },
        "ceo",
      ),
    (err) => err.code === "PREVIEW_TOKEN_INVALID",
  );
});

check("version conflict blocked", () => {
  const preview = previewApAtomicCutover(basePreviewInput());
  assert.throws(
    () =>
      activateApAtomicCutover(
        {
          ...basePreviewInput(),
          operationId: "ver-conflict",
          confirmation: CONFIRMATION_PHRASE,
          previewToken: preview.previewToken,
          expectedVersion: preview.summary.erpVersion + 999,
        },
        "ceo",
      ),
    (err) => err.code === "VERSION_CONFLICT",
  );
});

check("forced failure after validation => mutation 0", () => {
  const preview = previewApAtomicCutover(basePreviewInput());
  const hash = computeLegacyApDatasetHash(getErpState().data);
  assert.throws(
    () =>
      activateApAtomicCutover(
        {
          ...basePreviewInput(),
          operationId: "force-fail",
          confirmation: CONFIRMATION_PHRASE,
          previewToken: preview.previewToken,
          expectedVersion: preview.summary.erpVersion,
        },
        "ceo",
        { forceFailBeforeSave: true },
      ),
    (err) => err.code === "FORCED_FAILURE",
  );
  assert.equal(computeLegacyApDatasetHash(getErpState().data), hash);
  assert.equal(countLegacyApRows(getErpState().data).apOpeningBalances, 0);
  assert.equal(Boolean(getErpState().data.bankSyncMeta?.apLedgerActivatedAt), false);
});

check("atomic activate + concurrent second fails", () => {
  seed();
  const preview = previewApAtomicCutover(basePreviewInput());
  const first = activateApAtomicCutover(
    {
      ...basePreviewInput(),
      operationId: "act-1",
      confirmation: CONFIRMATION_PHRASE,
      previewToken: preview.previewToken,
      expectedVersion: preview.summary.erpVersion,
    },
    "ceo",
  );
  assert.equal(first.ok, true);
  assert.equal(first.activation.writeEnabled, true);
  assert.equal(first.activation.legacyWritersFrozen, true);
  assert.equal(countLegacyApRows(getErpState().data).apOpeningBalances, 1);

  const preview2 = previewApAtomicCutover(basePreviewInput({ operationId: "preview-2" }));
  // already activated => preview fails
  assert.equal(preview2.ok, false);

  assert.throws(
    () =>
      activateApAtomicCutover(
        {
          ...basePreviewInput(),
          operationId: "act-2",
          confirmation: CONFIRMATION_PHRASE,
          previewToken: preview.previewToken,
          expectedVersion: first.version,
        },
        "ceo",
      ),
    (err) => err.code === "ALREADY_ACTIVATED" || err.code === "VERSION_CONFLICT" || err.code === "PREVIEW_TOKEN_INVALID" || err.code === "ACTIVATION_VALIDATION_FAILED",
  );
});

check("idempotent replay same operationId", () => {
  seed();
  const preview = previewApAtomicCutover(basePreviewInput());
  const a = activateApAtomicCutover(
    {
      ...basePreviewInput(),
      operationId: "idem-1",
      confirmation: CONFIRMATION_PHRASE,
      previewToken: preview.previewToken,
      expectedVersion: preview.summary.erpVersion,
    },
    "ceo",
  );
  const b = activateApAtomicCutover(
    {
      ...basePreviewInput(),
      operationId: "idem-1",
      confirmation: CONFIRMATION_PHRASE,
      previewToken: preview.previewToken,
      expectedVersion: a.version,
    },
    "ceo",
  );
  assert.equal(b.idempotent, true);
  assert.equal(countLegacyApRows(getErpState().data).apOpeningBalances, 1);
});

check("cutover eligibility + opening FIFO partial + reverse", () => {
  seed();
  const preview = previewApAtomicCutover(basePreviewInput());
  activateApAtomicCutover(
    {
      ...basePreviewInput(),
      operationId: "fifo-1",
      confirmation: CONFIRMATION_PHRASE,
      previewToken: preview.previewToken,
      expectedVersion: preview.summary.erpVersion,
    },
    "ceo",
  );
  const payables = listNewLedgerPayables(getErpState().data);
  assert.equal(payables.some((p) => p.workDate === "2026-09-01"), false);
  assert.equal(payables.some((p) => p.kind === "openingBalance"), true);
  assert.equal(payables.some((p) => p.workDate === "2026-09-15"), true);

  createAndPostDisbursement(
    {
      operationId: "pay-partial",
      workerName: "WorkerA",
      workerId: "w1",
      disbursementDate: "2026-09-11",
      grossAmount: 3_000_000,
      channel: "cash",
      autoAllocate: true,
    },
    "test",
  );
  let bal = getWorkerApBalance("WorkerA", getErpState().data);
  assert.equal(bal.outstanding, 4_000_000);

  createAndPostDisbursement(
    {
      operationId: "pay-rest-advance",
      workerName: "WorkerA",
      workerId: "w1",
      disbursementDate: "2026-09-11",
      grossAmount: 5_000_000,
      channel: "cash",
      autoAllocate: true,
    },
    "test",
  );
  bal = getWorkerApBalance("WorkerA", getErpState().data);
  assert.equal(bal.outstanding, 0);
  assert.ok(bal.unallocatedAdvance >= 1_000_000);

  const last = getErpState().data.disbursements.filter((d) => !d.reversalOfDisbursementId).at(-1);
  reverseDisbursement(last.id, { operationId: "rev-1" }, "test");
  bal = getWorkerApBalance("WorkerA", getErpState().data);
  assert.ok(bal.outstanding > 0 || bal.unallocatedAdvance < 1_000_000);

  assert.equal(isLegacyApWriterFrozen(getErpState().data), true);
  // generic save cannot mutate legacy arrays
  const beforeHash = computeLegacyApDatasetHash(getErpState().data);
  const st = getErpState();
  saveErpState(
    {
      ...st.data,
      workerPayoutVouchers: [...(st.data.workerPayoutVouchers || []), { id: "hack", paidAmount: 99 }],
    },
    st.version,
    "attacker",
  );
  assert.equal(computeLegacyApDatasetHash(getErpState().data), beforeHash);
});

check("emergency pause blocks write without rolling back cutover", () => {
  assert.equal(isDisbursementWriteAllowed(getErpState().data), true);
  setEmergencyDisbursementWritePause(true, "ceo", { memo: "pause" });
  assert.equal(isDisbursementWriteAllowed(getErpState().data), false);
  assert.equal(Boolean(getErpState().data.bankSyncMeta.apLedgerActivatedAt), true);
  assert.equal(countLegacyApRows(getErpState().data).apOpeningBalances, 1);
  setEmergencyDisbursementWritePause(false, "ceo");
  assert.equal(isDisbursementWriteAllowed(getErpState().data), true);
});

check("new legacy writer count simulation 0 after freeze", () => {
  const st = getErpState();
  const before = (st.data.workerMonthlyActualVouchers || []).length;
  saveErpState(
    {
      ...st.data,
      workerMonthlyActualVouchers: [
        ...(st.data.workerMonthlyActualVouchers || []),
        { id: "new-legacy", entries: [{ amount: 1 }] },
      ],
    },
    st.version,
    "attacker2",
  );
  assert.equal((getErpState().data.workerMonthlyActualVouchers || []).length, before);
});

try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
console.log(failed === 0 ? "\nap atomic cutover: ALL PASS" : `\n${failed} failed`);
if (failed) process.exit(1);
