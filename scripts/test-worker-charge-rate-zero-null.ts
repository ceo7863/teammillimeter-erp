/**
 * Worker individual billing rate (customChargeCost): 0 is an explicit 0원 rate, null means "use the default".
 * Usage: npx tsx scripts/test-worker-charge-rate-zero-null.ts
 */
import assert from "node:assert/strict";
import {
  buildWorkerChargeCostAuditEntry,
  mergeAuditLogsForSave,
  normalizeWorkerChargeCostInput,
  planWorkerChargeCostUpdate,
  resolveWorkerChargeCostForSave,
} from "../server/workerChargeRate.mjs";
import { mergeWorkersForSave } from "../server/erpSaveMerge.mjs";
import {
  formatWorkerChargeCostState,
  parseWorkerChargeCostDraft,
  readWorkerChargeCost,
  workerChargeCostInputValue,
} from "../src/utils/workerChargeRate.ts";
import {
  applyWorkerCustomChargeCostFromForm,
  mergeIncomingWorkerMasterList,
  mergeWorkerMasterRecord,
  reconcileWorkerListUpdates,
} from "../src/utils/workerPayments.ts";
import { normalizeSalesRecords, resolveWorkerLineChargeAmount } from "../src/utils/saleBilling.ts";
import { buildSaleFormFromScSchedule } from "../src/utils/scScheduleSaleImport.ts";
import { createWorkerLine, enrichWorkerLineOnWorkerSelect } from "../src/utils/saleForm.ts";
import { snapshotWorkerForAudit, WORKER_AUDIT_FIELDS } from "../src/utils/auditLog.ts";

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

const SHIN = { id: 22, name: "신동석", constructionCost: 250000, overtimeCost: 30000, feeRate: 0.1, grade: "C" };
const CLIENT = { name: "테스트거래처", constructionCost: 300000, chargeCost: 300000, overtimeCost: 30000, mealIncluded: "N" };
const MANAGED = { customChargeCostUpdatedAt: "2026-10-01T06:00:00.000Z", customChargeCostUpdatedBy: "admin" };

function serverSave(prev: Record<string, unknown>, incoming: Record<string, unknown>) {
  return mergeWorkersForSave([prev], [incoming])[0] as Record<string, unknown>;
}

// --- input normalization -------------------------------------------------------------------
check("normalize: null/''/undefined → null, 0 → 0, '350,000' → 350000", () => {
  assert.equal(normalizeWorkerChargeCostInput(null), null);
  assert.equal(normalizeWorkerChargeCostInput(undefined), null);
  assert.equal(normalizeWorkerChargeCostInput(""), null);
  assert.equal(normalizeWorkerChargeCostInput("  "), null);
  assert.equal(normalizeWorkerChargeCostInput(0), 0);
  assert.equal(normalizeWorkerChargeCostInput("0"), 0);
  assert.equal(normalizeWorkerChargeCostInput("350,000"), 350000);
});

check("normalize: negative / NaN / Infinity / text rejected", () => {
  assert.throws(() => normalizeWorkerChargeCostInput(-1), (e: { code?: string }) => e.code === "WORKER_RATE_NEGATIVE");
  assert.throws(() => normalizeWorkerChargeCostInput("-5000"), (e: { code?: string }) => e.code === "WORKER_RATE_NEGATIVE");
  assert.throws(() => normalizeWorkerChargeCostInput(Number.NaN), (e: { code?: string }) => e.code === "WORKER_RATE_INVALID");
  assert.throws(() => normalizeWorkerChargeCostInput(Number.POSITIVE_INFINITY), (e: { code?: string }) => e.code === "WORKER_RATE_INVALID");
  assert.throws(() => normalizeWorkerChargeCostInput("abc"), (e: { code?: string }) => e.code === "WORKER_RATE_INVALID");
});

check("client draft parse: '' → null kind, '0' → 0, '350,000원' → 350000, '-1' invalid", () => {
  assert.equal(parseWorkerChargeCostDraft("").kind, "null");
  assert.deepEqual(parseWorkerChargeCostDraft("0"), { kind: "value", value: 0 });
  assert.deepEqual(parseWorkerChargeCostDraft("350,000원"), { kind: "value", value: 350000 });
  assert.equal(parseWorkerChargeCostDraft("-1").kind, "invalid");
  assert.equal(parseWorkerChargeCostDraft("1e9999").kind, "invalid");
});

