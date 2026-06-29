/**
 * Trigger ERP schedule sync via local API (run on EC2 where erp pm2 listens).
 * Usage: node scripts/trigger-schedule-sync-via-api.mjs [loginId] [password]
 */
const loginId = process.argv[2] || "admin";
const password = process.argv[3] || "1234";
const base = `http://127.0.0.1:${process.env.PORT || 8080}`;

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ loginId, password }),
});
const loginBody = await loginRes.text();
if (!loginRes.ok) {
  console.error("Login failed:", loginRes.status, loginBody.slice(0, 300));
  process.exit(1);
}
const { token } = JSON.parse(loginBody);
if (!token) {
  console.error("No token in login response");
  process.exit(1);
}

const statusBefore = await fetch(`${base}/api/sc-schedules/sync-status`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log("=== sync-status (before) ===");
console.log(await statusBefore.text());

const syncRes = await fetch(`${base}/api/sc-schedules/sync`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
const syncText = await syncRes.text();
console.log("\n=== sync POST", syncRes.status, "===");
console.log(syncText);

const statusAfter = await fetch(`${base}/api/sc-schedules/sync-status`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log("\n=== sync-status (after) ===");
console.log(await statusAfter.text());

if (!syncRes.ok) process.exit(1);
