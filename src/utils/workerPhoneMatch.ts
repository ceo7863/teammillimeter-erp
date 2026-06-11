import type { WorkerMasterLike } from "@/utils/workerPayments";

function normalizeWorkerName(value: unknown) {
  return String(value || "").trim();
}

function stripLeadingAPrefix(name: string) {
  const normalized = normalizeWorkerName(name);
  return normalized.startsWith("A") && normalized.length > 1 ? normalized.slice(1) : normalized;
}

function normalizeWorkerListMatchKey(name: string) {
  return stripLeadingAPrefix(normalizeWorkerName(name)).replace(/\s+/g, "");
}

function parseDepositNameAliases(raw: unknown) {
  return String(raw || "")
    .split(/[,?\n\r;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function findWorkerByListName(workers: WorkerMasterLike[], name: string) {
  const list = Array.isArray(workers) ? workers : [];
  const target = normalizeWorkerName(name);
  if (!target) return null;

  const exact = list.find((worker) => normalizeWorkerName(worker?.name) === target);
  if (exact) return exact;

  const targetCore = stripLeadingAPrefix(target);
  const targetKey = normalizeWorkerListMatchKey(target);

  for (const worker of list) {
    const workerName = normalizeWorkerName(worker?.name);
    if (!workerName) continue;
    if (stripLeadingAPrefix(workerName) === targetCore) return worker;
    if (workerName === `A${target}`) return worker;
    if (normalizeWorkerListMatchKey(workerName) === targetKey) return worker;
  }

  for (const worker of list) {
    const aliases = parseDepositNameAliases(worker?.depositNameAliases);
    if (aliases.some((alias) => normalizeWorkerName(alias) === target)) return worker;
    if (aliases.some((alias) => normalizeWorkerListMatchKey(alias) === targetKey)) return worker;
  }

  return null;
}

export function resolveWorkerPhone(workers: WorkerMasterLike[], participantName: string) {
  const worker = findWorkerByListName(workers, participantName);
  if (!worker) return null;
  const phone = String(worker.phone || "").replace(/\D/g, "");
  return phone || null;
}

export function resolveScScheduleParticipants(workers: WorkerMasterLike[], participantNames: string[] = []) {
  return participantNames
    .map((participantName) => String(participantName || "").trim())
    .filter(Boolean)
    .map((participantName) => {
      const master = findWorkerByListName(workers, participantName);
      const phone = String(master?.phone || "").trim();
      return {
        participantName,
        name: String(master?.name || participantName).trim(),
        phone,
        vehicleNo: String(master?.vehicleNo || "").trim(),
      };
    });
}
