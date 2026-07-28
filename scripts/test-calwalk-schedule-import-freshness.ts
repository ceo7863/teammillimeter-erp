import assert from "node:assert/strict";
import { refreshCalwalkSchedulesForMonth } from "../src/utils/scSchedules";
import { persistScScheduleSyncResultWithRetry } from "../server/scScheduleSync.mjs";

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
      return [];
    },
  });

  assert.equal(fetched, true);
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
        const error = new Error("VERSION_CONFLICT");
        throw error;
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
    () => persistScScheduleSyncResultWithRetry({
      result: createSyncResult(),
      runAt: "2026-07-29T03:04:05.000Z",
      start: new Date("2026-06-01T00:00:00.000Z"),
      end: new Date("2026-10-01T00:00:00.000Z"),
      maxAttempts: 2,
      readState: () => ({ version: 10, data: { clients: [], workers: [], scSchedules: [] } }),
      writeState: () => {
        writeCount += 1;
        throw new Error("VERSION_CONFLICT");
      },
    }),
    /VERSION_CONFLICT/,
  );
  assert.equal(writeCount, 2);
}

async function main() {
  await testRefreshOrdersSyncBeforeFetch();
  await testRefreshFallsBackToStoredRows();
  testVersionConflictRetryPreservesConcurrentDomains();
  testConflictRetryIsBounded();
  console.log("test-calwalk-schedule-import-freshness: PASS");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
