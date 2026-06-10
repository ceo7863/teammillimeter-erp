/** @typedef {{ start: number; end: number; canonical: string }} IntentKeywordSpan */

export function normalizeChatText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactChatText(value) {
  return normalizeChatText(value).replace(/\s+/g, "");
}

export function levenshtein(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const prev = new Array(right.length + 1);
  const curr = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
}

export function maxEditDistanceFor(word) {
  const len = String(word || "").length;
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 2;
}

/** canonical intent -> synonym phrases (longest first for matching) */
export const CHAT_INTENT_GROUPS = {
  bank: [
    "\uACC4\uC88C \uB0B4\uC5ED",
    "\uC740\uD589 \uACC4\uC88C",
    "\uD1B5\uC7A5\uB0B4\uC5ED",
    "\uACC4\uC88C\uB0B4\uC5ED",
    "\uD1B5\uC7A5",
    "\uACC4\uC88C",
    "\uC740\uD589",
  ],
  calendar: ["\uCE98\uB9B0\uB354", "\uCE04\uB9B0\uB354", "\uCE98\uBCC0\uB354", "\uB2EC\uB825", "\uCE98\uB9B0\uB354\uD45C"],
  taxInvoice: [
    "\uC138\uAE08 \uACC4\uC0B0\uC11C",
    "\uC138\uAE08\uACC4\uC0B0\uC11C",
    "\uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED",
    "\uACC4\uC0B0\uC11C",
  ],
  depositHistory: ["\uC785\uAE08 \uB0B4\uC5ED", "\uC785\uAE08\uB0B4\uC5ED", "\uC785\uAE08\uB0B4\uC5ED\uC11C"],
  constructionStatement: [
    "\uC2DC\uACF5\uBE44 \uB0B4\uC5ED\uC11C",
    "\uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C",
    "\uC2DC\uACF5\uB0B4\uC5ED\uC11C",
    "\uC2DC\uACF5\uBE44\uB0B4\uC5ED",
  ],
  scSchedule: ["SC\uC2A4\uCF00\uC904", "SC\uC77C\uC815", "\uC2A4\uCF00\uC904"],
  openVerb: [
    "\uC5F4\uC5B4\uC918\uC694",
    "\uC5F4\uC5B4\uC918",
    "\uC774\uB3D9\uD574",
    "\uC785\uB2C8\uCE74",
    "\uC5F4\uC5B4",
    "\uC5F4\uAE30",
    "\uD655\uC778",
    "\uC870\uD68C",
    "\uBCF4\uAE30",
    "\uBCF4\uC5EC",
    "\uC774\uB3D9",
    "\uC5F4",
    "\uBD10",
    "\uCC28",
    "\uC918",
  ],
  unpaid: ["\uBBF8\uC218\uAE08", "\uBBF8\uC218"],
  voucher: ["\uB9E4\uCD9C\uC804\uD45C", "\uC804\uD45C", "\uB9E4\uCD9C"],
  ledger: ["\uC7A5\uBD80", "\uC6D0\uC7A5"],
  vehicle: [
    "\uCC28\uB7C9 \uBC88\uD638",
    "\uCC28\uB7C9\uBC88\uD638",
    "\uCC28 \uBC88\uD638",
    "\uCC28\uBC88\uD638",
    "\uCC28\uB7C9",
  ],
};

const INTENT_SYNONYMS_SORTED = Object.fromEntries(
  Object.entries(CHAT_INTENT_GROUPS).map(([key, phrases]) => [
    key,
    [...phrases].sort((a, b) => b.length - a.length),
  ]),
);

function isAsciiPhrase(phrase) {
  return /^[\x00-\x7F]+$/.test(String(phrase || ""));
}

function phraseVariants(phrase) {
  const raw = String(phrase || "");
  const variants = [raw, compactChatText(raw)];
  if (isAsciiPhrase(raw)) {
    variants.push(raw.toLowerCase(), compactChatText(raw).toLowerCase());
  }
  return [...new Set(variants.filter(Boolean))];
}

function exactIncludesPhrase(text, phrase) {
  const raw = String(text || "");
  const normalized = normalizeChatText(raw);
  const compact = compactChatText(raw);
  for (const variant of phraseVariants(phrase)) {
    if (variant.length < 2) continue;
    if (isAsciiPhrase(variant)) {
      if (normalized.toLowerCase().includes(variant) || compact.toLowerCase().includes(variant)) return true;
    } else if (normalized.includes(variant) || compact.includes(variant)) {
      return true;
    }
  }
  return false;
}

