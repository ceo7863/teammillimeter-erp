import { getErpState } from "../server/db.mjs";
import { buildScWeeklyBriefingPreview } from "../server/scWeeklyBriefingNotify.mjs";
import { resolveClientContacts, findClientForSchedule } from "../server/clientContacts.mjs";

const data = getErpState().data || {};
const preview = buildScWeeklyBriefingPreview(data, {});

console.log(
  JSON.stringify(
    {
      weekLabel: preview.weekLabel,
      siteCount: preview.siteCount,
      notifyCount: preview.notifyCount,
      missingPhoneCount: preview.missingPhoneCount,
      groups: preview.groups.map((g) => {
        const match = findClientForSchedule(data.clients || [], g.sampleSchedule || { clientId: g.clientId, clientName: g.clientName, projectName: g.siteName });
        return {
          clientName: g.clientName,
          siteName: g.siteName,
          clientId: g.clientId,
          matchedClient: match ? { id: match.id, name: match.name, phone: match.phone ? "yes" : "no", contacts: (match.contacts || []).length } : null,
          notify: g.notifyCount,
          recipients: g.recipientRows.map((r) => ({ name: r.participantName, phone: r.phone || null })),
        };
      }),
    },
    null,
    2,
  ),
);
