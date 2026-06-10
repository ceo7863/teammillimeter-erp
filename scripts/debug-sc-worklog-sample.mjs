import { getErpState } from "../server/db.mjs";

const data = getErpState().data || {};
const sample = (data.scSchedules || []).find((row) => row.workLog);
console.log(JSON.stringify(sample ? { id: sample.id, workLog: sample.workLog } : null, null, 2));