check("display: null → 기본단가, 0 → 0원 개별단가, 350000 → 350,000원", () => {
  assert.equal(formatWorkerChargeCostState(null), "기본단가");
  assert.equal(formatWorkerChargeCostState(0), "0원 개별단가");
  assert.match(formatWorkerChargeCostState(350000), /350,000/);
  assert.equal(workerChargeCostInputValue(0), "0");
  assert.equal(workerChargeCostInputValue(null), "");
});

// --- server generic merge (property presence, not truthiness) ------------------------------
check("server merge 350000 → 0 persists 0 (was restored to 350000 before)", () => {
  const out = serverSave({ ...SHIN, customChargeCost: 350000 }, { ...SHIN, customChargeCost: 0 });
  assert.equal(out.customChargeCost, 0);
});

check("server merge 350000 → null persists null", () => {
  const out = serverSave({ ...SHIN, customChargeCost: 350000 }, { ...SHIN, customChargeCost: null });
  assert.ok(Object.prototype.hasOwnProperty.call(out, "customChargeCost"));
  assert.equal(out.customChargeCost, null);
});

check("server merge 0 → 350000, 0 → null, null → 0", () => {
  assert.equal(serverSave({ ...SHIN, customChargeCost: 0 }, { ...SHIN, customChargeCost: 350000 }).customChargeCost, 350000);
  assert.equal(serverSave({ ...SHIN, customChargeCost: 0 }, { ...SHIN, customChargeCost: null }).customChargeCost, null);
  assert.equal(serverSave({ ...SHIN, customChargeCost: null }, { ...SHIN, customChargeCost: 0 }).customChargeCost, 0);
});

check("server merge '' → null (never 0, never kept)", () => {
  const out = serverSave({ ...SHIN, customChargeCost: 350000 }, { ...SHIN, customChargeCost: "" });
  assert.equal(out.customChargeCost, null);
});

check("server merge: incoming row without the property keeps stored value (incl. 0)", () => {
  assert.equal(serverSave({ ...SHIN, customChargeCost: 350000 }, { ...SHIN }).customChargeCost, 350000);
  assert.equal(serverSave({ ...SHIN, customChargeCost: 0 }, { ...SHIN }).customChargeCost, 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(serverSave({ ...SHIN }, { ...SHIN }), "customChargeCost"));
});

check("server merge: negative rate rejected", () => {
  assert.throws(() => serverSave({ ...SHIN, customChargeCost: 350000 }, { ...SHIN, customChargeCost: -1000 }));
});

check("server merge: stale tab cannot overwrite endpoint-managed rate", () => {
  const out = serverSave({ ...SHIN, customChargeCost: 0, ...MANAGED }, { ...SHIN, customChargeCost: 350000 });
  assert.equal(out.customChargeCost, 0);
  assert.equal(out.customChargeCostUpdatedAt, MANAGED.customChargeCostUpdatedAt);
  const ignored = resolveWorkerChargeCostForSave({ ...SHIN, customChargeCost: 0, ...MANAGED }, { customChargeCost: 350000 });
  assert.equal(ignored.ignored, true);
});

check("server merge: probation-end transition may still change a managed rate", () => {
  const out = serverSave(
    { ...SHIN, customChargeCost: 0, ...MANAGED },
    { ...SHIN, customChargeCost: 280000, probationAdjustedAt: "2026-10-02" },
  );
  assert.equal(out.customChargeCost, 280000);
});

check("server merge: generic save cannot forge rate stamps", () => {
  const out = serverSave({ ...SHIN, customChargeCost: 350000 }, { ...SHIN, customChargeCost: 0, customChargeCostUpdatedAt: "x" });
  assert.equal(out.customChargeCost, 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(out, "customChargeCostUpdatedAt"));
});

check("server merge: new worker '' → null, 0 → 0", () => {
  const [a] = mergeWorkersForSave([], [{ id: 900, name: "신규A", customChargeCost: "" }]) as Array<Record<string, unknown>>;
  const [b] = mergeWorkersForSave([], [{ id: 901, name: "신규B", customChargeCost: 0 }]) as Array<Record<string, unknown>>;
  assert.equal(a.customChargeCost, null);
  assert.equal(b.customChargeCost, 0);
});

