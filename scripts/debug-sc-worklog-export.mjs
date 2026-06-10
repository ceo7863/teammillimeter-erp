import fs from "fs";

const envText = fs.readFileSync(process.argv[2] || ".env", "utf8");
const secret = envText.match(/^SC_SYNC_SECRET=(.+)$/m)?.[1]?.trim() || "";
const url = "https://sc.teammillimeter.com/api/erp/schedule-export?start=2025-01-01&end=2027-01-01";
const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
const data = await res.json();
const withLog = (data.schedules || []).filter((row) => row.workLog);
console.log("with workLog", withLog.length);
if (withLog[0]) {
  const ex = withLog[0];
  console.log(JSON.stringify({
    id: ex.id,
    plan: `${ex.startTime}-${ex.endTime}`,
    workLog: ex.workLog,
  }, null, 2));
}
