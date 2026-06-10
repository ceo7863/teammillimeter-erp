function splitManagerNames(manager) {
  return String(manager || "")
    .split(/[,??/|;|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizePhoneDisplay(phone) {
  const value = String(phone || "").trim();
  return value && value !== "-" ? value : "";
}

export function normalizeNotifyPhone(phone) {
  return normalizePhoneDisplay(phone).replace(/\D/g, "");
}

function ensurePrimaryContact(contacts) {
  if (!contacts.length) return contacts;
  if (contacts.some((row) => row.isPrimary)) return contacts;
  return contacts.map((row, index) => ({ ...row, isPrimary: index === 0 }));
}

export function normalizeClientContacts(client) {
  if (!client) return [];

  const rawContacts = Array.isArray(client.contacts) ? client.contacts : [];
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

export function syncClientLegacyContactFields(contacts = []) {
  const rows = contacts.filter((row) => row.name || row.phone);
  const primary = rows.find((row) => row.isPrimary) || rows[0];
  return {
    contacts: rows,
    manager: rows.map((row) => row.name).filter(Boolean).join(","),
    phone: primary?.phone || rows.find((row) => row.phone)?.phone || "",
  };
}

export function findClientForSchedule(clients, schedule) {
  const list = Array.isArray(clients) ? clients : [];
  const clientId = schedule?.clientId;
  const nameHint = String(schedule?.clientName || schedule?.projectName || "").trim();
  let match = list.find((row) => String(row?.id ?? "") === String(clientId ?? ""));
  if (!match && nameHint) {
    match = list.find((row) => String(row?.name || "").trim() === nameHint);
  }
  return match || null;
}

export function resolveClientManagerName(clients, schedule) {
  const match = findClientForSchedule(clients, schedule);
  if (!match) return "";
  const contacts = normalizeClientContacts(match);
  const primary =
    contacts.find((row) => row.isPrimary && row.name) ||
    contacts.find((row) => row.name) ||
    contacts[0];
  if (primary?.name) return primary.name;
  return String(match.manager || match.ceoName || "").trim();
}

export function resolveClientContacts(clients, schedule, options = {}) {
  const match = findClientForSchedule(clients, schedule);
  const clientName = match
    ? String(match.name || "").trim()
    : String(schedule?.clientName || schedule?.projectName || "").trim();
  const contacts = normalizeClientContacts(match);
  const siteManager = String(schedule?.siteManagerName || "").trim();
  const excludeSiteManager = options.excludeSiteManager === true;

  if (contacts.length) {
    return contacts.map((contact) => ({
      clientName,
      name: contact.name,
      phone: normalizeNotifyPhone(contact.phone),
      phoneDisplay: contact.phone,
      contactId: contact.id,
      isPrimary: Boolean(contact.isPrimary),
    }));
  }

  if (siteManager && !excludeSiteManager) {
    return [
      {
        clientName,
        name: siteManager,
        phone: "",
        phoneDisplay: "",
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
          phone: "",
          phoneDisplay: "",
          contactId: "client",
          isPrimary: true,
        },
      ]
    : [];
}

export function resolveClientContact(clients, schedule, options = {}) {
  const rows = resolveClientContacts(clients, schedule, options);
  const primary = rows.find((row) => row.isPrimary) || rows.find((row) => row.phone) || rows[0];
  return {
    clientName: primary?.clientName || "",
    name: primary?.name || "",
    phone: primary?.phone || "",
    phoneDisplay: primary?.phoneDisplay || "",
  };
}
