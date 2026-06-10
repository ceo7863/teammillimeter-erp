import {
  getWorkerProbationEndDate,
  getWorkerPortalStatementStartDate,
  isWorkerInProbationForPortal,
  resolveWorkerPortalCalendarMonthPeriod,
  saleDateEligibleForWorkerPortal,
} from "../src/utils/workerPortalProbation.ts";

const worker = { grade: "E", hireDate: "2025-02-25" };

const probationEnd = getWorkerProbationEndDate(worker);
const statementStart = getWorkerPortalStatementStartDate(worker);

console.log("probationEnd", probationEnd);
console.log("statementStart", statementStart);

if (probationEnd !== "2025-05-25") {
  throw new Error(`expected probation end 2025-05-25, got ${probationEnd}`);
}
if (statementStart !== "2025-05-26") {
  throw new Error(`expected statement start 2025-05-26, got ${statementStart}`);
}

const mayPeriod = resolveWorkerPortalCalendarMonthPeriod("2025-05", worker);
if (mayPeriod?.periodStart !== "2025-05-26" || mayPeriod?.periodEnd !== "2025-05-31") {
  throw new Error(`unexpected May period: ${JSON.stringify(mayPeriod)}`);
}

if (isWorkerInProbationForPortal(worker, "2025-05-25") !== true) {
  throw new Error("expected in probation on end date");
}
if (isWorkerInProbationForPortal(worker, "2025-05-26") !== false) {
  throw new Error("expected out of probation after end date");
}

if (saleDateEligibleForWorkerPortal("2025-05-25", worker)) {
  throw new Error("May 25 sale should be excluded");
}
if (!saleDateEligibleForWorkerPortal("2025-05-26", worker)) {
  throw new Error("May 26 sale should be included");
}

const junePeriod = resolveWorkerPortalCalendarMonthPeriod("2025-06", worker);
if (junePeriod?.periodStart !== "2025-06-01" || junePeriod?.periodEnd !== "2025-06-30") {
  throw new Error(`unexpected June period: ${JSON.stringify(junePeriod)}`);
}

console.log("verify-worker-portal-probation: ok");
