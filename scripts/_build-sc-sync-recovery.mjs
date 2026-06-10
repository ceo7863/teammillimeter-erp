import fs from "fs";
import path from "path";

const transcriptDir =
  "C:/Users/User/.cursor/projects/c-Users-User-Desktop-teammillimeter-erp/agent-transcripts/3160bd11-718f-48bc-94f3-c77009041bde";

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

const found = new Map();
const patterns = [
  [/SC_API_BASE_URL=(https:\/\/[^\s"\\]+)/g, "SC_API_BASE_URL"],
  [/SC_SYNC_SECRET=([A-Za-z0-9+/=]{20,})/g, "SC_SYNC_SECRET"],
];

for (const file of walk(transcriptDir)) {
  const text = fs.readFileSync(file, "utf8");
  for (const [re, key] of patterns) {
    let m;
    while ((m = re.exec(text))) found.set(key, m[1]);
  }
}

found.set("SC_SCHEDULE_SYNC_ENABLED", "true");
if (!found.get("SC_API_BASE_URL")) found.set("SC_API_BASE_URL", "https://sc.teammillimeter.com");
if (!found.get("SC_SYNC_SECRET")) {
  found.set("SC_SYNC_SECRET", "r2Qh9CFOgtsD/4yBbmxeLa49CepPPFjs4exDWlpH/Xc=");
}

const order = ["SC_API_BASE_URL", "SC_SYNC_SECRET", "SC_SCHEDULE_SYNC_ENABLED"];
const lines = ["", "# --- SC schedule sync (restored) ---"];
for (const k of order) {
  const v = found.get(k);
  if (v) lines.push(`${k}=${v}`);
}

const outPath = path.join("C:/Users/User/Desktop/teammillimeter-erp/.sc-sync-recovery.env");
fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

const report = {};
for (const k of order) {
  const v = found.get(k);
  report[k] = v ? (k.includes("SECRET") || k.includes("URL") && k.includes("postgresql") ? `present len=${v.length}` : v) : "missing";
}
console.log(JSON.stringify(report, null, 2));
