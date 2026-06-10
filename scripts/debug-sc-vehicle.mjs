#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";
import { listStaffScSchedulesForClient } from "../server/scScheduleSync.mjs";
import { findWorkerByListName, resolveScScheduleParticipants } from "../server/workerPhoneMatch.mjs";

getDb();
const state = getErpState();
const data = state.data || {};
const workers = Array.isArray(data.workers) ? data.workers : [];
const schedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
const clients = Array.isArray(data.clients) ? data.clients : [];

const withVehicle = workers.filter((w) => String(w.vehicleNo || "").trim());
const withParticipants = schedules.filter((s) => (s.participantNames || []).length > 0).slice(0, 5);

console.log(
  JSON.stringify(
    {
      workerCount: workers.length,
      workersWithVehicleNo: withVehicle.length,
      sampleWorkersWithVehicle: withVehicle.slice(0, 5).map((w) => ({
        id: w.id,
        name: w.name,
        vehicleNo: w.vehicleNo,
        phone: w.phone,
      })),
      scheduleCount: schedules.length,
      sampleSchedules: withParticipants.map((s) => {
        const names = s.participantNames || [];
        const resolved = resolveScScheduleParticipants(workers, names);
        return {
          id: s.id,
          workDate: s.workDate,
          workType: s.workType,
          clientId: s.clientId,
          participantNames: names,
          storedParticipants: s.participants,
          resolvedParticipants: resolved,
          matchDebug: names.map((name) => {
            const master = findWorkerByListName(workers, name);
            return {
              scName: name,
              matchedWorker: master?.name || null,
              vehicleNo: master?.vehicleNo || null,
            };
          }),
        };
      }),
    },
    null,
    2,
  ),
);

if (clients[0]) {
  const month = String(schedules[0]?.workDate || "").slice(0, 7) || new Date().toISOString().slice(0, 7);
  const api = listStaffScSchedulesForClient(clients[0].id, month);
  const apiSample = (api.schedules || []).filter((s) => (s.participantNames || []).length).slice(0, 3);
  console.log(
    "\n--- API sample ---\n",
    JSON.stringify(
      {
        client: clients[0].name,
        month,
        apiSample: apiSample.map((s) => ({
          workType: s.workType,
          participantNames: s.participantNames,
          participants: s.participants,
        })),
      },
      null,
      2,
    ),
  );
}
