import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();
const MARKER = "\uD648\uB8E8";

const clients = (data.clients || []).filter(
  (c) => String(c.name || "").includes(MARKER) || String(c.depositNameAliases || "").includes(MARKER),
);
const deposits = (data.bankTransactions || [])
  .filter((t) => {
    if (t.deposit <= 0) return false;
    const text = [t.description, t.counterpartyName, t.linkedSubject, t.memo].join(" ");
    return text.includes(MARKER);
  })
  .slice(-8);

console.log(
  JSON.stringify(
    {
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        nameCodepoints: [...String(c.name || "")].map((ch) => ch.codePointAt(0)),
        aliases: c.depositNameAliases,
      })),
      deposits: deposits.map((t) => ({
        id: t.id,
        at: String(t.transactionAt).slice(0, 10),
        deposit: t.deposit,
        description: t.description,
        counterpartyName: t.counterpartyName,
        linkedSubject: t.linkedSubject,
        linkedSubjectCodepoints: [...String(t.linkedSubject || "")].map((ch) => ch.codePointAt(0)),
      })),
      salesClientNames: [
        ...new Set(
          (data.sales || [])
            .filter((s) => String(s.client || "").includes(MARKER))
            .map((s) => s.client),
        ),
      ],
    },
    null,
    2,
  ),
);
