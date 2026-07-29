import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CALWALK_SCHEDULE_IMPORT_LABELS } from "../src/components/CalendarScScheduleImportModal.tsx";
import { buildSaleFormFromScSchedule } from "../src/utils/scScheduleSaleImport.ts";
import {
  canSelectCalwalkImportSchedule,
  createRequestGenerationGuard,
  refreshCalwalkSchedulesForMonth,
} from "../src/utils/scSchedules.ts";
import {
  createSingleFlight,
  persistScScheduleSyncResultWithRetry,
} from "../server/scScheduleSync.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

async function testRefreshOrdersSyncBeforeFetch() {
  const calls: string[] = [];
  const schedules = [
    {
      id: "schedule-1",
      workDate: "2026-07-29",
      participants: [{ name: "worker", meal: 12000, expense: 34000 }],
    },
  ];
  const result = await refreshCalwalkSchedulesForMonth("2026-07", {
    sync: async () => {
      calls.push("sync");
      return { ok: true };
    },
    fetchSchedules: async (monthKey) => {
      calls.push(`fetch:${monthKey}`);
      return schedules as never;
    },
    now: () => new Date("2026-07-29T03:04:05.000Z"),
  });

  assert.deepEqual(calls, ["sync", "fetch:2026-07"]);
  assert.equal(result.schedules[0]?.participants?.[0]?.meal, 12000);
  assert.equal(result.schedules[0]?.participants?.[0]?.expense, 34000);
  assert.equal(result.warning, "");
  assert.equal(result.refreshedAt, "2026-07-29T03:04:05.000Z");
}

async function testRefreshFallsBackToStoredRows() {
  let fetched = false;
  const result = await refreshCalwalkSchedulesForMonth("2026-07", {
    sync: async () => {
      throw new Error("provider unavailable");
    },
    fetchSchedules: async () => {
      fetched = true;
      return [{ id: "stored-1", workDate: "2026-07-29" }] as never;
    },
  });

  assert.equal(fetched, true);
  assert.equal(result.schedules.length, 1);
  assert.match(result.warning, /CalWalk/);
}

function createSyncResult() {
  return {
    source: "calwalk",
    projects: [{ id: "project-1", name: "client one" }],
    schedules: [
      {
        id: "schedule-1",
        scProjectId: "project-1",
        projectName: "client one",
        workDate: "2026-07-29",
        startTime: "09:00",
        endTime: "18:00",
        workType: "confirmed",
        expectedHeadcount: 1,
        participantNames: ["worker one"],
        participantCount: 1,
        participants: [{ name: "worker one", meal: 12000, expense: 34000 }],
      },
    ],
  };
}

function testVersionConflictRetryPreservesConcurrentDomains() {
  let state = {
    version: 10,
    data: {
      clients: [{ id: 1, name: "client one", scProjectIds: ["project-1"] }],
      workers: [{ id: 1, name: "worker one" }],
      scSchedules: [],
      notices: [{ id: "before" }],
      settings: { keep: true },
    },
  };
  let writeCount = 0;
  const persisted = persistScScheduleSyncResultWithRetry({
    result: createSyncResult(),
    runAt: "2026-07-29T03:04:05.000Z",
    start: new Date("2026-06-01T00:00:00.000Z"),
    end: new Date("2026-10-01T00:00:00.000Z"),
    readState: () => state,
    writeState: (nextData, expectedVersion) => {
      writeCount += 1;
      if (writeCount === 1) {
        state = {
          version: 11,
          data: { ...state.data, notices: [{ id: "concurrent" }], unrelated: { value: 7 } },
        };
        throw new Error("VERSION_CONFLICT");
      }
      assert.equal(expectedVersion, 11);
      state = { version: 12, data: nextData };
      return { version: 12 };
    },
  });

  assert.equal(persisted.attemptCount, 2);
  assert.equal(writeCount, 2);
  assert.deepEqual(state.data.notices, [{ id: "concurrent" }]);
  assert.deepEqual(state.data.unrelated, { value: 7 });
  assert.equal(state.data.settings.keep, true);
  assert.equal(state.data.scSchedules[0]?.participants?.[0]?.meal, 12000);
  assert.equal(state.data.scSchedules[0]?.participants?.[0]?.expense, 34000);
}

