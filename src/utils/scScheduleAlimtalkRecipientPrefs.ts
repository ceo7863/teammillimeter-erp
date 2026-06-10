import { normalizeClientContactPhoneDigits } from "@/utils/clientContacts";

const STORAGE_KEY = "erp.scScheduleAlimtalkRecipientPrefs.v1";

export type ScScheduleAlimtalkRecipientPrefs = {
  clients: Record<string, Record<string, boolean>>;
  workers: Record<string, boolean>;
};

function emptyPrefs(): ScScheduleAlimtalkRecipientPrefs {
  return { clients: {}, workers: {} };
}

function readPrefs(): ScScheduleAlimtalkRecipientPrefs {
  if (typeof window === "undefined") return emptyPrefs();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPrefs();
    const parsed = JSON.parse(raw) as Partial<ScScheduleAlimtalkRecipientPrefs>;
    return {
      clients: parsed.clients && typeof parsed.clients === "object" ? parsed.clients : {},
      workers: parsed.workers && typeof parsed.workers === "object" ? parsed.workers : {},
    };
  } catch {
    return emptyPrefs();
  }
}

function writePrefs(prefs: ScScheduleAlimtalkRecipientPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

export function normalizeScScheduleAlimtalkClientKey(
  clientId?: string | number | null,
  clientName?: string | null,
) {
  const name = String(clientName ?? "").trim();
  if (name) return `name:${name}`;
  const id = String(clientId ?? "").trim();
  if (id) return `id:${id}`;
  return "";
}

export function scScheduleAlimtalkContactPrefKey(
  contactId?: string,
  phone?: string | null,
  participantName?: string,
) {
  const phoneDigits = normalizeClientContactPhoneDigits(String(phone || ""));
  if (phoneDigits) return `p:${phoneDigits}`;
  const id = String(contactId ?? "").trim();
  if (id) return `c:${id}`;
  const name = String(participantName ?? "").trim();
  return name ? `n:${name}` : "unknown";
}

export function scScheduleAlimtalkWorkerPrefKey(phone: string | null | undefined, participantName: string) {
  const phoneDigits = normalizeClientContactPhoneDigits(String(phone || ""));
  if (phoneDigits) return `p:${phoneDigits}`;
  const name = String(participantName ?? "").trim();
  return name ? `n:${name}` : "unknown";
}

export function hasScScheduleAlimtalkClientContactPrefs(clientKey: string) {
  if (!clientKey) return false;
  const prefs = readPrefs();
  const clientPrefs = prefs.clients[clientKey];
  return Boolean(clientPrefs && Object.keys(clientPrefs).length > 0);
}

export function isScScheduleAlimtalkClientContactInPool(clientKey: string, contactKey: string) {
  if (!clientKey || !contactKey) return true;
  if (!hasScScheduleAlimtalkClientContactPrefs(clientKey)) return true;
  return resolveScScheduleAlimtalkClientContactSelected(clientKey, contactKey, false);
}

export function resolveScScheduleAlimtalkClientContactSelected(
  clientKey: string,
  contactKey: string,
  defaultSelected = true,
) {
  if (!clientKey || !contactKey) return defaultSelected;
  const prefs = readPrefs();
  const clientPrefs = prefs.clients[clientKey];
  if (!clientPrefs || !(contactKey in clientPrefs)) return defaultSelected;
  return clientPrefs[contactKey];
}

export function resolveScScheduleAlimtalkWorkerSelected(
  workerKey: string,
  defaultSelected = true,
) {
  if (!workerKey) return defaultSelected;
  const prefs = readPrefs();
  if (!(workerKey in prefs.workers)) return defaultSelected;
  return prefs.workers[workerKey];
}

export function saveScScheduleAlimtalkClientContactPref(
  clientKey: string,
  contactKey: string,
  selected: boolean,
) {
  if (!clientKey || !contactKey) return;
  const prefs = readPrefs();
  const clientPrefs = { ...(prefs.clients[clientKey] || {}), [contactKey]: selected };
  writePrefs({ ...prefs, clients: { ...prefs.clients, [clientKey]: clientPrefs } });
}

export function saveScScheduleAlimtalkClientContactPrefs(
  clientKey: string,
  entries: Array<{ contactKey: string; selected: boolean }>,
) {
  if (!clientKey || !entries.length) return;
  const prefs = readPrefs();
  const clientPrefs = { ...(prefs.clients[clientKey] || {}) };
  for (const entry of entries) {
    if (!entry.contactKey) continue;
    clientPrefs[entry.contactKey] = entry.selected;
  }
  writePrefs({ ...prefs, clients: { ...prefs.clients, [clientKey]: clientPrefs } });
}

export function saveScScheduleAlimtalkWorkerPref(workerKey: string, selected: boolean) {
  if (!workerKey) return;
  const prefs = readPrefs();
  writePrefs({ ...prefs, workers: { ...prefs.workers, [workerKey]: selected } });
}

export function buildScScheduleAlimtalkClientContactSelection(
  clientKey: string,
  contacts: Array<{
    contactId: string;
    phoneNormalized: string;
    name?: string;
  }>,
) {
  const next: Record<string, boolean> = {};
  for (const row of contacts) {
    if (!row.phoneNormalized) continue;
    const uiKey = `${row.contactId}:${row.phoneNormalized}`;
    const prefKey = scScheduleAlimtalkContactPrefKey(row.contactId, row.phoneNormalized, row.name);
    next[uiKey] = resolveScScheduleAlimtalkClientContactSelected(clientKey, prefKey, true);
  }
  return next;
}
