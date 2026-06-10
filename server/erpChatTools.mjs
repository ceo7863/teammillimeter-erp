import { getErpState } from "./db.mjs";
import { findWorkerByListName } from "./workerPhoneMatch.mjs";

const KOREA_TZ = "Asia/Seoul";

export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KOREA_TZ }).format(new Date());
}

export function addDaysISO(dateStr, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!match) return dateStr;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatKRW(value) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}

function normalizeMatchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\(\uC8FC\)|\uC8FC\uC2DD\uD68C\uC0AC|\u3231|\(\uC720\)|\uC720\uD55C\uD68C\uC0AC|\uD68C\uC0AC/g, "");
}

function parseAliasList(raw) {
  return String(raw || "")
    .split(/[,;\n\r|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitManagerNames(manager) {
  return String(manager || "")
    .split(/[,;/|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function nameMatchesQuery(candidate, queryKey) {
  const key = normalizeMatchKey(candidate);
  if (!key || !queryKey) return false;
  return key === queryKey || key.includes(queryKey) || queryKey.includes(key);
}

export function resolveDateFromInput(input) {
  const raw = String(input || "").trim();
  const today = todayISO();
  if (!raw || raw === "\uC624\uB298" || raw.toLowerCase() === "today") return today;
  if (raw === "\uB0B4\uC77C" || raw.toLowerCase() === "tomorrow") return addDaysISO(today, 1);
  if (raw === "\uBAA8\uB798") return addDaysISO(today, 2);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return today;
}

function getUnpaid(sale) {
  const amount = Number(sale.amount) || 0;
  const paid = Number(sale.paid ?? sale.basePaid ?? 0) || 0;
  return Math.max(amount - paid, 0);
}

function findClientsByQuery(clients, query) {
  const queryKey = normalizeMatchKey(query);
  if (!queryKey) return [];

  const matches = [];
  for (const client of clients) {
    const labels = [
      client.name,
      client.taxInvoiceCorpName,
      client.manager,
      ...parseAliasList(client.depositNameAliases),
    ].filter(Boolean);

    if (labels.some((label) => nameMatchesQuery(label, queryKey))) {
      matches.push(client);
      continue;
    }

    const contacts = Array.isArray(client.contacts) ? client.contacts : [];
    if (contacts.some((row) => nameMatchesQuery(row?.name, queryKey))) {
      matches.push(client);
    }
  }

  const seen = new Set();
  return matches.filter((client) => {
    const id = String(client.id ?? client.name);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function resolveClientContacts(client) {
  const contacts = Array.isArray(client.contacts) ? client.contacts : [];
  if (contacts.length) {
    return contacts
      .map((row, index) => ({
        name: String(row?.name || "").trim(),
        phone: String(row?.phone || "").trim(),
        isPrimary: Boolean(row?.isPrimary) || index === 0,
      }))
      .filter((row) => row.name || row.phone);
  }

  const phone = String(client.phone || "").trim();
  const managers = splitManagerNames(client.manager);
  if (managers.length) {
    return managers.map((name, index) => ({
      name,
      phone: index === 0 ? phone : "",
      isPrimary: index === 0,
    }));
  }

  if (phone) {
    return [{ name: String(client.manager || client.name || "").trim(), phone, isPrimary: true }];
  }
  return [];
}

export function canUserViewContactPhones(user) {
  if (user?.role === "admin") return true;
  const pages = Array.isArray(user?.allowedPages) ? user.allowedPages : null;
  if (!pages) return true;
  return pages.includes("basicInfo") || pages.includes("clients");
}

export function toolGetClientUnpaid({ clientName }) {
  const state = getErpState(["sales", "clients"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const query = String(clientName || "").trim();
  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, query);
  const clientNames = matchedClients.length
    ? matchedClients.map((row) => String(row.name || "").trim()).filter(Boolean)
    : [query];

  const nameKeys = new Set(clientNames.map((name) => normalizeMatchKey(name)));
  matchedClients.forEach((client) => {
    parseAliasList(client.depositNameAliases).forEach((alias) => nameKeys.add(normalizeMatchKey(alias)));
    if (client.taxInvoiceCorpName) nameKeys.add(normalizeMatchKey(client.taxInvoiceCorpName));
  });
  nameKeys.add(normalizeMatchKey(query));

  const rows = sales.filter((sale) => {
    const saleClient = String(sale.client || "").trim();
    if (!saleClient) return false;
    const saleKey = normalizeMatchKey(saleClient);
    if (nameKeys.has(saleKey)) return true;
    return [...nameKeys].some((key) => saleKey.includes(key) || key.includes(saleKey));
  });

  const unpaidRows = rows
    .map((sale) => ({
      id: sale.id,
      date: String(sale.date || "").slice(0, 10),
      client: String(sale.client || ""),
      site: String(sale.site || ""),
      amount: Number(sale.amount) || 0,
      paid: Number(sale.paid ?? sale.basePaid ?? 0) || 0,
      unpaid: getUnpaid(sale),
    }))
    .filter((row) => row.unpaid > 0);

  const totalUnpaid = unpaidRows.reduce((sum, row) => sum + row.unpaid, 0);
  const resolvedName = matchedClients[0]?.name || query;

  return {
    ok: true,
    clientName: resolvedName,
    matchedClientCount: matchedClients.length,
    unpaidCount: unpaidRows.length,
    totalUnpaid,
    totalUnpaidFormatted: formatKRW(totalUnpaid),
    rows: unpaidRows.slice(0, 20),
  };
}

export function toolGetScheduleCount({ date }) {
  const state = getErpState(["sales", "settings"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const scSchedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
  const dateKey = resolveDateFromInput(date);

  const salesRows = sales.filter((row) => String(row.date || "").slice(0, 10) === dateKey);
  const scRows = scSchedules.filter((row) => String(row.workDate || "").slice(0, 10) === dateKey);

  return {
    ok: true,
    date: dateKey,
    salesCount: salesRows.length,
    scScheduleCount: scRows.length,
    totalCount: salesRows.length + scRows.length,
    salesPreview: salesRows.slice(0, 10).map((row) => ({
      client: String(row.client || ""),
      site: String(row.site || ""),
      amount: Number(row.amount) || 0,
    })),
    scPreview: scRows.slice(0, 10).map((row) => ({
      projectName: String(row.projectName || row.clientName || ""),
      siteName: String(row.siteName || ""),
      participantCount: Array.isArray(row.participantNames) ? row.participantNames.length : 0,
    })),
  };
}

export function toolLookupContact({ name }, user) {
  const canViewPhone = canUserViewContactPhones(user);
  const state = getErpState(["clients", "workers"]);
  const data = state.data || {};
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const query = String(name || "").trim();
  if (!query) {
    return { ok: false, error: "\uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const queryKey = normalizeMatchKey(query);
  const results = [];

  for (const client of clients) {
    const contacts = resolveClientContacts(client);
    for (const contact of contacts) {
      if (nameMatchesQuery(contact.name, queryKey) || nameMatchesQuery(client.manager, queryKey)) {
        results.push({
          kind: "client_contact",
          clientName: String(client.name || ""),
          name: contact.name || String(client.manager || ""),
          phone: canViewPhone ? contact.phone || String(client.phone || "") : null,
          phoneRestricted: !canViewPhone,
          isPrimary: Boolean(contact.isPrimary),
        });
      }
    }
    if (nameMatchesQuery(client.name, queryKey) || nameMatchesQuery(client.manager, queryKey)) {
      results.push({
        kind: "client",
        clientName: String(client.name || ""),
        name: String(client.manager || client.name || ""),
        phone: canViewPhone ? String(client.phone || "") : null,
        phoneRestricted: !canViewPhone,
        manager: String(client.manager || ""),
      });
    }
  }

  const worker = findWorkerByListName(workers, query);
  if (worker) {
    results.push({
      kind: "worker",
      name: String(worker.name || ""),
      phone: canViewPhone ? String(worker.phone || "") : null,
      phoneRestricted: !canViewPhone,
      category: String(worker.category || ""),
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const row of results) {
    const key = `${row.kind}:${row.clientName || ""}:${row.name}:${row.phone || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return {
    ok: true,
    query,
    matchCount: deduped.length,
    canViewPhone,
    matches: deduped.slice(0, 15),
  };
}

export function toolSearchClient({ query, limit = 10 }) {
  const state = getErpState(["clients"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const matches = findClientsByQuery(clients, query).slice(0, Math.min(Number(limit) || 10, 20));
  return {
    ok: true,
    query,
    count: matches.length,
    clients: matches.map((client) => ({
      id: client.id,
      name: String(client.name || ""),
      manager: String(client.manager || ""),
      businessNo: String(client.businessNo || ""),
    })),
  };
}

export function toolGetWorkerInfo({ name }, user) {
  const canViewPhone = canUserViewContactPhones(user);
  const state = getErpState(["workers"]);
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const worker = findWorkerByListName(workers, String(name || "").trim());
  if (!worker) {
    return { ok: false, error: "\uC2DC\uACF5\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  return {
    ok: true,
    name: String(worker.name || ""),
    category: String(worker.category || ""),
    grade: String(worker.grade || ""),
    phone: canViewPhone ? String(worker.phone || "") : null,
    phoneRestricted: !canViewPhone,
    isActive: worker.isActive !== false,
  };
}

export const ERP_CHAT_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_client_unpaid",
      description: "\uAC70\uB798\uCC98 \uD604\uC7AC \uBBF8\uC218(\uBBF8\uC218\uAE08) \uD569\uACC4\uC640 \uBBF8\uC218 \uB9E4\uCD9C \uBAA9\uB85D\uC744 \uC870\uD68C\uD569\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 \uB610\uB294 \uBCC4\uCE59 (\uC608: \uC778\uB514\uD37C, \uD0A4\uCE9C\uC81C\uB2C8\uC2A4)" },
        },
        required: ["clientName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_schedule_count",
      description: "\uD2B9\uC815 \uB0A0\uC9DC(\uC624\uB298/\uB0B4\uC77C/\uBAA8\uB798 \uB610\uB294 YYYY-MM-DD)\uC758 \uB9E4\uCD9C \uC77C\uC815 \uAC74\uC218\uC640 SC \uC77C\uC815 \uAC74\uC218\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "\uC624\uB298, \uB0B4\uC77C, \uBAA8\uB798 \uB610\uB294 YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_contact",
      description: "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790, \uAC70\uB798\uCC98, \uC2DC\uACF5\uC790 \uC774\uB984\uC73C\uB85C \uC804\uD654\uBC88\uD638\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "\uC778\uBAA9 \uB610\uB294 \uB2F4\uB2F9\uC790 \uC774\uB984" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_client",
      description: "\uAC70\uB798\uCC98 \uBAA9\uB85D\uC744 \uC774\uB984 \uB610\uB294 \uBCC4\uCE59\uC73C\uB85C \uAC80\uC0C9\uD569\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_worker_info",
      description: "\uC2DC\uACF5\uC790 \uAE30\uBCF8 \uC815\uBCF4(\uC774\uB984, \uAD6C\uBD84, \uC804\uD654\uBC88\uD638)\uB97C \uC870\uD68C\uD569\uB2C8\uB4DC\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
];

export function executeErpChatTool(name, args, user) {
  switch (name) {
    case "get_client_unpaid":
      return toolGetClientUnpaid(args || {});
    case "get_schedule_count":
      return toolGetScheduleCount(args || {});
    case "lookup_contact":
      return toolLookupContact(args || {}, user);
    case "search_client":
      return toolSearchClient(args || {});
    case "get_worker_info":
      return toolGetWorkerInfo(args || {}, user);
    default:
      return { ok: false, error: `\uC54C \uC218 \uC5C6\uB294 \uB3C4\uAD6C: ${name}` };
  }
}

export function tryRuleBasedChat(message, user) {
  const text = String(message || "").trim();
  if (!text) return null;

  const kwUnpaid = "\uBBF8\uC218";
  const kwTomorrow = "\uB0B4\uC77C";
  const kwToday = "\uC624\uB298";
  const kwDayAfter = "\uBAA8\uB798";
  const kwSchedule = "\uC77C\uC815";
  const kwSc = "\uC2A4\uCF00\uC904";
  const kwPhone = "\uC804\uD654";
  const kwContact = "\uC5F0\uB77D\uCC98";
  const kwNumber = "\uBC88\uD638";

  if (text.includes(kwUnpaid)) {
    let clientName = "";
    const possessive = text.match(/^(.+?)\uC758/);
    if (possessive) clientName = possessive[1].trim();
    if (!clientName) {
      clientName = text
        .replace(new RegExp(`${kwUnpaid}(\uAE08)?`, "g"), "")
        .replace(/\uD604\uC7AC/g, "")
        .replace(/(?:\uB97C|\uC740|\uB294|\uC918|\uC54C\uB824|\uC870\uD68C|\uD655\uC778|\uC5BC\uB9C8|\?)/g, "")
        .replace(/\uC758$/g, "")
        .trim();
    }
    if (clientName) {
      return formatUnpaidAnswer(toolGetClientUnpaid({ clientName }));
    }
  }

  if (text.includes(kwSchedule) || text.includes(kwSc)) {
    let date = kwToday;
    if (text.includes(kwTomorrow)) date = kwTomorrow;
    else if (text.includes(kwDayAfter)) date = kwDayAfter;
    else {
      const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) date = dateMatch[0];
    }
    return formatScheduleAnswer(toolGetScheduleCount({ date }));
  }

  if (text.includes(kwPhone) || text.includes(kwContact) || text.includes(kwNumber)) {
    let name = "";
    const possessive = text.match(/^(.+?)\uC758/);
    if (possessive) name = possessive[1].trim();
    if (!name) {
      name = text
        .replace(/\uC804\uD654\uBC88\uD638|\uC5F0\uB77D\uCC98|\uD734\uB300\uD3F0|\uBC88\uD638/g, "")
        .replace(/(?:\uB294|\uC740|\uC918|\uC54C\uB824|\uC870\uD68C|\uD655\uC778|\?)/g, "")
        .replace(/\uC758$/g, "")
        .trim();
    }
    if (name) {
      return formatContactAnswer(toolLookupContact({ name }, user));
    }
  }

  return null;
}

export function formatUnpaidAnswer(data) {
  if (!data.ok) return data.error || "\uBBF8\uC218 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (data.unpaidCount === 0) {
    return `${data.clientName} \uAC70\uB798\uCC98\uC758 \uD604\uC7AC \uBBF8\uC218 \uB9E4\uCD9C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  const lines = [
    `${data.clientName} \uD604\uC7AC \uBBF8\uC218 \uD569\uACC4: ${data.totalUnpaidFormatted}\uC6D0 (${data.unpaidCount}\uAC74)`,
  ];
  data.rows.slice(0, 5).forEach((row) => {
    lines.push(`- ${row.date} ${row.site || "-"}: ${formatKRW(row.unpaid)}\uC6D0`);
  });
  if (data.unpaidCount > 5) lines.push(`\u2026 \uC678 ${data.unpaidCount - 5}\uAC74`);
  return lines.join("\n");
}

export function formatScheduleAnswer(data) {
  if (!data.ok) return "\uC77C\uC815 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  return `${data.date} \uC77C\uC815: \uB9E4\uCD9C ${data.salesCount}\uAC74, SC \uC77C\uC815 ${data.scScheduleCount}\uAC74 (\uD569\uACC4 ${data.totalCount}\uAC74)`;
}

export function formatContactAnswer(data) {
  if (!data.ok) return data.error || "\uC5F0\uB77D\uCC98 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (!data.matchCount) return `"${data.query}"\uC744(\uB97C) \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  if (data.matches.some((row) => row.phoneRestricted)) {
    return "\uC804\uD654\uBC88\uD638 \uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790 \uB610\uB294 \uAE30\uBCF8\uC815\uBCF4 \uBA54\uB274 \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
  }
  return data.matches
    .slice(0, 5)
    .map((row) => {
      if (row.kind === "worker") return `\uC2DC\uACF5\uC790 ${row.name}: ${row.phone || "-"}`;
      if (row.kind === "client_contact") return `\uAC70\uB798\uCC98 ${row.clientName} \uB2F4\uB2F9 ${row.name}: ${row.phone || "-"}`;
      return `\uAC70\uB798\uCC98 ${row.clientName} (${row.name}): ${row.phone || "-"}`;
    })
    .join("\n");
}
