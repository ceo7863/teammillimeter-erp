import { getErpState } from "./db.mjs";
import { config } from "./config.mjs";
import { findWorkerByListName } from "./workerPhoneMatch.mjs";
import { weekRangeISO, filterSchedulesForWeek } from "./scWeeklyBriefingNotify.mjs";
import {
  chatIncludesIntent,
  findIntentKeywordSpan,
  expandSynonymsForExtraction,
} from "./erpChatFuzzy.mjs";
import {
  isWorkerVehicleQuery,
  extractWorkerNameFromVehicleQuery,
} from "./erpChatVehicleExtract.mjs";

export { isWorkerVehicleQuery, extractWorkerNameFromVehicleQuery } from "./erpChatVehicleExtract.mjs";

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

export function monthRangeISO(offset = 0) {
  const today = todayISO();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return { startDate: today, endDate: today };
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const date = new Date(year, month + offset, 1);
  const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  const endDateObj = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
  return { startDate, endDate };
}

export function resolveMonthRangeFromInput(input) {
  const raw = String(input || "").trim();
  if (
    !raw ||
    raw.includes("\uC774\uBC88\uB2EC") ||
    raw.includes("\uC774\uBC88 \uB2EC") ||
    raw.includes("\uC774\uB2EC") ||
    raw.includes("\uB2F9\uC6D4")
  ) {
    const range = monthRangeISO(0);
    return { ...range, label: `\uC774\uBC88 \uB2EC (${range.startDate}~${range.endDate})` };
  }
  if (
    raw.includes("\uC9C0\uB09C\uB2EC") ||
    raw.includes("\uC9C0\uB09C \uB2EC") ||
    raw.includes("\uC800\uBC88\uB2EC") ||
    raw.includes("\uC804\uC6D4")
  ) {
    const range = monthRangeISO(-1);
    return { ...range, label: `\uC9C0\uB09C \uB2EC (${range.startDate}~${range.endDate})` };
  }
  if (raw.includes("\uB2E4\uC74C\uB2EC") || raw.includes("\uB2E4\uC74C \uB2EC")) {
    const range = monthRangeISO(1);
    return { ...range, label: `\uB2E4\uC74C \uB2EC (${range.startDate}~${range.endDate})` };
  }
  const yearMonthMatch = raw.match(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4(?:\uB2EC)?/);
  if (yearMonthMatch) {
    const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayISO());
    const year = yearMonthMatch[1] ? Number(yearMonthMatch[1]) : Number(todayMatch?.[1] || new Date().getFullYear());
    const month = Number(yearMonthMatch[2]);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDateObj = new Date(year, month, 0);
    const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
    return { startDate, endDate, label: `${year}\uB144 ${month}\uC6D4 (${startDate}~${endDate})` };
  }
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const monthKey = iso[0].slice(0, 7);
    const [year, month] = monthKey.split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDateObj = new Date(year, month, 0);
    const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
    return { startDate, endDate, label: `${monthKey}` };
  }
  const range = monthRangeISO(0);
  return { ...range, label: `\uC774\uBC88 \uB2EC (${range.startDate}~${range.endDate})` };
}

