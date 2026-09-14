/**
 * Read-only B&B August reallocation preflight (alias of preview mode).
 *
 *   DATABASE_PATH=/path/to/erp.sqlite node scripts/bnb-august-reallocation-preflight.mjs
 */

process.env.BNB_MODE = "preview";

const { runBnbAugustReallocation } = await import("./bnb-august-reallocation-apply.mjs");

const result = await runBnbAugustReallocation({ mode: "preview" });
console.log(JSON.stringify(result, null, 2));
if (!result.diagnosis?.ok) {
  console.error("NOT_READY");
  process.exitCode = 1;
}
