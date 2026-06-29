import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

function pick(key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

const url =
  "https://calwalk.com/api/integrations/erp/schedule-export?workspace=teammm&start=2026-06-01&end=2026-07-01";

for (const [name, key] of [
  ["SC_SYNC", "SC_SYNC_SECRET"],
  ["CALWALK", "CALWALK_ERP_EXPORT_SECRET"],
  ["ERP", "ERP_SYNC_SECRET"],
]) {
  const secret = pick(key);
  if (!secret) {
    console.log(name, "missing");
    continue;
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  console.log(name, "len", secret.length, "status", res.status);
}