// --- dedicated endpoint planner ------------------------------------------------------------
check("plan: 350000 → 0 stamps updatedAt/By and reports before/after", () => {
  const plan = planWorkerChargeCostUpdate({
    workers: [{ ...SHIN, customChargeCost: 350000 }],
    workerId: 22,
    input: { customChargeCost: 0, expectedCustomChargeCost: 350000 },
    actor: "admin",
    now: "2026-10-01T07:00:00.000Z",
  });
  assert.equal(plan.changed, true);
  assert.equal(plan.before, 350000);
  assert.equal(plan.after, 0);
  assert.equal(plan.worker.customChargeCost, 0);
  assert.equal(plan.worker.customChargeCostUpdatedBy, "admin");
});

check("plan: explicit null clears; unchanged is a no-op", () => {
  const cleared = planWorkerChargeCostUpdate({ workers: [{ ...SHIN, customChargeCost: 0 }], workerId: 22, input: { customChargeCost: null } });
  assert.equal(cleared.after, null);
  assert.equal(cleared.worker.customChargeCost, null);
  const same = planWorkerChargeCostUpdate({ workers: [{ ...SHIN, customChargeCost: 0 }], workerId: 22, input: { customChargeCost: 0 } });
  assert.equal(same.changed, false);
});

check("plan: concurrent edit → 409 WORKER_RATE_CONFLICT with currentValue", () => {
  assert.throws(
    () =>
      planWorkerChargeCostUpdate({
        workers: [{ ...SHIN, customChargeCost: 0 }],
        workerId: 22,
        input: { customChargeCost: 280000, expectedCustomChargeCost: 350000 },
      }),
    (e: { code?: string; status?: number; currentValue?: unknown }) =>
      e.code === "WORKER_RATE_CONFLICT" && e.status === 409 && e.currentValue === 0,
  );
});

check("plan: missing property / negative / unknown worker rejected", () => {
  assert.throws(() => planWorkerChargeCostUpdate({ workers: [SHIN], workerId: 22, input: {} }));
  assert.throws(() => planWorkerChargeCostUpdate({ workers: [SHIN], workerId: 22, input: { customChargeCost: -1 } }));
  assert.throws(
    () => planWorkerChargeCostUpdate({ workers: [SHIN], workerId: 999, input: { customChargeCost: 0 } }),
    (e: { status?: number }) => e.status === 404,
  );
});

check("audit entry records before/after/who/when; null shown as 기본단가", () => {
  const entry = buildWorkerChargeCostAuditEntry({
    worker: SHIN,
    before: 350000,
    after: null,
    user: { name: "관리자", email: "a@example.com" },
    now: "2026-10-01T07:00:00.000Z",
  });
  assert.equal(entry.before, "350,000");
  assert.equal(entry.after, "기본단가");
  assert.equal(entry.userName, "관리자");
  assert.equal(entry.at, "2026-10-01T07:00:00.000Z");
  assert.equal(entry.field, "customChargeCost");
});

check("audit logs merge append-only (older client list cannot drop server entries)", () => {
  const merged = mergeAuditLogsForSave(
    [{ id: 1, at: "2026-10-01T01:00:00Z" }, { id: 2, at: "2026-10-01T02:00:00Z" }],
    [{ id: 1, at: "2026-10-01T01:00:00Z" }, { id: 3, at: "2026-10-01T03:00:00Z" }],
  );
  assert.deepEqual(merged.map((e: { id: number }) => e.id), [3, 2, 1]);
});

// --- client merge ---------------------------------------------------------------------------
check("client refresh: server 0 beats local 350000 (was preferLocal before)", () => {
  const merged = mergeIncomingWorkerMasterList([{ ...SHIN, customChargeCost: 0 }], [{ ...SHIN, customChargeCost: 350000 }]);
  assert.equal(merged[0].customChargeCost, 0);
});

check("client refresh: server without rate clears local 350000", () => {
  const merged = mergeIncomingWorkerMasterList([{ ...SHIN }], [{ ...SHIN, customChargeCost: 350000 }]);
  assert.equal(readWorkerChargeCost(merged[0]), null);
});

check("client local update: missing property keeps value, explicit 0/null applied", () => {
  assert.equal(mergeWorkerMasterRecord({ ...SHIN, customChargeCost: 0 }, { ...SHIN }).customChargeCost, 0);
  assert.equal(mergeWorkerMasterRecord({ ...SHIN, customChargeCost: 350000 }, { ...SHIN, customChargeCost: 0 }).customChargeCost, 0);
  assert.equal(mergeWorkerMasterRecord({ ...SHIN, customChargeCost: 350000 }, { ...SHIN, customChargeCost: null }).customChargeCost, null);
  const reconciled = reconcileWorkerListUpdates([{ ...SHIN, customChargeCost: 0 }], [{ ...SHIN, memo: "x" }]);
  assert.equal(reconciled[0].customChargeCost, 0);
});

