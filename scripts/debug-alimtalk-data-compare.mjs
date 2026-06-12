#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { buildScScheduleNotifyPreview } from "../server/scScheduleNotify.mjs";
import { buildScWeeklyBriefingPreview } from "../server/scWeeklyBriefingNotify.mjs";
import { normalizeNotificationSettings } from "../server/notificationSettings.mjs";

const paths = process.argv.slice(2);
if (paths.length < 2) {
  console.error("Usage: node --import tsx scripts/debug-alimtalk-data-compare.mjs <current-db> <backup-db>");
  process.exit(1);
}

function loadData(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const meta = db.prepare("SELECT version, updated_at FROM erp_state WHERE id = 1").get() || {};
  let data = {};
  try {
    for (const row of db.prepare("SELECT domain, payload FROM erp_domain_state").all()) {
      Object.assign(data, JSON.parse(String(row.payload)));
    }
  } catch {
    // legacy
  }
  if (!Object.keys(data).length) {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    const parsed = JSON.parse(String(row.payload));
    data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
  }
  db.close();
  return { label: dbPath, meta, data };
}

function stableJson(value) {
  return JSON.stringify(value);
}

function diffSettings(current, backup) {
  const cur = normalizeNotificationSettings(current);
  const bak = normalizeNotificationSettings(backup);
  const keys = [
    "enabled",
    "dailyReportEnabled",
    "commentNotifyEnabled",
    "scScheduleNotifyEnabled",
    "dailyReportHour",
    "dailyReportMinute",
    "scScheduleNotifyHour",
    "scScheduleNotifyMinute",
    "scWeeklyBriefingNotifyEnabled",
    "scWeeklyBriefingWeekday",
    "scWeeklyBriefingHour",
    "scWeeklyBriefingMinute",
    "scScheduleNotifyMode",
    "dailyReportExtraPhones",
  ];
  const diffs = [];
  for (const key of keys) {
    const left = cur[key];
    const right = bak[key];
    if (stableJson(left) !== stableJson(right)) {
      diffs.push({ key, current: left, backup: right });
    }
  }
  const curRecipients = stableJson(cur.recipients);
  const bakRecipients = stableJson(bak.recipients);
  if (curRecipients !== bakRecipients) {
    diffs.push({
      key: "recipients",
      currentCount: cur.recipients.length,
      backupCount: bak.recipients.length,
      current: cur.recipients,
      backup: bak.recipients,
    });
  }
  return diffs;
}

function contactSummary(clients) {
  return (clients || []).map((client) => ({
    id: client.id,
    name: client.name,
    phone: client.phone || "",
    contactCount: Array.isArray(client.contacts) ? client.contacts.length : 0,
    contacts: (client.contacts || []).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone || "",
      role: c.role || "",
    })),
  }));
}

function diffClients(currentClients, backupClients) {
  const backupById = new Map((backupClients || []).map((c) => [String(c.id), c]));
  const changed = [];
  for (const client of currentClients || []) {
    const prev = backupById.get(String(client.id));
    if (!prev) continue;
    const curContacts = stableJson(client.contacts || []);
    const bakContacts = stableJson(prev.contacts || []);
    const curPhone = String(client.phone || "");
    const bakPhone = String(prev.phone || "");
    if (curContacts !== bakContacts || curPhone !== bakPhone) {
      changed.push({
        id: client.id,
        name: client.name,
        phone: { current: curPhone, backup: bakPhone },
        contactCount: {
          current: (client.contacts || []).length,
          backup: (prev.contacts || []).length,
        },
        contacts: {
          current: client.contacts || [],
          backup: prev.contacts || [],
        },
      });
    }
  }
  return changed;
}

function scheduleStats(data) {
  const schedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
  const byDate = {};
  for (const row of schedules) {
    const day = String(row.workDate || "").slice(0, 10);
    byDate[day] = (byDate[day] || 0) + 1;
  }
  return {
    total: schedules.length,
    byDate,
    syncMeta: data.scScheduleSyncMeta || null,
  };
}

function previewStats(data) {
  const tomorrow = buildScScheduleNotifyPreview(data);
  const weekly = buildScWeeklyBriefingPreview(data, {});
  return {
    tomorrow: {
      targetDate: tomorrow.targetDate,
      scheduleCount: tomorrow.scheduleCount,
      notifyCount: tomorrow.notifyCount,
      missingPhoneCount: tomorrow.missingPhoneCount,
      rowCount: tomorrow.rows.length,
    },
    weekly: {
      weekStart: weekly.weekStart,
      weekEnd: weekly.weekEnd,
      siteCount: weekly.siteCount,
      notifyCount: weekly.notifyCount,
      groupCount: weekly.groups.length,
    },
  };
}

const [currentPath, backupPath] = paths;
const current = loadData(currentPath);
const backup = loadData(backupPath);

const report = {
  current: { path: current.label, ...current.meta },
  backup: { path: backup.label, ...backup.meta },
  notificationSettingsDiff: diffSettings(
    current.data.notificationSettings,
    backup.data.notificationSettings,
  ),
  clientContactDiffCount: diffClients(current.data.clients, backup.data.clients).length,
  clientContactDiffs: diffClients(current.data.clients, backup.data.clients).slice(0, 20),
  schedules: {
    current: scheduleStats(current.data),
    backup: scheduleStats(backup.data),
  },
  preview: {
    current: previewStats(current.data),
    backup: previewStats(backup.data),
  },
};

console.log(JSON.stringify(report, null, 2));
