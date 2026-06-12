function normalizeWorkerName(value) {
  return String(value || "").trim();
}

function stripLeadingAPrefix(name) {
  const normalized = normalizeWorkerName(name);
  if (!normalized) return normalized;
  const stripped = normalized.replace(/^[A-Za-z]+/, "").trimStart();
  return stripped || normalized;
}

function normalizeWorkerListMatchKey(name) {
  return stripLeadingAPrefix(normalizeWorkerName(name)).replace(/\s+/g, "");
}

function parseDepositNameAliases(raw) {
  return String(raw || "")
    .split(/[,?\n\r;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function findWorkerByListName(workers, name) {
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
    if (normalizeWorkerListMatchKey(workerName) === targetKey) return worker;
  }

  for (const worker of list) {
    const aliases = parseDepositNameAliases(worker?.depositNameAliases);
    if (aliases.some((alias) => normalizeWorkerName(alias) === target)) return worker;
    if (aliases.some((alias) => normalizeWorkerListMatchKey(alias) === targetKey)) return worker;
  }

  return null;
}

export function resolveWorkerPhone(workers, participantName) {
  const worker = findWorkerByListName(workers, participantName);
  if (!worker) return null;
  const phone = normalizePhone(worker.phone);
  return phone || null;
}

export function resolveScScheduleParticipants(workers, participantNames = []) {
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
