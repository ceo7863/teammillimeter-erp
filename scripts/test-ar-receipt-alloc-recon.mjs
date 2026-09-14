/**
 * AR receipt allocation / reconciliation gates.
 * Run: node scripts/test-ar-receipt-alloc-recon.mjs
 * (re-executes under tsx for TS read-model imports)
 */
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

if (!process.env.AR_ALLOC_RECON_TSX && !process.execArgv.some((a) => String(a).includes("tsx"))) {
  process.env.AR_ALLOC_RECON_TSX = "1";
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", fileURLToPath(import.meta.url)],
    { stdio: "inherit", env: process.env, cwd: root },
  );
  process.exit(r.status ?? 1);
}

const liveDbPathBefore = process.env.DATABASE_PATH ? String(process.env.DATABASE_PATH) : "";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "erp-ar-alloc-recon-"));
process.env.DATABASE_PATH = path.join(tmp, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmp, "pdf");
process.env.JWT_SECRET = "ar-receipt-alloc-recon-test";

const { initDb, saveErpState, getErpState } = await import("../server/db.mjs");
const { planAllocationsForTarget } = await import("../server/allocationTarget.mjs");
const {
  registerCanonicalReceipt,
  proposeFifoAllocations,
  listReceipts,
} = await import("../server/receipts.mjs");
const { proposeFifoAllocationsScoped } = await import("../server/canonicalCollection.mjs");
const {
  previewArAdjustment,
  createArAdjustment,
  reverseArAdjustment,
  listArAdjustments,
} = await import("../server/arAdjustments.mjs");
const { createDepositorAlias, isGenericBlockedName } = await import("../server/depositorAliases.mjs");
const { reconcileBankDepositCoverage } = await import("../server/bankDepositClassification.mjs");
const { buildReceiptListRows, filterReceiptListRows } = await import("../src/utils/receiptListReadModel.ts");

initDb();

let passed = 0;
let failed = 0;
const results = {};

function check(name, fn) {
  try {
    fn();
    passed += 1;
    results[name] = "PASS";
    console.log("PASS:", name);
  } catch (error) {
    failed += 1;
    results[name] = "FAIL";
    console.error("FAIL:", name);
    console.error(error?.message || error);
  }
}

function fifoArgs() {
  return { proposeFifoAllocations, proposeFifoAllocationsScoped };
}

const client = { id: "c1", name: "테스트업체" };
const clients = [client];
const sales = [
  { id: "s1", date: "2026-08-01", clientId: "c1", client: "테스트업체", amount: 1_000_000 },
  { id: "s2", date: "2026-08-15", clientId: "c1", client: "테스트업체", amount: 2_000_000 },
  { id: "s3", date: "2026-09-01", clientId: "c1", client: "테스트업체", amount: 3_000_000 },
];

check("planAllocationsForTarget UNAPPLIED", () => {
  const plan = planAllocationsForTarget({
    mode: "UNAPPLIED",
    sales,
    client,
    clients,
    grossAmount: 500_000,
    ...fifoArgs(),
  });
  assert.equal(plan.allocations.length, 0);
  assert.equal(plan.unallocatedAmount, 500_000);
  assert.equal(plan.scopeMeta.mode, "UNAPPLIED");
});

check("planAllocationsForTarget STATEMENT scoped", () => {
  const plan = planAllocationsForTarget({
    mode: "STATEMENT",
    sales,
    client,
    clients,
    grossAmount: 1_500_000,
    statementSaleIds: ["s1", "s2"],
    ...fifoArgs(),
  });
  assert.ok(plan.allocations.every((row) => ["s1", "s2"].includes(String(row.saleId))));
  assert.equal(
    plan.allocations.reduce((sum, row) => sum + row.amount, 0) + plan.unallocatedAmount,
    1_500_000,
  );
  assert.equal(plan.scopeMeta.mode, "STATEMENT");
});

check("planAllocationsForTarget PERIOD", () => {
  const plan = planAllocationsForTarget({
    mode: "PERIOD",
    sales,
    client,
    clients,
    grossAmount: 5_000_000,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    ...fifoArgs(),
  });
  assert.ok(plan.allocations.every((row) => ["s1", "s2"].includes(String(row.saleId))));
  assert.ok(!plan.allocations.some((row) => String(row.saleId) === "s3"));
  assert.equal(plan.scopeMeta.mode, "PERIOD");
});

check("planAllocationsForTarget SELECTED_SALES + spill protection", () => {
  const plan = planAllocationsForTarget({
    mode: "SELECTED_SALES",
    sales,
    client,
    clients,
    grossAmount: 500_000,
    saleIds: ["s1"],
    allocations: [
      { saleId: "s1", amount: 400_000 },
      { saleId: "s3", amount: 400_000 },
    ],
    ...fifoArgs(),
  });
  assert.deepEqual(
    plan.allocations.map((row) => row.saleId),
    ["s1"],
  );
  assert.equal(plan.allocations[0].amount, 400_000);
  assert.equal(plan.unallocatedAmount, 100_000);
  assert.ok(!plan.allocations.some((row) => String(row.saleId) === "s3"));
});

