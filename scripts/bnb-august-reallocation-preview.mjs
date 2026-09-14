/**
 * READ-ONLY preview: RCP-20260914-0001 / client 97 August 2026 reallocation candidates.
 *
 * Aligns with apply/preflight preconditions via diagnoseBnbAugustReallocation.
 * NEVER calls saveErpState or replaceReceiptAllocations.
 *
 *   DATABASE_PATH=/path/to/erp.sqlite node scripts/bnb-august-reallocation-preview.mjs
 */

import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  BNB_TARGET,
  diagnoseBnbAugustReallocation,
  runBnbAugustReallocation,
} from "./bnb-august-reallocation-apply.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

if (!process.env.DATABASE_PATH && process.env.ERP_ROOT) {
  process.env.DATABASE_PATH = path.join(process.env.ERP_ROOT, "data", "erp.sqlite");
}
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(repoRoot, "data", "erp.sqlite");
}

process.env.BNB_MODE = "preview";

async function main() {
  const root = process.env.ERP_ROOT || repoRoot;
  process.chdir(root);
  const result = await runBnbAugustReallocation({ mode: "preview" });

  let candidateNote = null;
  try {
    const { getErpState, initDb } = await import(pathToFileURL(path.join(root, "server/db.mjs")).href);
    if (typeof initDb === "function") initDb();
    const { proposeFifoAllocations, listReceipts, listReceiptAllocations } = await import(
      pathToFileURL(path.join(root, "server/receipts.mjs")).href,
    );
    const { proposeFifoAllocationsScoped } = await import(
      pathToFileURL(path.join(root, "server/canonicalCollection.mjs")).href,
    );
    const { planAllocationsForTarget } = await import(
      pathToFileURL(path.join(root, "server/allocationTarget.mjs")).href,
    );
    const data = getErpState().data || {};
    const diagnosis = diagnoseBnbAugustReallocation(data, {
      planAllocationsForTarget,
      proposeFifoAllocations,
      proposeFifoAllocationsScoped,
      listReceipts,
      listReceiptAllocations,
    });
    candidateNote = {
      primaryPlan: "PERIOD",
      periodStart: BNB_TARGET.periodStart,
      periodEnd: BNB_TARGET.periodEnd,
      diagnosisCode: diagnosis.code,
      failures: diagnosis.failures,
      afterPreview: diagnosis.afterPreview,
    };
  } catch (error) {
    candidateNote = { error: error?.message || String(error) };
  }

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        mutatesProduction: false,
        apply: false,
        mutations: 0,
        target: BNB_TARGET,
        ...result,
        candidateNote,
        message:
          "preview only. Apply requires BNB_MODE=apply and BNB_APPLY_CONFIRM=YES_REALLOCATE_BNB_AUGUST_2026",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }));
  process.exitCode = 1;
});
