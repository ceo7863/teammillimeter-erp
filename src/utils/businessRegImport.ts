import type { ClientFormState } from "@/components/ClientFormModal";
import { isValidEmail } from "@/utils/clientMaster";

export type BusinessRegImportFieldKey =
  | "name"
  | "taxInvoiceCorpName"
  | "businessNo"
  | "ceoName"
  | "email"
  | "address"
  | "bizType"
  | "bizClass";

export const BUSINESS_REG_IMPORT_FIELDS: Array<{ key: BusinessRegImportFieldKey; label: string }> = [
  { key: "name", label: "\uAC70\uB798\uCC98\uBA85" },
  { key: "taxInvoiceCorpName", label: "\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589\uC6A9 \uC0C1\uD638" },
  { key: "businessNo", label: "\uC0AC\uC5C5\uC790\uBC88\uD638" },
  { key: "ceoName", label: "\uB300\uD45C\uC790\uBA85" },
  { key: "email", label: "\uC774\uBA54\uC77C" },
  { key: "address", label: "\uC8FC\uC18C" },
  { key: "bizType", label: "\uC5C5\uD0DC" },
  { key: "bizClass", label: "\uC5C5\uC885" },
];

export function normalizeImportedBusinessNo(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 10) return String(raw || "").trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function cleanImportedText(raw: string) {
  let value = String(raw || "").replace(/\s+/g, " ");
  while (/^[\s.．:：?？·\-—]/.test(value)) {
    value = value.replace(/^[\s.．:：?？·\-—]+/, "");
  }
  return value.trim();
}

const EMAIL_LABEL_RE = /(?:\uC774\s*\uBA54\s*\uC77C|E-?\s*mail|email)\s*[:：?]?\s*/i;
const EMAIL_TOKEN_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_RELAXED_TOKEN_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+(?:\.[A-Za-z]{2,})?/g;
const EMAIL_LOOSE_TOKEN_RE = /[A-Za-z0-9._%+-]{1,64}\s*@\s*[A-Za-z0-9.-]{1,}(?:\s*[.．,]\s*[A-Za-z]{2,})?/g;

function prepareImportedEmailText(raw: string) {
  return String(raw || "")
    .replace(/\uFF20/g, "@")
    .replace(/\uFF0E/g, ".")
    .replace(/\(at\)|\[at\]|\{at\}|\uFF08at\uFF09/gi, "@")
    .replace(/\s*@\s*/g, "@")
    .replace(/\s*\.\s*/g, ".")
    .replace(/,\s*(?=co\.kr|com|net|org|kr\b|go\.kr\b)/gi, ".")
    .replace(/@\s+/g, "@")
    .replace(/\s+(\.|@)/g, "$1")
    .replace(/(\.|@)\s+/g, "$1")
    .replace(/@([a-z0-9-]+)\s+(co\.kr|com|net|org|kr|go\.kr)\b/gi, "@$1.$2")
    .replace(/@([a-z0-9-]+)\s+([a-z]{2,})\b/gi, (_match, domain, tld) =>
      String(domain).includes(".") ? _match : `@${domain}.${tld}`,
    )
    .replace(/^[\s:：;；,，]+|[\s:：;；,，]+$/g, "");
}

export function isPlausibleImportedEmail(value: string) {
  const email = String(value || "").trim().toLowerCase();
  if (!email.includes("@")) return false;
  const [local, ...domainParts] = email.split("@");
  const domain = domainParts.join("@");
  if (!local || !domain) return false;
  if (!/^[a-z0-9._%+-]+$/.test(local) || local.length < 1 || local.length > 64) return false;
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.length < 2) return false;
  if (!/[a-z]/.test(local) && !/\d/.test(local)) return false;
  return true;
}