function fuzzyWindowMatch(haystack, needle) {
  const compactHay = compactChatText(haystack);
  const compactNeedle = compactChatText(needle);
  const needleLen = compactNeedle.length;
  if (needleLen < 3) return false;

  const maxDist = maxEditDistanceFor(compactNeedle);
  for (let i = 0; i <= compactHay.length - needleLen; i += 1) {
    const window = compactHay.slice(i, i + needleLen);
    if (levenshtein(window, compactNeedle) <= maxDist) return true;
  }

  const maxWindow = needleLen + maxDist;
  for (let size = needleLen; size <= maxWindow && size <= compactHay.length; size += 1) {
    for (let i = 0; i <= compactHay.length - size; i += 1) {
      const window = compactHay.slice(i, i + size);
      if (levenshtein(window, compactNeedle) <= maxDist) return true;
    }
  }
  return false;
}

export function fuzzyIncludesInText(text, phrase) {
  if (exactIncludesPhrase(text, phrase)) return true;
  const compactNeedle = compactChatText(phrase);
  if (compactNeedle.length < 3) return false;
  return fuzzyWindowMatch(text, phrase);
}

function tokenizeForFuzzy(text) {
  return normalizeChatText(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokenFuzzyMatchesPhrase(token, phrase) {
  const compactToken = compactChatText(token);
  const compactPhrase = compactChatText(phrase);
  if (compactToken.length < 3 || compactPhrase.length < 3) return false;
  const maxDist = maxEditDistanceFor(compactPhrase);
  return levenshtein(compactToken, compactPhrase) <= maxDist;
}

export function chatIncludesIntent(text, intentKey, options = {}) {
  const { excludeIntents = [] } = options;
  for (const excluded of excludeIntents) {
    if (chatIncludesIntent(text, excluded, { excludeIntents: [] })) return false;
  }

  const phrases = INTENT_SYNONYMS_SORTED[intentKey];
  if (!phrases?.length) return false;

  for (const phrase of phrases) {
    if (fuzzyIncludesInText(text, phrase)) return true;
  }

  const tokens = tokenizeForFuzzy(text);
  for (const phrase of phrases) {
    if (compactChatText(phrase).length < 3) continue;
    if (tokens.some((token) => tokenFuzzyMatchesPhrase(token, phrase))) return true;
  }
  return false;
}

function findSpanInRawText(raw, needle) {
  const normalized = normalizeChatText(raw);
  const compactRaw = compactChatText(raw);
  const compactNeedle = compactChatText(needle);

  let idx = normalized.indexOf(needle);
  if (idx >= 0) return { start: idx, end: idx + needle.length, matched: needle };

  idx = compactRaw.indexOf(compactNeedle);
  if (idx >= 0) {
    let start = 0;
    let compactPos = 0;
    for (let i = 0; i < raw.length && compactPos < idx; i += 1) {
      if (!/\s/.test(raw[i])) compactPos += 1;
      start = i + 1;
    }
    let end = start;
    let matchedLen = 0;
    for (let i = start; i < raw.length && matchedLen < compactNeedle.length; i += 1) {
      end = i + 1;
      if (!/\s/.test(raw[i])) matchedLen += 1;
    }
    return { start, end, matched: raw.slice(start, end) };
  }

  if (compactNeedle.length >= 3 && fuzzyWindowMatch(raw, needle)) {
    const maxDist = maxEditDistanceFor(compactNeedle);
    for (let size = compactNeedle.length; size <= compactNeedle.length + maxDist && size <= compactRaw.length; size += 1) {
      for (let i = 0; i <= compactRaw.length - size; i += 1) {
        const window = compactRaw.slice(i, i + size);
        if (levenshtein(window, compactNeedle) <= maxDist) {
          let start = 0;
          let compactPos = 0;
          for (let j = 0; j < raw.length && compactPos < i; j += 1) {
            if (!/\s/.test(raw[j])) compactPos += 1;
            start = j + 1;
          }
          let end = start;
          let matchedLen = 0;
          for (let j = start; j < raw.length && matchedLen < size; j += 1) {
            end = j + 1;
            if (!/\s/.test(raw[j])) matchedLen += 1;
          }
          return { start, end, matched: raw.slice(start, end) };
        }
      }
    }
  }
  return null;
}

/** @returns {IntentKeywordSpan | null} */
export function findIntentKeywordSpan(text, intentKey) {
  const phrases = INTENT_SYNONYMS_SORTED[intentKey];
  if (!phrases?.length) return null;
  const raw = String(text || "");

  for (const phrase of phrases) {
    const span = findSpanInRawText(raw, phrase);
    if (span) {
      return { start: span.start, end: span.end, canonical: phrase };
    }
  }

  const tokens = tokenizeForFuzzy(raw);
  let offset = 0;
  for (const token of tokens) {
    const tokenStart = raw.indexOf(token, offset);
    if (tokenStart < 0) continue;
    offset = tokenStart + token.length;
    for (const phrase of phrases) {
      if (tokenFuzzyMatchesPhrase(token, phrase)) {
        return { start: tokenStart, end: tokenStart + token.length, canonical: phrase };
      }
    }
  }
  return null;
}

export function expandSynonymsForExtraction(text) {
  let result = normalizeChatText(text);
  for (const [intentKey, phrases] of Object.entries(INTENT_SYNONYMS_SORTED)) {
    const canonical = phrases[0];
    if (!canonical || intentKey === "openVerb") continue;
    for (const phrase of phrases) {
      if (phrase === canonical) continue;
      if (!fuzzyIncludesInText(result, phrase)) continue;
      const span = findSpanInRawText(result, phrase);
      if (span) {
        result = `${result.slice(0, span.start)}${canonical}${result.slice(span.end)}`;
      }
    }
  }
  return result;
}

// --- self-test (run: node server/erpChatFuzzy.mjs) ---
function runFuzzySelfTests() {
  const cases = [
    { text: "5\uC6D4 \uD1B5\uC7A5 \uC5F4\uC5B4\uC918", intent: "bank", expect: true },
    { text: "5\uC6D4 \uACC4\uC88C \uC5F4\uC5B4\uC918", intent: "bank", expect: true },
    { text: "\uC778\uB514\uD37C \uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED \uC5F4\uC5B4\uC918", intent: "taxInvoice", expect: true },
    { text: "\uC778\uB514\uD37C \uC138\uAE08\uACC4\uC0B0\uC11C \uC5F4\uC5B4\uC918", intent: "openVerb", expect: true },
    { text: "\uC778\uB514\uD37C \uCE98\uB9B0\uB354 \uC5F4\uC5B4\uC918", intent: "calendar", expect: true },
    { text: "\uD1B5\uC7A5\uB0B4\uC5ED 5\uC6D4", intent: "bank", expect: true },
    { text: "\uC778\uB514\uD37C \uC785\uAE08\uB0B4\uC5ED \uC5F4\uC5B4\uC918", intent: "bank", expect: false },
    { text: "\uC778\uB514\uD37C \uC785\uAE08\uB0B4\uC5ED \uC5F4\uC5B4\uC918", intent: "depositHistory", expect: true },
    { text: "\uCC28\uB7C9\uBC88\uD638 \uBC15\uC900\uADDC", intent: "vehicle", expect: true },
    { text: "\uBC15\uC900\uADDC \uCC28\uBC88\uD638", intent: "vehicle", expect: true },
  ];

  let passed = 0;
  let failed = 0;
  for (const { text, intent, expect } of cases) {
    const actual =
      intent === "bank"
        ? chatIncludesIntent(text, "bank", { excludeIntents: ["depositHistory"] })
        : chatIncludesIntent(text, intent);

    const ok = actual === expect;
    const mark = ok ? "PASS" : "FAIL";
    console.log(`${mark}: "${text}" -> ${intent} (expected ${expect}, got ${actual})`);
    if (ok) passed += 1;
    else failed += 1;
  }

  const navCases = [
    { text: "5\uC6D4 \uD1B5\uC7A5 \uC5F4\uC5B4\uC918", expectBank: true },
    { text: "5\uC6D4 \uACC4\uC88C \uC5F4\uC5B4\uC918", expectBank: true },
  ];
  for (const { text, expectBank } of navCases) {
    const bank =
      chatIncludesIntent(text, "bank", { excludeIntents: ["depositHistory"] }) &&
      chatIncludesIntent(text, "openVerb");
    const mark = bank === expectBank ? "PASS" : "FAIL";
    console.log(`${mark}: nav bank+open "${text}" (expected ${expectBank}, got ${bank})`);
    if (bank === expectBank) passed += 1;
    else failed += 1;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());

if (isMain) {
  const ok = runFuzzySelfTests();
  process.exit(ok ? 0 : 1);
}
