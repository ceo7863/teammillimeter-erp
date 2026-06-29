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

function parseParticipantMoney(value) {
  if (value == null || value === "") return null;
  const amount = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function extractParticipantExtras(participant) {
  if (!participant || typeof participant !== "object") {
    return { meal: null, expense: null };
  }
  const meal = parseParticipantMoney(participant.meal);
  const expense = parseParticipantMoney(participant.expense);
  return {
    meal,
    expense,
  };
}

/** Stored schedule participants (CalWalk export) merged with ERP worker master. */
export function resolveScScheduleParticipantDetails(workers, row = {}) {
  const participantNames = Array.isArray(row.participantNames) ? row.participantNames : [];
  const resolved = resolveScScheduleParticipants(workers, participantNames);
  const stored = Array.isArray(row.participants) ? row.participants : [];
  if (!stored.length) return resolved;

  return stored.map((participant, index) => {
    const key = String(participant?.participantName || participant?.name || "").trim();
    const fallback =
      resolved.find((rowItem) => rowItem.participantName === key || rowItem.name === key) ||
      resolved[index];
    const extras = extractParticipantExtras(participant);
    return {
      participantName: key || fallback?.participantName || "",
      name: String(participant?.name || fallback?.name || key).trim(),
      phone: String(participant?.phone || fallback?.phone || "").trim(),
      vehicleNo: String(participant?.vehicleNo || fallback?.vehicleNo || "").trim(),
      ...(extras.meal != null ? { meal: extras.meal } : {}),
      ...(extras.expense != null ? { expense: extras.expense } : {}),
      ...(participant?.workLog ? { workLog: participant.workLog } : {}),
    };
  });
}
