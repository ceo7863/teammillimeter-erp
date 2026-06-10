import { getErpState } from "../server/db.mjs";

const data = getErpState().data || {};
const clients = Array.isArray(data.clients) ? data.clients : [];
const withContacts = clients.filter((c) => Array.isArray(c.contacts) && c.contacts.length > 0);
const withManager = clients.filter((c) => String(c.manager || "").trim());
console.log("clients", clients.length, "withContacts", withContacts.length, "withManager", withManager.length);
console.log(
  "sampleContacts",
  withContacts.slice(0, 5).map((c) => ({
    name: c.name,
    manager: c.manager,
    contacts: (c.contacts || []).map((x) => ({ name: x.name, phone: x.phone ? "yes" : "no" })),
  })),
);

const schedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
const withSiteManager = schedules.filter((s) => s.siteManagerName);
const withParticipants = schedules.filter((s) => (s.participantNames || []).length > 0);
console.log("schedules", schedules.length, "siteManager", withSiteManager.length, "participants", withParticipants.length);
console.log(
  "sampleSchedules",
  schedules.slice(0, 3).map((s) => ({
    client: s.clientName,
    site: s.projectName,
    siteManager: s.siteManagerName || "",
    participants: s.participantNames || [],
  })),
);
