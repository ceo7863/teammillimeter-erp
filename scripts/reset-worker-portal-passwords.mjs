import { getErpState, saveErpState } from "../server/db.mjs";
import {
  applyDefaultPortalPasswordToWorker,
  deriveWorkerPortalDefaultPassword,
  normalizePortalLoginId,
} from "../server/workerPortal.mjs";

const state = getErpState();
const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
let updatedCount = 0;

const nextWorkers = workers.map((worker) => {
  if (!normalizePortalLoginId(worker.portalLoginId) || worker.isActive === false) {
    return worker;
  }
  updatedCount += 1;
  return applyDefaultPortalPasswordToWorker(worker, { force: true });
});

if (!updatedCount) {
  console.log("No active workers with portal login ID to reset.");
  process.exit(0);
}

const saved = saveErpState(
  { ...state.data, workers: nextWorkers },
  state.version,
  "script:reset-worker-portal-passwords",
);

console.log(`Reset ${updatedCount} worker portal password(s) to phone suffix (last 4 digits).`);
console.log(`Saved ERP state version ${saved.version}.`);

const samples = nextWorkers
  .filter((w) => normalizePortalLoginId(w.portalLoginId) && w.isActive !== false)
  .slice(0, 5)
  .map((w) => ({
    loginId: w.portalLoginId,
    name: w.name,
    defaultPassword: deriveWorkerPortalDefaultPassword(w),
  }));
if (samples.length) {
  console.log("Sample defaults:", samples);
}
