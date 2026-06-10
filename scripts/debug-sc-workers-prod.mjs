#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

import { isBlockedScParticipantName } from "../server/scScheduleSync.mjs";

getDb();
const { data } = getErpState();

const workers = (data.workers || []).filter((w) => {
  const loginId = String(w.portalLoginId || w.loginId || "").trim();
  return ["300002", "300006", "300027"].includes(loginId) || isBlockedScParticipantName(w.name);
});
console.log("workers", workers.length, workers.map((w) => ({ id: w.id, name: w.name, portalLoginId: w.portalLoginId })));

let schedHits = 0;
for (const s of data.scSchedules || []) {
  const hit = [...(s.participantNames || []), ...(s.participants || []).map((p) => p.name || p.participantName)].some(
    (n) => isBlockedScParticipantName(n),
  );
  if (hit) schedHits++;
}
console.log("schedulesWithNames", schedHits, "total", (data.scSchedules || []).length);