/** OCR \uC774\uBA54\uC77C \uC870\uAC01 \uBCF4\uC815 (\uFF20\u2192@, \uACF5\uBC31 \uC81C\uAC70, ,com \u2192 .com) */
export function normalizeImportedEmail(raw: string) {
  const prepared = prepareImportedEmailText(raw);

  const strict = prepared.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (strict) return strict[0].toLowerCase();

  const relaxed = prepared.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+(?:\.[A-Za-z]{2,})?/);
  if (relaxed) return relaxed[0].toLowerCase();

  const minimal = prepared.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/);
  if (minimal) return minimal[0].toLowerCase();

  const loose = String(raw || "")
    .replace(/\uFF20/g, "@")
    .match(/[A-Za-z0-9._%+-]{1,64}\s*@\s*[A-Za-z0-9.-]{1,}/);
  if (loose) return loose[0].replace(/\s+/g, "").toLowerCase();

  return cleanImportedText(raw).replace(/\s+/g, "").toLowerCase();
}

function joinBrokenEmailLines(lines: string[]) {
  const joined: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || "").trim();
    if (!line) continue;
    const nextLine = String(lines[index + 1] || "").trim();
    if (/@\s*$/.test(line) && nextLine) {
      joined.push(`${line}${nextLine}`);
      index += 1;
      continue;
    }
    if (/^[^\s@]+@[^\s@]*$/.test(line) && !/\.[A-Za-z]{2,}/.test(line) && nextLine) {
      const tldLike = /^(?:co\.kr|com|net|org|kr|go\.kr|[a-z]{2,6})$/i;
      const domainNext = /^[a-z0-9-]+(?:\.[a-z]{2,})+$/i;
      if (tldLike.test(nextLine)) {
        joined.push(`${line}.${nextLine}`);
        index += 1;
        continue;
      }
      if (domainNext.test(nextLine)) {
        joined.push(`${line}.${nextLine}`);
        index += 1;
        continue;
      }
    }
    joined.push(line);
  }
  return joined;
}

type ImportedEmailCandidate = { email: string; score: number };

/** \uC774\uBA54\uC77C \uD558\uB098 \uC774\uC0C1 \uCD94\uCD9C (\uC810\uC218 \uB192\uC740 \uC21C) */
export function extractImportedEmailCandidates(text: string): ImportedEmailCandidate[] {
  const candidates: ImportedEmailCandidate[] = [];
  const seen = new Set<string>();

  const push = (raw: string, score: number) => {
    const email = normalizeImportedEmail(raw);
    if (!email || !email.includes("@") || seen.has(email)) return;
    const valid = isValidEmail(email);
    const plausible = isPlausibleImportedEmail(email);
    if (!valid && !plausible) return;
    seen.add(email);
    candidates.push({ email, score: valid ? score : Math.max(score - 15, 5) });
  };

  const normalized = String(text || "");
  const lines = joinBrokenEmailLines(normalized.split(/\r?\n/));

  for (const line of lines) {
    if (!/[@\uFF20]/.test(line)) continue;

    const fromLabel = EMAIL_LABEL_RE.test(line);
    const body = line.replace(EMAIL_LABEL_RE, "").trim();
    const prepared = body || line;

    for (const match of prepared.matchAll(EMAIL_TOKEN_RE)) {
      push(match[0], fromLabel ? 100 : 60);
    }
    for (const match of prepared.matchAll(EMAIL_RELAXED_TOKEN_RE)) {
      push(match[0], fromLabel ? 92 : 52);
    }
    for (const match of prepared.matchAll(EMAIL_LOOSE_TOKEN_RE)) {
      push(match[0], fromLabel ? 88 : 48);
    }

    if (prepared.length <= 120) {
      push(prepared, fromLabel ? 95 : 55);
    }
  }

  const labelBlock = normalized.match(
    new RegExp(`${EMAIL_LABEL_RE.source}([^\\n\\r]{3,120})`, "i"),
  );
  if (labelBlock) push(labelBlock[1], 90);

  for (const match of normalized.matchAll(EMAIL_TOKEN_RE)) {
    push(match[0], 20);
  }
  for (const match of normalized.matchAll(EMAIL_RELAXED_TOKEN_RE)) {
    push(match[0], 15);
  }
  for (const match of normalized.matchAll(EMAIL_LOOSE_TOKEN_RE)) {
    push(match[0], 10);
  }

  return candidates.sort(
    (a, b) => b.score - a.score || Number(isValidEmail(b.email)) - Number(isValidEmail(a.email)),
  );
}