export function resolveStatementPeriodFromInput(input) {
  const raw = String(input || "").trim();
  const dayRangeMatch = raw.match(/(\d{1,2})\s*\uC77C\s*(?:\uC5D0\uC11C|\uBD80\uD130|~|\-)\s*(\d{1,2})\s*\uC77C/);
  if (dayRangeMatch) {
    const monthRange = resolveMonthRangeFromInput(raw);
    const monthKey = monthRange.startDate.slice(0, 7);
    const [year, month] = monthKey.split("-");
    const startDay = String(Number(dayRangeMatch[1])).padStart(2, "0");
    const endDay = String(Number(dayRangeMatch[2])).padStart(2, "0");
    const startDate = `${year}-${month}-${startDay}`;
    const endDate = `${year}-${month}-${endDay}`;
    return {
      startDate,
      endDate,
      label: `${Number(month)}\uC6D4 ${Number(dayRangeMatch[1])}\uC77C~${Number(dayRangeMatch[2])}\uC77C (${startDate}~${endDate})`,
    };
  }
  return resolveMonthRangeFromInput(raw);
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

export function toolGetClientContacts({ clientName, personName }, user) {
  const canViewPhone = canUserViewContactPhones(user);
  const state = getErpState(["clients"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const query = String(clientName || "").trim();
  const personQuery = String(personName || "").trim();
  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  if (personQuery) {
    return toolLookupClientContact({ clientName: query, personName: personQuery }, user);
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

export function parseClientPersonContactQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\uAC70\uB798\uCC98|\uB2F4\uB2F9\uC790|\uB2F4\uB2F9|\uC804\uD654\uBC88\uD638|\uC804\uD654|\uC5F0\uB77D\uCC98|\uD734\uB300\uD3F0|\uBC88\uD638|\uC870\uD68C|\uC54C\uB824|\uC918|\uD655\uC778|\uC8FC\uC138\uC694|\uAD6C\uD574|\uC8FC\uC138\uC694/g, "")
    .replace(/(?:\uB294|\uC740|\uB97C|\uC758|\?|!)/g, "")
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const state = getErpState(["clients"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];

  for (let splitAt = parts.length - 1; splitAt >= 1; splitAt -= 1) {
    const clientQuery = parts.slice(0, splitAt).join(" ");
    const personName = parts.slice(splitAt).join(" ");
    if (!personName || personName.length < 2) continue;
    const matchedClients = findClientsByQuery(clients, clientQuery);
    if (matchedClients.length) {
      return {
        clientName: String(matchedClients[0].name || clientQuery),
        personName,
        clientQuery,
      };
    }
  }

  return null;
}

export function toolLookupClientContact({ clientName, personName }, user) {
  const canViewPhone = canUserViewContactPhones(user);
  const state = getErpState(["clients"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const clientQuery = String(clientName || "").trim();
  const personQuery = String(personName || "").trim();
  if (!clientQuery || !personQuery) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uACFC \uB2F4\uB2F9\uC790 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, clientQuery);
  if (!matchedClients.length) {
    return { ok: false, error: `"${clientQuery}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }

  const personKey = normalizeMatchKey(personQuery);
  for (const client of matchedClients) {
    const contacts = resolveClientContacts(client);
    for (const contact of contacts) {
      if (nameMatchesQuery(contact.name, personKey)) {
        return {
          ok: true,
          clientName: String(client.name || ""),
          personName: contact.name,
          phone: canViewPhone ? contact.phone || "" : null,
          phoneRestricted: !canViewPhone,
          isPrimary: Boolean(contact.isPrimary),
        };
      }
    }

    for (const managerName of splitManagerNames(client.manager)) {
      if (nameMatchesQuery(managerName, personKey)) {
        const phone = String(client.phone || "").trim();
        return {
          ok: true,
          clientName: String(client.name || ""),
          personName: managerName,
          phone: canViewPhone ? phone : null,
          phoneRestricted: !canViewPhone,
          isPrimary: true,
        };
      }
    }
  }

  return {
    ok: false,
    error: `${matchedClients[0]?.name || clientQuery} ${personQuery} \uB2F4\uB2F9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`,
  };
}

export function formatClientContactLookupAnswer(data) {
  if (!data?.ok) return data?.error || "\uB2F4\uB2F9\uC790 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const phone = data.phoneRestricted ? "\uC804\uD654\uBC88\uD638 \uC870\uD68C \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." : data.phone || "-";
  const primary = data.isPrimary ? " (\uC8FC\uB2F4\uB2F9)" : "";
  return `\uAC70\uB798\uCC98 ${data.clientName} \uB2F4\uB2F9 ${data.personName}${primary}: ${phone}`;
}

function tryClientContactsOrPersonLookup(name, user) {
  const query = String(name || "").trim();
  if (!query) return null;

  const parsed = parseClientPersonContactQuery(query);
  if (parsed) {
    return formatClientContactLookupAnswer(toolLookupClientContact(parsed, user));
  }

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

export function toolGetWorkerInfo({ name, rawQuery }, user) {
  const canViewPhone = canUserViewContactPhones(user);
  const state = getErpState(["workers"]);
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const rawName = String(name || "").trim();
  const rawQueryStr = String(rawQuery || "").trim();
  const vehicleSource = isWorkerVehicleQuery(rawName)
    ? rawName
    : isWorkerVehicleQuery(rawQueryStr)
      ? rawQueryStr
      : "";
  let query = vehicleSource ? extractWorkerNameFromVehicleQuery(vehicleSource) : rawName;
  let worker = findWorkerByListName(workers, query);
  if (!worker && rawQueryStr && isWorkerVehicleQuery(rawQueryStr)) {
    const reextracted = extractWorkerNameFromVehicleQuery(rawQueryStr);
    if (reextracted && reextracted !== query) {
      worker = findWorkerByListName(workers, reextracted);
      if (worker) query = reextracted;
    }
  }
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

export function parseMonthDayDateFromText(text, anchorYear) {
  const year = Number(anchorYear) || Number(todayISO().slice(0, 4));
  const md = String(text || "").match(/(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C/);
  if (md) {
    const month = String(md[1]).padStart(2, "0");
    const day = String(md[2]).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const iso = String(text || "").match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : "";
}

export function extractOpenVoucherQuery(text) {
  const raw = String(text || "").trim();
  const date = parseMonthDayDateFromText(raw);
  let clientName = "";

  const leading = raw.match(/^(.+?)\s+\d{1,2}\s*\uC6D4/);
  if (leading) clientName = leading[1].trim();

  if (!clientName) {
    clientName = raw
      .replace(/\d{1,2}\s*\uC6D4\s*\d{1,2}\s*\uC77C/g, "")
      .replace(/\d{4}-\d{2}-\d{2}/g, "")
      .replace(
        /\uC804\uD45C|\uB9E4\uCD9C|\uC5F4\uC5B4|\uC5F4\uAE30|\uC774\uB3D9|\uCC44|\uBCF4\uAE30|\uCC3E|\uC870\uD68C|\uC918|\uC785\uB2C8\uCE74|\?/g,
        "",
      )
      .trim();
  }

  return { clientName, date };
}

export function toolFindSaleVoucher({ clientName, date, site, year }) {
  const state = getErpState(["sales", "clients"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const query = String(clientName || "").trim();
  let dateKey = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    dateKey = parseMonthDayDateFromText(String(date || ""), year);
  }

  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }
  if (!dateKey) {
    return { ok: false, error: "\uB0A0\uC9DC(\uC608: 6\uC6D41\uC77C \uB610\uB294 YYYY-MM-DD)\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, query);
  const clientFilterKeys = buildClientFilterKeys(query, matchedClients);
  const siteKey = site ? normalizeMatchKey(site) : "";

  let rows = sales.filter((sale) => {
    const saleDate = String(sale.date || "").slice(0, 10);
    if (saleDate !== dateKey) return false;
    if (!saleMatchesClientFilter(sale.client, matchedClients, clientFilterKeys)) return false;
    if (siteKey && !labelMatchesClientKeys(sale.site, new Set([siteKey]))) return false;
    return true;
  });

  rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

  const mapped = rows.slice(0, 15).map((sale) => ({
    id: sale.id,
    voucherNo: String(sale.voucherNo || sale.id || ""),
    client: String(sale.client || ""),
    site: String(sale.site || ""),
    date: String(sale.date || "").slice(0, 10),
    amount: Number(sale.amount) || 0,
  }));

  return {
    ok: true,
    clientName: matchedClients[0]?.name || query,
    date: dateKey,
    count: rows.length,
    sales: mapped,
    openSaleId: rows.length === 1 ? rows[0]?.id ?? null : null,
  };
}

export function tryRuleBasedVoucherOpen(message) {
  const text = String(message || "").trim();
  if (!text.includes("\uC804\uD45C")) return null;
  if (!/(?:\uC5F4|\uBD10|\uCC28|\uC774\uB3D9|\uD655\uC778)/.test(text)) return null;
  const { clientName, date } = extractOpenVoucherQuery(text);
  if (!clientName || !date) return null;
  return toolFindSaleVoucher({ clientName, date });
}

export function buildChatActionsFromSaleVoucher(result) {
  if (!result?.ok) return [];
  if (result.openSaleId != null && result.openSaleId !== "") {
    return [{ type: "open_sale_voucher", saleId: result.openSaleId }];
  }
  if (result.count > 1 && result.date && result.clientName) {
    return [
      {
        type: "open_sale_voucher_search",
        client: result.clientName,
        startDate: result.date,
        endDate: result.date,
      },
    ];
  }
  return [];
}

export function formatSaleVoucherAnswer(data) {
  if (!data.ok) return data.error || "\uC804\uD45C \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (data.count === 0) {
    return `${data.clientName} ${data.date} \uC804\uD45C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  if (data.count === 1) {
    const row = data.sales[0];
    return `${row.client} / ${row.site || "-"} \uC804\uD45C(${row.voucherNo || row.id})\uB97C \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.\n${data.date} \u00B7 ${formatKRW(row.amount)}\uC6D0`;
  }
  const lines = [`${data.clientName} ${data.date} \uC804\uD45C ${data.count}\uAC74\uC785\uB2C8\uB2E4.`];
  data.sales.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.voucherNo || row.id} / ${row.site || "-"} \u00B7 ${formatKRW(row.amount)}\uC6D0`);
  });
  if (data.count > data.sales.length) {
    lines.push(`\u2026 \uC678 ${data.count - data.sales.length}\uAC74`);
  }
  lines.push("\uB9E4\uCD9C\uC804\uD45C\uAC80\uC0C9\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.");
  return lines.join("\n");
}

const TRAILING_CHAT_ACTION_SUFFIX =
  /(?:\s*|\uC758)*(?:\uC5F4\uC5B4\uC918|\uC5F4\uC5B4|\uC5F4\uAE30|\uBD10|\uCC28|\uC774\uB3D9|\uD655\uC778|\uC918|\uC774\uB3D9\uD574|\uC785\uB2C8\uCE74|\uC870\uD68C|\uBCF4\uAE30|\?)*\s*$/;

function extractNameBeforeKeyword(text, keywordPattern) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const kwTest = new RegExp(keywordPattern.source);
  const kwReplace = new RegExp(keywordPattern.source, "g");

  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive && kwTest.test(raw)) return possessive[1].trim();

  const attached = raw.match(new RegExp(`^(.+?)(${keywordPattern.source})`));
  if (attached) return attached[1].trim();

  return raw
    .replace(kwReplace, "")
    .replace(/\uAC70\uB798\uCC98/g, "")
    .replace(TRAILING_CHAT_ACTION_SUFFIX, "")
    .trim();
}

export function extractNameBeforeIntent(text, intentKey) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const span = findIntentKeywordSpan(raw, intentKey);
  if (!span) return "";

  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive && span.start > 0) return possessive[1].trim();

  const before = raw.slice(0, span.start).trim();
  if (before) {
    return before
      .replace(/\uAC70\uB798\uCC98/g, "")
      .replace(TRAILING_CHAT_ACTION_SUFFIX, "")
      .trim();
  }

  return raw
    .slice(span.end)
    .replace(/\uAC70\uB798\uCC98/g, "")
    .replace(TRAILING_CHAT_ACTION_SUFFIX, "")
    .trim();
}

const ERP_CALENDAR_KEYWORD_PATTERN =
  /\uCE98\uB9B0\uB354|\uCE04\uB9B0\uB354|\uCE98\uBCC0\uB354|\uB2EC\uB825/;

const SC_SCHEDULE_KEYWORD_PATTERN =
  /\uC2A4\uCF00\uC904|(?:^|\s)SC(?:\s|$|\uC2A4\uCF00\uC904|\uC77C\uC815)|SC\s*\uC2A4\uCF00\uC904|SC\s*\uC77C\uC815|SC\uC2A4\uCF00\uC904|SC\uC77C\uC815/i;

const CHAT_OPEN_VERB_PATTERN = /(?:\uC5F4|\uBD10|\uCC28|\uC774\uB3D9|\uD655\uC778|\uC918|\uC870\uD68C|\uBCF4\uAE30|\uBCF4\uC5EC)/;

export function hasChatOpenVerb(text) {
  const raw = String(text || "");
  return chatIncludesIntent(raw, "openVerb") || CHAT_OPEN_VERB_PATTERN.test(raw);
}

export function includesErpCalendarKeyword(text) {
  const raw = String(text || "");
  return chatIncludesIntent(raw, "calendar") || ERP_CALENDAR_KEYWORD_PATTERN.test(raw);
}

export function includesCalendarKeyword(text) {
  return includesErpCalendarKeyword(text);
}

export function includesScScheduleKeyword(text) {
  const raw = String(text || "");
  if (chatIncludesIntent(raw, "scSchedule")) return true;
  if (/\uC2A4\uCF00\uC904/.test(raw)) return true;
  if (/(?:^|\s)SC(?:\s|$|\uC2A4\uCF00\uC904|\uC77C\uC815)/i.test(raw)) return true;
  const compact = raw.replace(/\s+/g, "");
  return /SC(?:\uC2A4\uCF00\uC904|\uC77C\uC815)/i.test(compact);
}

export function extractCalendarClientQuery(text) {
  const expanded = expandSynonymsForExtraction(text);
  const byIntent = extractNameBeforeIntent(expanded, "calendar");
  if (byIntent) return byIntent;
  return extractNameBeforeKeyword(expanded, ERP_CALENDAR_KEYWORD_PATTERN);
}

export function extractScScheduleClientQuery(text) {
  const expanded = expandSynonymsForExtraction(String(text || "").trim());
  let name = extractNameBeforeIntent(expanded, "scSchedule");
  if (!name && /\uC77C\uC815/.test(expanded) && !includesErpCalendarKeyword(expanded)) {
    name = extractNameBeforeKeyword(expanded, /\uC77C\uC815/);
  }
  return stripPeriodFromClientQuery(String(name || "").trim());
}

export function toolOpenScSchedule() {
  const url = String(config.sc?.apiBaseUrl || config.sc?.sharePublicUrl || "https://sc.teammillimeter.com").replace(/\/$/, "");
  return { ok: true, kind: "sc", url };
}

export function toolOpenClientSiteRequestCalendar({ clientName }) {
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

  const resolvedName = String(matchedClients[0]?.name || query).trim();
  const clientId = matchedClients[0]?.id;
  return {
    ok: true,
    kind: "clientSiteCalendar",
    clientName: resolvedName,
    clientId: clientId != null && clientId !== "" ? clientId : undefined,
  };
}

export function tryRuleBasedScScheduleOpen(message) {
  const text = String(message || "").trim();
  const clientName = extractScScheduleClientQuery(text);
  const hasScheduleKeyword = includesScScheduleKeyword(text);
  const hasClientScheduleKeyword =
    Boolean(clientName) && /\uC77C\uC815/.test(text) && !includesErpCalendarKeyword(text);
  if (!hasScheduleKeyword && !hasClientScheduleKeyword) return null;
  if (!hasChatOpenVerb(text)) return null;
  if (includesErpCalendarKeyword(text)) return null;
  if (clientName) {
    return toolOpenClientSiteRequestCalendar({ clientName });
  }
  return toolOpenScSchedule();
}

export function buildChatActionsFromScScheduleOpen(result) {
  if (!result?.ok) return [];
  if (result.kind === "clientSiteCalendar" || (result.clientName && !result.url)) {
    return [
      {
        type: "open_client_site_request_calendar",
        clientName: result.clientName,
        clientId: result.clientId,
      },
    ];
  }
  if (!result.url) return [];
  return [{ type: "open_sc_schedule", url: result.url }];
}

export function formatScScheduleOpenAnswer(data) {
  if (!data.ok) return data.error || "\uC2A4\uCF00\uC904 \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (data.kind === "clientSiteCalendar" || (data.clientName && !data.url)) {
    return `${data.clientName} \uC5C5\uCCB4\uBCC4 \uCE98\uB9B0\uB354(\uD604\uC7A5 \uC811\uC218)\uB97C \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.`;
  }
  return "SC \uC2A4\uCF00\uC904 \uC0AC\uC774\uD2B8\uB97C \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.";
}

export function toolOpenClientCalendar({ clientName }) {
  const state = getErpState(["sales", "clients"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const query = String(clientName || "").trim();
  if (!query) {
    return { ok: true, pageOnly: true, anchorDate: todayISO(), saleCount: 0 };
  }

  const matchedClients = findClientsByQuery(clients, query);
  if (!matchedClients.length) {
    return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }

  const clientFilterKeys = buildClientFilterKeys(query, matchedClients);
  const resolvedName = String(matchedClients[0]?.name || query).trim();
  const clientSales = sales
    .filter((sale) => saleMatchesClientFilter(sale.client, matchedClients, clientFilterKeys))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const anchorDate = String(clientSales[0]?.date || todayISO()).slice(0, 10);

  return {
    ok: true,
    clientName: resolvedName,
    anchorDate,
    saleCount: clientSales.length,
  };
}

export function tryRuleBasedCalendarOpen(message) {
  const text = String(message || "").trim();
  if (!includesErpCalendarKeyword(text)) return null;
  if (!hasChatOpenVerb(text)) return null;
  const clientName = extractCalendarClientQuery(text);
  if (clientName) {
    return toolOpenClientCalendar({ clientName });
  }
  return { ok: true, pageOnly: true, anchorDate: todayISO(), saleCount: 0 };
}

export function buildChatActionsFromCalendarOpen(result) {
  if (!result?.ok) return [];
  if (result.pageOnly || !result.clientName) {
    return [{ type: "navigate_erp", page: "calendar", label: "\uCE98\uB9B0\uB354" }];
  }
  return [
    {
      type: "open_client_calendar",
      clientName: result.clientName,
      anchorDate: result.anchorDate || todayISO(),
    },
  ];
}

export function formatCalendarOpenAnswer(data) {
  if (!data.ok) return data.error || "\uCE98\uB9B0\uB354 \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (data.pageOnly) return "\uCE98\uB9B0\uB354\uC744 \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.";
  const monthHint = String(data.anchorDate || "").slice(0, 7);
  const saleHint =
    data.saleCount > 0
      ? ` \uCD5C\uADFC \uC804\uD45C \uAE30\uC900 ${monthHint}\uC6D4\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4.`
      : " \uC804\uD45C\uAC00 \uC5C6\uC5B4 \uC774\uBC88 \uB2EC\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4.";
  return `${data.clientName} \uAC70\uB798\uCC98 \uCE98\uB9B0\uB354\uB97C \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.${saleHint}`;
}

function saleHasWorker(sale, workerName) {
  const target = String(workerName || "").trim();
  if (!target) return false;
  const workers = Array.isArray(sale?.workers) ? sale.workers : [];
  if (workers.length) {
    return workers.some((line) => String(line?.worker || "").trim() === target);
  }
  return String(sale?.worker || "")
    .split(",")
    .map((name) => name.trim())
    .includes(target);
}

function countWorkerStatementRows(sales, workerName, startDate, endDate) {
  const rangeStart = String(startDate || "").slice(0, 10);
  const rangeEnd = String(endDate || "").slice(0, 10);
  let count = 0;
  for (const sale of sales) {
    const saleDate = String(sale?.date || "").slice(0, 10);
    if (rangeStart && saleDate < rangeStart) continue;
    if (rangeEnd && saleDate > rangeEnd) continue;
    if (!saleHasWorker(sale, workerName)) continue;
    const workers = Array.isArray(sale?.workers) ? sale.workers : [];
    if (workers.length) {
      count += workers.filter((line) => String(line?.worker || "").trim() === workerName).length;
    } else {
      count += 1;
    }
  }
  return count;
}

export function extractWorkerStatementQuery(text) {
  const raw = String(text || "").trim();
  const range = resolveStatementPeriodFromInput(raw);
  let workerName = raw
    .replace(/\uC2DC\uACF5\uBE44\s*\uB0B4\uC5ED\uC11C|\uC2DC\uACF5\uB0B4\uC5ED\uC11C|\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C/g, "")
    .replace(
      /\uC774\uBC88\uB2EC|\uC774\uBC88 \uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C \uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C \uB2EC/g,
      "",
    )
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4/g, "")
    .replace(/\d{1,2}\s*\uC77C/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\uC2DC\uACF5\uC790|\uB0B4\uC5ED\uC11C|\uC870\uD68C|\uCC3E/g, "")
    .replace(TRAILING_CHAT_ACTION_SUFFIX, "")
    .trim();

  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) workerName = possessive[1].trim();

  return {
    workerName,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
  };
}

export function toolOpenWorkerConstructionCostStatement({ workerName, startDate, endDate, period }) {
  const state = getErpState(["sales", "workers"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const query = String(workerName || "").trim();
  if (!query) {
    return { ok: false, error: "\uC2DC\uACF5\uC790 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const worker = findWorkerByListName(workers, query);
  if (!worker) {
    return { ok: false, error: `"${query}" \uC2DC\uACF5\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let periodLabel = "";
  if (!rangeStart || !rangeEnd) {
    const parsed = resolveMonthRangeFromInput(String(period || "").trim() || "\uC774\uBC88\uB2EC");
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    periodLabel = parsed.label;
  } else {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
  }

  const resolvedName = String(worker.name || query).trim();
  const rowCount = countWorkerStatementRows(sales, resolvedName, rangeStart, rangeEnd);

  return {
    ok: true,
    workerName: resolvedName,
    startDate: rangeStart,
    endDate: rangeEnd,
    periodLabel,
    rowCount,
  };
}

export function tryRuleBasedWorkerStatementOpen(message) {
  const text = String(message || "").trim();
  if (
    !text.includes("\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C") &&
    !text.includes("\uC2DC\uACF5\uB0B4\uC5ED\uC11C") &&
    !text.includes("\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C")
  ) {
    return null;
  }
  if (!/(?:\uC5F4|\uBD10|\uCC28|\uC774\uB3D9|\uD655\uC778|\uC918|\uC0DD\uC131|\uBCF4\uAE30)/.test(text)) return null;
  const { workerName, startDate, endDate } = extractWorkerStatementQuery(text);
  if (!workerName) return null;
  return toolOpenWorkerConstructionCostStatement({ workerName, startDate, endDate });
}

export function buildChatActionsFromWorkerStatementOpen(result) {
  if (!result?.ok || !result.workerName) return [];
  return [
    {
      type: "open_worker_construction_cost_statement",
      workerName: result.workerName,
      startDate: result.startDate,
      endDate: result.endDate,
      autoGenerate: true,
    },
  ];
}

export function formatWorkerStatementOpenAnswer(data) {
  if (!data.ok) return data.error || "\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const period = data.periodLabel || `${data.startDate}~${data.endDate}`;
  if (!data.rowCount) {
    return `${data.workerName} \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C(${period})\uB97C \uC5F4\uC5B4 \uC904\uB2C8\uB2E4. \uD574\uB2F9 \uAE30\uAC04 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  return `${data.workerName} \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C(${period}, ${data.rowCount}\uAC74)\uB97C \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.`;
}

function stripStatementQueryNoise(raw) {
  return String(raw || "")
    .replace(/\uC2DC\uACF5\uBE44\s*\uB0B4\uC5ED\uC11C|\uC2DC\uACF5\uB0B4\uC5ED\uC11C|\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C/g, "")
    .replace(
      /\uC774\uBC88\uB2EC|\uC774\uBC88 \uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C \uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C \uB2EC/g,
      "",
    )
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4/g, "")
    .replace(/\d{1,2}\s*\uC77C/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\uC785\uAE08\uB0B4\uC5ED|\uC785\uAE08 \uB0B4\uC5ED|\uC785\uAE08\uB0B4\uC5ED|\uC138\uAE08\uACC4\uC0B0\uC11C|\uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED/g, "")
    .replace(/\uAC70\uB798\uCC98|\uC2DC\uACF5\uC790|\uB0B4\uC5ED\uC11C|\uC5D0\uC11C|\uBD80\uD130|\uB9CC\uB4E4/g, "")
    .replace(TRAILING_CHAT_ACTION_SUFFIX, "")
    .trim();
}

export function extractClientStatementQuery(text) {
  const raw = String(text || "").trim();
  const expanded = expandSynonymsForExtraction(raw);
  const range = resolveStatementPeriodFromInput(expanded);
  let clientName = extractNameBeforeIntent(expanded, "constructionStatement");
  if (!clientName) clientName = stripStatementQueryNoise(expanded);
  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) clientName = possessive[1].trim();
  return {
    clientName,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
  };
}

export function isDepositHistoryAllPeriodQuery(text) {
  const raw = String(text || "");
  if (!chatIncludesIntent(raw, "depositHistory")) return false;
  return /(?:\uBAA8\uB4E0|\uC804\uCCB4|\uC804\uBD80)/.test(raw);
}

function stripDepositHistoryClientName(name) {
  return stripPeriodFromClientQuery(
    String(name || "")
      .replace(/(?:\uBAA8\uB4E0|\uC804\uCCB4|\uC804\uBD80)\s*/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function stripPeriodFromClientQuery(name) {
  return String(name || "")
    .replace(
      /\uC774\uBC88\uB2EC|\uC774\uBC88 \uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C \uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C \uB2EC/g,
      "",
    )
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4(?:\uB2EC)?/g, "")
    .replace(/\d{1,2}\s*\uC77C/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDepositHistoryQuery(text) {
  const raw = String(text || "").trim();
  const expanded = expandSynonymsForExtraction(raw);
  const range = resolveStatementPeriodFromInput(expanded);
  const allHistory = isDepositHistoryAllPeriodQuery(expanded);
  const clientName = stripDepositHistoryClientName(extractNameBeforeIntent(expanded, "depositHistory"));
  return {
    clientName,
    allHistory,
    startDate: allHistory ? "" : range.startDate,
    endDate: allHistory ? "" : range.endDate,
    periodLabel: allHistory ? "" : range.label,
  };
}

export function extractTaxInvoiceHistoryQuery(text) {
  const raw = String(text || "").trim();
  const expanded = expandSynonymsForExtraction(raw);
  const range = resolveStatementPeriodFromInput(expanded);
  const clientName = extractNameBeforeIntent(expanded, "taxInvoice");
  return {
    clientName,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
  };
}

function filterClientSalesInRange(sales, matchedClients, clientFilterKeys, startDate, endDate) {
  const rangeStart = String(startDate || "").slice(0, 10);
  const rangeEnd = String(endDate || "").slice(0, 10);
  return sales.filter((sale) => {
    const saleDate = String(sale?.date || "").slice(0, 10);
    if (rangeStart && saleDate < rangeStart) return false;
    if (rangeEnd && saleDate > rangeEnd) return false;
    return saleMatchesClientFilter(sale.client, matchedClients, clientFilterKeys);
  });
}

export function toolOpenClientConstructionCostStatement({ clientName, startDate, endDate, period }) {
  const state = getErpState(["sales", "clients"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const query = String(clientName || "").trim();
  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, query);
  if (!matchedClients.length) {
    return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let periodLabel = "";
  if (!rangeStart || !rangeEnd) {
    const parsed = resolveStatementPeriodFromInput(String(period || "").trim() || "\uC774\uBC88\uB2EC");
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    periodLabel = parsed.label;
  } else {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
  }

  const clientFilterKeys = buildClientFilterKeys(query, matchedClients);
  const resolvedName = String(matchedClients[0]?.name || query).trim();
  const matchedSales = filterClientSalesInRange(sales, matchedClients, clientFilterKeys, rangeStart, rangeEnd);
  const saleIds = matchedSales
    .map((sale) => sale.id)
    .filter((id) => id != null && id !== "");

  return {
    ok: true,
    clientName: resolvedName,
    startDate: rangeStart,
    endDate: rangeEnd,
    periodLabel,
    rowCount: matchedSales.length,
    saleIds,
  };
}

export function toolOpenClientDepositHistory({ clientName, allHistory, startDate, endDate, period }) {
  const state = getErpState(["clients", "paymentVouchers"]);
  const data = state.data || {};
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const paymentVouchers = Array.isArray(data.paymentVouchers) ? data.paymentVouchers : [];
  const query = String(clientName || "").trim();
  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, query);
  if (!matchedClients.length) {
    return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }

  const clientFilterKeys = buildClientFilterKeys(query, matchedClients);
  const resolvedName = String(matchedClients[0]?.name || query).trim();
  const showAllHistory =
    allHistory === true ||
    /^(?:\uC804\uCCB4|\uBAA8\uB4E0|\uC804\uBD80|all)$/i.test(String(period || "").trim());

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let periodLabel = "";
  if (!showAllHistory && (!rangeStart || !rangeEnd)) {
    const parsed = resolveStatementPeriodFromInput(String(period || "").trim() || "\uC774\uBC88\uB2EC");
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    periodLabel = parsed.label;
  } else if (!showAllHistory && rangeStart && rangeEnd) {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
  }

  const depositCount = paymentVouchers.filter((voucher) => {
    if (!labelMatchesClientKeys(voucher?.client, clientFilterKeys)) return false;
    if (showAllHistory) return true;
    const voucherDate = String(voucher?.date || "").slice(0, 10);
    if (rangeStart && voucherDate < rangeStart) return false;
    if (rangeEnd && voucherDate > rangeEnd) return false;
    return true;
  }).length;

  return {
    ok: true,
    clientName: resolvedName,
    depositCount,
    allHistory: showAllHistory,
    startDate: showAllHistory ? undefined : rangeStart,
    endDate: showAllHistory ? undefined : rangeEnd,
    periodLabel,
  };
}

export function toolOpenClientTaxInvoiceHistory({ clientName, startDate, endDate, period }) {
  const state = getErpState(["clients", "taxInvoices"]);
  const data = state.data || {};
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const taxInvoices = Array.isArray(data.taxInvoices) ? data.taxInvoices : [];
  const query = String(clientName || "").trim();
  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, query);
  if (!matchedClients.length) {
    return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let periodLabel = "";
  if (!rangeStart || !rangeEnd) {
    const parsed = resolveStatementPeriodFromInput(String(period || "").trim() || "\uC774\uBC88\uB2EC");
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    periodLabel = parsed.label;
  } else {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
  }

  const clientFilterKeys = buildClientFilterKeys(query, matchedClients);
  const resolvedName = String(matchedClients[0]?.name || query).trim();
  const invoiceCount = taxInvoices.filter((invoice) => {
    const issueDate = String(invoice?.issueDate || "").slice(0, 10);
    if (rangeStart && issueDate < rangeStart) return false;
    if (rangeEnd && issueDate > rangeEnd) return false;
    return labelMatchesClientKeys(invoice?.client, clientFilterKeys);
  }).length;

  return {
    ok: true,
    clientName: resolvedName,
    startDate: rangeStart,
    endDate: rangeEnd,
    periodLabel,
    invoiceCount,
  };
}

export function tryRuleBasedClientStatementOpen(message) {
  const text = String(message || "").trim();
  if (!chatIncludesIntent(text, "constructionStatement")) {
    return null;
  }
  if (!hasChatOpenVerb(text) && !/(?:\uC0DD\uC131)/.test(text)) return null;
  const { clientName, startDate, endDate } = extractClientStatementQuery(text);
  if (!clientName) return null;
  const result = toolOpenClientConstructionCostStatement({ clientName, startDate, endDate });
  if (!result.ok) return result;
  const state = getErpState(["clients", "workers"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  if (!findClientsByQuery(clients, clientName).length) return null;
  if (findWorkerByListName(workers, clientName)) return null;
  return result;
}

export function tryRuleBasedStatementOpen(message) {
  const clientResult = tryRuleBasedClientStatementOpen(message);
  if (clientResult) return clientResult;
  return tryRuleBasedWorkerStatementOpen(message);
}

export function tryRuleBasedDepositOpen(message) {
  const text = String(message || "").trim();
  if (!chatIncludesIntent(text, "depositHistory")) {
    return null;
  }
  const { clientName, allHistory, startDate, endDate } = extractDepositHistoryQuery(text);
  if (!clientName) return null;
  return toolOpenClientDepositHistory({ clientName, allHistory, startDate, endDate });
}

export function tryRuleBasedTaxInvoiceOpen(message) {
  const text = String(message || "").trim();
  if (!chatIncludesIntent(text, "taxInvoice")) return null;
  if (!hasChatOpenVerb(text) && !/\uB0B4\uC5ED/.test(text)) return null;
  const { clientName, startDate, endDate } = extractTaxInvoiceHistoryQuery(text);
  if (!clientName) return null;
  return toolOpenClientTaxInvoiceHistory({ clientName, startDate, endDate });
}

export function includesBankKeyword(text) {
  const raw = String(text || "");
  return chatIncludesIntent(raw, "bank", { excludeIntents: ["depositHistory"] });
}

export function tryRuleBasedBankOpen(message) {
  const text = String(message || "").trim();
  if (!includesBankKeyword(text)) return null;
  if (!hasChatOpenVerb(text)) return null;
  const period = resolveStatementPeriodFromInput(text);
  return {
    ok: true,
    startDate: period.startDate,
    endDate: period.endDate,
    periodLabel: period.label,
  };
}

export function buildChatActionsFromBankOpen(result) {
  if (!result?.ok) return [];
  return [
    {
      type: "navigate_erp",
      page: "accounting",
      label: "\uD1B5\uC7A5",
      accountingTab: "bank",
      startDate: result.startDate,
      endDate: result.endDate,
    },
  ];
}

export function formatBankOpenAnswer(data) {
  if (!data.ok) return data.error || "\uD1B5\uC7A5 \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const period = data.periodLabel || `${data.startDate}~${data.endDate}`;
  return `\uD1B5\uC7A5 \uB0B4\uC5ED(${period})\uC744 \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.`;
}

export function buildChatActionsFromClientStatementOpen(result) {
  if (!result?.ok || !result.clientName) return [];
  return [
    {
      type: "open_client_statement",
      client: result.clientName,
      startDate: result.startDate,
      endDate: result.endDate,
      saleIds: Array.isArray(result.saleIds) ? result.saleIds : [],
      autoGenerate: true,
    },
  ];
}

export function buildChatActionsFromDepositOpen(result) {
  if (!result?.ok || !result.clientName) return [];
  return [
    {
      type: "open_client_deposit_history",
      clientName: result.clientName,
      allHistory: result.allHistory === true,
      startDate: result.startDate,
      endDate: result.endDate,
    },
  ];
}

export function buildChatActionsFromTaxInvoiceOpen(result) {
  if (!result?.ok || !result.clientName) return [];
  return [
    {
      type: "open_client_tax_invoice_history",
      clientName: result.clientName,
      startDate: result.startDate,
      endDate: result.endDate,
    },
  ];
}

export function formatClientStatementOpenAnswer(data) {
  if (!data.ok) return data.error || "\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const period = data.periodLabel || `${data.startDate}~${data.endDate}`;
  if (!data.rowCount) {
    return `${data.clientName} \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C(${period})\uB97C \uC0DD\uC131\uD574 \uC5F4\uC5B4 \uC904\uB2C8\uB2E4. \uD574\uB2F9 \uAE30\uAC04 \uC804\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  return `${data.clientName} \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C(${period}, ${data.rowCount}\uAC74)\uB97C \uC0DD\uC131\uD574 \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.`;
}

export function formatDepositOpenAnswer(data) {
  if (!data.ok) return data.error || "\uC785\uAE08\uB0B4\uC5ED \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const period = data.periodLabel || (data.startDate && data.endDate ? `${data.startDate}~${data.endDate}` : "");
  const countHint =
    data.depositCount > 0
      ? ` (${period || (data.allHistory ? "\uC804\uCCB4" : "")} ${data.depositCount}\uAC74)`
      : period
        ? ` (${period})`
        : "";
  const periodHint = data.allHistory ? " \uC804\uCCB4 \uAE30\uAC04" : period ? ` (${period})` : "";
  return `${data.clientName} \uAC70\uB798\uCC98 \uC785\uAE08\uB0B4\uC5ED${periodHint}\uC744 \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.${countHint}`;
}

export function formatTaxInvoiceOpenAnswer(data) {
  if (!data.ok) return data.error || "\uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const period = data.periodLabel || `${data.startDate}~${data.endDate}`;
  const countHint = data.invoiceCount > 0 ? ` (${data.invoiceCount}\uAC74)` : "";
  return `${data.clientName} \uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED(${period})${countHint}\uC744 \uC5F4\uC5B4 \uC904\uB2C8\uB2E4.`;
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
      description:
        "\uAC70\uB798\uCC98 \uC774\uB984(\uB610\uB294 \uBCC4\uCE59)\uC73C\uB85C \uB2F4\uB2F9\uC790 \uBAA9\uB85D\uACFC \uC804\uD654\uBC88\uD638\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. '\uC778\uB514\uD37C \uAE40\uD718\uAD6D \uC804\uD654\uBC88\uD638'\uCC98\uB7FC \uAC70\uB798\uCC98+\uB2F4\uB2F9\uC790 \uC774\uB984 \uC870\uD569 \uC2DC personName\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 \uB610\uB294 \uBCC4\uCE59 (\uC608: \uC778\uB514\uD37C, \uD0A4\uCE9C\uC81C\uB2C8\uC2A4)" },
          personName: { type: "string", description: "\uB2F4\uB2F9\uC790 \uC778\uC0C1 (\uC608: \uAE40\uD718\uAD6D). \uAC70\uB798\uCC98+\uB2F4\uB2F9\uC790 \uC804\uD654 \uC870\uD68C \uC2DC \uC9C0\uC815." },
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
      name: "open_client_calendar",
      description: "ERP \uCE98\uB9B0\uB354/\uB2EC\uB825 \uD654\uBA74\uC744 \uC5F4\uC796\uB2C8\uB2E4. '\uC778\uB514\uD37C \uCE98\uB9B0\uB354 \uC5F4\uC5B4' \uCC98\uB7FC \uAC70\uB798\uCC98 \uD544\uD130 \uC801\uC6A9. SC \uC2A4\uCF00\uC904\uC740 open_sc_schedule \uC0AC\uC6A9.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uC778\uB514\uD37C, \uCEE4\uC2A4\uD798). \uBE44\uC6B0\uBA74 ERP \uCE98\uB9B0\uB354 \uC804\uCCB4 \uC624\uD508." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_sc_schedule",
      description: "SC(sc.teammillimeter.com) \uC2A4\uCF00\uC904 \uC0AC\uC774\uD2B8\uB97C \uC5F4\uC796\uB2C8\uB2E4. \uAC70\uB798\uCC98 \uC774\uB984 \uC5C6\uC774 '\uC2A4\uCF00\uC904 \uC5F4\uC5B4', 'SC \uC5F4\uC5B4' \uC694\uCCAD \uC2DC \uC0AC\uC6A9.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_client_site_request_calendar",
      description: "\uAC70\uB798\uCC98 \uC5C5\uCCB4\uBCC4 \uCE98\uB9B0\uB354(\uD604\uC7A5 \uC811\uC218 \uC2A4\uCF00\uC904)\uB97C \uC5F4\uC796\uB2C8\uB2E4. '\uC778\uB514\uD37C \uC2A4\uCF00\uC904 \uC5F4\uC5B4', '\uC778\uB514\uD37C \uC77C\uC815 \uC5F4\uC5B4' \uCC98\uB7FC \uAC70\uB798\uCC98+\uC2A4\uCF00\uC904/\uC77C\uC815 \uC694\uCCAD \uC2DC \uC0AC\uC6A9.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uC778\uB514\uD37C)" },
        },
        required: ["clientName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_sale_voucher",
      description: "\uAC70\uB798\uCC98\uC640 \uB0A0\uC9DC\uB85C \uB9E4\uCD9C \uC804\uD45C\uB97C \uCC3E\uC2B5\uB2C8\uB2E4. \uC804\uD45C \uC5F4\uAE30 \uC694\uCCAD \uC2DC \uC0AC\uC6A9\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uCEE4\uC2A4\uD798, \uC778\uB514\uD37C)" },
          date: { type: "string", description: "YYYY-MM-DD \uB610\uB294 6\uC6D41\uC77C \uD615\uD0DC \uB0A0\uC9DC" },
          site: { type: "string", description: "\uD604\uC7A5\uBA85 (\uC120\uD0DD)" },
        },
        required: ["clientName", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_worker_info",
      description:
        "\uC2DC\uACF5\uC790 \uAE30\uBCF8 \uC815\uBCF4(\uC774\uB984, \uAD6C\uBD84, \uCC28\uB7C9\uBC88\uD638, \uC804\uD654\uBC88\uD638)\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. '\uCC28\uBC88\uD638', '\uCC28\uB7C9\uBC88\uD638', '\uCC28\uB7C9 \uBC88\uD638' \uBAA8\uB450 \uCC28\uB7C9\uBC88\uD638 \uC870\uD68C\uC785\uB2C8\uB2E4. \uC2DC\uACF5\uC790 \uC774\uB984\uC740 \uCC28\uB7C9\uBC88\uD638 \uC55E\uB098 \uB4A4\uC5D0 \uC62C \uC218 \uC788\uC2B5\uB2C8\uB2E4(\uC608: '\uBC15\uC900\uADDC \uCC28\uB7C9\uBC88\uD638', '\uCC28\uB7C9\uBC88\uD638 \uBC15\uC900\uADDC'). name\uC5D0 \uCD94\uCD9C\uB41C \uC2DC\uACF5\uC790 \uC774\uB984\uB9CC \uC804\uB2EC\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "\uCC28\uB7C9\uBC88\uD638 \uC870\uD68C \uC2DC\uACF5\uC790 \uC774\uB984 (\uC608: '\uBC15\uC900\uADDC \uCC28\uB7C9\uBC88\uD638' \u2192 '\uBC15\uC900\uADDC')",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_worker_construction_cost_statement",
      description: "\uC2DC\uACF5\uC790 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C/\uC2DC\uACF5\uB0B4\uC5ED\uC11C(\uAC1C\uC778 \uC2DC\uACF5\uB0B4\uC5ED\uC11C)\uB97C \uC5F4\uC796\uB2C8\uB2E4. \uC608: \uAE40\uBBFC\uC131 5\uC6D4 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uC5F4\uC5B4\uC918, \uAE40\uBBFC\uC131 \uC774\uBC88\uB2EC \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C.",
      parameters: {
        type: "object",
        properties: {
          workerName: { type: "string", description: "\uC2DC\uACF5\uC790 \uC774\uB984 (\uC608: \uAE40\uBBFC\uC131)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          period: { type: "string", description: "5\uC6D4, \uC774\uBC88\uB2EC, \uC9C0\uB09C\uB2EC, 2026\uB144 5\uC6D4 \uB4F1 (\uC2DC\uC791/\uC885\uB8CC\uC77C \uC0DD\uB7B5 \uC2DC). \uB144\uB3C4 \uC5C6\uC73C\uBA74 \uC62C\uD574." },
        },
        required: ["workerName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_client_construction_cost_statement",
      description: "\uAC70\uB798\uCC98 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C\uB97C \uC0DD\uC131\uD574 \uC5F4\uC796\uB2C8\uB2E4. \uC608: \uC778\uB514\uD37C \uC774\uBC88\uB2EC \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C, \uC778\uB514\uD37C \uC774\uBC88\uB2EC 15\uC77C~30\uC77C \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uC778\uB514\uD37C)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          period: { type: "string", description: "\uC774\uBC88\uB2EC, 5\uC6D4 \uB4F1 (\uC2DC\uC791/\uC885\uB8CC\uC77C \uC0DD\uB7B5 \uC2DC)" },
        },
        required: ["clientName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_client_deposit_history",
      description: "\uAC70\uB798\uCC98 \uC785\uAE08\uB0B4\uC5ED \uD654\uBA74\uC744 \uC5F4\uC796\uB2C8\uB2E4. '\uBAA8\uB4E0', '\uC804\uCCB4' \uC785\uAE08\uB0B4\uC5ED\uC740 \uAE30\uAC04 \uD544\uD130 \uC5C6\uC774 \uC804\uCCB4 \uB0B4\uC5ED\uC744 \uC5F4\uC5B4\uC918\uC694.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uC778\uB514\uD37C)" },
          allHistory: { type: "boolean", description: "\uC804\uCCB4 \uAE30\uAC04 \uC785\uAE08\uB0B4\uC5ED (\uBAA8\uB4E0/\uC804\uCCB4 \uC694\uCCAD \uC2DC true)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          period: { type: "string", description: "\uC804\uCCB4, \uBAA8\uB4E0, 5\uC6D4, \uC774\uBC88\uB2EC \uB4F1 (\uC120\uD0DD)" },
        },
        required: ["clientName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_client_tax_invoice_history",
      description: "\uAC70\uB798\uCC98 \uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED \uD654\uBA74\uC744 \uC5F4\uC796\uB2C8\uB2E4. \uC608: \uC778\uB514\uD37C \uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED \uC5F4\uC5B4\uC918.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uC778\uB514\uD37C)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC\uC77C YYYY-MM-DD (\uC120\uD0DD)" },
          period: { type: "string", description: "\uC774\uBC88\uB2EC, 5\uC6D4 \uB4F1 (\uC120\uD0DD)" },
        },
        required: ["clientName"],
      },
    },
  },
];

export function executeErpChatTool(name, args, user, question) {
  const rawQuestion = String(question || args?.rawQuery || "").trim();
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
    case "find_sale_voucher":
      return toolFindSaleVoucher(args || {});
    case "open_client_calendar":
      return toolOpenClientCalendar(args || {});
    case "open_sc_schedule":
      return toolOpenScSchedule();
    case "open_client_site_request_calendar": {
      const parsed = rawQuestion ? extractScScheduleClientQuery(rawQuestion) : "";
      return toolOpenClientSiteRequestCalendar({
        clientName: args?.clientName || parsed,
      });
    }
    case "open_worker_construction_cost_statement":
      return toolOpenWorkerConstructionCostStatement(args || {});
    case "open_client_construction_cost_statement":
      return toolOpenClientConstructionCostStatement(args || {});
    case "open_client_deposit_history": {
      const parsed = rawQuestion ? extractDepositHistoryQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (merged.allHistory !== true && parsed.allHistory) merged.allHistory = parsed.allHistory;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolOpenClientDepositHistory(merged);
    }
    case "open_client_tax_invoice_history": {
      const parsed = rawQuestion ? extractTaxInvoiceHistoryQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolOpenClientTaxInvoiceHistory(merged);
    }
    default:
      return { ok: false, error: `\uC54C \uC218 \uC5C6\uB294 \uB3C4\uAD6C: ${name}` };
  }
}

/** Info-query rule paths (vehicle, unpaid, schedule, contacts) without open/navigation. */
export function tryRuleBasedInfoQuery(message, user) {
  return tryRuleBasedChat(message, user);
}

const CHAT_GREETING_PATTERN =
  /^(?:안녕(?:하세요|하십니까)?|반가(?:워|워요|웠습니다)?|하이|헬로(?:우)?|hello|hi|hey|굿모닝|good(?:morning|afternoon|evening)|ㅎㅇ)(?:[!?.,~…]*)$/i;

export function isChatGreeting(message) {
  const raw = String(message || "").trim();
  if (!raw) return false;
  const normalized = raw.replace(/\s+/g, "");
  return CHAT_GREETING_PATTERN.test(normalized);
}

const CASUAL_ERP_BLOCK_PATTERN =
  /미수|입금|출금|통장|계좌|세금계산서|전표|일정|스케줄|캘린더|달력|열어|열어줘|조회|거래처|시공|차량|차번|연락처|전화|담당|내역서|시공비|매출|분석|근태|대시보드|홈금/i;

export function isCasualConversationQuery(message) {
  const raw = String(message || "").trim();
  if (!raw) return false;
  if (isChatGreeting(raw)) return true;

  const normalized = raw.replace(/\s+/g, "");
  if (CASUAL_ERP_BLOCK_PATTERN.test(normalized)) return false;

  return /(?:날씨|weather|기온|미세먼지|우산|비올|눈올|체감온도)|(?:심심|농담|재밌|지루|기분|피곤|힘들|행복)|(?:어때|어떄|어떠|뭐해|뭐하|추천)|(?:고마워|감사|미안)|(?:ㅋㅋ|ㅎㅎ)/i.test(
    normalized,
  );
}

export function formatCasualFallbackAnswer(message) {
  const normalized = String(message || "").replace(/\s+/g, "");
  if (/(?:날씨|weather|기온|미세먼지|우산|비올|눈올)/i.test(normalized)) {
    return [
      "실시간 날씨는 ERP 챗봇에서 확인할 수 없어요.",
      "기상청 앱이나 네이버·다음 날씨에서 보시면 가장 정확합니다.",
    ].join("\n");
  }
  return null;
}

export function formatGreetingAnswer() {
  return [
    "안녕하세요! TeamMillimeter ERP 어시스턴트입니다.",
    "",
    "다음과 같이 도와드릴 수 있어요.",
    "· 거래처 미수, 일정, 담당자/시공자 연락처·차량번호 조회",
    "· 거래처 입금내역, 세금계산서, 시공비내역서 열기",
    "· 캘린더, SC 스케줄, 통장, 전표 등 ERP 화면 이동",
    "",
    '예: "인디퍼 미수", "내일 일정", "인디퍼 입금내역 열어줘", "어떤 화면 열 수 있어?"',
  ].join("\n");
}

export function tryRuleBasedChat(message, user) {
  const text = String(message || "").trim();
  if (!text) return null;

  if (isChatGreeting(text)) {
    return formatGreetingAnswer();
  }

  const kwUnpaid = "\uBBF8\uC218";
  const kwTomorrow = "\uB0B4\uC77C";
  const kwToday = "\uC624\uB298";
  const kwDayAfter = "\uBAA8\uB798";
  const kwSchedule = "\uC77C\uC815";
  const kwSc = "\uC2A4\uCF00\uC904";
  const kwPhone = "\uC804\uD654";
  const kwContact = "\uC5F0\uB77D\uCC98";
  const kwNumber = "\uBC88\uD638";
  const kwManager = "\uB2F4\uB2F9";

  if (chatIncludesIntent(text, "unpaid") || text.includes(kwUnpaid)) {
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

  if ((text.includes(kwSchedule) || text.includes(kwSc)) && !(hasChatOpenVerb(text) && includesScScheduleKeyword(text))) {
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

  if (isWorkerVehicleQuery(text)) {
    const name = extractWorkerNameFromVehicleQuery(text);
    if (name) {
      return formatWorkerAnswer(toolGetWorkerInfo({ name }, user));
    }
  }

  if (text.includes(kwManager) || text.includes(kwPhone) || text.includes(kwContact) || text.includes(kwNumber)) {
    const parsed = parseClientPersonContactQuery(text);
    if (parsed) {
      return formatClientContactLookupAnswer(toolLookupClientContact(parsed, user));
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
  if (data.personName && data.clientName && !Array.isArray(data.clients)) {
    return formatClientContactLookupAnswer(data);
  }
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
