import {
  buildWorkerProbationAlerts,
  formatWorkerProbationAlertMessage,
} from "../src/utils/workerProbationAlerts.ts";

const workers = [
  {
    id: 1,
    name: "\uD14C\uC2A4\uD2B8",
    grade: "E",
    hireDate: "2025-02-25",
    isActive: true,
  },
];

const alertsAtStart = buildWorkerProbationAlerts(workers, "2025-03-22");
if (alertsAtStart.length !== 1 || alertsAtStart[0].monthIndex !== 1) {
  throw new Error(`expected one 1-month alert on 2025-03-22, got ${JSON.stringify(alertsAtStart)}`);
}

const alertsBeforeWindow = buildWorkerProbationAlerts(workers, "2025-03-21");
if (alertsBeforeWindow.length !== 0) {
  throw new Error("expected no alert before 3-day window");
}

const alertsOnMilestone = buildWorkerProbationAlerts(workers, "2025-03-25");
if (alertsOnMilestone.length !== 1 || alertsOnMilestone[0].daysUntil !== 0) {
  throw new Error(`expected alert on milestone day, got ${JSON.stringify(alertsOnMilestone)}`);
}

const alertsAfterMilestone = buildWorkerProbationAlerts(workers, "2025-03-26");
if (alertsAfterMilestone.length !== 0) {
  throw new Error("expected no alert after 1-month milestone");
}

const alertsThirdMonth = buildWorkerProbationAlerts(workers, "2025-05-22");
if (alertsThirdMonth.length !== 1 || alertsThirdMonth[0].monthIndex !== 3) {
  throw new Error(`expected 3-month alert, got ${JSON.stringify(alertsThirdMonth)}`);
}

const message = formatWorkerProbationAlertMessage(alertsThirdMonth[0]);
if (!message.includes("\uD3EC\uD138 \uB0B4\uC5ED\uC11C")) {
  throw new Error(`expected portal message, got ${message}`);
}

console.log("verify-worker-probation-alerts: ok");