export function suggestImportedEmail(text: string): string | undefined {
  return extractImportedEmailCandidates(text)[0]?.email;
}

const CEO_LABEL_RE =
  /(?:\uB300\s*\uD45C\s*(?:\uC790|\uBA85)|\uB300\s*\uD45C|\uC131\s*\uBA85(?:\s*\(\s*\uB300\s*\uD45C\s*\uC790\s*\))?|\uC131\s*\(\s*\uC774\s*\)\s*\uBA85|\uB300\s*\uD45C\s*\(\s*\uC774\s*\)\s*\uC790)\s*[:：?]?\s*/i;

const CEO_FIELD_BLEED_RE =
  /(?:\s+\d{2,}|\s+\uC0DD\s*\uB144|\s+\uC8FC\s*\uC18C|\s+\uC0AC\s*\uC5C5|\s+\uC18C\s*\uC7AC|\s+\uC5C5\s*\uD0DC|\s+\uC885\s*\uBAA9|\s+\uBC95\s*\uC778|\s+\uC774\s*\uBA54|\s+\uC774\s*\uBA54\s*\uC77C|\s+\uC678\s*\uAD6D|\s+\uC8FC\s*\uBBFC)/;

const CEO_BLOCKED_WORD_RE =
  /(?:\uC8FC\uC2DD\uD68C\uC0AC|\(\uC8FC\)|\uBC95\uC778|\uC0AC\uC5C5\uC790|\uB4F1\uB85D|\uBC88\uD638|\uC5C5\uD0DC|\uC885\uBAA9|\uC11C\uC6B8|\uBD80\uC0B0|\uB300\uAD6C|\uC778\uCC9C|\uAD11\uC8FC|\uB300\uC804|\uC6B8\uC0B0|\uACBD\uAE30|\uC138\uAE08\uACC4\uC0B0)/;

/** OCR \uB300\uD45C\uC790\uBA85 \uBCF4\uC815 */
export function normalizeImportedCeoName(raw: string) {
  let value = cleanImportedText(raw)
    .replace(/\([^)]*\)/g, " ")
    .replace(CEO_FIELD_BLEED_RE, " ")
    .split(/[,，;；|/]/)[0]
    .trim();

  const compact = value.replace(/\s+/g, "");
  if (/^[\uAC00-\uD7A3]{2,5}$/.test(compact)) return compact;

  const hangulMatch = value.match(/^[\uAC00-\uD7A3·]{2,8}/);
  if (hangulMatch) return hangulMatch[0].replace(/·/g, "");

  const englishMatch = value.match(/^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}/);
  if (englishMatch) return englishMatch[0].trim();

  return cleanImportedText(value.slice(0, 20));
}

