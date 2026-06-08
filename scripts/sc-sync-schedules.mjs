import { initDb } from "../server/db.mjs";
import { runScScheduleSync } from "../server/scScheduleSync.mjs";

initDb();

const result = await runScScheduleSync({ updatedBy: "sc-sync-schedules:cli" });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
