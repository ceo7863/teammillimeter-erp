// Standalone test � mirrors erpChatTools month/unpaid parsing without import chain.

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeChatMonthText(text) {
  return String(text || "")
    .replace(/(\d{1,2})\s*\uC6D4\s*\uB2EC/g, "$1\uC6D4")
    .replace(/(\d{1,2})\s*\uC6D4\uB2EC/g, "$1\uC6D4");
}

const CHAT_MONTH_KEYWORD_PATTERN =
  /\uC774\uBC88\uB2EC|\uC774\uBC88\s*\uB2EC|\uC774\uB2EC|\uB2F9\uC6D4|\uC800\uBC88\s*\uB2EC|\uC800\uBC88\uB2EC|\uC9C0\uB09C\s*\uB2EC|\uC9C0\uB09C\uB2EC|\uC804\uC6D4|\uB2E4\uC74C\s*\uB2EC|\uB2E4\uC74C\uB2EC|(?:(?:\d{4})\s*\uB144\s*)?(?:\d{1,2})\s*\uC6D4(?:\uB2EC)?/;

const HAS_LIST_HINT_PATTERN =
  /(?:\uBAA8\uB4E0|\uC804\uCCB4|\uC804\uBD80|\uB9AC\uC2A4\uD2B8|\uBAA9\uB85D|\uD604\uD669|\uB0B4\uC5ED|\uBBF8\uC218\s*\uB9AC\uC2A4\uD2B8)/;

function chatHasMonthKeyword(text) {
  return CHAT_MONTH_KEYWORD_PATTERN.test(String(text || ""));
}

function monthRangeISO(offset = 0) {
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

function resolveMonthRangeFromInput(input) {
  const raw = normalizeChatMonthText(String(input || "").trim());
  if (!raw || raw.includes("\uC774\uBC88\uB2EC") || raw.includes("\uC774\uBC88 \uB2EC") || raw.includes("\uC774\uB2EC") || raw.includes("\uB2F9\uC6D4")) {
    const range = monthRangeISO(0);
    return { ...range, label: `\uC774\uBC88 \uB2EC (${range.startDate}~${range.endDate})` };
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
  const range = monthRangeISO(0);
  return { ...range, label: `\uC774\uBC88 \uB2EC (${range.startDate}~${range.endDate})` };
}

function isUnpaidListQuery(text) {
  const raw = String(text || "").trim();
  if (!raw.includes("\uBBF8\uC218")) return false;
  const hasPeriod =
    chatHasMonthKeyword(raw) ||
    /(?:\uC624\uB298|\uC5B4\uC81C|\uB0B4\uC77C|\uBAA8\uB798|\uC774\uBC88\uC8FC|\uAE08\uC8FC|\d{4}-\d{2}-\d{2})/.test(raw);
  const hasListHint = HAS_LIST_HINT_PATTERN.test(raw);
  return hasPeriod || hasListHint;
}

function extractUnpaidListQuery(text) {
  const expanded = normalizeChatMonthText(text);
  const hasMonthKeyword = chatHasMonthKeyword(expanded);
  const hasListHint = HAS_LIST_HINT_PATTERN.test(expanded);
  let range = null;
  if (hasMonthKeyword) {
    range = resolveMonthRangeFromInput(expanded);
  } else if (hasListHint) {
    range = null;
  } else {
    range = resolveMonthRangeFromInput(expanded);
  }
  return {
    startDate: range?.startDate,
    endDate: range?.endDate,
    periodLabel: range?.label,
    allUnpaid: !range,
    hasListHint,
    hasMonthKeyword,
  };
}

const queries = [
  "5\uC6D4 \uBBF8\uC218\uB9AC\uC2A4\uD2B8",
  "4\uC6D4 \uBBF8\uC218\uB9AC\uC2A4\uD2B8",
  "5\uC6D4\uB2EC \uBBF8\uC218\uB9AC\uC2A4\uD2B8",
  "5\uC6D4 \uBBF8\uC218 \uB9AC\uC2A4\uD2B8",
  "\uBBF8\uC218\uB9AC\uC2A4\uD2B8",
  "5\uC6D4 \uBBF8\uC218",
];
for (const q of queries) {
  console.log(JSON.stringify({ q, is: isUnpaidListQuery(q), ...extractUnpaidListQuery(q) }));
}
