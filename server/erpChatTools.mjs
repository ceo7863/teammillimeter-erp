import { getErpState } from "./db.mjs";
import { config } from "./config.mjs";
import { getClientBusinessRegMeta } from "./clientBusinessReg.mjs";
import { listSentStatementArchiveMetas } from "./pdfArchive.mjs";
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

function normalizeChatMonthText(text) {
  return String(text || "")
    .replace(/(\d{1,2})\s*\uC6D4\s*\uB2EC/g, "$1\uC6D4")
    .replace(/(\d{1,2})\s*\uC6D4\uB2EC/g, "$1\uC6D4");
}

const CHAT_MONTH_KEYWORD_PATTERN =
  /\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC800\uBC88\s*\uB2EC|\uC800\uBC88\uB2EC|\uC9C0\uB09C\s*\uB2EC|\uC9C0\uB09C\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\s*\uB2EC|\uB2E4\uC74C\uB2EC|(?:(?:\d{4})\s*\uB144\s*)?(?:\d{1,2})\s*\uC6D4(?:\uB2EC)?/;

const CHAT_MONTH_KEYWORD_STRIP_PATTERN =
  /\uC774\uBC88\uB2EC|\uC774\uBC88 \uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC800\uBC88 \uB2EC|\uC800\uBC88\uB2EC|\uC9C0\uB09C \uB2EC|\uC9C0\uB09C\uB2EC|\uC804\uC6D4|\uB2E4\uC74C \uB2EC|\uB2E4\uC74C\uB2EC/g;

function chatHasMonthKeyword(text) {
  return CHAT_MONTH_KEYWORD_PATTERN.test(String(text || ""));
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
  if (!raw) return today;
  if (raw.includes("\uC5B4\uC81C") || raw.toLowerCase() === "yesterday") return addDaysISO(today, -1);
  if (raw.includes("\uC624\uB298") || raw.toLowerCase() === "today") return today;
  if (raw.includes("\uB0B4\uC77C") || raw.toLowerCase() === "tomorrow") return addDaysISO(today, 1);
  if (raw.includes("\uBAA8\uB798")) return addDaysISO(today, 2);
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
  const raw = normalizeChatMonthText(String(input || "").trim());
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
    raw.includes("\uC800\uBC88\uB2EC") ||
    raw.includes("\uC800\uBC88 \uB2EC")
  ) {
    const range = monthRangeISO(-1);
    return { ...range, label: `\uC800\uBC88 \uB2EC (${range.startDate}~${range.endDate})` };
  }
  if (
    raw.includes("\uC9C0\uB09C\uB2EC") ||
    raw.includes("\uC9C0\uB09C \uB2EC") ||
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
    const label = yearMonthMatch[1]
      ? `${year}\uB144 ${month}\uC6D4 (${startDate}~${endDate})`
      : `${month}\uC6D4 (${startDate}~${endDate})`;
    return { startDate, endDate, label };
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

function scheduleMatchesWorkerFilter(schedule, workerName, workers) {
  const worker = findWorkerByListName(workers, workerName);
  if (!worker) return false;
  const targetName = String(worker.name || workerName || "").trim();
  const participantNames = Array.isArray(schedule?.participantNames) ? schedule.participantNames : [];
  return participantNames.some((name) => {
    const matched = findWorkerByListName(workers, name);
    if (matched && String(matched.name || "").trim() === targetName) return true;
    return String(name || "").trim() === targetName;
  });
}

function resolveScheduleNameFilter(text, clients, workers) {
  const entities = resolveChatEntitiesFromText(text, clients, workers);
  if (entities.workerName && !entities.clientName) {
    return { workerName: entities.workerName };
  }
  if (entities.clientName && !entities.workerName) {
    return { clientName: entities.clientName };
  }
  if (entities.clientName && entities.workerName) {
    if (/\uD604\uC7A5|\uAC70\uB798\uCC98|\uBBF8\uC218|\uACC4\uC0B0\uC11C|\uC785\uAE08|\uB0B4\uC5ED\uC11C|\uC0AC\uC5C5\uC790/.test(text)) {
      return { clientName: entities.clientName };
    }
    return { workerName: entities.workerName };
  }

  const extracted = extractClientNameFromScheduleQuery(text);
  if (!extracted) return {};

  const resolved = resolveChatEntityKind(extracted, clients, workers);
  if (resolved.kind === "worker") return { workerName: resolved.name };
  if (resolved.kind === "client") return { clientName: resolved.name };
  return {};
}

function isConstructionStatementQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (chatIncludesIntent(raw, "depositHistory") || chatIncludesIntent(raw, "taxInvoice")) return false;
  if (chatIncludesIntent(raw, "constructionStatement")) return true;
  return raw.includes("\uB0B4\uC5ED\uC11C");
}

function hasWorkerStatementContext(text) {
  return /(?:\uC2DC\uACF5\uC790|\uC2DC\uACF5\uBE44|\uC2DC\uACF5\uB0B4\uC5ED|\uC2DC\uACF5)/.test(String(text || ""));
}

function hasClientStatementContext(text) {
  return String(text || "").includes("\uAC70\uB798\uCC98");
}