export function isPlausibleImportedCeoName(name: string) {
  const value = normalizeImportedCeoName(name);
  if (!value || value.length < 2 || value.length > 24) return false;
  if (/[\d@]/.test(value)) return false;
  if (CEO_BLOCKED_WORD_RE.test(value)) return false;
  return /^[\uAC00-\uD7A3A-Za-z\s·.'-]+$/.test(value);
}

type ImportedCeoNameCandidate = { name: string; score: number };

function pushCeoCandidate(
  candidates: ImportedCeoNameCandidate[],
  seen: Set<string>,
  raw: string,
  score: number,
) {
  const name = normalizeImportedCeoName(raw);
  if (!isPlausibleImportedCeoName(name) || seen.has(name)) return;
  seen.add(name);
  candidates.push({ name, score });
}

/** \uB300\uD45C\uC790\uBA85 \uD558\uB098 \uC774\uC0C1 \uCD94\uCD9C (\uC810\uC218 \uB192\uC740 \uC21C) */
export function extractImportedCeoNameCandidates(text: string): ImportedCeoNameCandidate[] {
  const candidates: ImportedCeoNameCandidate[] = [];
  const seen = new Set<string>();
  const normalized = String(text || "");
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!CEO_LABEL_RE.test(line)) continue;

    const sameLine = line.replace(CEO_LABEL_RE, "").trim();
    if (sameLine) {
      pushCeoCandidate(candidates, seen, sameLine, 100);
      continue;
    }

    const nextLine = lines[index + 1] || "";
    if (nextLine && !CEO_LABEL_RE.test(nextLine) && nextLine.length <= 24) {
      pushCeoCandidate(candidates, seen, nextLine, 90);
    }
  }

  const labelBlock = normalized.match(
    new RegExp(`${CEO_LABEL_RE.source}([^\\n\\r]{2,40})`, "i"),
  );
  if (labelBlock) pushCeoCandidate(candidates, seen, labelBlock[1], 95);

  for (const match of normalized.matchAll(
    /(?:\uB300\s*\uD45C\s*(?:\uC790|\uBA85)?|\uC131\s*\uBA85)\s*[:：?]?\s*([\uAC00-\uD7A3]{2,5})/gi,
  )) {
    pushCeoCandidate(candidates, seen, match[1], 70);
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function suggestImportedCeoName(text: string): string | undefined {
  return extractImportedCeoNameCandidates(text)[0]?.name;
}

const BIZ_TYPE_LABEL_RE = /\uC5C5\s*\uD0DC\s*[:：.?]?\s*/i;
const BIZ_CLASS_LABEL_RE = /(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)\s*[:：.?]?\s*/i;
const BIZ_HEADER_ROW_RE = /^\s*\uC5C5\s*\uD0DC[\s/|]*\uC885\s*\uBAA9\s*$|^\s*\uC5C5\s*\uD0DC[\s/|]*\uC5C5\s*\uC885\s*$|^\s*\uC5C5\s*\uD0DC\s+\uC885\s*\uBAA9\s*$|^\s*\uC5C5\s*\uD0DC\s+\uC5C5\s*\uC885\s*$/i;
const BIZ_LABEL_NOISE_RE =
  /(?:\uC0AC\s*\uC5C5\s*\uC758\s*\uC885\s*\uB958|\uC0AC\uC5C5\uC758\uC885\uB958|\uC874\s*\uC131\s*\uC0AC\s*\uC5C5|\uD604\s*\uC7AC\s*\uC815|\uC800\s*\uC790\s*\uC758|\uC0AC\s*\uC5C5\s*\uC790\s*\uC815\s*\uBCF4)/gi;
const BIZ_FIELD_BLEED_RE =
  /(?:\s+\uC885\s*\uBAA9|\s+\uC5C5\s*\uC885|\s+\uC0AC\s*\uC5C5\s*\uC758\s*\uC885\s*\uB958|\s+\uC131\s*\uBA85|\s+\uB300\s*\uD45C|\s+\uC8FC\s*\uC18C|\s+\uC774\s*\uBA54)/;
const BIZ_LABEL_ONLY_RE =
  /^(?:\uC0AC\uC5C5\uC758\uC885\uB958|\uC0AC\uC5C5\uC758\s*\uC885\s*\uB958|\uC5C5\uD0DC|\uC885\uBAA9|\uC5C5\uC885|\uC800\uC790\uC758|\uD604\uC7AC\uC815|\uC0AC\uC5C5\uC790\uC815\uBCF4)$/i;

type ImportedBizFieldCandidate = { value: string; score: number };

export function normalizeImportedBizField(raw: string) {
  return cleanImportedText(raw)
    .replace(BIZ_LABEL_NOISE_RE, " ")
    .replace(BIZ_TYPE_LABEL_RE, "")
    .replace(BIZ_CLASS_LABEL_RE, "")
    .replace(BIZ_FIELD_BLEED_RE, " ")
    .trim();
}

function captureBizValueAfterLabel(text: string, labelRe: RegExp) {
  const normalized = String(text || "");
  const colonMatch = normalized.match(
    new RegExp(
      `${labelRe.source}\\s*[:：.]+\\s*(.+?)(?=\\s*(?:\\uC885\\s*\\uBAA9|\\uC5C5\\s*\\uC885|\\uC131\\s*\\uBA85|\\uB300\\s*\\uD45C|\\uC8FC\\s*\\uC18C|\\uC774\\s*\\uBA54)|$)`,
      "i",
    ),
  );
  if (colonMatch) {
    const value = normalizeImportedBizField(colonMatch[1]);
    return isPlausibleImportedBizField(value) ? value : undefined;
  }

  const plainMatch = normalized.match(new RegExp(`${labelRe.source}[ \\t]+([^\\n\\r]{2,80})`, "i"));
  if (plainMatch) {
    const value = normalizeImportedBizField(plainMatch[1]);
    return isPlausibleImportedBizField(value) ? value : undefined;
  }
  return undefined;
}

function isBizHeaderRow(line: string) {
  const compact = line.replace(/\s+/g, " ").trim();
  if (BIZ_HEADER_ROW_RE.test(compact)) return true;
  const hasType = /\uC5C5\s*\uD0DC/i.test(line);
  const hasClass = /(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)/i.test(line);
  if (!hasType || !hasClass) return false;
  const stripped = line
    .replace(BIZ_LABEL_NOISE_RE, " ")
    .replace(/\uC5C5\s*\uD0DC/gi, "")
    .replace(/(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)/gi, "")
    .replace(/[:：./|]/g, "")
    .trim();
  return stripped.length <= 4;
}

function extractInlineBizPair(text: string): { bizType?: string; bizClass?: string } {
  const normalized = String(text || "").replace(/\r/g, "");
  const lineMatches = normalized.match(
    /\uC5C5\s*\uD0DC\s*[:：.]+\s*(.+?)\s*(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)\s*[:：.]+\s*(.+)/i,
  );
  if (lineMatches) {
    const bizType = normalizeImportedBizField(lineMatches[1] || "");
    const bizClass = normalizeImportedBizField(lineMatches[2] || "");
    if (isPlausibleImportedBizField(bizType) && isPlausibleImportedBizField(bizClass)) {
      return { bizType, bizClass };
    }
  }
  return {};
}

function cleanImportedTextPreserveColumns(raw: string) {
  let value = String(raw || "").trim();
  while (/^[\s.．:：?？·\-—]/.test(value)) {
    value = value.replace(/^[\s.．:：?？·\-—]+/, "");
  }
  return value;
}

function splitBizValuePair(raw: string): { bizType?: string; bizClass?: string } {
  const cleaned = cleanImportedTextPreserveColumns(raw);
  if (!cleaned) return {};
  const columnMatch = cleaned.match(/^(.+?)\s{2,}(.+)$/);
  if (columnMatch) {
    const bizType = normalizeImportedBizField(columnMatch[1]);
    const bizClass = normalizeImportedBizField(columnMatch[2]);
    if (isPlausibleImportedBizField(bizType) && isPlausibleImportedBizField(bizClass)) {
      return { bizType, bizClass };
    }
  }
  const combined = cleaned.match(/^\uC5C5\s*\uD0DC\s+\uC885\s*\uBAA9\s+(\S+)\s+(.+)$/i);
  if (combined) {
    const bizType = normalizeImportedBizField(combined[1]);
    const bizClass = normalizeImportedBizField(combined[2]);
    if (isPlausibleImportedBizField(bizType) && isPlausibleImportedBizField(bizClass)) {
      return { bizType, bizClass };
    }
  }
  if (!/,/.test(cleaned)) {
    const tokens = cleaned.split(/\s+/).map((part) => normalizeImportedBizField(part)).filter(Boolean);
    if (tokens.length >= 2 && isPlausibleImportedBizField(tokens[0]) && isPlausibleImportedBizField(tokens[1])) {
      return { bizType: tokens[0], bizClass: tokens[1] };
    }
  }
  if (isPlausibleImportedBizField(normalizeImportedBizField(cleaned))) {
    return { bizType: normalizeImportedBizField(cleaned) };
  }
  return {};
}

function extractBizTablePair(text: string): { bizType?: string; bizClass?: string } {
  const normalized = String(text || "").replace(/\r/g, "");
  const inline = extractInlineBizPair(normalized);
  if (inline.bizType && inline.bizClass) return inline;

  let rowPair: { bizType?: string; bizClass?: string } = {};
  const lines = normalized.split(/\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inlineOnLine = line.match(
      /\uC5C5\s*\uD0DC\s*[:：.]+\s*(.+?)\s*(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)\s*[:：.]+\s*(.+)/i,
    );
    if (inlineOnLine) {
      const bizType = normalizeImportedBizField(inlineOnLine[1] || "");
      const bizClass = normalizeImportedBizField(inlineOnLine[2] || "");
      if (isPlausibleImportedBizField(bizType) && isPlausibleImportedBizField(bizClass)) {
        return { bizType, bizClass };
      }
    }
    const combinedLine = line.match(/^\uC5C5\s*\uD0DC\s+\uC885\s*\uBAA9\s+(\S+)\s+(.+)$/i);
    if (combinedLine) {
      const bizType = normalizeImportedBizField(combinedLine[1]);
      const bizClass = normalizeImportedBizField(combinedLine[2]);
      if (isPlausibleImportedBizField(bizType) && isPlausibleImportedBizField(bizClass)) {
        return { bizType, bizClass };
      }
    }
    if (!isBizHeaderRow(line)) continue;
    const nextLine = lines[index + 1] || "";
    rowPair = splitBizValuePair(nextLine);
    if (rowPair.bizType || rowPair.bizClass) break;
  }

  return {
    bizType: inline.bizType || rowPair.bizType || captureBizValueAfterLabel(normalized, BIZ_TYPE_LABEL_RE),
    bizClass: inline.bizClass || rowPair.bizClass || captureBizValueAfterLabel(normalized, BIZ_CLASS_LABEL_RE),
  };
}

function isPlausibleImportedBizField(value: string) {
  const normalized = normalizeImportedBizField(value);
  if (!normalized || normalized.length < 2 || normalized.length > 80) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (/(?:\uC0AC\uC5C5\uC790\uBC88\uD638|\uB4F1\uB85D\uBC88\uD638|\uC138\uAE08\uACC4\uC0B0)/.test(normalized)) return false;
  const compact = normalized.replace(/\s+/g, "");
  if (BIZ_LABEL_ONLY_RE.test(compact)) return false;
  if (/^\uC0AC\uC5C5\uC758\uC885\uB958/.test(compact) && compact.length <= 8) return false;
  if (/^[\s.．:：?？·\-—]+$/.test(normalized)) return false;
  return true;
}

function pushBizFieldCandidate(
  candidates: ImportedBizFieldCandidate[],
  seen: Set<string>,
  raw: string,
  score: number,
) {
  const value = normalizeImportedBizField(raw);
  if (!isPlausibleImportedBizField(value) || seen.has(value)) return;
  seen.add(value);
  candidates.push({ value, score });
}

function extractLabeledBizFieldCandidates(
  text: string,
  labelRe: RegExp,
  field: "bizType" | "bizClass",
): ImportedBizFieldCandidate[] {
  const candidates: ImportedBizFieldCandidate[] = [];
  const seen = new Set<string>();
  const normalized = String(text || "");
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isBizHeaderRow(line)) continue;
    if (!labelRe.test(line)) continue;

    const hasBothLabels =
      /\uC5C5\s*\uD0DC/i.test(line) && /(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)/i.test(line);
    if (hasBothLabels) {
      const inlinePair = extractInlineBizPair(line);
      if (field === "bizType" && inlinePair.bizType) {
        pushBizFieldCandidate(candidates, seen, inlinePair.bizType, 100);
        continue;
      }
      if (field === "bizClass" && inlinePair.bizClass) {
        pushBizFieldCandidate(candidates, seen, inlinePair.bizClass, 100);
        continue;
      }
    }

    const sameLine = line.replace(labelRe, "").trim();
    if (sameLine) {
      pushBizFieldCandidate(candidates, seen, sameLine, 100);
      continue;
    }

    const nextLine = lines[index + 1] || "";
    if (nextLine && !labelRe.test(nextLine) && nextLine.length <= 80) {
      const pair = splitBizValuePair(nextLine);
      if (field === "bizType" && pair.bizType) {
        pushBizFieldCandidate(candidates, seen, pair.bizType, 95);
        continue;
      }
      if (field === "bizClass" && pair.bizClass) {
        pushBizFieldCandidate(candidates, seen, pair.bizClass, 95);
        continue;
      }
      pushBizFieldCandidate(candidates, seen, nextLine, 90);
    }
  }

  const labelBlock = normalized.match(new RegExp(`${labelRe.source}\\s*[:：.]+\\s*([^\\n\\r]{2,80})`, "i"));
  if (labelBlock) pushBizFieldCandidate(candidates, seen, labelBlock[1], 95);

  return candidates.sort((a, b) => b.score - a.score);
}

