import { getErpState } from "../server/db.mjs";

const clients = (getErpState().data || {}).clients || [];
const managerOnly = clients.filter((c) => {
  const hasManager = String(c.manager || "").trim();
  const hasContacts = Array.isArray(c.contacts) && c.contacts.length > 0;
  return hasManager && !hasContacts;
});
const contactsOnly = clients.filter((c) => {
  const hasManager = String(c.manager || "").trim();
  const hasContacts = Array.isArray(c.contacts) && c.contacts.length > 0;
  return hasContacts && !hasManager;
});
const neither = clients.filter((c) => {
  const hasManager = String(c.manager || "").trim();
  const hasContacts = Array.isArray(c.contacts) && c.contacts.length > 0;
  return !hasManager && !hasContacts;
});

console.log(
  JSON.stringify(
    {
      total: clients.length,
      managerOnly: managerOnly.length,
      contactsOnly: contactsOnly.length,
      neither: neither.length,
      managerOnlySample: managerOnly.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name,
        manager: c.manager,
        phone: c.phone,
      })),
      neitherSample: neither.slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
    },
    null,
    2,
  ),
);
