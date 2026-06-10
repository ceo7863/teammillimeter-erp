#!/usr/bin/env node
import { getDb, getErpState, saveErpState } from "../server/db.mjs";
import {
  isBlockedScParticipantName,
  stripBlockedParticipantsFromSchedule,
} from "../server/scScheduleSync.mjs";

const dryRun = process.argv.includes("--dry-run");
const targetLoginIds = new Set(["300002", "300006", "300027"]);
const targetNameParts = ["박정우", "김명진", "김준영"];

function matchesWorkerForDeactivation(worker) {
  const loginId = String(worker?.portalLoginId || worker?.loginId || "").trim();
  return targetLoginIds.has(loginId);
}

getDb();
const state = getErpState();
const data = state.data;

const matchedWorkers = (data.workers || []).filter(matchesWorkerForDeactivation);
console.log(
  "matchedWorkers:",
  JSON.stringify(
    matchedWorkers.map((row) => ({
      id: row.id,
      name: row.name,
      portalLoginId: row.portalLoginId,
      isActive: row.isActive,
    })),
    null,
    2,
  ),
);

let scheduleTouched = 0;
const nextSchedules = (data.scSchedules || []).map((schedule) => {
  const next = stripBlockedParticipantsFromSchedule(schedule);
  if (JSON.stringify(next) !== JSON.stringify(schedule)) scheduleTouched += 1;
  return next;
});

const nextWorkers = (data.workers || []).map((worker) => {
  if (!matchesWorkerForDeactivation(worker)) return worker;
  if (worker.isActive === false) return worker;
  return { ...worker, isActive: false };
});

const workerChanges = nextWorkers.filter((row, index) => row !== data.workers[index]).length;

let remainingHits = 0;
for (const schedule of nextSchedules) {
  const names = [
    ...(schedule.participantNames || []),
    ...(schedule.participants || []).map((row) => row?.name || row?.participantName),
  ];
  if (names.some((name) => isBlockedScParticipantName(name))) remainingHits += 1;
}

console.log(
  JSON.stringify(
    {
      dryRun,
      matchedWorkers: matchedWorkers.length,
      workersDeactivated: workerChanges,
      schedulesUpdated: scheduleTouched,
      remainingBlockedParticipantHits: remainingHits,
    },
    null,
    2,
  ),
);

if (dryRun) process.exit(0);

saveErpState(
  {
    ...data,
    workers: nextWorkers,
    scSchedules: nextSchedules,
  },
  state.version,
  "repair-remove-sc-workers",
);

console.log("saved");
