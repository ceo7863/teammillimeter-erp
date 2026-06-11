import {
  WORKER_PROBATION_FINAL_PAY,
  WORKER_PROBATION_NET_PAY,
  resolveWorkerProbationExpectedAmount,
} from "../src/utils/workerEGradePayPeriods.ts";
import { calculateWorkerPaymentVat } from "../src/utils/workerMonthlyPayments.ts";

if (WORKER_PROBATION_NET_PAY !== 2_000_000) {
  throw new Error(`expected probation net pay 2000000, got ${WORKER_PROBATION_NET_PAY}`);
}
if (WORKER_PROBATION_FINAL_PAY !== 2_200_000) {
  throw new Error(`expected probation final pay 2200000, got ${WORKER_PROBATION_FINAL_PAY}`);
}
if (resolveWorkerProbationExpectedAmount() !== 2_000_000) {
  throw new Error("expected default probation expected amount 2000000");
}
if (resolveWorkerProbationExpectedAmount(1_800_000) !== 1_800_000) {
  throw new Error("expected saved probation expected amount to be preserved");
}

const withVat = calculateWorkerPaymentVat(WORKER_PROBATION_NET_PAY, true);
if (withVat.finalPayAmount !== WORKER_PROBATION_FINAL_PAY) {
  throw new Error(
    `expected probation with-vat total ${WORKER_PROBATION_FINAL_PAY}, got ${withVat.finalPayAmount}`,
  );
}

console.log("verify-worker-probation-pay: ok");