export function extractImportedBizTypeCandidates(text: string): ImportedBizFieldCandidate[] {
  const candidates = extractLabeledBizFieldCandidates(text, BIZ_TYPE_LABEL_RE, "bizType");
  const seen = new Set(candidates.map((row) => row.value));
  const table = extractBizTablePair(text);
  if (table.bizType) pushBizFieldCandidate(candidates, seen, table.bizType, 110);
  const captured = captureBizValueAfterLabel(String(text || ""), BIZ_TYPE_LABEL_RE);
  if (captured) pushBizFieldCandidate(candidates, seen, captured, 85);
  return candidates.sort((a, b) => b.score - a.score || b.value.length - a.value.length);
}

export function extractImportedBizClassCandidates(text: string): ImportedBizFieldCandidate[] {
  const candidates = extractLabeledBizFieldCandidates(text, BIZ_CLASS_LABEL_RE, "bizClass");
  const seen = new Set(candidates.map((row) => row.value));
  const table = extractBizTablePair(text);
  if (table.bizClass) pushBizFieldCandidate(candidates, seen, table.bizClass, 110);
  const captured = captureBizValueAfterLabel(String(text || ""), BIZ_CLASS_LABEL_RE);
  if (captured) pushBizFieldCandidate(candidates, seen, captured, 85);
  return candidates.sort((a, b) => b.score - a.score || b.value.length - a.value.length);
}

