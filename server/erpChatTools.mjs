import { getErpState } from "./db.mjs";
import { findWorkerByListName } from "./workerPhoneMatch.mjs";
import { weekRangeISO, filterSchedulesForWeek } from "./scWeeklyBriefingNotify.mjs";

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

function normalizePersonMatchKey(value) {
  return normalizeMatchKey(value).replace(/(\uB300\uD45C\uB2F9|\uB300\uD45C|\uC774\uC0AC|\uACFC\uC7A5|\uD300\uC7A5|\uC2E4\uC7A5|\uCC28\uC7A5|\uBD80\uC7A5|\uC0AC\uC7A5|\uB2F4)+/g, "");
}

function nameMatchesQuery(candidate, queryKey) {
  const key = normalizePersonMatchKey(candidate);
  const query = normalizePersonMatchKey(queryKey);
  if (!key || !query) return false;
  return key === query || key.includes(query) || query.includes(key);
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

export function resolveDateRangeFromInput(input) {
  const raw = String(input || "").trim();
  const today = todayISO();

  if (raw.includes("\uC774\uBC88\uC8FC") || raw.includes("\uAE08\uC8FC")) {
    const range = weekRangeISO(today);
    return { ...range, label: `\uC774\uBC88 \uC8FC (${range.startDate}~${range.endDate})` };
  }
  if (raw.includes("\uB2E4\uC74C\uC8FC")) {
    const { endDate } = weekRangeISO(today);
    const range = weekRangeISO(addDaysISO(endDate, 1));
    return { ...range, label: `\uB2E4\uC74C \uC8FC (${range.startDate}~${range.endDate})` };
  }
  if (raw.includes("\uC800\uBC88\uC8FC") || raw.includes("\uC9C0\uB09C\uC8FC")) {
    const { startDate } = weekRangeISO(today);
    const range = weekRangeISO(addDaysISO(startDate, -1));
    return { ...range, label: `\uC9C0\uB09C \uC8FC (${range.startDate}~${range.endDate})` };
  }

  const single = resolveDateFromInput(raw);
  return { startDate: single, endDate: single, label: single };
}

function buildClientFilterKeys(clientQuery, matchedClients) {
  const keys = new Set();
  const queryKey = normalizeMatchKey(clientQuery);
  if (queryKey) keys.add(queryKey);
  for (const client of matchedClients) {
    keys.add(normalizeMatchKey(client.name));
    if (client.taxInvoiceCorpName) keys.add(normalizeMatchKey(client.taxInvoiceCorpName));
    parseAliasList(client.depositNameAliases).forEach((alias) => keys.add(normalizeMatchKey(alias)));
  }
  return keys;
}

function labelMatchesClientKeys(label, keys) {
  const key = normalizeMatchKey(label);
  if (!key) return false;
  if (keys.has(key)) return true;
  return [...keys].some((candidate) => key.includes(candidate) || candidate.includes(key));
}

function scheduleMatchesClientFilter(schedule, matchedClients, keys) {
  const clientId = String(schedule?.clientId ?? "").trim();
  if (clientId) {
    for (const client of matchedClients) {
      if (String(client.id ?? "") === clientId) return true;
    }
  }
  const labels = [schedule?.projectName, schedule?.clientName].filter(Boolean);
  return labels.some((label) => labelMatchesClientKeys(label, keys));
}

function saleMatchesClientFilter(clientName, matchedClients, keys) {
  return labelMatchesClientKeys(clientName, keys);
}

function mapScPreviewRow(row) {
  const participantNames = Array.isArray(row.participantNames)
    ? row.participantNames.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  const start = String(row.startTime || "").trim();
  const end = String(row.endTime || "").trim();
  const timeRange = start && end ? `${start}-${end}` : start || end || "";
  return {
    workDate: String(row.workDate || "").slice(0, 10),
    projectName: String(row.projectName || row.clientName || ""),
    siteName: String(row.siteName || ""),
    workType: String(row.workType || ""),
    timeRange,
    participants: participantNames.join(", "),
    participantCount: participantNames.length,
  };
}

function extractClientNameFromScheduleQuery(text) {
  return String(text || "")
    .replace(/\uC774\uBC88\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC|\uAE08\uC8FC|\uC774\uB2EC|\uC81C|\uC8FC|\uAC04/g, "")
    .replace(/\uC624\uB298|\uB0B4\uC77C|\uBAA8\uB798/g, "")
    .replace(/\uC77C\uC815|\uC2A4\uCF00\uC904|\uB9E4\uCD9C|\uAC70\uB798\uCC98/g, "")
    .replace(/(?:\uB294|\uC740|\uB97C|\uC758|\?|\uC54C\uB824|\uC870\uD68C|\uD655\uC778|\uC918|\uC785\uB2C8\uCE74)/g, "")
    .trim();
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
    return [{ name: String(client.manager || client.ceoName || client.name || "").trim(), phone, isPrimary: true }];
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

export function toolGetScheduleCount({ date, startDate, endDate, clientName, limit = 30 }) {
  const state = getErpState(["sales", "settings", "clients"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const scSchedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const maxRows = Math.min(Math.max(Number(limit) || 30, 1), 50);

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let rangeLabel = "";

  if (rangeStart && rangeEnd) {
    rangeLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
  } else {
    const parsed = resolveDateRangeFromInput(date);
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    rangeLabel = parsed.label;
  }

  const clientQuery = String(clientName || "").trim();
  let matchedClients = [];
  let clientFilterKeys = null;
  if (clientQuery) {
    matchedClients = findClientsByQuery(clients, clientQuery);
    clientFilterKeys = buildClientFilterKeys(clientQuery, matchedClients);
  }

  let salesRows = sales.filter((row) => {
    const rowDate = String(row.date || "").slice(0, 10);
    return rowDate >= rangeStart && rowDate <= rangeEnd;
  });
  let scRows = filterSchedulesForWeek(scSchedules, rangeStart, rangeEnd);

  if (clientFilterKeys) {
    salesRows = salesRows.filter((row) => saleMatchesClientFilter(row.client, matchedClients, clientFilterKeys));
    scRows = scRows.filter((row) => scheduleMatchesClientFilter(row, matchedClients, clientFilterKeys));
  }

  scRows.sort((a, b) => {
    const dateCmp = String(a.workDate || "").localeCompare(String(b.workDate || ""));
    if (dateCmp !== 0) return dateCmp;
    return String(a.startTime || "").localeCompare(String(b.startTime || ""));
  });
  salesRows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  const resolvedClientName = matchedClients[0]?.name || clientQuery || "";

  return {
    ok: true,
    date: rangeLabel,
    startDate: rangeStart,
    endDate: rangeEnd,
    clientName: resolvedClientName,
    filteredByClient: Boolean(clientQuery),
    salesCount: salesRows.length,
    scScheduleCount: scRows.length,
    totalCount: salesRows.length + scRows.length,
    salesPreview: salesRows.slice(0, maxRows).map((row) => ({
      date: String(row.date || "").slice(0, 10),
      client: String(row.client || ""),
      site: String(row.site || ""),
      worker: String(row.worker || ""),
      amount: Number(row.amount) || 0,
    })),
    scPreview: scRows.slice(0, maxRows).map(mapScPreviewRow),
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
      vehicleNo: String(worker.vehicleNo || "").trim(),
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

export function toolGetClientContacts({ clientName }, user) {
  const canViewPhone = canUserViewContactPhones(user);
  const state = getErpState(["clients"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const query = String(clientName || "").trim();
  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, query);
  if (!matchedClients.length) {
    return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }

  const rows = matchedClients.slice(0, 5).map((client) => {
    const contacts = resolveClientContacts(client);
    return {
      clientName: String(client.name || ""),
      manager: String(client.manager || ""),
      contacts: contacts.map((contact) => ({
        name: contact.name,
        phone: canViewPhone ? contact.phone || "" : null,
        isPrimary: Boolean(contact.isPrimary),
      })),
    };
  });

  return {
    ok: true,
    query,
    clientCount: rows.length,
    canViewPhone,
    clients: rows,
  };
}

function extractClientNameFromContactQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) return possessive[1].trim();

  return raw
    .replace(/\uAC70\uB798\uCC98|\uB2F4\uB2F9\uC790|\uB2F4\uB2F9|\uC804\uD654\uBC88\uD638|\uC5F0\uB77D\uCC98|\uD734\uB300\uD3F0|\uBC88\uD638|\uC870\uD68C|\uC54C\uB824|\uC918|\uD655\uC778/g, "")
    .replace(/(?:\uB294|\uC740|\uB97C|\uC785\uB2C8\uCE74|\?)/g, "")
    .replace(/\uC758$/g, "")
    .trim();
}

function tryClientContactsOrPersonLookup(name, user) {
  const query = String(name || "").trim();
  if (!query) return null;

  const state = getErpState(["clients"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  if (findClientsByQuery(clients, query).length) {
    return formatClientContactsAnswer(toolGetClientContacts({ clientName: query }, user));
  }
  return formatContactAnswer(toolLookupContact({ name: query }, user));
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
    vehicleNo: String(worker.vehicleNo || "").trim(),
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
      description: "\uB0A0\uC9DC \uB610\uB294 \uAE30\uAC04(\uC624\uB298/\uB0B4\uC77C/\uC774\uBC88\uC8FC/\uB2E4\uC74C\uC8FC/YYYY-MM-DD)\uACFC \uAC70\uB798\uCC98 \uC774\uB984(\uC120\uD0DD)\uC73C\uB85C \uB9E4\uCD9C\uC77C\uC815\uACFC SC \uC77C\uC815 \uBAA9\uB85D\uC744 \uC870\uD68C\uD569\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "\uC624\uB298, \uB0B4\uC77C, \uC774\uBC88\uC8FC, \uB2E4\uC74C\uC8FC \uB610\uB294 YYYY-MM-DD" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791\uC77C YYYY-MM-DD" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC\uC77C YYYY-MM-DD" },
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 \uB610\uB294 \uBCC4\uCE59 (\uC608: \uD0A4\uCE9C\uC81C\uB2C8\uC2A4)" },
          limit: { type: "number", description: "\uBAA9\uB85D \uCD5C\uB300 \uAC74\uC218 (\uAE30\uBCF8 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_contact",
      description: "\uB2F4\uB2F9\uC790 \uC778\uC0C1 \uB610\uB294 \uC2DC\uACF5\uC790 \uC774\uB984\uC73C\uB85C \uC804\uD654\uBC88\uD638\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uAC70\uB798\uCC98 \uC774\uB984\uC73C\uB85C \uB2F4\uB2F9\uC790\uB97C \uCC3E\uC744 \uB54C\uB294 get_client_contacts\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "\uB2F4\uB2F9\uC790 \uC778\uC0C1 \uB610\uB294 \uC2DC\uACF5\uC790 \uC774\uB984" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_contacts",
      description: "\uAC70\uB798\uCC98 \uC774\uB984(\uB610\uB294 \uBCC4\uCE59)\uC73C\uB85C \uB2F4\uB2F9\uC790 \uBAA9\uB85D\uACFC \uC804\uD654\uBC88\uD638\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4.",
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
      description: "\uC2DC\uACF5\uC790 \uAE30\uBCF8 \uC815\uBCF4(\uC774\uB984, \uAD6C\uBD84, \uCC28\uB7C9\uBC88\uD638, \uC804\uD654\uBC88\uD638)\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4.",
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
    case "get_client_contacts":
      return toolGetClientContacts(args || {}, user);
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
  const kwVehicle = "\uCC28\uB7C9";
  const kwManager = "\uB2F4\uB2F9";

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
    const clientName = extractClientNameFromScheduleQuery(text);
    const range = resolveDateRangeFromInput(text);
    const hasWeekKeyword =
      text.includes("\uC774\uBC88\uC8FC") ||
      text.includes("\uB2E4\uC74C\uC8FC") ||
      text.includes("\uC800\uBC88\uC8FC") ||
      text.includes("\uC9C0\uB09C\uC8FC") ||
      text.includes("\uAE08\uC8FC");

    if (clientName || hasWeekKeyword) {
      return formatScheduleAnswer(
        toolGetScheduleCount({
          date: hasWeekKeyword ? text : range.startDate,
          startDate: range.startDate,
          endDate: range.endDate,
          clientName: clientName || undefined,
        }),
      );
    }

    let date = kwToday;
    if (text.includes(kwTomorrow)) date = kwTomorrow;
    else if (text.includes(kwDayAfter)) date = kwDayAfter;
    else {
      const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) date = dateMatch[0];
    }
    return formatScheduleAnswer(toolGetScheduleCount({ date }));
  }

  if (text.includes(kwVehicle)) {
    let name = "";
    const possessive = text.match(/^(.+?)\uC758/);
    if (possessive) name = possessive[1].trim();
    if (!name) {
      name = text
        .replace(/\uCC28\uB7C9\uBC88\uD638|\uCC28\uB7C9|\uB2E4\uB2C8|\uB108\uBBC0\uBC84|\uB118\uBC84/g, "")
        .replace(/(?:\uB294|\uC740|\uC918|\uC54C\uB824|\uC870\uD68C|\uD655\uC778|\?)/g, "")
        .replace(/\uC758$/g, "")
        .trim();
    }
    if (name) {
      return formatWorkerAnswer(toolGetWorkerInfo({ name }, user));
    }
  }

  if (text.includes(kwManager)) {
    const clientName = extractClientNameFromContactQuery(text);
    if (clientName) {
      return tryClientContactsOrPersonLookup(clientName, user);
    }
  }

  if (text.includes(kwPhone) || text.includes(kwContact) || text.includes(kwNumber)) {
    const name = extractClientNameFromContactQuery(text);
    if (name) {
      return tryClientContactsOrPersonLookup(name, user);
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
  const title = data.filteredByClient && data.clientName ? `${data.clientName} ${data.date}` : String(data.date || "");
  const lines = [
    `${title} \uC77C\uC815: \uB9E4\uCD9C ${data.salesCount}\uAC74, SC \uC77C\uC815 ${data.scScheduleCount}\uAC74 (\uD569\uACC4 ${data.totalCount}\uAC74)`,
  ];

  if (data.totalCount === 0) {
    lines.push(
      data.filteredByClient
        ? `\n${data.clientName || "\uD574\uB2F9 \uAC70\uB798\uCC98"}\uC758 \uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`
        : "\n\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
    );
    return lines.join("\n");
  }

  const isRange = Boolean(data.startDate && data.endDate && data.startDate !== data.endDate);
  const formatListDate = (iso) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
    if (!match) return "";
    return `${Number(match[2])}/${Number(match[3])}`;
  };

  const salesPreview = Array.isArray(data.salesPreview) ? data.salesPreview : [];
  if (data.salesCount > 0) {
    lines.push("\n[\uB9E4\uCD9C \uC77C\uC815]");
    salesPreview.forEach((row, index) => {
      const amount = row.amount ? ` \u00B7 ${formatKRW(row.amount)}\uC6D0` : "";
      const worker = row.worker ? ` \u00B7 ${row.worker}` : "";
      const datePrefix = isRange && row.date ? `${formatListDate(row.date)} \u00B7 ` : "";
      lines.push(`${index + 1}. ${datePrefix}${row.client || "-"} / ${row.site || "-"}${worker}${amount}`);
    });
    if (data.salesCount > salesPreview.length) {
      lines.push(`\u2026 \uC678 ${data.salesCount - salesPreview.length}\uAC74`);
    }
  }

  const scPreview = Array.isArray(data.scPreview) ? data.scPreview : [];
  if (data.scScheduleCount > 0) {
    lines.push("\n[SC \uC77C\uC815]");
    scPreview.forEach((row, index) => {
      const parts = [];
      if (isRange && row.workDate) parts.push(formatListDate(row.workDate));
      parts.push(row.projectName || "-");
      if (row.timeRange) parts.push(row.timeRange);
      if (row.siteName) parts.push(row.siteName);
      if (row.workType) parts.push(row.workType);
      if (row.participants) parts.push(row.participants);
      else if (row.participantCount) parts.push(`${row.participantCount}\uBA85`);
      lines.push(`${index + 1}. ${parts.join(" \u00B7 ")}`);
    });
    if (data.scScheduleCount > scPreview.length) {
      lines.push(`\u2026 \uC678 ${data.scScheduleCount - scPreview.length}\uAC74`);
    }
  }

  return lines.join("\n");
}

export function formatContactAnswer(data) {
  if (!data.ok) return data.error || "\uC5F0\uB77D\uCC98 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (!data.matchCount) return `"${data.query}"\uC744(\uB97C) \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  const phoneNote = data.canViewPhone === false ? " (\uC804\uD654\uBC88\uD638 \uC870\uD68C \uAD8C\uD55C \uC5C6\uC2B5\uB2C8\uB2E4.)" : "";
  return data.matches
    .slice(0, 5)
    .map((row) => {
      if (row.kind === "worker") {
        const vehicle = row.vehicleNo ? `, \uCC28\uB7C9 ${row.vehicleNo}` : "";
        const phone = row.phoneRestricted ? "\uAD8C\uD55C \uC5C6\uC2B5\uB2C8\uB2E4." : row.phone || "-";
        return `\uC2DC\uACF5\uC790 ${row.name}: ${phone}${vehicle}`;
      }
      if (row.kind === "client_contact") {
        const phone = row.phoneRestricted ? "\uAD8C\uD55C \uC5C6\uC2B5\uB2C8\uB2E4." : row.phone || "-";
        return `\uAC70\uB798\uCC98 ${row.clientName} \uB2F4\uB2F9 ${row.name}: ${phone}`;
      }
      const phone = row.phoneRestricted ? "\uAD8C\uD55C \uC5C6\uC2B5\uB2C8\uB2E4." : row.phone || "-";
      return `\uAC70\uB798\uCC98 ${row.clientName} (${row.name}): ${phone}`;
    })
    .join("\n") + phoneNote;
}

export function formatClientContactsAnswer(data) {
  if (!data.ok) return data.error || "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const lines = [];
  for (const client of data.clients || []) {
    lines.push(`\uAC70\uB798\uCC98 ${client.clientName}`);
    const contacts = Array.isArray(client.contacts) ? client.contacts : [];
    if (!contacts.length) {
      lines.push("- \uB4F1\uB85D\uB41C \uB2F4\uB2F9\uC790 \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
      continue;
    }
    contacts.forEach((contact) => {
      const primary = contact.isPrimary ? " (\uC8FC\uB2F4\uB2F9)" : "";
      const phone = data.canViewPhone ? contact.phone || "-" : "\uC870\uD68C \uAD8C\uD55C \uC5C6\uC2B5\uB2C8\uB2E4.";
      lines.push(`- ${contact.name || "-"}${primary}: ${phone}`);
    });
  }
  if (!data.canViewPhone) {
    lines.push("\uC804\uD654\uBC88\uD638 \uC870\uD68C\uB294 \uAD00\uB9AC\uC790 \uB610\uB294 \uAE30\uBCF8\uC815\uBCF4 \uBA54\uB274 \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
  }
  return lines.join("\n");
}

export function formatWorkerAnswer(data) {
  if (!data.ok) return data.error || "\uC2DC\uACF5\uC790 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const lines = [`\uC2DC\uACF5\uC790 ${data.name}${data.category ? ` (${data.category})` : ""}`];
  lines.push(`\uCC28\uB7C9\uBC88\uD638: ${data.vehicleNo || "-"}`);
  if (data.phoneRestricted) {
    lines.push("\uC804\uD654\uBC88\uD638: \uC870\uD68C \uAD8C\uD55C \uC5C6\uC2B5\uB2C8\uB2E4.");
  } else if (data.phone) {
    lines.push(`\uC804\uD654\uBC88\uD638: ${data.phone}`);
  }
  return lines.join("\n");
}