check("planAllocationsForTarget GLOBAL_FIFO warns", () => {
  const plan = planAllocationsForTarget({
    mode: "GLOBAL_FIFO",
    sales,
    client,
    clients,
    grossAmount: 500_000,
    ...fifoArgs(),
  });
  assert.equal(plan.scopeMeta.mode, "GLOBAL_FIFO");
  assert.ok(plan.warnings.some((w) => /잘못 충당|오래된/.test(String(w))));
});

check("planAllocationsForTarget OPENING_ADJUSTMENT throws", () => {
  assert.throws(
    () =>
      planAllocationsForTarget({
        mode: "OPENING_ADJUSTMENT",
        sales,
        client,
        clients,
        grossAmount: 100,
        ...fifoArgs(),
      }),
    (err) => err?.code === "OPENING_ADJUSTMENT_FORBIDDEN",
  );
});

function seedBase() {
  const state = getErpState();
  saveErpState(
    {
      ...(state.data || {}),
      clients: [{ id: "c1", name: "테스트업체", isActive: true }],
      sales: [
        { id: "s1", date: "2026-08-01", clientId: "c1", client: "테스트업체", amount: 1_000_000, workers: [] },
        { id: "s2", date: "2026-08-15", clientId: "c1", client: "테스트업체", amount: 2_000_000, workers: [] },
      ],
      receipts: [],
      receiptAllocations: [],
      arAdjustments: [],
      arAdjustmentEvents: [],
      depositorAliases: [],
      bankTransactions: [],
    },
    state.version,
    "test",
    { allowReceiptMutation: true, allowArAdjustmentMutation: true, allowDepositorAliasMutation: true },
  );
}

check("registerCanonicalReceipt company-only / no mode -> UNAPPLIED", () => {
  seedBase();
  const r1 = registerCanonicalReceipt(
    {
      operationId: "rcpt-unapplied-1",
      clientId: "c1",
      receiptDate: "2026-09-10",
      grossAmount: 700_000,
      channel: "cash",
      source: "receivables",
    },
    "test",
  );
  assert.equal(r1.summary.allocatedAmount, 0);
  assert.equal(r1.summary.unallocatedAmount, 700_000);
  assert.equal(r1.scope?.mode, "UNAPPLIED");

  const company = registerCanonicalReceipt(
    {
      operationId: "rcpt-company-1",
      clientId: "c1",
      receiptDate: "2026-09-10",
      grossAmount: 100_000,
      channel: "cash",
      source: "receivables",
      companyOnly: true,
      targetMode: "GLOBAL_FIFO",
    },
    "test",
  );
  assert.equal(company.summary.allocatedAmount, 0);
  assert.equal(company.scope?.mode, "UNAPPLIED");
  assert.equal(company.scope?.companyOnly, true);
});

check("receipt list: receiptDate includes fully allocated cash; saleDate differs", () => {
  const receipts = [
    {
      id: "r-full",
      receiptNo: "RCP-1",
      clientId: "c1",
      clientName: "테스트업체",
      receiptDate: "2026-09-05",
      grossAmount: 1_000_000,
      channel: "cash",
      source: "receivables",
      status: "posted",
      createdAt: "2026-09-05T01:00:00.000Z",
    },
  ];
  const allocations = [
    { id: "a1", receiptId: "r-full", saleId: "s1", amount: 1_000_000, status: "posted" },
  ];
  const salesRows = [{ id: "s1", date: "2026-08-01" }];
  const rows = buildReceiptListRows(receipts, allocations, salesRows, clients);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unallocatedAmount, 0);
  assert.equal(rows[0].allocatedAmount, 1_000_000);

  const byReceipt = filterReceiptListRows(rows, {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    dateBasis: "receiptDate",
  });
  assert.equal(byReceipt.length, 1);

  const bySale = filterReceiptListRows(rows, {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    dateBasis: "saleDate",
  });
  assert.equal(bySale.length, 0, "saleDate basis should exclude Aug sale in Sep filter");

  const bySaleAug = filterReceiptListRows(rows, {
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    dateBasis: "saleDate",
  });
  assert.equal(bySaleAug.length, 1);
});

check("arAdjustments preview mutation 0; create+reverse; cash identity untouched", () => {
  seedBase();
  const before = getErpState();
  const receiptCountBefore = listReceipts(before.data).length;
  const preview = previewArAdjustment({
    clientId: "c1",
    adjustmentType: "CREDIT_AR_ADJUSTMENT",
    targetMode: "BALANCE_ONLY",
    amount: 50_000,
    memo: "preview only",
  });
  assert.equal(preview.preview, true);
  assert.equal(preview.touchesReceipts, false);
  assert.equal(preview.touchesSalesAmounts, false);
  assert.equal(listArAdjustments(getErpState().data).length, 0);
  assert.equal(listReceipts(getErpState().data).length, receiptCountBefore);

  const created = createArAdjustment(
    {
      operationId: "aradj-test-1",
      clientId: "c1",
      clientName: "테스트업체",
      effectiveDate: "2026-09-10",
      adjustmentType: "CREDIT_AR_ADJUSTMENT",
      targetMode: "BALANCE_ONLY",
      amount: 50_000,
      memo: "test credit",
    },
    "test",
  );
  assert.equal(created.ok, true);
  assert.equal(listReceipts(getErpState().data).length, receiptCountBefore);

  const reversed = reverseArAdjustment(
    created.adjustment.id,
    { operationId: "aradj-rev-1", reversalEffectiveDate: "2026-09-11" },
    "test",
  );
  assert.equal(reversed.ok, true);
  assert.equal(listReceipts(getErpState().data).length, receiptCountBefore);
});

