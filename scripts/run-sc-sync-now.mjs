import { runScScheduleSync } from "../server/scScheduleSync.mjs";

const result = await runScScheduleSync({ updatedBy: "manual-expense-sync" });
console.log(JSON.stringify(result, null, 2));