function resolveStatementNameFilter(text, clients, workers) {
  const entities = resolveChatEntitiesFromText(text, clients, workers);
  if (entities.workerName && !entities.clientName) {
    return { workerName: entities.workerName };
  }
  if (entities.clientName && !entities.workerName) {
    return { clientName: entities.clientName };
  }
  if (entities.clientName && entities.workerName) {
    if (hasClientStatementContext(text) && !hasWorkerStatementContext(text)) {
      return { clientName: entities.clientName };
    }
    if (hasWorkerStatementContext(text) && !hasClientStatementContext(text)) {
      return { workerName: entities.workerName };
    }
    return { workerName: entities.workerName };
  }

  const workerParsed = extractWorkerStatementQuery(text);
  const clientParsed = extractClientStatementQuery(text);
  const nameQuery = (workerParsed.workerName || clientParsed.clientName || "").trim();
  if (!nameQuery) return {};

  const resolved = resolveChatEntityKind(nameQuery, clients, workers);
  if (resolved.kind === "worker") return { workerName: resolved.name };
  if (resolved.kind === "client") return { clientName: resolved.name };
  if (resolved.kind === "ambiguous") {
    if (hasClientStatementContext(text) && !hasWorkerStatementContext(text)) {
      return { clientName: String(resolved.client?.name || nameQuery).trim() };
    }
    return { workerName: String(resolved.worker?.name || nameQuery).trim() };
  }
  return { unresolvedName: nameQuery };
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

function labelMentionedInText(text, label) {
  const raw = String(text || "");
  const labelStr = String(label || "").trim();
  if (!labelStr) return false;
  if (raw.includes(labelStr)) return true;
  const textKey = normalizeMatchKey(raw);
  const labelKey = normalizeMatchKey(labelStr);
  return labelKey.length >= 2 && textKey.includes(labelKey);
}

function dedupeEntitiesById(entities, idSelector) {
  const seen = new Set();
  return entities.filter((entity) => {
    const id = idSelector(entity);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function findClientsMentionedInText(text, clients = []) {
  const hits = [];
  for (const client of clients) {
    const labels = [
      client.name,
      client.taxInvoiceCorpName,
      ...parseAliasList(client.depositNameAliases),
    ].filter(Boolean);
    let matchLen = 0;
    for (const label of labels) {
      if (labelMentionedInText(text, label)) {
        matchLen = Math.max(matchLen, normalizeMatchKey(label).length);
      }
    }
    if (matchLen > 0) hits.push({ entity: client, matchLen });
  }
  hits.sort((a, b) => b.matchLen - a.matchLen);
  return dedupeEntitiesById(
    hits.map((row) => row.entity),
    (client) => String(client.id ?? client.name),
  );
}

export function findWorkersMentionedInText(text, workers = []) {
  const hits = [];
  for (const worker of workers) {
    const labels = [worker.name, ...parseAliasList(worker.depositNameAliases)].filter(Boolean);
    let matchLen = 0;
    for (const label of labels) {
      if (labelMentionedInText(text, label)) {
        matchLen = Math.max(matchLen, normalizePersonMatchKey(label).length);
      }
    }
    if (matchLen > 0) hits.push({ entity: worker, matchLen });
  }
  hits.sort((a, b) => b.matchLen - a.matchLen);
  return dedupeEntitiesById(
    hits.map((row) => row.entity),
    (worker) => String(worker.id ?? worker.name),
  );
}

export function resolveChatEntityKind(nameQuery, clients = [], workers = []) {
  const query = String(nameQuery || "").trim();
  if (!query) return { kind: "unknown" };

  const worker = findWorkerByListName(workers, query);
  const clientMatches = findClientsByQuery(clients, query);

  if (worker && !clientMatches.length) {
    return { kind: "worker", name: String(worker.name || query).trim(), worker };
  }
  if (clientMatches.length && !worker) {
    return { kind: "client", name: String(clientMatches[0]?.name || query).trim(), client: clientMatches[0] };
  }
  if (worker && clientMatches.length) {
    return {
      kind: "ambiguous",
      name: query,
      worker,
      client: clientMatches[0],
    };
  }
  return { kind: "unknown", name: query };
}

export function resolveChatEntitiesFromText(text, clients = [], workers = []) {
  const raw = String(text || "").trim();
  const mentionedClients = findClientsMentionedInText(raw, clients);
  const mentionedWorkers = findWorkersMentionedInText(raw, workers);
  return {
    clientName: mentionedClients[0] ? String(mentionedClients[0].name || "").trim() : "",
    workerName: mentionedWorkers[0] ? String(mentionedWorkers[0].name || "").trim() : "",
    clients: mentionedClients,
    workers: mentionedWorkers,
  };
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

function stripUnpaidListQueryNoise(text) {
  return String(text || "")
    .replace(/\uBBF8\uC218(?:\uAE08)?/g, "")
    .replace(/\uD604\uC7AC/g, "")
    .replace(/\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/g, "")
    .replace(/\uC774\uBC88\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC|\uAE08\uC8FC/g, "")
    .replace(CHAT_MONTH_KEYWORD_STRIP_PATTERN, "")
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4(?:\uB2EC)?/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/(?:\uBAA8\uB4E0|\uC804\uCCB4|\uC804\uBD80|\uB9AC\uC2A4\uD2B8|\uBAA9\uB85D|\uD604\uD669|\uB0B4\uC5ED|\uC870\uD68C|\uD655\uC778|\uC54C\uB824|\uC918|\?)/g, "")
    .replace(/(?:\uB97C|\uC740|\uB294|\uC758|\uC744)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUnpaidClientNameFromQuery(text) {
  const raw = String(text || "").trim();
  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) return possessive[1].trim();
  const stripped = stripUnpaidListQueryNoise(normalizeChatMonthText(expandSynonymsForExtraction(raw)));
  if (!stripped) return "";
  const state = getErpState(["clients"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const matched = findClientsByQuery(clients, stripped);
  if (matched.length) return String(matched[0]?.name || stripped).trim();
  return stripped;
}

export function isUnpaidListQuery(text) {
  const raw = String(text || "").trim();
  if (!raw.includes("\uBBF8\uC218")) return false;
  if (hasChatOpenVerb(raw) && raw.includes("\uBBF8\uC218\uAE08")) return false;

  const hasPeriod =
    chatHasMonthKeyword(raw) ||
    /(?:\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798|\uC774\uBC88\uC8FC|\uAE08\uC8FC|\d{4}-\d{2}-\d{2})/.test(raw);
  const hasListHint = /(?:\uBAA8\uB4E0|\uC804\uCCB4|\uC804\uBD80|\uB9AC\uC2A4\uD2B8|\uBAA9\uB85D|\uD604\uD669|\uB0B4\uC5ED|\uBBF8\uC218\s*\uB9AC\uC2A4\uD2B8)/.test(raw);
  const clientName = extractUnpaidClientNameFromQuery(raw);

  if (clientName && !hasPeriod && !hasListHint) return false;
  if (hasPeriod || hasListHint) return true;
  if (!clientName && hasListHint) return true;
  return false;
}

export function extractUnpaidListQuery(text) {
  const raw = String(text || "").trim();
  const expanded = normalizeChatMonthText(expandSynonymsForExtraction(raw));
  const hasMonthKeyword = chatHasMonthKeyword(expanded);
  const hasWeekKeyword = /\uC774\uBC88\uC8FC|\uAE08\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC/.test(expanded);
  const hasSingleDayKeyword = /\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/.test(expanded);
  const hasListHint = /(?:\uBAA8\uB4E0|\uC804\uCCB4|\uC804\uBD80|\uB9AC\uC2A4\uD2B8|\uBAA9\uB85D|\uD604\uD669|\uB0B4\uC5ED|\uBBF8\uC218\s*\uB9AC\uC2A4\uD2B8)/.test(expanded);

  let range = null;
  if (hasMonthKeyword && !hasWeekKeyword && !hasSingleDayKeyword) {
    range = resolveMonthRangeFromInput(expanded);
  } else if (hasWeekKeyword) {
    range = resolveDateRangeFromInput(expanded);
  } else if (hasSingleDayKeyword || /\d{4}-\d{2}-\d{2}/.test(expanded)) {
    range = resolveDateRangeFromInput(expanded);
  } else if (hasListHint) {
    range = null;
  } else {
    range = resolveMonthRangeFromInput(expanded);
  }

  let clientName = "";
  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) clientName = possessive[1].trim();
  if (!clientName) {
    clientName = stripUnpaidListQueryNoise(expanded);
    if (clientName) {
      const state = getErpState(["clients"]);
      const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
      const matched = findClientsByQuery(clients, clientName);
      if (matched.length) {
        clientName = String(matched[0]?.name || clientName).trim();
      } else {
        clientName = "";
      }
    }
  }

  return {
    clientName,
    startDate: range?.startDate,
    endDate: range?.endDate,
    periodLabel: range?.label,
    rawPeriodHint: detectDepositDayHint(expanded),
    allUnpaid: !range,
  };
}

export function toolGetUnpaidList({ startDate, endDate, clientName, period, rawQuery, limit = 30 }) {
  const state = getErpState(["clients", "sales"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const rawText = normalizeChatMonthText(String(rawQuery || period || "").trim());
  const maxRows = Math.min(Math.max(Number(limit) || 30, 1), 50);

  let rangeStart = startDate ? String(startDate).slice(0, 10) : "";
  let rangeEnd = endDate ? String(endDate).slice(0, 10) : "";
  let periodLabel = "";
  let rawPeriodHint = "";
  let allUnpaid = false;

  if (!rangeStart || !rangeEnd) {
    const parsed = extractUnpaidListQuery(rawText || "\uC774\uBC88\uB2EC \uBBF8\uC218 \uBAA9\uB85D");
    rangeStart = parsed.startDate || "";
    rangeEnd = parsed.endDate || "";
    periodLabel = parsed.periodLabel || "";
    rawPeriodHint = parsed.rawPeriodHint || "";
    allUnpaid = parsed.allUnpaid;
    if (!clientName && parsed.clientName) clientName = parsed.clientName;
  } else {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
    rawPeriodHint = detectDepositDayHint(rawText);
  }

  let clientFilterKeys = null;
  let resolvedClientName = "";
  const query = String(clientName || "").trim();
  if (query) {
    const matchedClients = findClientsByQuery(clients, query);
    if (!matchedClients.length) {
      return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
    }
    clientFilterKeys = buildClientFilterKeys(query, matchedClients);
    resolvedClientName = String(matchedClients[0]?.name || query).trim();
  }

  const unpaidRows = sales
    .map((sale) => ({
      id: sale.id,
      date: String(sale.date || "").slice(0, 10),
      client: String(sale.client || ""),
      site: String(sale.site || ""),
      amount: Number(sale.amount) || 0,
      paid: Number(sale.paid ?? sale.basePaid ?? 0) || 0,
      unpaid: getUnpaid(sale),
    }))
    .filter((row) => {
      if (row.unpaid <= 0) return false;
      if (rangeStart && row.date < rangeStart) return false;
      if (rangeEnd && row.date > rangeEnd) return false;
      if (clientFilterKeys && !labelMatchesClientKeys(row.client, clientFilterKeys)) return false;
      return true;
    })
    .sort((a, b) => b.unpaid - a.unpaid || String(b.date).localeCompare(String(a.date)));

  const totalUnpaid = unpaidRows.reduce((sum, row) => sum + row.unpaid, 0);

  return {
    ok: true,
    startDate: rangeStart || undefined,
    endDate: rangeEnd || undefined,
    periodLabel,
    rawPeriodHint,
    allUnpaid,
    clientName: resolvedClientName || undefined,
    unpaidCount: unpaidRows.length,
    totalUnpaid,
    totalUnpaidFormatted: formatKRW(totalUnpaid),
    rows: unpaidRows.slice(0, maxRows),
  };
}

export function formatUnpaidListAnswer(data) {
  if (!data.ok) return data.error || "\uBBF8\uC218 \uBAA9\uB85D \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";

  const title = data.allUnpaid
    ? "\uC804\uCCB4"
    : buildDepositPeriodTitle({
        startDate: data.startDate,
        endDate: data.endDate,
        periodLabel: data.periodLabel,
        rawPeriodHint: data.rawPeriodHint,
      });
  const clientPrefix = data.clientName ? `${data.clientName} ` : "";

  if (data.unpaidCount === 0) {
    return `${clientPrefix}${title} \uBBF8\uC218 \uB9E4\uCD9C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }

  const lines = [
    `${clientPrefix}${title} \uBBF8\uC218 \uD569\uACC4: ${data.totalUnpaidFormatted}\uC6D0 (${data.unpaidCount}\uAC74)`,
  ];
  for (const row of data.rows || []) {
    const site = row.site ? ` / ${row.site}` : "";
    lines.push(`- ${row.client}${site} (${row.date}): ${formatKRW(row.unpaid)}\uC6D0`);
  }
  if (data.unpaidCount > (data.rows || []).length) {
    lines.push(`\u2026 \uC678 ${data.unpaidCount - (data.rows || []).length}\uAC74`);
  }
  return lines.join("\n");
}

export function tryRuleBasedUnpaidListQuery(message) {
  const text = String(message || "").trim();
  if (!isUnpaidListQuery(text)) return null;
  const parsed = extractUnpaidListQuery(text);
  return formatUnpaidListAnswer(
    toolGetUnpaidList({
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      clientName: parsed.clientName,
      rawQuery: text,
    }),
  );
}

export function toolGetScheduleCount({ date, startDate, endDate, clientName, workerName, limit = 30 }) {
  const state = getErpState(["sales", "settings", "clients", "workers"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const scSchedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const workers = Array.isArray(data.workers) ? data.workers : [];
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
  const workerQuery = String(workerName || "").trim();
  let matchedClients = [];
  let clientFilterKeys = null;
  let resolvedWorkerName = "";
  if (workerQuery) {
    const worker = findWorkerByListName(workers, workerQuery);
    resolvedWorkerName = String(worker?.name || workerQuery).trim();
  }
  if (clientQuery) {
    matchedClients = findClientsByQuery(clients, clientQuery);
    clientFilterKeys = buildClientFilterKeys(clientQuery, matchedClients);
  }

  let salesRows = sales.filter((row) => {
    const rowDate = String(row.date || "").slice(0, 10);
    return rowDate >= rangeStart && rowDate <= rangeEnd;
  });
  let scRows = filterSchedulesForWeek(scSchedules, rangeStart, rangeEnd);

  if (resolvedWorkerName) {
    salesRows = salesRows.filter((row) => saleHasWorker(row, resolvedWorkerName));
    scRows = scRows.filter((row) => scheduleMatchesWorkerFilter(row, resolvedWorkerName, workers));
  } else if (clientFilterKeys) {
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
    workerName: resolvedWorkerName,
    filteredByClient: Boolean(clientQuery && !resolvedWorkerName),
    filteredByWorker: Boolean(resolvedWorkerName),
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
  const result = tryRuleBasedStatementOpen(message);
  if (result?.workerName) return result;
  return null;
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

export function isDepositTotalQuery(text) {
  const raw = String(text || "").trim();
  if (!raw.includes("\uC785\uAE08")) return false;
  if (chatIncludesIntent(raw, "depositHistory")) return false;
  if (hasChatOpenVerb(raw) && /\uB0B4\uC5ED/.test(raw)) return false;
  if (/\uC785\uAE08\s*(?:\uC561|\uD569\uACC4|\uCD1D(?:\uC561)?|\uAE08\uC561|\uC591)/.test(raw)) return true;
  if (
    /(?:\uD569\uACC4|\uCD1D\uC561|\uC591|\uC5BC\uB9C8|\uB410|\uB420|\uB41C|\uB420\uC9C0|\uB410\uC9C0)/.test(raw) &&
    raw.includes("\uC785\uAE08")
  ) {
    return true;
  }
  if (/\uB0B4\uC5ED/.test(raw)) return false;
  if (
    /(?:\uC624\uB298|\uB0B4\uC77C|\uBAA8\uB798|\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uBC88\uC8FC|\uAE08\uC8FC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC804\uC6D4)/.test(
      raw,
    ) &&
    raw.includes("\uC785\uAE08")
  ) {
    return true;
  }
  if (/\d{4}-\d{2}-\d{2}/.test(raw) && raw.includes("\uC785\uAE08")) return true;
  if (/(?:\d{1,2})\s*\uC6D4/.test(raw) && raw.includes("\uC785\uAE08")) return true;
  return false;
}

function stripDepositTotalQueryNoise(text) {
  return String(text || "")
    .replace(/\uC785\uAE08\s*(?:\uC561|\uD569\uACC4|\uCD1D(?:\uC561)?|\uAE08\uC561|\uC591)/g, "")
    .replace(/\uC785\uAE08/g, "")
    .replace(/\uC624\uB298|\uB0B4\uC77C|\uBAA8\uB798/g, "")
    .replace(/\uC774\uBC88\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC|\uAE08\uC8FC/g, "")
    .replace(
      /\uC774\uBC88\uB2EC|\uC774\uBC88 \uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C \uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C \uB2EC/g,
      "",
    )
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4(?:\uB2EC)?/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(
      /(?:\uD569\uACC4|\uCD1D\uC561|\uC591|\uAE08\uC561|\uC5BC\uB9C8|\uB418|\uB420|\uB41C|\uC870\uD68C|\uD655\uC778|\uC54C\uB824|\uC918|\?)/g,
      "",
    )
    .replace(/(?:\uB97C|\uC740|\uB294|\uC758|\uC744)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDepositDayHint(text) {
  const raw = String(text || "");
  if (raw.includes("\uC624\uB298")) return "\uC624\uB298";
  if (raw.includes("\uC5B4\uC81C")) return "\uC5B4\uC81C";
  if (raw.includes("\uB0B4\uC77C")) return "\uB0B4\uC77C";
  if (raw.includes("\uBAA8\uB798")) return "\uBAA8\uB798";
  return "";
}

export function extractDepositTotalQuery(text) {
  const raw = String(text || "").trim();
  const expanded = expandSynonymsForExtraction(raw);
  const hasMonthKeyword =
    /\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C\s*\uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C\s*\uB2EC|(?:\d{4})\s*\uB144\s*(?:\d{1,2})\s*\uC6D4|(?:\d{1,2})\s*\uC6D4(?:\uB2EC)?/.test(
      expanded,
    );
  const hasWeekKeyword = /\uC774\uBC88\uC8FC|\uAE08\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC/.test(expanded);
  const hasSingleDayKeyword = /\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/.test(expanded);

  let range;
  let periodKind = "day";
  if (hasMonthKeyword && !hasWeekKeyword && !hasSingleDayKeyword) {
    range = resolveMonthRangeFromInput(expanded);
    periodKind = "month";
  } else {
    range = resolveDateRangeFromInput(expanded);
    periodKind = range.startDate === range.endDate ? "day" : "range";
  }

  let clientName = "";
  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) clientName = possessive[1].trim();
  if (!clientName) {
    clientName = stripDepositTotalQueryNoise(expanded);
    if (clientName) {
      const state = getErpState(["clients"]);
      const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
      const matched = findClientsByQuery(clients, clientName);
      if (matched.length) {
        clientName = String(matched[0]?.name || clientName).trim();
      }
    }
  }

  return {
    clientName,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
    periodKind,
    rawPeriodHint: detectDepositDayHint(expanded),
  };
}

function buildDepositPeriodTitle(data) {
  const { startDate, endDate, periodLabel, rawPeriodHint } = data;
  const hint = String(rawPeriodHint || "").trim();
  if (startDate === endDate) {
    if (hint === "\uC624\uB298") return `\uC624\uB298(${startDate})`;
    if (hint === "\uC5B4\uC81C") return `\uC5B4\uC81C(${startDate})`;
    if (hint === "\uB0B4\uC77C") return `\uB0B4\uC77C(${startDate})`;
    if (hint === "\uBAA8\uB798") return `\uBAA8\uB798(${startDate})`;
    return `${startDate}`;
  }
  if (periodLabel) return periodLabel;
  return `${startDate}~${endDate}`;
}

export function toolGetDepositTotal({ date, startDate, endDate, clientName, period, rawQuery }) {
  const state = getErpState(["clients", "paymentVouchers"]);
  const data = state.data || {};
  const paymentVouchers = Array.isArray(data.paymentVouchers) ? data.paymentVouchers : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const rawText = String(rawQuery || period || date || "").trim();

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let periodLabel = "";
  let periodKind = "day";
  let rawPeriodHint = "";

  if (date && !rangeStart && !rangeEnd) {
    const single = resolveDateFromInput(date);
    rangeStart = single;
    rangeEnd = single;
    rawPeriodHint = String(date).trim();
    periodLabel = single;
  }

  if (!rangeStart || !rangeEnd) {
    const parsed = extractDepositTotalQuery(rawText || "\uC624\uB298");
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    periodLabel = parsed.periodLabel;
    periodKind = parsed.periodKind;
    rawPeriodHint = parsed.rawPeriodHint;
    if (!clientName && parsed.clientName) clientName = parsed.clientName;
  } else {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
    periodKind = rangeStart === rangeEnd ? "day" : "range";
    rawPeriodHint = detectDepositDayHint(rawText);
  }

  let clientFilterKeys = null;
  let resolvedClientName = "";
  const query = String(clientName || "").trim();
  if (query) {
    const matchedClients = findClientsByQuery(clients, query);
    if (!matchedClients.length) {
      return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
    }
    clientFilterKeys = buildClientFilterKeys(query, matchedClients);
    resolvedClientName = String(matchedClients[0]?.name || query).trim();
  }

  const round = (value) => Math.round(Number(value) || 0);
  const rows = [];

  for (const voucher of paymentVouchers) {
    const voucherDate = String(voucher?.date || "").slice(0, 10);
    if (rangeStart && voucherDate < rangeStart) continue;
    if (rangeEnd && voucherDate > rangeEnd) continue;
    if (clientFilterKeys && !labelMatchesClientKeys(voucher?.client, clientFilterKeys)) continue;

    const amount = round(voucher.amount);
    const vatAmount = round(voucher.vatAmount);
    const finalAmount = round(voucher.finalAmount ?? voucher.amount);
    rows.push({
      client: String(voucher?.client || "-").trim(),
      site: String(voucher?.site || "").trim(),
      date: voucherDate,
      amount,
      vatAmount,
      finalAmount,
    });
  }

  rows.sort((a, b) => b.finalAmount - a.finalAmount || String(b.date).localeCompare(String(a.date)));

  const totals = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.supply += row.amount;
      acc.vat += row.vatAmount;
      acc.final += row.finalAmount;
      return acc;
    },
    { count: 0, supply: 0, vat: 0, final: 0 },
  );

  return {
    ok: true,
    startDate: rangeStart,
    endDate: rangeEnd,
    periodLabel,
    periodKind,
    rawPeriodHint,
    clientName: resolvedClientName || undefined,
    depositCount: totals.count,
    totalFinal: totals.final,
    totalSupply: totals.supply,
    totalVat: totals.vat,
    rows,
  };
}

export function formatDepositTotalAnswer(data) {
  if (!data.ok) return data.error || "\uC785\uAE08 \uD569\uACC4 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";

  const title = buildDepositPeriodTitle(data);
  const clientPrefix = data.clientName ? `${data.clientName} ` : "";

  if (data.depositCount === 0) {
    return `${clientPrefix}${title} \uB4F1\uB85D\uB41C \uC785\uAE08\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }

  const lines = [
    `${clientPrefix}${title} \uC785\uAE08 \uD569\uACC4: ${formatKRW(data.totalFinal)}\uC6D0 (${data.depositCount}\uAC74)`,
    `\uACF5\uAE09\uAC00: ${formatKRW(data.totalSupply)}\uC6D0 \u00B7 \uBD80\uAC00\uC138: ${formatKRW(data.totalVat)}\uC6D0`,
  ];

  const preview = (data.rows || []).slice(0, 10);
  preview.forEach((row) => {
    const site = row.site ? ` / ${row.site}` : "";
    lines.push(`- ${row.client}${site}: ${formatKRW(row.finalAmount)}\uC6D0`);
  });
  if (data.depositCount > preview.length) {
    lines.push(`\u2026 \uC678 ${data.depositCount - preview.length}\uAC74`);
  }
  return lines.join("\n");
}

export function isSalesTotalQuery(text) {
  const raw = String(text || "").trim();
  if (!raw.includes("\uB9E4\uCD9C")) return false;
  if (/(?:\uC138\uAE08\s*\uACC4\uC0B0\uC11C|\uACC4\uC0B0\uC11C)/.test(raw)) return false;
  if (isTaxInvoiceSummaryQuery(raw)) return false;
  if (
    (raw.includes("\uC77C\uC815") || raw.includes("\uC2A4\uCF00\uC904")) &&
    !/(?:\uAE08\uC561|\uD569\uACC4|\uC591|\uC5BC\uB9C8|\uC561|\uC5BC\uB9C8\?)/.test(raw)
  ) {
    return false;
  }
  if (/\uB9E4\uCD9C\s*(?:\uC561|\uD569\uACC4|\uCD1D(?:\uC561)?|\uAE08\uC561|\uC591)/.test(raw)) return true;
  if (
    /(?:\uD569\uACC4|\uCD1D\uC561|\uC591|\uC5BC\uB9C8|\uB410|\uB420|\uB41C|\uC5BC\uB9C8)/.test(raw) &&
    raw.includes("\uB9E4\uCD9C")
  ) {
    return true;
  }
  if (
    /(?:\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798|\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uC774\uBC88\uC8FC|\uAE08\uC8FC|\d{4}-\d{2}-\d{2}|(?:\d{1,2})\s*\uC6D4(?:\uB2EC)?)/.test(
      raw,
    ) &&
    raw.includes("\uB9E4\uCD9C")
  ) {
    return true;
  }
  return false;
}

function stripSalesTotalQueryNoise(text) {
  return String(text || "")
    .replace(/\uB9E4\uCD9C\s*(?:\uC561|\uD569\uACC4|\uCD1D(?:\uC561)?|\uAE08\uC561|\uC591)/g, "")
    .replace(/\uB9E4\uCD9C/g, "")
    .replace(/\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/g, "")
    .replace(/\uC774\uBC88\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC|\uAE08\uC8FC/g, "")
    .replace(
      /\uC774\uBC88\uB2EC|\uC774\uBC88 \uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C \uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C \uB2EC/g,
      "",
    )
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4(?:\uB2EC)?/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(
      /(?:\uD569\uACC4|\uCD1D\uC561|\uC591|\uAE08\uC561|\uC5BC\uB9C8|\uB418|\uB420|\uB41C|\uC870\uD68C|\uD655\uC778|\uC54C\uB824|\uC918|\?)/g,
      "",
    )
    .replace(/(?:\uB97C|\uC740|\uB294|\uC758|\uC744)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSalesTotalQuery(text) {
  const raw = String(text || "").trim();
  const expanded = normalizeChatMonthText(expandSynonymsForExtraction(raw));
  const hasMonthKeyword =
    /\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C\s*\uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C\s*\uB2EC|(?:\d{4})\s*\uB144\s*(?:\d{1,2})\s*\uC6D4|(?:\d{1,2})\s*\uC6D4(?:\uB2EC)?/.test(
      expanded,
    );
  const hasWeekKeyword = /\uC774\uBC88\uC8FC|\uAE08\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC/.test(expanded);
  const hasSingleDayKeyword = /\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/.test(expanded);

  let range;
  if (hasMonthKeyword && !hasWeekKeyword && !hasSingleDayKeyword) {
    range = resolveMonthRangeFromInput(expanded);
  } else {
    range = resolveDateRangeFromInput(expanded);
  }

  let clientName = "";
  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) clientName = possessive[1].trim();
  if (!clientName) {
    clientName = stripSalesTotalQueryNoise(expanded);
    if (clientName) {
      const state = getErpState(["clients"]);
      const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
      const matched = findClientsByQuery(clients, clientName);
      if (matched.length) {
        clientName = String(matched[0]?.name || clientName).trim();
      }
    }
  }

  return {
    clientName,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
    rawPeriodHint: detectDepositDayHint(expanded),
  };
}

export function toolGetSalesTotal({ date, startDate, endDate, clientName, period, rawQuery }) {
  const state = getErpState(["clients", "sales"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const rawText = String(rawQuery || period || date || "").trim();

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let periodLabel = "";
  let rawPeriodHint = "";

  if (date && !rangeStart && !rangeEnd) {
    const single = resolveDateFromInput(date);
    rangeStart = single;
    rangeEnd = single;
    rawPeriodHint = String(date).trim();
    periodLabel = single;
  }

  if (!rangeStart || !rangeEnd) {
    const parsed = extractSalesTotalQuery(rawText || "\uC624\uB298");
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    periodLabel = parsed.periodLabel;
    rawPeriodHint = parsed.rawPeriodHint;
    if (!clientName && parsed.clientName) clientName = parsed.clientName;
  } else {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
    rawPeriodHint = detectDepositDayHint(rawText);
  }

  let clientFilterKeys = null;
  let resolvedClientName = "";
  const query = String(clientName || "").trim();
  if (query) {
    const matchedClients = findClientsByQuery(clients, query);
    if (!matchedClients.length) {
      return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
    }
    clientFilterKeys = buildClientFilterKeys(query, matchedClients);
    resolvedClientName = String(matchedClients[0]?.name || query).trim();
  }

  const round = (value) => Math.round(Number(value) || 0);
  const rows = [];

  for (const sale of sales) {
    const saleDate = String(sale?.date || "").slice(0, 10);
    if (rangeStart && saleDate < rangeStart) continue;
    if (rangeEnd && saleDate > rangeEnd) continue;
    if (clientFilterKeys && !labelMatchesClientKeys(sale?.client, clientFilterKeys)) continue;

    const amount = round(sale.amount);
    rows.push({
      client: String(sale?.client || "-").trim(),
      site: String(sale?.site || "").trim(),
      date: saleDate,
      amount,
      voucherNo: String(sale?.voucherNo || sale?.id || "").trim(),
    });
  }

  rows.sort((a, b) => b.amount - a.amount || String(b.date).localeCompare(String(a.date)));

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return {
    ok: true,
    startDate: rangeStart,
    endDate: rangeEnd,
    periodLabel,
    rawPeriodHint,
    clientName: resolvedClientName || undefined,
    salesCount: rows.length,
    totalAmount,
    rows,
  };
}

export function formatSalesTotalAnswer(data) {
  if (!data.ok) return data.error || "\uB9E4\uCD9C \uD569\uACC4 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";

  const title = buildDepositPeriodTitle(data);
  const clientPrefix = data.clientName ? `${data.clientName} ` : "";

  if (data.salesCount === 0) {
    return `${clientPrefix}${title} \uB9E4\uCD9C \uC804\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }

  const lines = [
    `${clientPrefix}${title} \uB9E4\uCD9C \uD569\uACC4: ${formatKRW(data.totalAmount)}\uC6D0 (${data.salesCount}\uAC74)`,
  ];

  const preview = (data.rows || []).slice(0, 10);
  preview.forEach((row) => {
    const site = row.site ? ` / ${row.site}` : "";
    lines.push(`- ${row.client}${site}: ${formatKRW(row.amount)}\uC6D0`);
  });
  if (data.salesCount > preview.length) {
    lines.push(`\u2026 \uC678 ${data.salesCount - preview.length}\uAC74`);
  }
  return lines.join("\n");
}

function parseTaxInvoiceFlowTypeFromText(text) {
  const raw = String(text || "");
  const hasPurchase =
    /\uB9E4\uC785/.test(raw) ||
    /(?:\uB4E4\uC5B4(?:\uC628|\uC788|\uC558|\uC11C|\uC5B4|\uC5C8|\uB358)?|\uBC1B(?:\uC740|\uC740|\uC740\uC74C|\uC740\uC5B4|\uC740\uB294)?|\uC218\uCC98|\uC218\uC785)/.test(
      raw,
    );
  const hasSales =
    /\uB9E4\uCD9C/.test(raw) ||
    /(?:\uB098(?:\uAC04|\uAC94|\uC900|\uAC04\uB294|\uAC94\uC11C|\uC11C)?|\uBCF4(?:\uB0C4|\uB09C|\uB0C4\uB294|\uB0B4|\uB0B8)?|\uCCAD\uAD6C|\uBC1C\uAE09\uD55C)/.test(
      raw,
    );
  if (hasPurchase && !hasSales) return "purchase";
  if (hasSales && !hasPurchase) return "sales";
  return null;
}

function parseTaxInvoiceDocumentTypeFromText(text) {
  const raw = String(text || "");
  if (/\uC138\uAE08\s*\uACC4\uC0B0\uC11C/.test(raw)) return "tax";
  if (/\uACC4\uC0B0\uC11C/.test(raw)) return "bill";
  return null;
}

function buildTaxInvoiceFlowTypeLabel(flowType) {
  if (flowType === "purchase") return "\uB9E4\uC785";
  if (flowType === "sales") return "\uB9E4\uCD9C";
  return "\uB9E4\uC785\u00B7\uB9E4\uCD9C";
}

function buildTaxInvoiceDocumentTypeLabel(documentType) {
  if (documentType === "tax") return "\uC138\uAE08\uACC4\uC0B0\uC11C";
  if (documentType === "bill") return "\uACC4\uC0B0\uC11C";
  return "\uC138\uAE08\uACC4\uC0B0\uC11C\u00B7\uACC4\uC0B0\uC11C";
}

function stripTaxInvoiceSummaryQueryNoise(text) {
  return String(text || "")
    .replace(/\uC138\uAE08\s*\uACC4\uC0B0\uC11C|\uACC4\uC0B0\uC11C/g, "")
    .replace(/\uB9E4\uC785|\uB9E4\uCD9C/g, "")
    .replace(/\uC624\uB298|\uB0B4\uC77C|\uBAA8\uB798/g, "")
    .replace(/\uC774\uBC88\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC|\uAE08\uC8FC/g, "")
    .replace(
      /\uC774\uBC88\uB2EC|\uC774\uBC88 \uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C \uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C \uB2EC/g,
      "",
    )
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4(?:\uB2EC)?/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(
      /(?:\uAE08\uC561|\uD569\uACC4|\uCD1D\uC561|\uC591|\uC5BC\uB9C8|\uB4E4\uC5B4\uC628|\uB4E4\uC5B4|\uC628|\uBC1C\uD589|\uAC74\uC218|\uC870\uD68C|\uD655\uC778|\uC54C\uB824|\uC918|\?)/g,
      "",
    )
    .replace(/(?:\uB97C|\uC740|\uB294|\uC758|\uC744|\uC5D0\uC11C|\uACF3)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTaxInvoiceSummaryQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (!/(?:\uC138\uAE08\s*\uACC4\uC0B0\uC11C|\uACC4\uC0B0\uC11C)/.test(raw)) return false;

  if (/\uB0B4\uC5ED/.test(raw) && hasChatOpenVerb(raw)) return false;
  if (hasChatOpenVerb(raw) && chatIncludesIntent(raw, "taxInvoice")) {
    const { clientName } = extractTaxInvoiceHistoryQuery(raw);
    if (clientName) return false;
  }
  if (
    chatIncludesIntent(raw, "taxInvoice") &&
    /\uB0B4\uC5ED/.test(raw) &&
    !/(?:\uAE08\uC561|\uD569\uACC4|\uC591|\uC5BC\uB9C8|\uB4E4\uC5B4\uC628|\uB4E4\uC5B4|\uBC1C\uD589|\uB4E4\uC5B4)/.test(raw)
  ) {
    return false;
  }

  const hasFlowKeyword = /(?:\uB9E4\uC785|\uB9E4\uCD9C)/.test(raw);
  const hasDirectionHint = /(?:\uB4E4\uC5B4(?:\uC628|\uC788|\uC558|\uC11C|\uC5B4|\uC5C8|\uB358)?|\uBC1B(?:\uC740|\uC740|\uC740\uC74C|\uC740\uC5B4|\uC740\uB294)?|\uC218\uCC98|\uB098(?:\uAC04|\uAC94|\uC900|\uAC04\uB294|\uAC94\uC11C|\uC11C)?|\uBCF4(?:\uB0C4|\uB09C|\uB0B4|\uB0B8)?|\uCCAD\uAD6C)/.test(
    raw,
  );
  const hasPeriodHint =
    /(?:\uC624\uB298|\uB0B4\uC77C|\uBAA8\uB798|\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uC774\uBC88\uC8FC|\uAE08\uC8FC|\d{4}-\d{2}-\d{2}|(?:\d{1,2})\s*\uC6D4)/.test(
      raw,
    );
  const hasAmountHint = /(?:\uAE08\uC561|\uD569\uACC4|\uC591|\uC5BC\uB9C8|\uBC1C\uD589|\uAC74|\uC5B4\uB514|\uC5B4\uB514\uC11C|\uC5B4\uB290|\uC5B4\uB290\uAC70\uCC98|\uC5B4\uB290\uAC70)/.test(
    raw,
  );
  const hasCasualAsk = /(?:\uB370|\uC8E0|\uC9C0|\uB098|\uC788|\uC788\uC5B4|\uC788\uB294|\uC788\uB098|\uC788\uC744|\uC788\uC744\uAE4C|\uC788\uC744\uAE4C\?)/.test(
    raw.replace(/\s+/g, ""),
  );

  if (hasDirectionHint) return true;
  if (hasFlowKeyword && (hasPeriodHint || hasAmountHint || hasCasualAsk)) return true;
  if (hasPeriodHint && (hasAmountHint || hasDirectionHint || hasCasualAsk)) return true;
  if (hasFlowKeyword && hasAmountHint) return true;
  return false;
}

export function extractTaxInvoiceSummaryQuery(text) {
  const raw = String(text || "").trim();
  const expanded = expandSynonymsForExtraction(raw);
  const hasMonthKeyword =
    /\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC9C0\uB09C\uB2EC|\uC9C0\uB09C\s*\uB2EC|\uC800\uBC88\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\uB2EC|\uB2E4\uC74C\s*\uB2EC|(?:\d{4})\s*\uB144\s*(?:\d{1,2})\s*\uC6D4|(?:\d{1,2})\s*\uC6D4(?:\uB2EC)?/.test(
      expanded,
    );
  const hasWeekKeyword = /\uC774\uBC88\uC8FC|\uAE08\uC8FC|\uB2E4\uC74C\uC8FC|\uC800\uBC88\uC8FC|\uC9C0\uB09C\uC8FC/.test(expanded);
  const hasSingleDayKeyword = /\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/.test(expanded);

  let range;
  if (hasMonthKeyword && !hasWeekKeyword && !hasSingleDayKeyword) {
    range = resolveMonthRangeFromInput(expanded);
  } else {
    range = resolveDateRangeFromInput(expanded);
  }

  let clientName = "";
  const possessive = raw.match(/^(.+?)\uC758/);
  if (possessive) clientName = possessive[1].trim();
  if (!clientName) {
    clientName = stripTaxInvoiceSummaryQueryNoise(expanded);
    if (clientName) {
      const state = getErpState(["clients"]);
      const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
      const matched = findClientsByQuery(clients, clientName);
      if (matched.length) {
        clientName = String(matched[0]?.name || clientName).trim();
      }
    }
  }

  return {
    clientName,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
    flowType: parseTaxInvoiceFlowTypeFromText(expanded),
    documentType: parseTaxInvoiceDocumentTypeFromText(expanded),
    rawPeriodHint: detectDepositDayHint(expanded),
  };
}

function buildTaxInvoicePeriodTitle(data) {
  const { startDate, endDate, periodLabel, rawPeriodHint } = data;
  const hint = String(rawPeriodHint || "").trim();
  if (startDate === endDate) {
    if (hint === "\uC624\uB298") return `\uC624\uB298(${startDate})`;
    if (hint === "\uC5B4\uC81C") return `\uC5B4\uC81C(${startDate})`;
    if (hint === "\uB0B4\uC77C") return `\uB0B4\uC77C(${startDate})`;
    if (hint === "\uBAA8\uB798") return `\uBAA8\uB798(${startDate})`;
    return `${startDate}`;
  }
  if (periodLabel) return periodLabel;
  return `${startDate}~${endDate}`;
}

export function toolGetTaxInvoiceSummary({
  date,
  startDate,
  endDate,
  flowType,
  documentType,
  clientName,
  period,
  rawQuery,
}) {
  const state = getErpState(["clients", "taxInvoices"]);
  const data = state.data || {};
  const taxInvoices = Array.isArray(data.taxInvoices) ? data.taxInvoices : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const rawText = String(rawQuery || period || date || "").trim();

  let rangeStart = String(startDate || "").slice(0, 10);
  let rangeEnd = String(endDate || "").slice(0, 10);
  let periodLabel = "";
  let rawPeriodHint = "";
  let resolvedFlowType = flowType === "purchase" || flowType === "sales" ? flowType : null;
  let resolvedDocumentType = documentType === "tax" || documentType === "bill" ? documentType : null;

  if (date && !rangeStart && !rangeEnd) {
    const single = resolveDateFromInput(date);
    rangeStart = single;
    rangeEnd = single;
    rawPeriodHint = String(date).trim();
    periodLabel = single;
  }

  if (!rangeStart || !rangeEnd) {
    const parsed = extractTaxInvoiceSummaryQuery(rawText || "\uC624\uB298");
    rangeStart = parsed.startDate;
    rangeEnd = parsed.endDate;
    periodLabel = parsed.periodLabel;
    rawPeriodHint = parsed.rawPeriodHint;
    if (!clientName && parsed.clientName) clientName = parsed.clientName;
    if (!resolvedFlowType && parsed.flowType) resolvedFlowType = parsed.flowType;
    if (!resolvedDocumentType && parsed.documentType) resolvedDocumentType = parsed.documentType;
  } else {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
    rawPeriodHint = detectDepositDayHint(rawText);
    if (!resolvedFlowType) resolvedFlowType = parseTaxInvoiceFlowTypeFromText(rawText);
    if (!resolvedDocumentType) resolvedDocumentType = parseTaxInvoiceDocumentTypeFromText(rawText);
  }

  let clientFilterKeys = null;
  let resolvedClientName = "";
  const query = String(clientName || "").trim();
  if (query) {
    const matchedClients = findClientsByQuery(clients, query);
    if (!matchedClients.length) {
      return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
    }
    clientFilterKeys = buildClientFilterKeys(query, matchedClients);
    resolvedClientName = String(matchedClients[0]?.name || query).trim();
  }

  const round = (value) => Math.round(Number(value) || 0);
  const rows = [];

  for (const invoice of taxInvoices) {
    if (String(invoice?.status || "") !== "issued") continue;
    const issueDate = String(invoice?.issueDate || "").slice(0, 10);
    if (rangeStart && issueDate < rangeStart) continue;
    if (rangeEnd && issueDate > rangeEnd) continue;
    if (resolvedFlowType && invoice?.flowType !== resolvedFlowType) continue;
    if (resolvedDocumentType && invoice?.documentType !== resolvedDocumentType) continue;
    if (clientFilterKeys && !labelMatchesClientKeys(invoice?.client, clientFilterKeys)) continue;

    rows.push({
      client: String(invoice?.client || "-").trim(),
      supplyAmount: round(invoice?.supplyAmount),
      vatAmount: round(invoice?.vatAmount),
      totalAmount: round(invoice?.totalAmount),
      documentType: invoice?.documentType === "bill" ? "bill" : "tax",
      issueDate,
    });
  }

  rows.sort(
    (a, b) => b.totalAmount - a.totalAmount || String(b.issueDate).localeCompare(String(a.issueDate)),
  );

  const totals = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.supply += row.supplyAmount;
      acc.vat += row.vatAmount;
      acc.amount += row.totalAmount;
      return acc;
    },
    { count: 0, supply: 0, vat: 0, amount: 0 },
  );

  return {
    ok: true,
    periodLabel,
    startDate: rangeStart,
    endDate: rangeEnd,
    rawPeriodHint,
    clientName: resolvedClientName || undefined,
    flowType: resolvedFlowType,
    documentType: resolvedDocumentType,
    flowTypeLabel: buildTaxInvoiceFlowTypeLabel(resolvedFlowType),
    documentTypeLabel: buildTaxInvoiceDocumentTypeLabel(resolvedDocumentType),
    count: totals.count,
    totalSupply: totals.supply,
    totalVat: totals.vat,
    totalAmount: totals.amount,
    rows,
  };
}

export function formatTaxInvoiceSummaryAnswer(data) {
  if (!data.ok) return data.error || "\uC138\uAE08\uACC4\uC0B0\uC11C \uD569\uACC4 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";

  const title = buildTaxInvoicePeriodTitle(data);
  const clientPrefix = data.clientName ? `${data.clientName} ` : "";
  const typeLabel = `${data.flowTypeLabel} ${data.documentTypeLabel}`.trim();

  if (data.count === 0) {
    return `${clientPrefix}${title} \uBC1C\uD589\uB41C ${typeLabel}\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }

  const lines = [
    `${clientPrefix}${title} ${typeLabel}: ${data.count}\uAC74 \u00B7 \uD569\uACC4 ${formatKRW(data.totalAmount)}\uC6D0`,
  ];

  const byClient = new Map();
  for (const row of data.rows || []) {
    const key = row.client || "-";
    const prev = byClient.get(key) || { client: key, totalAmount: 0 };
    prev.totalAmount += row.totalAmount;
    byClient.set(key, prev);
  }
  const clientRows = [...byClient.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  clientRows.slice(0, 15).forEach((row) => {
    lines.push(`- ${row.client}: ${formatKRW(row.totalAmount)}\uC6D0`);
  });
  if (clientRows.length > 15) {
    lines.push(`\u2026 \uC678 ${clientRows.length - 15}\uAC70\uB798\uCC98`);
  }

  lines.push(`\uACF5\uAE09\uAC00 ${formatKRW(data.totalSupply)}\uC6D0 \u00B7 \uBD80\uAC00\uC138 ${formatKRW(data.totalVat)}\uC6D0`);
  return lines.join("\n");
}

function findWorkersByQuery(workers, query) {
  const queryKey = normalizePersonMatchKey(query);
  if (!queryKey) return [];
  const matches = [];
  for (const worker of workers) {
    const labels = [worker.name, ...parseAliasList(worker.depositNameAliases)].filter(Boolean);
    if (labels.some((label) => nameMatchesQuery(label, queryKey))) {
      matches.push(worker);
    }
  }
  const seen = new Set();
  return matches.filter((worker) => {
    const id = String(worker.id ?? worker.name);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function stripPersonBankAccountQueryNoise(text) {
  return String(text || "")
    .replace(/\uACC4\uC88C(?:\uBC88\uD638)?|\uD1B5\uC7A5(?:\uBC88\uD638)?/g, "")
    .replace(/\uC804\uD654|\uC5F0\uB77D\uCC98|\uCC28(?:\uBC88|\uB7C9)(?:\uBC88\uD638)?/g, "")
    .replace(/(?:\uC54C\uB824|\uC918|\uC870\uD68C|\uD655\uC778|\?)/g, "")
    .replace(/(?:\uB97C|\uC740|\uB294|\uC758|\uC744|\uC758\uAC70|\uAFBC)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPersonBankAccountQuery(text) {
  const raw = String(text || "").trim();
  if (!/(?:\uACC4\uC88C(?:\uBC88\uD638)?|\uD1B5\uC7A5(?:\uBC88\uD638)?)/.test(raw)) return false;
  if (hasChatOpenVerb(raw)) return false;
  if (chatIncludesIntent(raw, "bank")) return false;
  if (/\uC785\uAE08\uB0B4\uC5ED|\uC785\uAE08\s*\uC561|\uC785\uAE08\s*\uD569\uACC4/.test(raw)) return false;
  return true;
}

export function extractPersonBankAccountQuery(text) {
  const raw = String(text || "").trim();
  const state = getErpState(["workers", "clients"]);
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const entities = resolveChatEntitiesFromText(raw, clients, workers);

  if (entities.workerName) {
    return { personName: entities.workerName, entityKind: "worker" };
  }
  if (entities.clientName) {
    return { personName: entities.clientName, entityKind: "client" };
  }

  let personName = stripPersonBankAccountQueryNoise(expandSynonymsForExtraction(raw));
  if (personName) {
    const resolved = resolveChatEntityKind(personName, clients, workers);
    if (resolved.kind === "worker") personName = resolved.name;
    else if (resolved.kind === "client") personName = resolved.name;
  }
  return { personName, entityKind: resolveChatEntityKind(personName, clients, workers).kind };
}

export function toolGetPersonBankAccount({ personName, entityKind }) {
  const state = getErpState(["workers", "clients"]);
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const query = String(personName || "").trim();
  if (!query) {
    return { ok: false, error: "\uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const preferWorker = entityKind === "worker";
  const preferClient = entityKind === "client";

  const workerMatches = preferClient ? [] : findWorkersByQuery(workers, query);
  if (workerMatches.length) {
    return {
      ok: true,
      query,
      matchCount: workerMatches.length,
      matches: workerMatches.slice(0, 5).map((worker) => ({
        kind: "worker",
        name: String(worker.name || ""),
        bank: String(worker.bank || "").trim(),
        account: String(worker.account || "").trim(),
        isActive: worker.isActive !== false,
      })),
    };
  }

  const clientMatches = findClientsByQuery(clients, query);
  if (!preferWorker && clientMatches.length) {
    return {
      ok: true,
      query,
      matchCount: clientMatches.length,
      matches: clientMatches.slice(0, 3).map((client) => ({
        kind: "client",
        name: String(client.name || ""),
        bank: "",
        account: "",
        note: "\uAC70\uB798\uCC98 \uBAA9\uB85D\uC5D0\uB294 \uACC4\uC88C \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
      })),
    };
  }

  return { ok: false, error: `"${query}"\uC744(\uB97C) \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
}

export function formatPersonBankAccountAnswer(data) {
  if (!data.ok) return data.error || "\uACC4\uC88C \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (!data.matchCount) return `"${data.query}"\uC758 \uACC4\uC88C \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`;

  const lines = [];
  for (const row of data.matches || []) {
    if (row.kind === "client") {
      lines.push(`${row.name}: ${row.note || "\uACC4\uC88C \uC815\uBCF4 \uC5C6\uC2B5\uB2C8\uB2E4."}`);
      continue;
    }
    const bank = row.bank || "-";
    const account = row.account || "-";
    const inactive = row.isActive === false ? " (\uBE44\uD65C\uC131)" : "";
    lines.push(`${row.name}${inactive}: ${bank} ${account}`.trim());
  }
  if (data.matchCount > (data.matches || []).length) {
    lines.push(`\u2026 \uC678 ${data.matchCount - (data.matches || []).length}\uBA85`);
  }
  return lines.join("\n");
}

export function tryRuleBasedPersonBankAccountQuery(message) {
  const text = String(message || "").trim();
  if (!isPersonBankAccountQuery(text)) return null;
  const parsed = extractPersonBankAccountQuery(text);
  return formatPersonBankAccountAnswer(toolGetPersonBankAccount({ personName: parsed.personName }));
}

function resolveScScheduleSiteName(schedule) {
  const workType = String(schedule?.workType || "").trim();
  if (workType) return workType;
  const siteName = String(schedule?.siteName || "").trim();
  if (siteName) return siteName;
  return String(schedule?.projectName || "").trim();
}

function clientSiteRequestCoversDate(request, date) {
  const start = String(request?.workDate || "").slice(0, 10);
  const end = String(request?.workDateEnd || request?.workDate || "").slice(0, 10);
  if (!start) return false;
  return date >= start && date <= end;
}

function stripClientSiteOnDateQueryNoise(text) {
  return String(text || "")
    .replace(/\d{1,2}\s*\uC6D4\s*\d{1,2}\s*\uC77C/g, "")
    .replace(/(?:(\d{4})\s*\uB144\s*)?(\d{1,2})\s*\uC6D4(?:\uB2EC)?/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/g, "")
    .replace(/\uD604\uC7A5|\uC5B4\uB514|\uC704\uCE58|\uC7A5\uC18C|\uAC70\uB798\uCC98|\uC77C\uC815|\uC2A4\uCF00\uC904/g, "")
    .replace(/(?:\uC788(?:\uC5B4|\uB098|\uC744|\uC744\uAE4C)|\uC5BC\uB9C8|\?|\uC54C\uB824|\uC918|\uC870\uD68C|\uD655\uC778)/g, "")
    .replace(/(?:\uB294|\uC740|\uB97C|\uC758|\uC744|\uC758\uAC70|\uAFBC|\uC5D0\uC11C|\uAC00|\uC774)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isClientSiteOnDateQuery(text) {
  const raw = String(text || "").trim();
  if (!/\uD604\uC7A5/.test(raw)) return false;
  if (hasChatOpenVerb(raw)) return false;
  if (/(?:\uC5B4\uB514|\uC5B4\uB514\uC57C|\uC704\uCE58|\uC7A5\uC18C|\uC5B4\uB290|\uC5B4\uB290\uAC70|\uC5B4\uB290\uAC70\uCC98)/.test(raw)) return true;
  if (/\d{1,2}\s*\uC6D4\s*\d{1,2}\s*\uC77C/.test(raw) || /\d{4}-\d{2}-\d{2}/.test(raw)) return true;
  if (/\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798/.test(raw)) return true;
  return false;
}

export function extractClientSiteOnDateQuery(text) {
  const raw = String(text || "").trim();
  const expanded = normalizeChatMonthText(expandSynonymsForExtraction(raw));
  let date = parseMonthDayDateFromText(expanded);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = resolveDateFromInput(expanded);
  }

  const state = getErpState(["clients", "workers"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const entities = resolveChatEntitiesFromText(expanded, clients, workers);

  let clientName = entities.clientName;
  if (!clientName) {
    clientName = stripClientSiteOnDateQueryNoise(expanded);
    if (clientName) {
      const resolved = resolveChatEntityKind(clientName, clients, workers);
      if (resolved.kind === "client") clientName = resolved.name;
      else if (resolved.kind === "worker") clientName = "";
      else {
        const matched = findClientsByQuery(clients, clientName);
        if (matched.length) clientName = String(matched[0]?.name || clientName).trim();
        else clientName = "";
      }
    }
  }

  return { clientName, date };
}

export function toolGetClientSiteOnDate({ clientName, date }) {
  const state = getErpState(["sales", "clients", "scSchedules", "clientSiteRequests"]);
  const data = state.data || {};
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const scSchedules = Array.isArray(data.scSchedules) ? data.scSchedules : [];
  const clientSiteRequests = Array.isArray(data.clientSiteRequests) ? data.clientSiteRequests : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];

  const query = String(clientName || "").trim();
  const dateKey = String(date || "").slice(0, 10);
  if (!query) {
    return { ok: false, error: "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return { ok: false, error: "\uB0A0\uC9DC(\uC608: 6\uC6D42\uC77C \uB610\uB294 YYYY-MM-DD)\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const matchedClients = findClientsByQuery(clients, query);
  if (!matchedClients.length) {
    return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }
  const clientFilterKeys = buildClientFilterKeys(query, matchedClients);
  const clientIds = new Set(matchedClients.map((client) => String(client.id ?? "")).filter(Boolean));
  const resolvedClientName = String(matchedClients[0]?.name || query).trim();

  const sites = [];
  const seen = new Set();

  const pushSite = (siteName, source) => {
    const name = String(siteName || "").trim();
    if (!name) return;
    const key = `${source}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    sites.push({ siteName: name, source });
  };

  for (const schedule of scSchedules) {
    if (String(schedule?.workDate || "").slice(0, 10) !== dateKey) continue;
    if (!scheduleMatchesClientFilter(schedule, matchedClients, clientFilterKeys)) continue;
    pushSite(resolveScScheduleSiteName(schedule), "SC \uC77C\uC815");
  }

  for (const sale of sales) {
    if (String(sale?.date || "").slice(0, 10) !== dateKey) continue;
    if (!saleMatchesClientFilter(sale.client, matchedClients, clientFilterKeys)) continue;
    pushSite(sale.site, "\uB9E4\uCD9C \uC804\uD45C");
  }

  for (const request of clientSiteRequests) {
    if (!clientSiteRequestCoversDate(request, dateKey)) continue;
    const requestClientId = String(request?.clientId ?? "");
    const requestMatches =
      (requestClientId && clientIds.has(requestClientId)) ||
      labelMatchesClientKeys(request?.clientName, clientFilterKeys);
    if (!requestMatches) continue;
    pushSite(request.siteName, "\uD604\uC7A5 \uC811\uC218");
  }

  return {
    ok: true,
    clientName: resolvedClientName,
    date: dateKey,
    siteCount: sites.length,
    sites,
  };
}

export function formatClientSiteOnDateAnswer(data) {
  if (!data.ok) return data.error || "\uD604\uC7A5 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (!data.siteCount) {
    return `${data.clientName} ${data.date} \uB4F1\uB85D\uB41C \uD604\uC7A5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  const lines = [`${data.clientName} ${data.date} \uD604\uC7A5:`];
  for (const row of data.sites || []) {
    lines.push(`- ${row.siteName}${row.source ? ` (${row.source})` : ""}`);
  }
  return lines.join("\n");
}

export function tryRuleBasedClientSiteOnDateQuery(message) {
  const text = String(message || "").trim();
  if (!isClientSiteOnDateQuery(text)) return null;
  const parsed = extractClientSiteOnDateQuery(text);
  return formatClientSiteOnDateAnswer(
    toolGetClientSiteOnDate({ clientName: parsed.clientName, date: parsed.date }),
  );
}

function stripClientBusinessRegQueryNoise(text) {
  return String(text || "")
    .replace(/\uC0AC\uC5C5\uC790\s*\uB4F1\uB85D(?:\uC99D)?/g, "")
    .replace(/(?:\uC5F4|\uBD10|\uCC28|\uC774\uB3D9|\uBCF4\uAE30|\uBCF4\uC5EC|\uC870\uD68C|\uD655\uC778|\uC918|\uC778\uC87D)/g, "")
    .replace(/(?:\uC788(?:\uC5B4|\uB098|\uC744|\uC744\uAE4C)|\uB4F1\uB85D|\uC5C5\uB85C\uB4DC|\uD30C\uC77C|\uC788\uB098|\?|\uC54C\uB824|\uC870\uD68C|\uD655\uC778)/g, "")
    .replace(/(?:\uB294|\uC740|\uB294|\uC758|\uC744|\uC758\uAC70|\uAFBC)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isClientBusinessRegQuery(text) {
  return /\uC0AC\uC5C5\uC790\s*\uB4F1\uB85D(?:\uC99D)?/.test(String(text || ""));
}

export function extractClientBusinessRegQuery(text) {
  const raw = String(text || "").trim();
  const state = getErpState(["clients", "workers"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const entities = resolveChatEntitiesFromText(raw, clients, workers);

  let clientName = entities.clientName;
  if (!clientName) {
    const possessive = raw.match(/^(.+?)\uC758/);
    if (possessive) clientName = possessive[1].trim();
  }
  if (!clientName) {
    clientName = stripClientBusinessRegQueryNoise(expandSynonymsForExtraction(raw));
    if (clientName) {
      const resolved = resolveChatEntityKind(clientName, clients, workers);
      if (resolved.kind === "client") clientName = resolved.name;
      else clientName = "";
    }
  }
  return { clientName };
}

export function toolGetClientBusinessReg({ clientName }) {
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
  const client = matchedClients[0];
  const resolvedName = String(client?.name || query).trim();
  const businessNo = String(client?.businessNo || "").trim();
  const meta = getClientBusinessRegMeta(String(client?.id ?? ""));
  return {
    ok: true,
    clientName: resolvedName,
    businessNo,
    hasFile: Boolean(meta),
    fileName: meta?.fileName || "",
    uploadedAt: meta?.updatedAt || "",
  };
}

export function formatClientBusinessRegAnswer(data) {
  if (!data.ok) return data.error || "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (!data.businessNo && !data.hasFile) {
    return `${data.clientName} \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D/\uC0AC\uC5C5\uC790\uBC88\uD638\uAC00 \uB4F1\uB85D\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`;
  }
  const lines = [`${data.clientName} \uC0AC\uC5C5\uC790\uB4F1\uB85D \uC815\uBCF4:`];
  if (data.businessNo) lines.push(`- \uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638: ${data.businessNo}`);
  if (data.hasFile) {
    const uploaded = data.uploadedAt ? ` (${String(data.uploadedAt).slice(0, 10)})` : "";
    lines.push(`- \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uD30C\uC77C: ${data.fileName}${uploaded}`);
  } else if (data.businessNo) {
    lines.push(`- \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uD30C\uC77C: \uC5C6\uC74C (\uBC88\uD638\uB9CC \uB4F1\uB85D)`);
  }
  return lines.join("\n");
}

export function toolOpenClientBusinessReg({ clientName }) {
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
  const client = matchedClients[0];
  const resolvedName = String(client?.name || query).trim();
  const clientId = client?.id;
  if (clientId == null || clientId === "") {
    return { ok: false, error: `${resolvedName} \uAC70\uB798\uCC98 ID\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
  }
  const meta = getClientBusinessRegMeta(String(clientId));
  if (!meta) {
    return {
      ok: false,
      error: `${resolvedName} \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uD30C\uC77C\uC774 \uB4F1\uB85D\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`,
      clientName: resolvedName,
      clientId,
      hasFile: false,
    };
  }
  return {
    ok: true,
    clientName: resolvedName,
    clientId,
    fileName: meta.fileName || "",
    hasFile: true,
  };
}

export function formatClientBusinessRegOpenAnswer(data) {
  if (!data.ok) return data.error || "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uC5F4\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  return `${data.clientName} \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC744 \uC5F4\uC5B4 \uB4DC\uB9BD\uB2C8\uB2E4.`;
}

export function buildChatActionsFromClientBusinessRegOpen(result) {
  if (!result?.ok || result.clientId == null || result.clientId === "") return [];
  return [
    {
      type: "open_client_business_reg",
      clientName: result.clientName,
      clientId: result.clientId,
    },
  ];
}

export function tryRuleBasedClientBusinessRegOpen(message) {
  const text = String(message || "").trim();
  if (!isClientBusinessRegQuery(text)) return null;
  if (!hasChatOpenVerb(text)) return null;
  const parsed = extractClientBusinessRegQuery(text);
  return toolOpenClientBusinessReg({ clientName: parsed.clientName });
}

export function tryRuleBasedClientBusinessRegQuery(message) {
  const text = String(message || "").trim();
  if (!isClientBusinessRegQuery(text)) return null;
  if (hasChatOpenVerb(text)) return null;
  const parsed = extractClientBusinessRegQuery(text);
  return formatClientBusinessRegAnswer(toolGetClientBusinessReg({ clientName: parsed.clientName }));
}

export function isClientTaxInvoiceIssuedQuery(text) {
  const raw = String(text || "").trim();
  if (!/(?:\uC138\uAE08\s*\uACC4\uC0B0\uC11C|\uACC4\uC0B0\uC11C)/.test(raw)) return false;
  if (hasChatOpenVerb(raw) && /\uB0B4\uC5ED/.test(raw)) return false;
  const compact = raw.replace(/\s+/g, "");
  const issuedAsk =
    /\uBC1C\uD589(?:\uD55C\uC801|\uD588|\uD55C)?/.test(compact) ||
    /\uD55C\uC801/.test(compact) ||
    /\uC788(?:\uC5B4|\uB098|\uC744\uAE4C|\uC2B5\uB2C8\uAE4C)/.test(compact);
  if (!issuedAsk) return false;
  if (/(?:\uAE08\uC561|\uD569\uACC4|\uC5BC\uB9C8)/.test(raw) && !/(?:\uC788(?:\uC5B4|\uB098)|\uD55C\uC801|\uBC1C\uD589)/.test(compact)) {
    return false;
  }
  return true;
}

export function formatClientTaxInvoiceIssuedAnswer(data) {
  if (!data.ok) return data.error || "\uACC4\uC0B0\uC11C \uBC1C\uD589 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const title = buildTaxInvoicePeriodTitle(data);
  const clientPrefix = data.clientName ? `${data.clientName} ` : "";
  const typeLabel = `${data.flowTypeLabel} ${data.documentTypeLabel}`.trim();
  if (data.count === 0) {
    return `${clientPrefix}${title} ${typeLabel} \uBC1C\uD589 \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  const lines = [
    `\uB124, ${clientPrefix}${title} ${typeLabel} ${data.count}\uAC74 \uBC1C\uD589\uD588\uC2B5\uB2C8\uB2E4. \uD569\uACC4 ${formatKRW(data.totalAmount)}\uC6D0`,
  ];
  for (const row of (data.rows || []).slice(0, 10)) {
    lines.push(`- ${String(row.issueDate || "").slice(0, 10)}: ${formatKRW(row.totalAmount)}\uC6D0`);
  }
  if (data.count > 10) lines.push(`\u2026 \uC678 ${data.count - 10}\uAC74`);
  return lines.join("\n");
}

export function tryRuleBasedClientTaxInvoiceIssuedQuery(message) {
  const text = String(message || "").trim();
  if (!isClientTaxInvoiceIssuedQuery(text)) return null;
  const parsed = extractTaxInvoiceSummaryQuery(text);
  return formatClientTaxInvoiceIssuedAnswer(
    toolGetTaxInvoiceSummary({
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      clientName: parsed.clientName,
      flowType: parsed.flowType,
      documentType: parsed.documentType,
      rawQuery: text,
    }),
  );
}

export function isStatementSentUnpaidQuery(text) {
  const raw = String(text || "").trim();
  if (!/\uB0B4\uC5ED\uC11C/.test(raw)) return false;
  const sent = /(?:\uBCF4\uB0C4|\uBCF4\uB099|\uBCF4\uB0C8|\uC804\uC1A1|\uB9C1\uD06C|\uBC1C\uC1A1)/.test(raw);
  const notPaid =
    /(?:\uC785\uAE08\s*(?:\uC548|\uC5C6|\uBABB)|\uBBF8\uC218|\uC548\s*\uB4E4|\uC548\s*\uB418|\uC544\uC9C1)/.test(raw);
  return sent && notPaid;
}

function collectUnpaidSalesFromArchive(archive, sales, salesById, clients, seenSaleIds, unpaidRows) {
  const subjectName = String(archive?.subjectName || "").trim();
  const matchedClients = findClientsByQuery(clients, subjectName);
  const clientFilterKeys = buildClientFilterKeys(subjectName, matchedClients);

  const pushSale = (sale, statementPeriod) => {
    const saleId = String(sale?.id ?? "");
    if (!saleId || seenSaleIds.has(saleId)) return;
    const unpaid = getUnpaid(sale);
    if (unpaid <= 0) return;
    seenSaleIds.add(saleId);
    unpaidRows.push({
      client: String(sale.client || subjectName || ""),
      site: String(sale.site || ""),
      date: String(sale.date || "").slice(0, 10),
      unpaid,
      statementPeriod,
      sentAt: String(archive?.createdAt || "").slice(0, 10),
    });
  };

  const statementPeriod =
    archive?.periodStart && archive?.periodEnd
      ? `${archive.periodStart}~${archive.periodEnd}`
      : String(archive?.periodStart || archive?.periodEnd || "");

  const saleIds = Array.isArray(archive?.statementSalesIds) ? archive.statementSalesIds : [];
  if (saleIds.length) {
    for (const id of saleIds) {
      const sale = salesById.get(String(id));
      if (sale) pushSale(sale, statementPeriod);
    }
    return;
  }

  if (!matchedClients.length) return;
  const matchedSales = filterClientSalesInRange(
    sales,
    matchedClients,
    clientFilterKeys,
    archive?.periodStart,
    archive?.periodEnd,
  );
  for (const sale of matchedSales) pushSale(sale, statementPeriod);
}

export function toolGetStatementSentUnpaid({ clientName, limit = 30 }) {
  const state = getErpState(["sales", "clients"]);
  const sales = Array.isArray(state.data?.sales) ? state.data.sales : [];
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const maxRows = Math.min(Math.max(Number(limit) || 30, 1), 50);
  const salesById = new Map(sales.map((sale) => [String(sale.id), sale]));

  let clientFilterKeys = null;
  let resolvedClientName = "";
  const query = String(clientName || "").trim();
  if (query) {
    const matchedClients = findClientsByQuery(clients, query);
    if (!matchedClients.length) {
      return { ok: false, error: `"${query}" \uAC70\uB798\uCC98\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` };
    }
    clientFilterKeys = buildClientFilterKeys(query, matchedClients);
    resolvedClientName = String(matchedClients[0]?.name || query).trim();
  }

  const archives = listSentStatementArchiveMetas().filter((archive) => {
    if (archive.category !== "statement-client") return false;
    if (!archive.sentViaLink) return false;
    if (archive.paymentStatus === "confirmed") return false;
    if (clientFilterKeys && !labelMatchesClientKeys(archive.subjectName, clientFilterKeys)) return false;
    return true;
  });

  const unpaidRows = [];
  const seenSaleIds = new Set();
  for (const archive of archives) {
    collectUnpaidSalesFromArchive(archive, sales, salesById, clients, seenSaleIds, unpaidRows);
  }

  unpaidRows.sort((a, b) => b.unpaid - a.unpaid || String(b.date).localeCompare(String(a.date)));
  const totalUnpaid = unpaidRows.reduce((sum, row) => sum + row.unpaid, 0);

  return {
    ok: true,
    clientName: resolvedClientName || undefined,
    statementCount: archives.length,
    unpaidCount: unpaidRows.length,
    totalUnpaid,
    rows: unpaidRows.slice(0, maxRows),
  };
}

export function formatStatementSentUnpaidAnswer(data) {
  if (!data.ok) return data.error || "\uB0B4\uC5ED\uC11C \uBBF8\uC785\uAE08 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const prefix = data.clientName ? `${data.clientName} ` : "";
  if (data.unpaidCount === 0) {
    return `${prefix}\uB0B4\uC5ED\uC11C \uBCF4\uB0C8\uC9C0\uB9CC \uC544\uC9C1 \uBBF8\uC785\uAE08\uC778 \uB9E4\uCD9C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  const lines = [
    `${prefix}\uB0B4\uC5ED\uC11C \uBCF4\uB0C8\uC9C0\uB9CC \uBBF8\uC785\uAE08 \uD569\uACC4: ${formatKRW(data.totalUnpaid)}\uC6D0 (${data.unpaidCount}\uAC74, \uB0B4\uC5ED\uC11C ${data.statementCount}\uAC74 \uAE30\uC900)`,
  ];
  for (const row of data.rows || []) {
    const site = row.site ? ` / ${row.site}` : "";
    const period = row.statementPeriod ? ` [${row.statementPeriod}]` : "";
    lines.push(`- ${row.client}${site} (${row.date}): ${formatKRW(row.unpaid)}\uC6D0${period}`);
  }
  if (data.unpaidCount > (data.rows || []).length) {
    lines.push(`\u2026 \uC678 ${data.unpaidCount - (data.rows || []).length}\uAC74`);
  }
  return lines.join("\n");
}

export function tryRuleBasedStatementSentUnpaidQuery(message) {
  const text = String(message || "").trim();
  if (!isStatementSentUnpaidQuery(text)) return null;
  let clientName = "";
  const possessive = text.match(/^(.+?)\uC758/);
  if (possessive) clientName = possessive[1].trim();
  if (!clientName) {
    clientName = text
      .replace(/\uB0B4\uC5ED\uC11C/g, "")
      .replace(/(?:\uBCF4\uB0C4|\uBCF4\uB099|\uBCF4\uB0C8|\uC804\uC1A1|\uC785\uAE08|\uBBF8\uC218|\uC5B4\uB514|\uC5B4\uB290|\uC5B4\uB290\uAC70|\?)/g, "")
      .replace(/(?:\uB294|\uC740|\uB294|\uC758|\uC744|\uC544\uC9C1|\uC548|\uC5C6|\uBABB|\uB4E4|\uB418)/g, "")
      .trim();
    if (clientName) {
      const state = getErpState(["clients"]);
      const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
      const matched = findClientsByQuery(clients, clientName);
      if (matched.length) clientName = String(matched[0]?.name || clientName).trim();
      else clientName = "";
    }
  }
  return formatStatementSentUnpaidAnswer(toolGetStatementSentUnpaid({ clientName: clientName || undefined }));
}

export function tryRuleBasedLookupQuery(message) {
  return (
    tryRuleBasedStatementSentUnpaidQuery(message) ||
    tryRuleBasedClientSiteOnDateQuery(message) ||
    tryRuleBasedPersonBankAccountQuery(message) ||
    tryRuleBasedClientBusinessRegQuery(message) ||
    tryRuleBasedClientTaxInvoiceIssuedQuery(message)
  );
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
  const result = tryRuleBasedStatementOpen(message);
  if (result?.clientName) return result;
  return null;
}

function stripUnpaidStatementLinkQueryNoise(text) {
  return String(text || "")
    .replace(/\uBBF8\uC218\s*\uC804\uD45C|\uBBF8\uC218\uC804\uD45C/g, " ")
    .replace(/\uC804\uD45C|\uB0B4\uC5ED\uC11C|\uC2DC\uACF5\uBE44(?:\uB0B4\uC5ED)?(?:\uC11C)?|\uC2DC\uACF5\uB0B4\uC5ED/g, "")
    .replace(/(?:\uB9C1\uD06C|\uB9C1\uD06C\uBC84\uC804|\uB9C1\uD06C\uBCF8|\uB9C1\uD06C\s*\uBCF8|\uBCF8)/g, "")
    .replace(/(?:\uB9CC\uB4E4|\uC0DD\uC131|\uCC28|\uCC3E|\uAC80\uC0C9|\uC870\uD68C|\uC5F4|\uBCF4\uC5EC|\uBCF4\uC5EC\uC918|\uC918|\uC778\uC6A9|\uD45C\uAE30|\uB54C\uC6B0\uAE30)/g, "")
    .replace(/(?:\uB294|\uC740|\uB97C|\uC758|\uC744|\uC758\uAC70|\uC5D0\uC11C|\uB85C|\uC744|\uAE4C|\?)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isClientUnpaidStatementLinkQuery(text) {
  const raw = String(text || "").trim();
  if (!/\uBBF8\uC218/.test(raw)) return false;
  if (!/(?:\uC804\uD45C|\uB0B4\uC5ED\uC11C|\uC2DC\uACF5\uBE44|\uC2DC\uACF5\uB0B4\uC5ED)/.test(raw)) return false;
  if (/(?:\uB9C1\uD06C|\uB9C1\uD06C\uBC84\uC804|\uB9C1\uD06C\uBCF8)/.test(raw)) return true;
  if (/(?:\uB9CC\uB4E4|\uC0DD\uC131|\uCC28|\uB54C\uC6B0\uAE30)/.test(raw)) return true;
  return hasChatOpenVerb(raw);
}

export function extractClientUnpaidStatementLinkQuery(text) {
  const raw = String(text || "").trim();
  const expanded = expandSynonymsForExtraction(raw);
  const hasPeriod =
    chatHasMonthKeyword(expanded) ||
    /\d{4}-\d{2}-\d{2}/.test(expanded) ||
    /\d{1,2}\s*\uC6D4/.test(expanded);
  const range = hasPeriod
    ? resolveStatementPeriodFromInput(expanded)
    : { startDate: "", endDate: "", label: "" };
  const state = getErpState(["clients", "workers"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const entities = resolveChatEntitiesFromText(expanded, clients, workers);

  let clientName = entities.clientName;
  if (!clientName) {
    const possessive = raw.match(/^(.+?)\uC758/);
    if (possessive) clientName = possessive[1].trim();
  }
  if (!clientName) {
    clientName = stripUnpaidStatementLinkQueryNoise(expanded);
    if (clientName) {
      const resolved = resolveChatEntityKind(clientName, clients, workers);
      if (resolved.kind === "client") clientName = resolved.name;
      else clientName = "";
    }
  }
  return {
    clientName,
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
  };
}

export function toolOpenClientUnpaidStatementLink({ clientName, startDate, endDate }) {
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
  if (rangeStart && rangeEnd) {
    periodLabel = rangeStart === rangeEnd ? rangeStart : `${rangeStart}~${rangeEnd}`;
  }

  const clientFilterKeys = buildClientFilterKeys(query, matchedClients);
  const resolvedName = String(matchedClients[0]?.name || query).trim();
  const scopedSales = filterClientSalesInRange(
    sales,
    matchedClients,
    clientFilterKeys,
    rangeStart || "",
    rangeEnd || "",
  );
  const unpaidSales = scopedSales.filter((sale) => getUnpaid(sale) > 0);
  if (!unpaidSales.length) {
    const periodHint = periodLabel ? ` (${periodLabel})` : "";
    return {
      ok: false,
      error: `${resolvedName}${periodHint} \uBBF8\uC218 \uC804\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`,
      clientName: resolvedName,
    };
  }

  const unpaidDates = unpaidSales
    .map((sale) => String(sale?.date || "").slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const saleIds = unpaidSales.map((sale) => sale.id).filter((id) => id != null && id !== "");

  return {
    ok: true,
    clientName: resolvedName,
    startDate: rangeStart || unpaidDates[0] || "",
    endDate: rangeEnd || unpaidDates[unpaidDates.length - 1] || "",
    periodLabel: periodLabel || (unpaidDates.length ? `${unpaidDates[0]}~${unpaidDates[unpaidDates.length - 1]}` : ""),
    saleIds,
    unpaidCount: unpaidSales.length,
    shareViaLink: true,
  };
}

export function formatClientUnpaidStatementLinkOpenAnswer(data) {
  if (!data.ok) return data.error || "\uBBF8\uC218 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const period = data.periodLabel || `${data.startDate}~${data.endDate}`;
  return `${data.clientName} \uBBF8\uC218 \uC804\uD45C ${data.unpaidCount}\uAC74\uC73C\uB85C \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C \uB9C1\uD06C \uBCF8\uC744 \uC0DD\uC131\uD574 \uD654\uBA74\uC5D0 \uD45C\uC2DC\uD569\uB2C8\uB2E4. (${period})`;
}

export function buildChatActionsFromClientUnpaidStatementLinkOpen(result) {
  if (!result?.ok || !result.clientName) return [];
  return [
    {
      type: "open_client_statement",
      client: result.clientName,
      startDate: result.startDate,
      endDate: result.endDate,
      saleIds: Array.isArray(result.saleIds) ? result.saleIds : [],
      unpaidOnly: true,
      autoGenerate: true,
      autoShareLink: true,
    },
  ];
}

export function tryRuleBasedClientUnpaidStatementLinkOpen(message) {
  const text = String(message || "").trim();
  if (!isClientUnpaidStatementLinkQuery(text)) return null;
  const parsed = extractClientUnpaidStatementLinkQuery(text);
  return toolOpenClientUnpaidStatementLink({
    clientName: parsed.clientName,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
  });
}

export function tryRuleBasedStatementOpen(message) {
  const text = String(message || "").trim();
  if (isClientUnpaidStatementLinkQuery(text)) return null;
  if (!isConstructionStatementQuery(text)) return null;
  if (!hasChatOpenVerb(text) && !/(?:\uC0DD\uC131|\uB0B4\uC5ED)/.test(text)) return null;

  const state = getErpState(["clients", "workers"]);
  const clients = Array.isArray(state.data?.clients) ? state.data.clients : [];
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const nameFilter = resolveStatementNameFilter(text, clients, workers);
  const workerPeriod = extractWorkerStatementQuery(text);
  const clientPeriod = extractClientStatementQuery(text);
  const startDate = workerPeriod.startDate || clientPeriod.startDate;
  const endDate = workerPeriod.endDate || clientPeriod.endDate;

  if (nameFilter.workerName) {
    return toolOpenWorkerConstructionCostStatement({
      workerName: nameFilter.workerName,
      startDate,
      endDate,
    });
  }
  if (nameFilter.clientName) {
    return toolOpenClientConstructionCostStatement({
      clientName: nameFilter.clientName,
      startDate,
      endDate,
    });
  }
  if (!nameFilter.unresolvedName) return null;

  if (hasWorkerStatementContext(text) && !hasClientStatementContext(text)) {
    return toolOpenWorkerConstructionCostStatement({
      workerName: nameFilter.unresolvedName,
      startDate,
      endDate,
    });
  }

  const clientResult = toolOpenClientConstructionCostStatement({
    clientName: nameFilter.unresolvedName,
    startDate,
    endDate,
  });
  if (clientResult.ok) return clientResult;
  if (hasWorkerStatementContext(text)) {
    return toolOpenWorkerConstructionCostStatement({
      workerName: nameFilter.unresolvedName,
      startDate,
      endDate,
    });
  }
  return null;
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

export function isBankAccountColumnOnlyQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const compact = raw.replace(/\s+/g, "");
  if (!/\uACC4\uC815\uB9CC/.test(compact)) return false;
  if (/^\uACC4\uC815\uB9CC/.test(compact)) return true;
  if (/\uD1B5\uC7A5(?:\uB0B4\uC5ED)?\uACC4\uC815\uB9CC/.test(compact)) return true;
  if (/\uACC4\uC815\uB9CC(?:\uBCF4\uC5EC|\uBCF4\uAE30|\uD45C\uC2DC)/.test(compact)) return true;
  if (/(?:\uBCF4\uC5EC|\uBCF4\uAE30|\uD45C\uC2DC)/.test(raw)) return true;
  if (includesBankKeyword(raw)) return true;
  return false;
}

const BANK_SEARCH_VERB_PATTERN = /(?:\uCC3E|\uAC80\uC0C9|\uC870\uD68C)/;

function textHasBankSearchPeriod(text) {
  const raw = String(text || "").trim();
  return (
    chatHasMonthKeyword(raw) ||
    /(?:\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798|\uC774\uBC88\uC8FC|\uAE08\uC8FC|\d{4}-\d{2}-\d{2}|\d{1,2}\s*\uC77C(?:\s*(?:\uC5D0\uC11C|\uBD80\uD130|~|\-)\s*\d{1,2}\s*\uC77C)?)/.test(
      raw,
    )
  );
}

function stripBankSearchPeriodNoise(value) {
  return String(value || "")
    .replace(CHAT_MONTH_KEYWORD_STRIP_PATTERN, "")
    .replace(
      /(?:\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798|\uC774\uBC88\uC8FC|\uAE08\uC8FC|\d{4}-\d{2}-\d{2}|\d{1,2}\s*\uC77C(?:\s*(?:\uC5D0\uC11C|\uBD80\uD130|~|\-)\s*\d{1,2}\s*\uC77C)?)/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBankSearchQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const quotedMatch = raw.match(
    /\uD1B5\uC7A5(?:\uB0B4\uC5ED)?(?:\uC5D0\uC11C|\uB9AC)?\s*[""\u300C\u300E''"]([^""\u300D\u300F''"]+)[""\u300D\u300F''"]\s*(?:\uCC3E|\uAC80\uC0C9)/,
  );
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  const fromMatch = raw.match(
    /\uD1B5\uC7A5(?:\uB0B4\uC5ED)?(?:\uC5D0\uC11C|\uB9AC)?\s+(.+?)\s*(?:\uCC3E\uC544(?:\uC918|\uC8FC\uC138\uC694|\uC694)?|\uAC80\uC0C9(?:\uD574(?:\uC918|\uC8FC\uC138\uC694|\uC694)?)?)/,
  );
  if (fromMatch?.[1]) {
    const query = stripBankSearchPeriodNoise(fromMatch[1]);
    if (query) return query;
  }

  const looseMatch = raw.match(/\uD1B5\uC7A5(?:\uB0B4\uC5ED)?\s*(?:\uC5D0\uC11C|\uB9AC)?\s*(.+?)\s*(?:\uCC3E|\uAC80\uC0C9)/);
  if (looseMatch?.[1]) {
    const query = stripBankSearchPeriodNoise(looseMatch[1]);
    if (query) return query;
  }

  return null;
}

export function isBankSearchQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (!includesBankKeyword(raw)) return false;
  if (!BANK_SEARCH_VERB_PATTERN.test(raw)) return false;
  if (hasChatOpenVerb(raw) && !/(?:\uCC3E|\uAC80\uC0C9)/.test(raw)) return false;
  if (isBankAccountColumnOnlyQuery(raw)) return false;
  return Boolean(extractBankSearchQuery(raw));
}

export function tryRuleBasedBankSearch(message) {
  const text = String(message || "").trim();
  if (!isBankSearchQuery(text)) return null;
  const searchQuery = extractBankSearchQuery(text);
  if (!searchQuery) return null;
  if (textHasBankSearchPeriod(text)) {
    const period = resolveStatementPeriodFromInput(text);
    return {
      ok: true,
      searchQuery,
      startDate: period.startDate,
      endDate: period.endDate,
      periodLabel: period.label,
      periodKey: "custom",
    };
  }
  return {
    ok: true,
    searchQuery,
    periodKey: "all",
  };
}

export function buildChatActionsFromBankSearch(result) {
  if (!result?.ok || !result.searchQuery) return [];
  const action = {
    type: "navigate_erp",
    page: "accounting",
    label: "\uD1B5\uC7A5",
    accountingTab: "bank",
    bankSearchQuery: result.searchQuery,
  };
  if (result.startDate && result.endDate) {
    action.startDate = result.startDate;
    action.endDate = result.endDate;
  }
  return [action];
}

export function formatBankSearchAnswer(data) {
  if (!data?.ok || !data.searchQuery) return data?.error || "\uD1B5\uC7A5 \uAC80\uC0C9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  const period = data.periodLabel
    ? ` (${data.periodLabel})`
    : data.periodKey === "all"
      ? " (\uC804\uCCB4 \uAE30\uAC04)"
      : "";
  return `\uD1B5\uC7A5 \uB0B4\uC5ED${period}\uC5D0\uC11C "${data.searchQuery}"\uC744(\uB97C) \uAC80\uC0C9\uD569\uB2C8\uB2E4.`;
}

export function tryRuleBasedBankAccountColumnView(message) {
  const text = String(message || "").trim();
  if (!isBankAccountColumnOnlyQuery(text)) return null;
  const period = resolveStatementPeriodFromInput(text);
  return {
    ok: true,
    startDate: period.startDate,
    endDate: period.endDate,
    periodLabel: period.label,
    accountColumnOnly: true,
  };
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
  const action = {
    type: "navigate_erp",
    page: "accounting",
    label: "\uD1B5\uC7A5",
    accountingTab: "bank",
    startDate: result.startDate,
    endDate: result.endDate,
  };
  if (result.accountColumnOnly) {
    action.bankColumnPreset = "account_only";
  }
  return [action];
}

export function formatBankOpenAnswer(data) {
  if (!data.ok) return data.error || "\uD1B5\uC7A5 \uC774\uB3D9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (data.accountColumnOnly) {
    return "\uD1B5\uC7A5 \uB0B4\uC5ED\uC5D0\uC11C \uACC4\uC815 \uC5F4\uB9CC \uBCF4\uC774\uB3C4\uB85D \uC5F4\uC5B4 \uB4DC\uB9BD\uB2C8\uB2E4.";
  }
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
      name: "get_unpaid_list",
      description:
        "\uAE30\uAC04\uBCC4 \uBBF8\uC218(\uBBF8\uC218\uAE08) \uBAA9\uB85D\uACFC \uD569\uACC4\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uC774\uBC88\uB2EC \uBBF8\uC218 \uB9AC\uC2A4\uD2B8, \uC800\uBC88\uB2EC \uBBF8\uC218\uBAA9\uB85D, 5\uC6D4 \uBBF8\uC218 \uBAA9\uB85D, \uC778\uB514\uD37C \uC774\uBC88\uB2EC \uBBF8\uC218. \uAC70\uB798\uCC98 \uC804\uCCB4 \uD604\uC7AC \uBBF8\uC218\uB294 get_client_unpaid(\uAC70\uB798\uCC98 \uC774\uB984 \uD544\uC218)\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791 YYYY-MM-DD" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC YYYY-MM-DD" },
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC120\uD0DD)" },
          period: { type: "string", description: "\uC774\uBC88\uB2EC, 5\uC6D4, \uC774\uBC88\uC8FC, \uC804\uCCB4 \uBBF8\uC218 \uBAA9\uB85D \uB4F1" },
          limit: { type: "number", description: "\uBAA9\uB85D \uCD5C\uB300 \uAC74\uC218 (\uAE30\uBCF8 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deposit_total",
      description:
        "\uAE30\uAC04\uBCC4 \uC785\uAE08 \uD569\uACC4(\uAE08\uC561)\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uC624\uB298 \uC785\uAE08\uC561, \uC774\uBC88\uB2EC \uC785\uAE08 \uD569\uACC4, \uC778\uB514\uD37C 5\uC6D4 \uC785\uAE08 \uC5BC\uB9C8. \uC785\uAE08\uB0B4\uC5ED \uD654\uBA74 \uC5F4\uAE30\uB294 open_client_deposit_history\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "\uC624\uB298, \uB0B4\uC77C, YYYY-MM-DD (\uB2E8\uC77C\uC77C)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791 YYYY-MM-DD" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC YYYY-MM-DD" },
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC120\uD0DD)" },
          period: { type: "string", description: "\uC624\uB298, \uC774\uBC88\uB2EC, \uC774\uBC88\uC8FC, 5\uC6D4 \uB4F1 (\uC120\uD0DD)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_total",
      description:
        "\uAE30\uAC04\uBCC4 \uB9E4\uCD9C(\uC804\uD45C) \uAE08\uC561 \uD569\uACC4\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uC624\uB298 \uB9E4\uCD9C, \uC5B4\uC81C \uB9E4\uCD9C \uC5BC\uB9C8, \uC774\uBC88\uB2EC \uB9E4\uCD9C \uD569\uACC4, \uC778\uB514\uD37C 5\uC6D4 \uB9E4\uCD9C. \uACC4\uC0B0\uC11C/\uC138\uAE08\uACC4\uC0B0\uC11C\uB294 get_tax_invoice_summary\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "\uC624\uB298, \uC5B4\uC81C, \uB0B4\uC77C, YYYY-MM-DD (\uB2E8\uC77C\uC77C)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791 YYYY-MM-DD" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC YYYY-MM-DD" },
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC120\uD0DD)" },
          period: { type: "string", description: "\uC624\uB298, \uC5B4\uC81C, \uC774\uBC88\uB2EC, \uC774\uBC88\uC8FC, 5\uC6D4 \uB4F1 (\uC120\uD0DD)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tax_invoice_summary",
      description:
        "\uAE30\uAC04\uBCC4 \uB9E4\uC785/\uB9E4\uCD9C \uACC4\uC0B0\uC11C\u00B7\uC138\uAE08\uACC4\uC0B0\uC11C \uD569\uACC4(\uAE08\uC561)\uC744 \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uC624\uB298 \uB9E4\uC785 \uACC4\uC0B0\uC11C \uAE08\uC561, \uC774\uBC88\uB2EC \uB9E4\uCD9C \uACC4\uC0B0\uC11C \uD569\uACC4, \uC624\uB298 \uB9E4\uC785 \uC138\uAE08\uACC4\uC0B0\uC11C. \uAC70\uB798\uCC98 \uB0B4\uC5ED \uD654\uBA74 \uC5F4\uAE30\uB294 open_client_tax_invoice_history\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "\uC624\uB298, \uB0B4\uC77C, YYYY-MM-DD (\uB2E8\uC77C\uC77C)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791 YYYY-MM-DD" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC YYYY-MM-DD" },
          flowType: { type: "string", description: "purchase(\uB9E4\uC785) \uB610\uB294 sales(\uB9E4\uCD9C)" },
          documentType: { type: "string", description: "tax(\uC138\uAE08\uACC4\uC0B0\uC11C) \uB610\uB294 bill(\uACC4\uC0B0\uC11C)" },
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC120\uD0DD)" },
          period: { type: "string", description: "\uC624\uB298, \uC774\uBC88\uB2EC, \uC774\uBC88\uC8FC, 5\uC6D4 \uB4F1 (\uC120\uD0DD)" },
        },
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
          workerName: { type: "string", description: "\uC2DC\uACF5\uC790 \uC774\uB984 (\uC608: \uBC30\uC885\uC6D0). SC \uCC38\uC5EC\uC790 \uAE30\uC900." },
          limit: { type: "number", description: "\uBAA9\uB85D \uCD5C\uB300 \uAC74\uC218 (\uAE30\uBCF8 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_person_bank_account",
      description:
        "\uC2DC\uACF5\uC790 \uB610\uB294 \uAC70\uB798\uCC98 \uC774\uB984\uC73C\uB85C \uACC4\uC88C(\uC740\uD589/\uACC4\uC88C\uBC88\uD638)\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uAC15\uD0DC\uC6D0 \uACC4\uC88C\uBC88\uD638 \uC54C\uB824\uC918. \uD1B5\uC7A5 \uD654\uBA74 \uC5F4\uAE30\uAC00 \uC544\uB2CC \uACC4\uC88C \uC815\uBCF4 \uC870\uD68C \uC804\uC6A9\uC785\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          personName: { type: "string", description: "\uC2DC\uACF5\uC790 \uB610\uB294 \uAC70\uB798\uCC98 \uC774\uB984" },
        },
        required: ["personName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_site_on_date",
      description:
        "\uAC70\uB798\uCC98\uC758 \uD14C\uC815 \uB0A0\uC9DC \uD604\uC7A5 \uC704\uCE58\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: 6\uC6D4 2\uC77C \uC778\uB514\uD37C \uD604\uC7A5 \uC5B4\uB514\uC57C. SC \uC77C\uC815, \uB9E4\uCD9C \uC804\uD45C, \uD604\uC7A5 \uC811\uC218 \uAE30\uC900.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uC778\uB514\uD37C)" },
          date: { type: "string", description: "YYYY-MM-DD \uB610\uB294 6\uC6D42\uC77C \uD615\uD0DC" },
        },
        required: ["clientName", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_statement_sent_unpaid",
      description:
        "\uB0B4\uC5ED\uC11C(\uB9C1\uD06C) \uBCF4\uB0C8\uC9C0\uB9CC \uC544\uC9C1 \uBBF8\uC785\uAE08\uC778 \uB9E4\uCD9C \uBAA9\uB85D\uC744 \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uB0B4\uC5ED\uC11C \uBCF4\uB0C8\uB294\uB370 \uC785\uAE08 \uC548 \uB4E4\uC5B4\uC628 \uAC70 \uC5B4\uB514.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC120\uD0DD)" },
          limit: { type: "number", description: "\uBAA9\uB85D \uCD5C\uB300 \uAC74\uC218 (\uAE30\uBCF8 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_business_reg",
      description:
        "\uAC70\uB798\uCC98 \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uD30C\uC77C \uBC0F \uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638 \uB4F1\uB85D \uC5EC\uBD80\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uC778\uB514\uD37C \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uC788\uC5B4?",
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
      name: "get_client_tax_invoice_issued",
      description:
        "\uAC70\uB798\uCC98\uC758 \uAE30\uAC04\uBCC4 \uACC4\uC0B0\uC11C/\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uC5EC\uBD80\uB97C \uC870\uD68C\uD569\uB2C8\uB2E4. \uC608: \uC778\uB514\uD37C \uC774\uBC88\uB2EC \uACC4\uC0B0\uC11C \uBC1C\uD589\uD55C\uC801 \uC788\uB098?",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC120\uD0DD)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791 YYYY-MM-DD" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC YYYY-MM-DD" },
          period: { type: "string", description: "\uC774\uBC88\uB2EC, 5\uC6D4 \uB4F1" },
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
      description:
        "\uC2DC\uACF5\uC790 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C/\uC2DC\uACF5\uB0B4\uC5ED\uC11C/\uB0B4\uC5ED\uC11C(\uAC1C\uC778 \uC2DC\uACF5\uB0B4\uC5ED\uC11C)\uB97C \uC5F4\uC796\uB2C8\uB2E4. \uC2DC\uACF5\uC790 \uBAA9\uB85D\uC5D0 \uC788\uB294 \uC774\uB984\uC774\uBA74 \uAC70\uB798\uCC98 \uB0B4\uC5ED\uC11C\uAC00 \uC544\uB2CC \uC774 \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694. \uC608: \uAE40\uBBFC\uC131 5\uC6D4 \uB0B4\uC5ED\uC11C, \uAE40\uBBFC\uC131 5\uC6D4 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uC5F4\uC5B4\uC918, \uAE40\uBBFC\uC131 \uC774\uBC88\uB2EC \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C.",
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
      description:
        "\uAC70\uB798\uCC98 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C\uB97C \uC0DD\uC131\uD574 \uC5F4\uC796\uB2C8\uB2E4. \uC2DC\uACF5\uC790 \uBAA9\uB85D \uC774\uB984\uC774\uBA74 open_worker_construction_cost_statement\uB97C \uC0AC\uC6A9\uD558\uC138\uC694. \uC608: \uC778\uB514\uD37C \uC774\uBC88\uB2EC \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C, \uC778\uB514\uD37C \uC774\uBC88\uB2EC 15\uC77C~30\uC77C \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C.",
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
  {
    type: "function",
    function: {
      name: "open_client_business_reg",
      description:
        "\uAC70\uB798\uCC98 \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uD30C\uC77C\uC744 \uC5F4\uC5B4 \uBCF4\uC5EC\uC8FC\uC138\uC694. \uC608: \uC778\uB514\uD37C \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uC5F4\uC5B4, \uC778\uB514\uD37C \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uBCF4\uC5EC\uC918. \uC5EC\uBD80 \uC870\uD68C\uB294 get_client_business_reg.",
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
      name: "open_client_unpaid_statement_link",
      description:
        "\uAC70\uB798\uCC98 \uBBF8\uC218 \uC804\uD45C\uB97C \uCC3E\uC544 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C \uB9C1\uD06C \uBCF8\uC744 \uC0DD\uC131\uD574 \uD654\uBA74\uC5D0 \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC608: \uC778\uB514\uD37C \uBBF8\uC218 \uC804\uD45C \uB0B4\uC5ED\uC11C \uB9CC\uB4E4\uC5B4, \uBBF8\uC218\uC804\uD45C \uB9C1\uD06C \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C \uC5F4\uC5B4\uC918. \uAE30\uAC04 \uC5C6\uC774 \uC694\uCCAD\uD558\uBA74 \uBBF8\uC218 \uC804\uCCB4\uB97C \uB300\uC0C1\uC73C\uB85C \uD569\uB2C8\uB2E4.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "\uAC70\uB798\uCC98 \uC774\uB984 (\uC608: \uC778\uB514\uD37C)" },
          startDate: { type: "string", description: "\uAE30\uAC04 \uC2DC\uC791 YYYY-MM-DD (\uC120\uD0DD)" },
          endDate: { type: "string", description: "\uAE30\uAC04 \uC885\uB8CC YYYY-MM-DD (\uC120\uD0DD)" },
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
    case "get_unpaid_list": {
      const parsed = rawQuestion ? extractUnpaidListQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.rawQuery && rawQuestion) merged.rawQuery = rawQuestion;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolGetUnpaidList(merged);
    }
    case "get_deposit_total": {
      const parsed = rawQuestion ? extractDepositTotalQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.rawQuery && rawQuestion) merged.rawQuery = rawQuestion;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolGetDepositTotal(merged);
    }
    case "get_sales_total": {
      const parsed = rawQuestion ? extractSalesTotalQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.rawQuery && rawQuestion) merged.rawQuery = rawQuestion;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolGetSalesTotal(merged);
    }
    case "get_tax_invoice_summary": {
      const parsed = rawQuestion ? extractTaxInvoiceSummaryQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.flowType && parsed.flowType) merged.flowType = parsed.flowType;
      if (!merged.documentType && parsed.documentType) merged.documentType = parsed.documentType;
      if (!merged.rawQuery && rawQuestion) merged.rawQuery = rawQuestion;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolGetTaxInvoiceSummary(merged);
    }
    case "get_schedule_count":
      return toolGetScheduleCount(args || {});
    case "get_person_bank_account": {
      const parsed = rawQuestion ? extractPersonBankAccountQuery(rawQuestion) : {};
      return toolGetPersonBankAccount({
        personName: args?.personName || parsed.personName,
        entityKind: parsed.entityKind,
      });
    }
    case "get_client_site_on_date": {
      const parsed = rawQuestion ? extractClientSiteOnDateQuery(rawQuestion) : {};
      return toolGetClientSiteOnDate({
        clientName: args?.clientName || parsed.clientName,
        date: args?.date || parsed.date,
      });
    }
    case "get_statement_sent_unpaid":
      return toolGetStatementSentUnpaid(args || {});
    case "get_client_business_reg": {
      const parsed = rawQuestion ? extractClientBusinessRegQuery(rawQuestion) : {};
      return toolGetClientBusinessReg({ clientName: args?.clientName || parsed.clientName });
    }
    case "get_client_tax_invoice_issued": {
      const parsed = rawQuestion ? extractTaxInvoiceSummaryQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.rawQuery && rawQuestion) merged.rawQuery = rawQuestion;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolGetTaxInvoiceSummary(merged);
    }
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
    case "open_worker_construction_cost_statement": {
      const parsed = rawQuestion ? extractWorkerStatementQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.workerName && parsed.workerName) merged.workerName = parsed.workerName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;
      return toolOpenWorkerConstructionCostStatement(merged);
    }
    case "open_client_construction_cost_statement": {
      const parsed = rawQuestion ? extractClientStatementQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      if (!merged.period && rawQuestion) merged.period = rawQuestion;

      const lookupState = getErpState(["clients", "workers"]);
      const lookupClients = Array.isArray(lookupState.data?.clients) ? lookupState.data.clients : [];
      const lookupWorkers = Array.isArray(lookupState.data?.workers) ? lookupState.data.workers : [];
      const resolveText = rawQuestion || merged.clientName || "";
      const nameFilter = resolveStatementNameFilter(resolveText, lookupClients, lookupWorkers);

      if (nameFilter.workerName) {
        const workerPeriod = rawQuestion ? extractWorkerStatementQuery(rawQuestion) : {};
        return toolOpenWorkerConstructionCostStatement({
          workerName: nameFilter.workerName,
          startDate: merged.startDate || workerPeriod.startDate,
          endDate: merged.endDate || workerPeriod.endDate,
          period: merged.period,
        });
      }

      const result = toolOpenClientConstructionCostStatement({
        ...merged,
        clientName: nameFilter.clientName || merged.clientName,
      });
      if (!result.ok && merged.clientName) {
        const worker = findWorkerByListName(lookupWorkers, merged.clientName);
        if (worker) {
          const workerPeriod = rawQuestion ? extractWorkerStatementQuery(rawQuestion) : {};
          return toolOpenWorkerConstructionCostStatement({
            workerName: String(worker.name || merged.clientName).trim(),
            startDate: merged.startDate || workerPeriod.startDate,
            endDate: merged.endDate || workerPeriod.endDate,
            period: merged.period,
          });
        }
      }
      return result;
    }
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
    case "open_client_business_reg": {
      const parsed = rawQuestion ? extractClientBusinessRegQuery(rawQuestion) : {};
      return toolOpenClientBusinessReg({ clientName: args?.clientName || parsed.clientName });
    }
    case "open_client_unpaid_statement_link": {
      const parsed = rawQuestion ? extractClientUnpaidStatementLinkQuery(rawQuestion) : {};
      const merged = { ...(args || {}) };
      if (!merged.clientName && parsed.clientName) merged.clientName = parsed.clientName;
      if (!merged.startDate && parsed.startDate) merged.startDate = parsed.startDate;
      if (!merged.endDate && parsed.endDate) merged.endDate = parsed.endDate;
      return toolOpenClientUnpaidStatementLink(merged);
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

export function tryRuleBasedTotalsQuery(message) {
  const text = String(message || "").trim();
  if (!text) return null;

  if (isDepositTotalQuery(text)) {
    const parsed = extractDepositTotalQuery(text);
    return formatDepositTotalAnswer(
      toolGetDepositTotal({
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        clientName: parsed.clientName,
        rawQuery: text,
      }),
    );
  }

  if (isTaxInvoiceSummaryQuery(text)) {
    if (isClientTaxInvoiceIssuedQuery(text)) {
      const parsed = extractTaxInvoiceSummaryQuery(text);
      return formatClientTaxInvoiceIssuedAnswer(
        toolGetTaxInvoiceSummary({
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          clientName: parsed.clientName,
          flowType: parsed.flowType,
          documentType: parsed.documentType,
          rawQuery: text,
        }),
      );
    }
    const parsed = extractTaxInvoiceSummaryQuery(text);
    return formatTaxInvoiceSummaryAnswer(
      toolGetTaxInvoiceSummary({
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        clientName: parsed.clientName,
        flowType: parsed.flowType,
        documentType: parsed.documentType,
        rawQuery: text,
      }),
    );
  }

  if (isSalesTotalQuery(text)) {
    const parsed = extractSalesTotalQuery(text);
    return formatSalesTotalAnswer(
      toolGetSalesTotal({
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        clientName: parsed.clientName,
        rawQuery: text,
      }),
    );
  }

  return null;
}

export function tryRuleBasedPriorityQuery(message) {
  return (
    tryRuleBasedLookupQuery(message) ||
    tryRuleBasedTotalsQuery(message) ||
    tryRuleBasedUnpaidListQuery(message)
  );
}

export function formatGreetingAnswer() {
  return [
    "안녕하세요! TeamMillimeter ERP 어시스턴트입니다.",
    "",
    "다음과 같이 도와드릴 수 있어요.",
    "· 거래처·기간별 미수 목록, 일정, 오늘/어제/기간별 매출·입금·계산서 합계, 담당자/시공자 연락처·차량번호·계좌번호 조회",
    "· 거래처 현장(날짜별), 사업자등록증, 계산서 발행 여부, 내역서 발송 후 미입금 조회",
    "· 거래처 입금내역, 세금계산서 내역, 시공비내역서·사업자등록증 파일 열기",
    "· 캘린더, SC 스케줄, 통장, 전표 등 ERP 화면 이동",
    "",
    '예: "인디퍼 미수", "인디퍼 미수 전표 내역서 링크로 만들어", "강태원 계좌번호", "인디퍼 사업자등록증 열어", "6월 2일 인디퍼 현장 어디야", "내역서 보냈는데 입금 안들어온데", "인디퍼 사업자등록증 있어?", "인디퍼 이번달 계산서 발행한적 있나?", "이번달 매출 얼마", "오늘 입금액"',
  ].join("\n");
}

export function tryRuleBasedChat(message, user) {
  const text = String(message || "").trim();
  if (!text) return null;

  if (isChatGreeting(text)) {
    return formatGreetingAnswer();
  }

  const lookupAnswer = tryRuleBasedLookupQuery(text);
  if (lookupAnswer) return lookupAnswer;

  const totalsAnswer = tryRuleBasedTotalsQuery(text);
  if (totalsAnswer) return totalsAnswer;

  const unpaidListAnswer = tryRuleBasedUnpaidListQuery(text);
  if (unpaidListAnswer) return unpaidListAnswer;

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

  if (
    !isClientSiteOnDateQuery(text) &&
    (text.includes(kwSchedule) || text.includes(kwSc)) &&
    !(hasChatOpenVerb(text) && includesScScheduleKeyword(text))
  ) {
    const extractedName = extractClientNameFromScheduleQuery(text);
    const range = resolveDateRangeFromInput(text);
    const hasWeekKeyword =
      text.includes("\uC774\uBC88\uC8FC") ||
      text.includes("\uB2E4\uC74C\uC8FC") ||
      text.includes("\uC800\uBC88\uC8FC") ||
      text.includes("\uC9C0\uB09C\uC8FC") ||
      text.includes("\uAE08\uC8FC");

    if (extractedName || hasWeekKeyword) {
      const lookupState = getErpState(["clients", "workers"]);
      const lookupData = lookupState.data || {};
      const nameFilter = resolveScheduleNameFilter(
        text,
        Array.isArray(lookupData.clients) ? lookupData.clients : [],
        Array.isArray(lookupData.workers) ? lookupData.workers : [],
      );
      return formatScheduleAnswer(
        toolGetScheduleCount({
          date: hasWeekKeyword ? text : range.startDate,
          startDate: range.startDate,
          endDate: range.endDate,
          clientName: nameFilter.clientName,
          workerName: nameFilter.workerName,
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

  if (
    !isPersonBankAccountQuery(text) &&
    (text.includes(kwManager) || text.includes(kwPhone) || text.includes(kwContact) || text.includes(kwNumber))
  ) {
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

  if (!isPersonBankAccountQuery(text) && (text.includes(kwPhone) || text.includes(kwContact) || text.includes(kwNumber))) {
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
  const title =
    data.filteredByWorker && data.workerName
      ? `${data.workerName} ${data.date}`
      : data.filteredByClient && data.clientName
        ? `${data.clientName} ${data.date}`
        : String(data.date || "");
  const lines = [
    `${title} \uC77C\uC815: \uB9E4\uCD9C ${data.salesCount}\uAC74, SC \uC77C\uC815 ${data.scScheduleCount}\uAC74 (\uD569\uACC4 ${data.totalCount}\uAC74)`,
  ];

  if (data.totalCount === 0) {
    lines.push(
      data.filteredByWorker
        ? `\n${data.workerName || "\uD574\uB2F9 \uC2DC\uACF5\uC790"}\uC758 \uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`
        : data.filteredByClient
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