export function suggestImportedBizType(text: string): string | undefined {
  return extractImportedBizTypeCandidates(text)[0]?.value;
}

export function suggestImportedBizClass(text: string): string | undefined {
  return extractImportedBizClassCandidates(text)[0]?.value;
}

/** \uC0C1\uD638(\uBC95\uC778\uBA85) \u2192 ERP \uAC70\uB798\uCC98\uBA85 \uC6A9 \uC57D\uCE6D */
export function simplifyClientNameFromLegalName(legalName: string) {
  const legal = cleanImportedText(legalName);
  if (!legal) return "";
  const simplified = legal
    .replace(/^\(?\s*(?:\uC8FC\uC2DD\uD68C\uC0AC|\(\uC8FC\)|\u3231|\uC720\uD55C\uD68C\uC0AC|\(\uC720\))\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
  return cleanImportedText(simplified) || legal;
}

export function mergeBusinessRegImport(
  current: ClientFormState,
  patch: Partial<Pick<ClientFormState, BusinessRegImportFieldKey>>,
  options: { fillEmptyOnly: boolean },
): { next: ClientFormState; filled: BusinessRegImportFieldKey[]; skipped: BusinessRegImportFieldKey[] } {
  const next = { ...current };
  const filled: BusinessRegImportFieldKey[] = [];
  const skipped: BusinessRegImportFieldKey[] = [];

  for (const { key } of BUSINESS_REG_IMPORT_FIELDS) {
    let value = cleanImportedText(patch[key] || "");
    if (!value) continue;
    if (key === "businessNo") value = normalizeImportedBusinessNo(value);
    if (key === "email") value = normalizeImportedEmail(value);
    if (key === "ceoName") value = normalizeImportedCeoName(value);
    if (key === "bizType" || key === "bizClass") value = normalizeImportedBizField(value);
    const existing = cleanImportedText(current[key] || "");
    if (options.fillEmptyOnly && existing) {
      skipped.push(key);
      continue;
    }
    next[key] = value;
    filled.push(key);
  }

  return { next, filled, skipped };
}

export function suggestBusinessRegValues(text: string): Partial<Record<BusinessRegImportFieldKey, string>> {
  const normalized = String(text || "");
  const suggestions: Partial<Record<BusinessRegImportFieldKey, string>> = {};

  const bizMatch = normalized.match(/\d{3}[-\s.]?\d{2}[-\s.]?\d{5}/);
  if (bizMatch) suggestions.businessNo = normalizeImportedBusinessNo(bizMatch[0]);

  const suggestedCeoName = suggestImportedCeoName(normalized);
  if (suggestedCeoName) suggestions.ceoName = suggestedCeoName;

  const nameMatch = normalized.match(
    /(?:\uC0C1\s*\uD638|\uBC95\s*\uC778\s*\uBA85|\uC0C1\s*\uD638\s*\(\uBC95\s*\uC778\s*\uBA85\))\s*[:?]?\s*([^\n\r]{2,60})/,
  );
  if (nameMatch) {
    const legal = cleanImportedText(nameMatch[1]);
    suggestions.taxInvoiceCorpName = legal;
    suggestions.name = simplifyClientNameFromLegalName(legal);
  }

  const suggestedEmail = suggestImportedEmail(normalized);
  if (suggestedEmail) suggestions.email = suggestedEmail;

  const addressMatch = normalized.match(
    /(?:\uC0AC\s*\uC5C5\s*\uC7A5\s*\uC18C\s*\uC7AC\s*\uC9C0|\uC0AC\s*\uC5C5\s*\uC7A5|\uC18C\s*\uC7AC\s*\uC9C0|\uC8FC\s*\uC18C)\s*[:?]?\s*([^\n\r]{5,120})/,
  );
  if (addressMatch) suggestions.address = cleanImportedText(addressMatch[1]);

  const suggestedBizType = suggestImportedBizType(normalized);
  if (suggestedBizType) suggestions.bizType = suggestedBizType;

  const suggestedBizClass = suggestImportedBizClass(normalized);
  if (suggestedBizClass) suggestions.bizClass = suggestedBizClass;

  return suggestions;
}

/** \uCD94\uCD9C \uD6C4\uBCF4 \uBAA9\uB85D\uC744 \uC790\uB3D9 \uCD94\uCC9C \uACB0\uACFC\uC5D0 \uBC18\uD655 */
export function enrichBusinessRegSuggestions(
  suggestions: Partial<Record<BusinessRegImportFieldKey, string>>,
  text: string,
): Partial<Record<BusinessRegImportFieldKey, string>> {
  const next = { ...suggestions };
  if (!next.ceoName) {
    const ceo = extractImportedCeoNameCandidates(text)[0]?.name;
    if (ceo) next.ceoName = ceo;
  }
  if (!next.email) {
    const email = extractImportedEmailCandidates(text)[0]?.email;
    if (email) next.email = email;
  }
  if (!next.bizType) {
    const bizType = extractImportedBizTypeCandidates(text)[0]?.value;
    if (bizType) next.bizType = bizType;
  }
  if (!next.bizClass) {
    const bizClass = extractImportedBizClassCandidates(text)[0]?.value;
    if (bizClass) next.bizClass = bizClass;
  }
  return next;
}

/** \uCD94\uCD9C \uacb0\uacfc + draft \uac12 \uD569\uCCD0 \uC790\uB3D9 \uCD94\uCC9C \uD654\uBA74\uC6A9 \uBAA9\uB85D \uAD6C\uC131 */
export function buildBusinessRegSuggestionDisplay(
  text: string,
  draft: Partial<Record<BusinessRegImportFieldKey, string>> = {},
): Partial<Record<BusinessRegImportFieldKey, string>> {
  const display = buildBusinessRegSuggestions(text);
  for (const { key } of BUSINESS_REG_IMPORT_FIELDS) {
    const pending = String(draft[key] ?? "").trim();
    if (!pending || display[key]) continue;
    if (key === "ceoName") display[key] = normalizeImportedCeoName(pending);
    else if (key === "email") display[key] = normalizeImportedEmail(pending);
    else if (key === "bizType" || key === "bizClass") display[key] = normalizeImportedBizField(pending);
    else display[key] = cleanImportedText(pending);
  }
  return display;
}

export function buildBusinessRegSuggestions(text: string): Partial<Record<BusinessRegImportFieldKey, string>> {
  return enrichBusinessRegSuggestions(suggestBusinessRegValues(text), text);
}
