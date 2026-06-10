import fs from "fs";

const envText = fs.readFileSync(process.argv[2] || ".env", "utf8");
const secret = envText.match(/^SC_SYNC_SECRET=(.+)$/m)?.[1]?.trim() || "";
const start = process.argv[3] || "2025-01-01";
const end = process.argv[4] || "2027-01-01";
const url = `https://sc.teammillimeter.com/api/erp/schedule-export?start=${start}&end=${end}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
const data = await res.json();
const schedules = Array.isArray(data.schedules) ? data.schedules : [];
const sample = schedules[0];
console.log("http", res.status, "count", schedules.length);
console.log("sample keys", sample ? Object.keys(sample) : []);
console.log("sample participant", JSON.stringify(sample?.participants?.[0] ?? null));
const withExtras = schedules.filter((row) =>
  (row.participants || []).some((p) => p.meal || p.expense),
);
console.log("with meal/expense", withExtras.length);
if (withExtras[0]) {
  console.log("example", JSON.stringify(withExtras[0], null, 2));
}
