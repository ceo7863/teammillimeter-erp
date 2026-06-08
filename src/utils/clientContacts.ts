import type { ClientMasterLike } from "@/utils/clientMaster";
import type { ScSchedule } from "@/utils/scSchedules";

export type ClientContact = {
  id: string;
  name: string;
  phone: string;
  isPrimary?: boolean;
};

export type ClientContactInput = {
  id?: string;
  name?: string;
  phone?: string;
  isPrimary?: boolean;
};

export type ScScheduleClientContactRow = {
  clientName: string;
  name: string;
  phoneDisplay: string;
  phoneNormalized: string;
  contactId: string;
  isPrimary: boolean;
};

export function newClientContactId() {
  return `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitManagerNames(manager: string) {
  return String(manager || "")
    .split(/[,??/|;|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizePhoneDisplay(phone: string) {
  const value = String(phone || "").trim();
  return value && value !== "-" ? value : "";
}

export function normalizeClientContactPhoneDigits(phone: string) {
  return normalizePhoneDisplay(phone).replace(/\D/g, "");
}

function ensurePrimaryContact(contacts: ClientContact[]) {
  if (!contacts.length) return contacts;
  if (contacts.some((row) => row.isPrimary)) return contacts;
  return contacts.map((row, index) => ({ ...row, isPrimary: index === 0 }));
}

export function normalizeClientContacts(client: ClientMasterLike | null | undefined): ClientContact[] {
  if (!client) return [];

  const rawContacts = Array.isArray((client as ClientMasterLike & { contacts?: ClientContactInput[] }).contacts)
    ? (client as ClientMasterLike & { contacts?: ClientContactInput[] }).contacts || []
    : [];

  const fromArray = rawContacts
    .map((row, index) => ({
      id: String(row?.id || "").trim() || `legacy-${index + 1}`,
      name: String(row?.name || "").trim(),
      phone: normalizePhoneDisplay(String(row?.phone || "")),
      isPrimary: Boolean(row?.isPrimary),
    }))
    .filter((row) => row.name || row.phone);

  if (fromArray.length) {
    return ensurePrimaryContact(fromArray);
  }

  const manager = String(client.manager || "").trim();
  const phone = normalizePhoneDisplay(String(client.phone || ""));
  const names = splitManagerNames(manager);

  if (names.length > 1) {
    return names.map((name, index) => ({
      id: `legacy-${index + 1}`,
      name,
      phone: index === 0 ? phone : "",
      isPrimary: index === 0,
    }));
  }

  if (manager || phone) {
    return [
      {
        id: "legacy-1",
        name: manager || String(client.ceoName || "").trim(),
        phone,
        isPrimary: true,
      },
    ];
  }

  return [];
}

export function normalizeClientContactInput(rows: ClientContactInput[] = []): ClientContact[] {
  const normalized = rows
    .map((row, index) => ({
      id: String(row?.id || "").trim() || newClientContactId(),
      name: String(row?.name || "").trim(),
      phone: normalizePhoneDisplay(String(row?.phone || "")),
      isPrimary: Boolean(row?.isPrimary),
    }))
    .filter((row) => row.name || row.phone);

  if (!normalized.length) return [];
  return ensurePrimaryContact(normalized);
}

export function syncClientLegacyContactFields(contacts: ClientContact[]) {
  const rows = contacts.filter((row) => row.name || row.phone);
  const primary = rows.find((row) => row.isPrimary) || rows[0];
  return {
    contacts: rows,
    manager: rows.map((row) => row.name).filter(Boolean).join(","),
    phone: primary?.phone || rows.find((row) => row.phone)?.phone || "",
  };
}

export function clientContactsToFormRows(client: ClientMasterLike | null | undefined): ClientContact[] {
  const contacts = normalizeClientContacts(client);
  if (contacts.length) return contacts;
  return [{ id: newClientContactId(), name: "", phone: "", isPrimary: true }];
}

function findClientForScSchedule(
  clients: ClientMasterLike[],
  schedule: Pick<ScSchedule, "clientId" | "clientName" | "projectName">,
) {
  const list = Array.isArray(clients) ? clients : [];
  const clientId = schedule?.clientId;
  const nameHint = String(schedule?.clientName || schedule?.projectName || "").trim();
  let match = list.find((row) => String(row?.id ?? "") === String(clientId ?? ""));
  if (!match && nameHint) {
    match = list.find((row) => String(row?.name || "").trim() === nameHint);
  }
  return match || null;
}

export function listScScheduleClientContacts(
  clients: ClientMasterLike[] = [],
  schedule: Pick<ScSchedule, "clientId" | "clientName" | "projectName" | "siteManagerName">,
): ScScheduleClientContactRow[] {
  const match = findClientForScSchedule(clients, schedule);
  const clientName = match
    ? String(match.name || "").trim()
    : String(schedule?.clientName || schedule?.projectName || "").trim();
  const contacts = normalizeClientContacts(match);
  const siteManager = String(schedule?.siteManagerName || "").trim();

  if (contacts.length) {
    return contacts.map((contact) => ({
      clientName,
      name: contact.name,
      phoneDisplay: contact.phone,
      phoneNormalized: normalizeClientContactPhoneDigits(contact.phone),
      contactId: contact.id,
      isPrimary: Boolean(contact.isPrimary),
    }));
  }

  if (siteManager) {
    return [
      {
        clientName,
        name: siteManager,
        phoneDisplay: "",
        phoneNormalized: "",
        contactId: "site-manager",
        isPrimary: true,
      },
    ];
  }

  return clientName
    ? [
        {
          clientName,
          name: "",
          phoneDisplay: "",
          phoneNormalized: "",
          contactId: "client",
          isPrimary: true,
        },
      ]
    : [];
}

/** @deprecated use listScScheduleClientContacts */
export function resolveScScheduleClientContact(
  clients: ClientMasterLike[] = [],
  schedule: Pick<ScSchedule, "clientId" | "clientName" | "projectName" | "siteManagerName">,
) {
  const rows = listScScheduleClientContacts(clients, schedule);
  const primary = rows.find((row) => row.isPrimary) || rows.find((row) => row.phoneNormalized) || rows[0];
  return {
    clientName: primary?.clientName || "",
    managerName: primary?.name || "",
    phoneDisplay: primary?.phoneDisplay || "",
    phoneNormalized: primary?.phoneNormalized || "",
  };
}