function testConflictRetryIsBounded() {
  let writeCount = 0;
  assert.throws(
    () =>
      persistScScheduleSyncResultWithRetry({
        result: createSyncResult(),
        runAt: "2026-07-29T03:04:05.000Z",
        start: new Date("2026-06-01T00:00:00.000Z"),
        end: new Date("2026-10-01T00:00:00.000Z"),
        maxAttempts: 3,
        readState: () => ({ version: 10, data: { clients: [], workers: [], scSchedules: [] } }),
        writeState: () => {
          writeCount += 1;
          throw new Error("VERSION_CONFLICT");
        },
      }),
    /VERSION_CONFLICT/,
  );
  assert.equal(writeCount, 3);
}

async function testSingleFlightSharesOneProducer() {
  const run = createSingleFlight();
  let producerCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const job = () =>
    run(async () => {
      producerCalls += 1;
      await gate;
      return { ok: true, token: producerCalls };
    });

  const p1 = job();
  const p2 = job();
  const p3 = job();
  release();
  const results = await Promise.all([p1, p2, p3]);
  assert.equal(producerCalls, 1);
  assert.deepEqual(
    results.map((row) => row.token),
    [1, 1, 1],
  );
}

function testStaleResponseGuard() {
  const guard = createRequestGenerationGuard();
  const monthRequest = guard.next();
  const modalRequest = guard.next();
  assert.equal(guard.isCurrent(monthRequest), false);
  assert.equal(guard.isCurrent(modalRequest), true);
  const afterClose = guard.next();
  assert.equal(guard.isCurrent(modalRequest), false);
  assert.equal(guard.isCurrent(afterClose), true);
}

function testLoadingSelectionGuard() {
  assert.equal(canSelectCalwalkImportSchedule({ loading: true }), false);
  assert.equal(canSelectCalwalkImportSchedule({ error: "failed" }), false);
  assert.equal(canSelectCalwalkImportSchedule({ loading: false, error: "" }), true);
}

function testLabelsUseCalWalk() {
  assert.equal(CALWALK_SCHEDULE_IMPORT_LABELS.title, "CalWalk 스케줄 가져오기");
  assert.match(CALWALK_SCHEDULE_IMPORT_LABELS.empty, /CalWalk/);
  assert.match(CALWALK_SCHEDULE_IMPORT_LABELS.loading, /CalWalk/);
  const appSource = readFileSync(join(rootDir, "src/App.tsx"), "utf8");
  assert.match(appSource, /CalWalk 스케줄 가져오기/);
  assert.doesNotMatch(appSource, /SC 스케줄 가져오기/);
}

function testMealExpenseAndNameMatchAndMealIncluded() {
  const workers = [
    { name: "김기사", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 },
    { name: "이기사", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 },
  ];
  const clients = [
    { name: "거래처A", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" },
  ];
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-meal-1",
      workDate: "2026-07-29",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장A",
      clientName: "거래처A",
      participantNames: ["김기사", "이기사"],
      participants: [
        { participantName: "김기사", name: "김기사", meal: 12000, expense: 34000 },
        { participantName: "이기사", name: "이기사", meal: 8000, expense: 15000 },
      ],
    },
    workers,
    clients,
    [],
  );

  assert.equal(form.workers[0].worker, "김기사");
  assert.equal(form.workers[0].meal, "12000");
  assert.equal(form.workers[0].expense, "34000");
  assert.equal(form.workers[1].worker, "이기사");
  assert.equal(form.workers[1].meal, "8000");
  assert.equal(form.workers[1].expense, "15000");

  const mealIncludedForm = buildSaleFormFromScSchedule(
    {
      id: "sc-meal-2",
      workDate: "2026-07-29",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장A",
      clientName: "거래처A",
      participantNames: ["김기사"],
      participants: [{ participantName: "김기사", name: "김기사", meal: 12000, expense: 34000 }],
    },
    workers,
    [{ name: "거래처A", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
    [],
  );
  // mealIncluded=Y keeps prior policy (do not force SC meal onto the row when included).
  assert.notEqual(mealIncludedForm.workers[0].meal, "12000");
  assert.equal(mealIncludedForm.workers[0].expense, "34000");
}

async function main() {
  await testRefreshOrdersSyncBeforeFetch();
  await testRefreshFallsBackToStoredRows();
  testVersionConflictRetryPreservesConcurrentDomains();
  testConflictRetryIsBounded();
  await testSingleFlightSharesOneProducer();
  testStaleResponseGuard();
  testLoadingSelectionGuard();
  testLabelsUseCalWalk();
  testMealExpenseAndNameMatchAndMealIncluded();
  console.log("test-calwalk-schedule-import-freshness: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
