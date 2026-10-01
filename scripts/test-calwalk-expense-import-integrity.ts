/**
 * CalWalk schedule meal/expense import integrity (identity, 0/null/deleted semantics, provenance, reimport preview).
 * Usage: npx tsx scripts/test-calwalk-expense-import-integrity.ts
 */
import assert from "node:assert/strict";
import {
  buildSaleFormFromScSchedule,
  getWorkerExtrasHistoryReference,
} from "../src/utils/scScheduleSaleImport.ts";
import { extractScParticipantExtras, getScScheduleWorkerDetails, type ScSchedule } from "../src/utils/scSchedules.ts";
import {
  buildCalwalkReimportPreview,
  computeCalwalkSourceHash,
  hasCalwalkProvenance,
} from "../src/utils/calwalkLineProvenance.ts";
import {
  buildSaleFromForm,
  commitWorkerGridInputsFromDom,
  enrichWorkerLineOnWorkerSelect,
  type SaleWorkerLine,
} from "../src/utils/saleForm.ts";
import { normalizeCalwalkParticipant, parseCalwalkMoney } from "../server/scScheduleSync.mjs";
import { resolveScScheduleParticipantDetails } from "../server/workerPhoneMatch.mjs";

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

const WORKERS = [
  { name: "이서준", constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1 },
  { name: "문정학", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 },
  { name: "최성훈", constructionCost: 300000, overtimeCost: 30000, feeRate: 0.1 },
  { name: "김철수", constructionCost: 300000, overtimeCost: 30000, feeRate: 0.1 },
];
const CLIENTS = [
  { name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" },
  { name: "식대포함", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" },
];

function schedule(id: string, participants: Array<Record<string, unknown>>, extra: Partial<ScSchedule> = {}): ScSchedule {
  return {
    id,
    workDate: "2026-07-31",
    startTime: "09:00",
    endTime: "18:00",
    workType: "역삼 현대까르띠에",
    clientName: "인디퍼",
    participantNames: participants.map((row) => String(row.participantName || row.name)),
    participants: participants.map((row) => ({
      participantName: String(row.participantName || row.name),
      name: String(row.name || row.participantName),
      phone: "",
      vehicleNo: "",
      ...row,
    })),
    ...extra,
  } as ScSchedule;
}

function line(form: { workers: SaleWorkerLine[] }, worker: string) {
  const found = form.workers.find((row) => row.worker === worker);
  assert.ok(found, `line for ${worker}`);
  return found;
}

function importAndSave(sc: ScSchedule, clients = CLIENTS) {
  const form = buildSaleFormFromScSchedule(sc, WORKERS, clients, [], null);
  const sale = { id: 9001, scScheduleId: sc.id, ...buildSaleFromForm(form, null, WORKERS, clients) };
  return { form, sale };
}

// Real 2026-07-31 export shape (ids from production read-only probe; no meal/expense fields for anyone).
const JULY31 = schedule(
  "cmrsv7v9l000m04jxeqahkp0f",
  [
    { participantName: "이서준", name: "이서준", workLog: { startTime: "18:02", endTime: "18:02", durationMinutes: null } },
    { participantName: "문정학", name: "문정학", workLog: { startTime: "12:05", endTime: "18:02", durationMinutes: 357 } },
    { participantName: "최성훈", name: "최성훈", workLog: { startTime: "18:02", endTime: "18:02", durationMinutes: null } },
  ],
  { startTime: "", endTime: "", workLog: { startTime: "12:05", endTime: "18:02", durationMinutes: 357 } },
);
// ERP history at the same client: 문정학's only expense line (sale 3902, 2026-07-13) is 24,000.
const JULY31_HISTORY = [
  { client: "인디퍼", workers: [{ worker: "문정학", meal: "", expense: "24000" }] },
  { client: "인디퍼", workers: [{ worker: "이서준", meal: "20000", expense: "" }] },
];

check("7/31 regression: history-average path would produce exactly 24,000 (root cause)", () => {
  assert.equal(getWorkerExtrasHistoryReference(JULY31_HISTORY, "인디퍼", "문정학").expense, 24000);
});

check("7/31 regression: CalWalk expense missing => ERP expense blank for 문정학 (no 24,000)", () => {
  const form = buildSaleFormFromScSchedule(JULY31, WORKERS, CLIENTS, JULY31_HISTORY, null);
  for (const name of ["이서준", "문정학", "최성훈"]) {
    assert.equal(line(form, name).expense, "", `${name} expense`);
    assert.equal(line(form, name).meal, "", `${name} meal`);
  }
  assert.equal(line(form, "문정학").sourceExpense, null);
  assert.equal(line(form, "문정학").sourceScheduleId, "cmrsv7v9l000m04jxeqahkp0f");
});

check("7/31 regression: legacy phantom line (no provenance, 24,000, CalWalk null) => source_unclear warning, not auto-kept as CalWalk", () => {
  const legacySale = {
    id: 4067,
    scScheduleId: JULY31.id,
    workers: [
      { worker: "이서준", meal: "", expense: "" },
      { worker: "문정학", meal: "", expense: "24000" },
      { worker: "최성훈", meal: "", expense: "" },
    ],
  };
  const preview = buildCalwalkReimportPreview(legacySale, JULY31, getScScheduleWorkerDetails(JULY31, WORKERS));
  const row = preview.rows.find((r) => r.worker === "문정학");
  const expense = row?.fields.find((f) => f.field === "expense");
  assert.equal(expense?.status, "source_unclear");
  assert.equal(expense?.source, "UNKNOWN");
  assert.equal(expense?.planned, "24000", "preview never mutates; repair is a separate approved dry-run");
  assert.ok(preview.warningCount >= 1);
});

check("server normalize: explicit 0 kept, null/'' dropped, invalid/negative dropped, positive exact", () => {
  assert.equal(parseCalwalkMoney(0), 0);
  assert.equal(parseCalwalkMoney("0"), 0);
  assert.equal(parseCalwalkMoney(null), null);
  assert.equal(parseCalwalkMoney(""), null);
  assert.equal(parseCalwalkMoney(-5), null);
  assert.equal(parseCalwalkMoney("abc"), null);
  assert.equal(parseCalwalkMoney(24000), 24000);
  const zero = normalizeCalwalkParticipant({ name: "문정학", meal: 0, expense: 0 });
  assert.equal(zero.meal, 0);
  assert.equal(zero.expense, 0);
  const missing = normalizeCalwalkParticipant({ name: "문정학", meal: null, expense: "" });
  assert.equal("meal" in missing, false);
  assert.equal("expense" in missing, false);
  const withId = normalizeCalwalkParticipant({ name: "문정학", memberId: "m-1", expense: 18000, expenses: [{ id: "e2" }, { id: "e1" }] });
  assert.equal(withId.memberId, "m-1");
  assert.deepEqual(withId.expenseItemIds, ["e1", "e2"]);
});

check("server participant rebuild keeps explicit 0 and never borrows by index", () => {
  const rows = resolveScScheduleParticipantDetails(
    [{ name: "문정학", phone: "010-0000-0000" }],
    {
      participantNames: ["문정학", "최성훈"],
      participants: [
        { participantName: "최성훈", name: "최성훈", expense: 0 },
        { participantName: "", name: "", meal: 5000 },
      ],
    },
  );
  assert.equal(rows[0].expense, 0);
  assert.equal(rows[0].phone, "");
  assert.equal(rows[1].phone, "", "blank participant must not inherit index-matched worker phone");
});

check("explicit 0 => '0'; null => ''; '' => ''", () => {
  const sc = schedule("s-zero", [
    { name: "이서준", expense: 0, meal: 0 },
    { name: "문정학", expense: null },
    { name: "최성훈", expense: "" },
  ]);
  const { form } = importAndSave(sc);
  assert.equal(line(form, "이서준").expense, "0");
  assert.equal(line(form, "이서준").meal, "0");
  assert.equal(line(form, "이서준").sourceExpense, 0);
  assert.equal(line(form, "문정학").expense, "");
  assert.equal(line(form, "문정학").sourceExpense, null);
  assert.equal(line(form, "최성훈").expense, "");
});

check("meal and expense are independent (meal never lands in expense)", () => {
  const { form } = importAndSave(schedule("s-meal", [{ name: "문정학", meal: 24000 }]));
  assert.equal(line(form, "문정학").meal, "24000");
  assert.equal(line(form, "문정학").expense, "");
  const { form: f2 } = importAndSave(schedule("s-exp", [{ name: "문정학", expense: 24000 }]));
  assert.equal(line(f2, "문정학").meal, "");
  assert.equal(line(f2, "문정학").expense, "24000");
});

check("alias keys are not double counted; item array only when no aggregate key", () => {
  assert.equal(extractScParticipantExtras({ expense: 12000, expenseAmount: 12000 }).expense, 12000);
  assert.equal(extractScParticipantExtras({ expense: 5000, expenses: [{ category: "PARKING", amount: 5000 }] }).expense, 5000);
  assert.equal(extractScParticipantExtras({ expenses: [{ category: "PARKING", amount: 3000 }, { category: "TOLL", amount: 2000 }] }).expense, 5000);
});

check("same worker, same date, different schedules => each sale uses only its own schedule", () => {
  const a = schedule("s-A", [{ name: "문정학", expense: 24000 }]);
  const b = schedule("s-B", [{ name: "문정학" }], { workType: "다른 현장" });
  assert.equal(line(importAndSave(a).form, "문정학").expense, "24000");
  assert.equal(line(importAndSave(b).form, "문정학").expense, "");
  const saleB = importAndSave(b).sale;
  assert.equal(buildCalwalkReimportPreview(saleB, a, getScScheduleWorkerDetails(a, WORKERS)).applicable, false);
});

check("duplicate participant names => per-row values (never summed) and preview marks ambiguous", () => {
  const sc = schedule("s-dup", [
    { name: "김철수", expense: 10000 },
    { name: "김철수" },
  ]);
  const { form, sale } = importAndSave(sc);
  const lines = form.workers.filter((row) => row.worker === "김철수");
  assert.deepEqual(lines.map((row) => row.expense), ["10000", ""]);
  const preview = buildCalwalkReimportPreview(sale, sc, getScScheduleWorkerDetails(sc, WORKERS));
  assert.equal(preview.rows.filter((row) => row.rowStatus === "ambiguous").length, 2);
  assert.equal(preview.changeCount, 0);
});

check("reimport is idempotent (fresh import vs same source => no changes, no conflicts)", () => {
  const sc = schedule("s-idem", [{ name: "문정학", meal: 12000, expense: 0 }, { name: "최성훈" }]);
  const { sale } = importAndSave(sc);
  const preview = buildCalwalkReimportPreview(sale, sc, getScScheduleWorkerDetails(sc, WORKERS));
  assert.equal(preview.applicable, true);
  assert.equal(preview.changeCount, 0);
  assert.equal(preview.conflictCount, 0);
  assert.equal(preview.warningCount, 0);
});

check("CalWalk deleted expense => removal preview; changed to 0 => update to '0'", () => {
  const before = schedule("s-del", [{ name: "문정학", expense: 20000 }, { name: "최성훈", expense: 15000 }]);
  const { sale } = importAndSave(before);
  const after = schedule("s-del", [{ name: "문정학" }, { name: "최성훈", expense: 0 }]);
  const preview = buildCalwalkReimportPreview(sale, after, getScScheduleWorkerDetails(after, WORKERS));
  const del = preview.rows.find((r) => r.worker === "문정학")!.fields.find((f) => f.field === "expense")!;
  assert.equal(del.status, "remove");
  assert.equal(del.planned, "");
  assert.equal(del.delta, -20000);
  const zero = preview.rows.find((r) => r.worker === "최성훈")!.fields.find((f) => f.field === "expense")!;
  assert.equal(zero.status, "update");
  assert.equal(zero.planned, "0");
});

check("user override is never silently overwritten (conflict, planned keeps ERP value)", () => {
  const sc = schedule("s-ovr", [{ name: "문정학", expense: 20000 }]);
  const { sale } = importAndSave(sc);
  const edited = {
    ...sale,
    workers: sale.workers.map((row) => (row.worker === "문정학" ? { ...row, expense: "25000" } : row)),
  };
  const changed = schedule("s-ovr", [{ name: "문정학", expense: 30000 }]);
  const field = buildCalwalkReimportPreview(edited, changed, getScScheduleWorkerDetails(changed, WORKERS))
    .rows[0].fields.find((f) => f.field === "expense")!;
  assert.equal(field.status, "conflict");
  assert.equal(field.source, "ERP_OVERRIDE");
  assert.equal(field.planned, "25000");
  const removed = schedule("s-ovr", [{ name: "문정학" }]);
  const removedField = buildCalwalkReimportPreview(edited, removed, getScScheduleWorkerDetails(removed, WORKERS))
    .rows[0].fields.find((f) => f.field === "expense")!;
  assert.equal(removedField.status, "conflict");
  assert.equal(removedField.planned, "25000");
});

check("stale source (older than imported) => conflict, no change", () => {
  const sc = schedule("s-stale", [{ name: "문정학", expense: 20000 }], { sourceUpdatedAt: "2026-08-02T00:00:00Z" });
  const { sale } = importAndSave(sc);
  const older = schedule("s-stale", [{ name: "문정학", expense: 5000 }], { sourceUpdatedAt: "2026-08-01T00:00:00Z" });
  const field = buildCalwalkReimportPreview(sale, older, getScScheduleWorkerDetails(older, WORKERS))
    .rows[0].fields.find((f) => f.field === "expense")!;
  assert.equal(field.status, "conflict");
  assert.equal(field.planned, "20000");
});

check("mealIncluded=Y => meal suppressed in import and preview", () => {
  const sc = schedule("s-mi", [{ name: "문정학", meal: 15000, expense: 7000 }], { clientName: "식대포함" });
  const { form, sale } = importAndSave(sc);
  assert.equal(line(form, "문정학").meal, "");
  assert.equal(line(form, "문정학").expense, "7000");
  const preview = buildCalwalkReimportPreview(sale, sc, getScScheduleWorkerDetails(sc, WORKERS), { mealIncluded: true });
  assert.equal(preview.changeCount, 0);
  assert.equal(preview.rows[0].fields[0].status, "suppressed");
});

check("provenance + hash stability (importedAt excluded; amount/0-vs-null/identity change the hash)", () => {
  const sc = schedule("s-hash", [{ name: "문정학", expense: 24000, memberId: "m-9" }], { sourceUpdatedAt: "2026-07-31T09:00:00Z" });
  const l1 = line(buildSaleFormFromScSchedule(sc, WORKERS, CLIENTS, [], null), "문정학");
  const l2 = line(buildSaleFormFromScSchedule(sc, WORKERS, CLIENTS, [], null), "문정학");
  assert.ok(hasCalwalkProvenance(l1));
  assert.equal(l1.sourceType, "CALWALK");
  assert.equal(l1.sourceMemberId, "m-9");
  assert.equal(l1.sourceUpdatedAt, "2026-07-31T09:00:00Z");
  assert.ok(l1.importedAt);
  assert.equal(l1.sourceHash, l2.sourceHash);
  const base = { scheduleId: "s", memberKey: "m", meal: null, expense: 0 };
  assert.notEqual(computeCalwalkSourceHash(base), computeCalwalkSourceHash({ ...base, expense: null }));
  assert.notEqual(computeCalwalkSourceHash(base), computeCalwalkSourceHash({ ...base, expense: 1 }));
  assert.notEqual(computeCalwalkSourceHash(base), computeCalwalkSourceHash({ ...base, scheduleId: "t" }));
  assert.equal(
    computeCalwalkSourceHash({ ...base, expenseItemIds: ["b", "a"] }),
    computeCalwalkSourceHash({ ...base, expenseItemIds: ["a", "b"] }),
  );
});

check("memberId identity wins over name when both sides carry it", () => {
  const sc = schedule("s-mid", [{ name: "문정학", memberId: "m-1", expense: 1000 }]);
  const { sale } = importAndSave(sc);
  const renamed = schedule("s-mid", [{ name: "문정학B", participantName: "문정학B", memberId: "m-1", expense: 1000 }]);
  const preview = buildCalwalkReimportPreview(sale, renamed, getScScheduleWorkerDetails(renamed, WORKERS));
  assert.equal(preview.rows[0].rowStatus, "matched");
  assert.equal(preview.changeCount, 0);
});

check("reselecting a different worker on the line drops CalWalk provenance", () => {
  const { form } = importAndSave(schedule("s-re", [{ name: "문정학", expense: 9000 }]));
  const next = enrichWorkerLineOnWorkerSelect(line(form, "문정학"), WORKERS, CLIENTS, "인디퍼", "최성훈");
  assert.equal(hasCalwalkProvenance(next), false);
  const same = enrichWorkerLineOnWorkerSelect(line(form, "문정학"), WORKERS, CLIENTS, "인디퍼", "문정학");
  assert.equal(hasCalwalkProvenance(same), true);
});

check("save-time DOM read-back is scoped to the editor root (no cross-form row leak)", () => {
  class FakeInput {
    dataset: Record<string, string>;
    value: string;
    constructor(row: number, col: string, value: string) {
      this.dataset = { workerRow: String(row), workerCol: col };
      this.value = value;
    }
  }
  (globalThis as Record<string, unknown>).HTMLInputElement = FakeInput;
  const rootA = { querySelectorAll: () => [new FakeInput(0, "expense", "")] };
  const rows = [{ no: 1, worker: "문정학", quantity: "1", unitCost: "", chargeAmount: "", meal: "", lodging: "", expense: "", overtimeHours: "", overtimeCost: "", memo: "" }];
  const committed = commitWorkerGridInputsFromDom(rows, rootA as unknown as ParentNode);
  assert.equal(committed[0].expense, "");
  const rootB = { querySelectorAll: () => [new FakeInput(0, "expense", "24000")] };
  assert.equal(commitWorkerGridInputsFromDom(rows, rootB as unknown as ParentNode)[0].expense, "24000");
  delete (globalThis as Record<string, unknown>).HTMLInputElement;
});

if (failed) {
  console.error(`test-calwalk-expense-import-integrity: FAIL (${failed})`);
  process.exit(1);
}
console.log("test-calwalk-expense-import-integrity: PASS");