check("new-worker form: '' → no rate, '0' → 0", () => {
  assert.ok(!Object.prototype.hasOwnProperty.call(applyWorkerCustomChargeCostFromForm({ name: "A" }, ""), "customChargeCost"));
  assert.equal(applyWorkerCustomChargeCostFromForm({ name: "A" }, "0").customChargeCost, 0);
});

check("audit snapshot: 0 stays 0, null/absent shows 기본단가 (not 0)", () => {
  assert.equal(snapshotWorkerForAudit({ ...SHIN, customChargeCost: 0 }).customChargeCost, 0);
  assert.equal(snapshotWorkerForAudit({ ...SHIN }).customChargeCost, null);
  const field = WORKER_AUDIT_FIELDS.find((f: { key: string }) => f.key === "customChargeCost");
  assert.equal(field?.format?.(null), "기본단가");
});

// --- billing rate resolution ---------------------------------------------------------------
check("line charge: 0 → '0' (no fallback), null → client default, 350000 → '350000'", () => {
  assert.equal(resolveWorkerLineChargeAmount({ customChargeCost: 0 }, CLIENT), "0");
  assert.equal(resolveWorkerLineChargeAmount({ customChargeCost: null }, CLIENT), "300000");
  assert.equal(resolveWorkerLineChargeAmount({}, CLIENT), "300000");
  assert.equal(resolveWorkerLineChargeAmount({ customChargeCost: 350000 }, CLIENT), "350000");
});

check("manual new sale: selecting a 0-rate worker sets chargeAmount 0", () => {
  const workers = [{ ...SHIN, customChargeCost: 0 }];
  const line = enrichWorkerLineOnWorkerSelect(createWorkerLine(0), workers, [CLIENT], CLIENT.name, "신동석");
  assert.equal(String(line.chargeAmount), "0");
});

check("manual new sale: null-rate worker gets client default", () => {
  const workers = [{ ...SHIN, customChargeCost: null }];
  const line = enrichWorkerLineOnWorkerSelect(createWorkerLine(0), workers, [CLIENT], CLIENT.name, "신동석");
  assert.equal(String(line.chargeAmount), "300000");
});

function importSchedule(worker: Record<string, unknown>, endTime = "18:00") {
  return buildSaleFormFromScSchedule(
    {
      id: `sc-${endTime}`,
      workDate: "2026-10-02",
      startTime: "09:00",
      endTime,
      workType: "현장",
      clientName: CLIENT.name,
      participantNames: ["신동석"],
      participants: [{ participantName: "신동석", name: "신동석" }],
    },
    [worker],
    [CLIENT],
    [],
  );
}

check("CalWalk new import: 0-rate worker → chargeAmount 0", () => {
  const form = importSchedule({ ...SHIN, customChargeCost: 0 });
  assert.equal(String(form.workers[0].chargeAmount), "0");
});

check("CalWalk new import: 0-rate worker short shift → chargeAmount 0", () => {
  const form = importSchedule({ ...SHIN, customChargeCost: 0 }, "12:00");
  assert.equal(String(form.workers[0].chargeAmount), "0");
});

check("CalWalk new import: null-rate worker → client default; 350000 → 350000", () => {
  assert.equal(String(importSchedule({ ...SHIN, customChargeCost: null }).workers[0].chargeAmount), "300000");
  assert.equal(String(importSchedule({ ...SHIN, customChargeCost: 350000 }).workers[0].chargeAmount), "350000");
});

// --- existing sales are never recalculated -------------------------------------------------
check("existing sale amounts unchanged when the worker rate changes", () => {
  const sale = {
    id: 4600,
    date: "2026-09-30",
    client: CLIENT.name,
    workers: [{ worker: "신동석", quantity: "1", unitCost: "250000", chargeAmount: "350000", lineBill: "350000" }],
    amount: 350000,
  };
  const before = normalizeSalesRecords([sale], [{ ...SHIN, customChargeCost: 350000 }])[0];
  for (const rate of [0, null, 280000]) {
    const after = normalizeSalesRecords([sale], [{ ...SHIN, customChargeCost: rate }])[0];
    assert.equal(after.amount, before.amount);
    assert.equal(String(after.workers[0].chargeAmount), "350000");
    assert.equal(String(after.workers[0].lineBill), String(before.workers[0].lineBill));
  }
});

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll worker charge rate tests passed");