check("depositor alias conflict; generic name block; explicit opt-in", () => {
  seedBase();
  const st = getErpState();
  saveErpState(
    {
      ...st.data,
      clients: [
        { id: "c1", name: "테스트업체", isActive: true },
        { id: "c2", name: "다른업체", isActive: true },
      ],
    },
    st.version,
    "test",
    { allowDepositorAliasMutation: true },
  );

  assert.equal(isGenericBlockedName("현금"), true);
  assert.throws(
    () =>
      createDepositorAlias(
        { operationId: "alias-no-optin", clientId: "c1", rawName: "홍길동입금" },
        "test",
      ),
    (err) => err?.code === "ALIAS_OPT_IN_REQUIRED",
  );

  assert.throws(
    () =>
      createDepositorAlias(
        { operationId: "alias-generic", clientId: "c1", rawName: "이체", explicitOptIn: true },
        "test",
      ),
    (err) => err?.code === "GENERIC_DEPOSITOR_NAME",
  );

  createDepositorAlias(
    { operationId: "alias-c1", clientId: "c1", rawName: "홍길동입금", explicitOptIn: true },
    "test",
  );

  assert.throws(
    () =>
      createDepositorAlias(
        { operationId: "alias-c2", clientId: "c2", rawName: "홍길동입금", explicitOptIn: true },
        "test",
      ),
    (err) => err?.code === "CLIENT_ALIAS_CONFLICT",
  );
});

check("bank classification coverage identity countDiff=0 amountDiff=0", () => {
  const txs = [
    { id: "bt1", deposit: 100_000, withdrawal: 0, subject: "A", transactionDate: "2026-09-01" },
    { id: "bt2", deposit: 200_000, withdrawal: 0, subject: "B", transactionDate: "2026-09-02" },
    { id: "bt3", deposit: 0, withdrawal: 50_000, subject: "out", transactionDate: "2026-09-03" },
  ];
  const coverage = reconcileBankDepositCoverage(txs, {
    receipts: [],
    allocations: [],
    unresolvedQueue: [],
    aliases: [],
    clients: [{ id: "c1", name: "테스트업체", isActive: true }],
  });
  assert.equal(coverage.totalCount, 2);
  assert.equal(coverage.countDiff, 0);
  assert.equal(coverage.amountDiff, 0);
  assert.equal(coverage.identityOk, true);
});

check("B&B preview script is read-only; live skipped when DATABASE_PATH unset", () => {
  const src = fs.readFileSync(path.join(root, "scripts", "bnb-august-reallocation-preview.mjs"), "utf8");
  assert.ok(!/saveErpState\s*\(/.test(src), "B&B script must not call saveErpState");
  assert.ok(!/replaceReceiptAllocations\s*\(/.test(src), "B&B script must not reallocate");
  assert.ok(/readOnly:\s*true/.test(src) || /NEVER calls saveErpState/.test(src));
  if (!liveDbPathBefore) {
    results["B&B live preview"] = "SKIP (DATABASE_PATH unset)";
    console.log("SKIP: B&B live preview (DATABASE_PATH unset) - read-only script check only");
    return;
  }
  results["B&B live preview"] = "SKIP (not auto-run against live DB in unit suite)";
  console.log("SKIP: B&B live preview (unit suite does not attach live DB)");
});

check("TAB labels input/history", () => {
  const src = fs.readFileSync(path.join(root, "src", "components", "PaymentReceivablesPage.tsx"), "utf8");
  assert.ok(/key:\s*"input",\s*label:\s*"매출별 입금"/.test(src));
  assert.ok(/key:\s*"history",\s*label:\s*"입금전표"/.test(src));
});

check("API helpers exist in erpApi", () => {
  const src = fs.readFileSync(path.join(root, "src", "utils", "erpApi.ts"), "utf8");
  for (const name of [
    "previewArAdjustmentApi",
    "createArAdjustmentApi",
    "reverseArAdjustmentApi",
    "fetchArAdjustmentsApi",
    "createDepositorAliasApi",
    "disableDepositorAliasApi",
    "fetchDepositorAliasesApi",
    "fetchBankDepositClassificationCoverageApi",
  ]) {
    assert.ok(src.includes(`export async function ${name}`), name);
  }
});

console.log("");
console.log(`Done. passed=${passed} failed=${failed}`);
if (failed) process.exit(1);
