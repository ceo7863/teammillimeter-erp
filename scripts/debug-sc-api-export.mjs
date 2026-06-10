#!/usr/bin/env node
import { config } from "../server/config.mjs";
import { isBlockedScParticipantName } from "../server/scScheduleSync.mjs";

const base = String(config.sc.apiBaseUrl || "").trim().replace(/\/$/, "");
const secret = String(config.sc.syncSecret || "").trim();
const start = "2026-05-01";
const end = "2026-06-30";
const url = `${base}/api/erp/schedule-export?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
const payload = await res.json();

let hits = [];
for (const s of payload.schedules || []) {
  for (const p of s.participants || []) {
    const name = String(p.name || p.participantName || "").trim();
    if (isBlockedScParticipantName(name)) {
      hits.push({ scheduleId: s.id, workDate: s.workDate, participant: p });
    }
  }
  for (const n of s.participantNames || []) {
    if (isBlockedScParticipantName(n)) {
      hits.push({ scheduleId: s.id, workDate: s.workDate, participantName: n });
    }
  }
}
console.log("hits", hits.length);
console.log(JSON.stringify(hits.slice(0, 5), null, 2));
if (payload.users) {
  console.log(
    "users sample",
    payload.users.filter((u) => isBlockedScParticipantName(u.name) || isBlockedScParticipantName(String(u.id))).slice(0, 10),
  );
}
console.log("payload keys", Object.keys(payload));
