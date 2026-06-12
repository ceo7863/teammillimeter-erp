#!/usr/bin/env node
/**
 * Find client job site(s) for a given date from erp_state payload.
 * Standalone - uses node:sqlite only (no server/db.mjs or erpChatTools).
 *
 * Usage:
 *   node scripts/query-indieffer-jun2-site.mjs [db-path] [date] [client-needle]
 */
import { DatabaseSync } from "node:sqlite";

const CLIENT_INDIEPER = "\uC778\uB514\uD37C";

const dbPath = process.argv[2] || "data/erp.sqlite";
const targetDates = process.argv[3] ? [process.argv[3]] : ["2026-06-02", "2025-06-02"];
const clientNeedle = process.argv[4] || CLIENT_INDIEPER;

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "");
}

function matchesClient(value) {
  const hay = norm(value);
  const needle = norm(clientNeedle);
  if (!needle || !hay) return false;
  return hay.includes(needle);
}

function resolveScSite(schedule) {
  const workType = String(schedule.workType || "").trim();
  if (workType) return workType;
  return String(schedule.projectName || "").trim();
}

function dateKey(value) {
  return String(value || "").slice(0, 10);
}

function requestCoversDate(request, date) {
  const start = dateKey(request.workDate);
  const end = dateKey(request.workDateEnd || request.workDate);
  if (!start) return false;
  return date >= start && date <= end;
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT payload, version, updated_at FROM erp_state WHERE id = 1").get();
if (!row?.payload) {
  console.error("No erp_state payload found at", dbPath);
  process.exit(1);
}

const data = JSON.parse(row.payload);
const clients = Array.isArray(data.clients) ? data.clients : [];
const indiefferClients = clients.filter((c) => matchesClient(c.name) || matchesClient(c.depositNameAliases));
const indiefferClientIds = new Set(indiefferClients.map((c) => String(c.id)));

console.log("=== META ===");
console.log({
  dbPath,
  version: row.version,
  updatedAt: row.updated_at,
  clientNeedle,
  targetDates,
  matchedClients: indiefferClients.map((c) => ({
    id: c.id,
    name: c.name,
    scProjectName: c.scProjectName || null,
    scProjectId: c.scProjectId || null,
    address: c.address || c.scProjectAddress || null,
  })),
});

for (const targetDate of targetDates) {
  console.log(`\n=== DATE ${targetDate} ===`);

  const scHits = (data.scSchedules || []).filter((s) => {
    if (dateKey(s.workDate) !== targetDate) return false;
    return (
      matchesClient(s.clientName) ||
      (s.clientId != null && indiefferClientIds.has(String(s.clientId)))
    );
  });

  const saleHits = (data.sales || []).filter((s) => {
    if (dateKey(s.date) !== targetDate) return false;
    return matchesClient(s.client);
  });

  const requestHits = (data.clientSiteRequests || []).filter((r) => {
    if (!requestCoversDate(r, targetDate)) return false;
    return matchesClient(r.clientName) || (r.clientId != null && indiefferClientIds.has(String(r.clientId)));
  });

  const results = [];

  for (const s of scHits) {
    const siteName = resolveScSite(s);
    const client = indiefferClients.find((c) => String(c.id) === String(s.clientId));
    results.push({
      source: "scSchedule",
      id: s.id,
      clientName: s.clientName || client?.name || null,
      siteName,
      projectName: s.projectName || null,
      workType: s.workType || null,
      address: client?.address || client?.scProjectAddress || null,
      startTime: s.startTime || null,
      endTime: s.endTime || null,
      expectedHeadcount: s.expectedHeadcount ?? s.participantCount ?? null,
      participants: Array.isArray(s.participantNames) ? s.participantNames : null,
    });
  }

  for (const s of saleHits) {
    results.push({
      source: "sale",
      id: s.id,
      clientName: s.client,
      siteName: String(s.site || "").trim() || null,
      projectName: null,
      workType: null,
      address: null,
      voucherNo: s.voucherNo || null,
      amount: s.amount ?? null,
      memo: String(s.memo || "").trim() || null,
      scScheduleId: s.scScheduleId || null,
    });
  }

  for (const r of requestHits) {
    results.push({
      source: "clientSiteRequest",
      id: r.id,
      clientName: r.clientName,
      siteName: String(r.siteName || "").trim() || null,
      status: r.status,
      address: null,
      memo: String(r.memo || "").trim() || null,
      workerCount: r.workerCount ?? null,
    });
  }

  if (!results.length) {
    console.log("No records found.");
    continue;
  }

  console.log(`Found ${results.length} record(s):`);
  for (const item of results) {
    console.log(JSON.stringify(item, null, 2));
  }

  const siteNames = [...new Set(results.map((r) => r.siteName).filter(Boolean))];
  console.log("Summary site names:", siteNames.length ? siteNames.join(", ") : "(none)");
}
