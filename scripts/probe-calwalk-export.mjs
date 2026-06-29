import { config } from "../server/config.mjs";

function isCalwalkScheduleSourceConfigured() {
  const base = String(config.calwalk?.apiBaseUrl || "").trim();
  const secret = String(config.calwalk?.exportSecret || "").trim();
  const workspace = String(config.calwalk?.workspaceSlug || "").trim();
  if (!base || !secret || !workspace) return false;
  if (config.calwalk?.scheduleSyncEnabled === false) return false;
  const hasDedicatedSecret = Boolean(
    process.env.CALWALK_ERP_EXPORT_SECRET?.trim() || process.env.ERP_SYNC_SECRET?.trim(),
  );
  if (!hasDedicatedSecret && process.env.CALWALK_SCHEDULE_SYNC_ENABLED !== "true") return false;
  return true;
}

function resolveScheduleSyncSource() {
  const forced = String(process.env.SC_SCHEDULE_SYNC_SOURCE || "auto").trim().toLowerCase();
  if (forced === "calwalk") return isCalwalkScheduleSourceConfigured() ? "calwalk" : null;
  if (isCalwalkScheduleSourceConfigured()) return "calwalk";
  if (String(config.sc.databaseUrl || "").trim()) return "sc-db";
  if (
    Boolean(String(config.sc.apiBaseUrl || "").trim()) &&
    Boolean(String(config.sc.syncSecret || "").trim())
  ) {
    return "sc-api";
  }
  return null;
}

const secret = String(config.calwalk.exportSecret || "").trim();
const base = String(config.calwalk.apiBaseUrl || "https://calwalk.com").replace(/\/$/, "");
const workspace = String(config.calwalk.workspaceSlug || "teammm").trim();
const start = process.argv[2] || "2026-06-01";
const end = process.argv[3] || "2026-07-01";

console.log("scheduleSyncSource:", resolveScheduleSyncSource());
console.log("calwalk workspace:", workspace);
console.log("secret configured:", Boolean(secret));

if (!secret) {
  console.error("Set CALWALK_ERP_EXPORT_SECRET (or ERP_SYNC_SECRET)");
  process.exit(1);
}

const url = `${base}/api/integrations/erp/schedule-export?workspace=${encodeURIComponent(workspace)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  console.log("\n=== CalWalk export", res.status, "===");
  if (!res.ok) {
    console.log(text.slice(0, 500));
    process.exit(1);
  }
  const payload = JSON.parse(text);
  const withExtras = (payload.schedules || []).filter(
    (row) =>
      row.workLog ||
      (Array.isArray(row.participants) &&
        row.participants.some((p) => p.meal || p.expense || p.workLog)),
  );
  console.log(
    JSON.stringify(
      {
        source: payload.source,
        workspace: payload.workspace,
        range: payload.range,
        projectCount: payload.projects?.length ?? 0,
        scheduleCount: payload.schedules?.length ?? 0,
        schedulesWithWorkLogOrExtras: withExtras.length,
        sampleSchedule: payload.schedules?.[0] ?? null,
        sampleWithExtras: withExtras[0] ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Fetch failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
