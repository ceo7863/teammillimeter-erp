export type ClientDepositMatchSource = {
  name?: string;
  manager?: string;
  depositNameAliases?: string;
};

/** @deprecated use ClientDepositMatchSource */
export type ClientDepositAliasSource = ClientDepositMatchSource;

export type WorkerDepositMatchSource = {
  name?: string;
  depositNameAliases?: string;
};

export type DepositClientMatchResult = {
  matched: boolean;
  scoreBonus: number;
  reason: string;
};

const DEFAULT_MATCH_SCORES = {
  name: 35,
  linked: 25,
  alias: 33,
  manager: 32,
};

function normalizeMatchText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\uFF08\uFF09()]/g, "");
}

const INTERNAL_COMPANY_NAME_KEY = "\uD300\uBC00\uB9AC\uBBF8\uD130";

/** \uC608\uAE08\uC8FC\uAC00 \uBCF8\uC778 \uD68C\uC0AC(\uC8FC\uC2DD\uD68C\uC0AC \uD300\uBC00\uB9AC\uBBF8\uD130 \uB4F1) \uACC4\uC88C\uB85C \uB098\uAC04 \uB0B4\uBD80 \uC774\uCCB4 */
export function isInternalCompanyBankTransfer(tx: { counterpartyName?: string }) {
  const counterparty = normalizeMatchText(tx.counterpartyName || "");
  if (!counterparty.includes(INTERNAL_COMPANY_NAME_KEY)) return false;
  if (counterparty.includes("\uC8FC\uC2DD\uD68C\uC0AC")) return true;
  if (counterparty.startsWith("\uC8FC") && counterparty.includes(INTERNAL_COMPANY_NAME_KEY)) return true;
  return counterparty === INTERNAL_COMPANY_NAME_KEY;
}

export function includesDepositName(haystack: string, name: string) {
  const left = normalizeMatchText(haystack);
  const right = normalizeMatchText(name);
  if (!left || !right) return false;
  if (left.length >= 2 && right.length >= 2) {
    return left.includes(right) || right.includes(left);
  }
  return false;
}

export function parseDepositNameAliases(raw?: string) {
  return String(raw || "")
    .split(/[,?\n\r;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDepositNameAliases(raw?: string) {
  return parseDepositNameAliases(raw).join(", ");
}

/** Bank import counterparty (예금주), description, memo 순으로 매칭 텍스트를 구성합니다. */
export function resolveBankDepositMatchSubject(tx: {
  counterpartyName?: string;
  description?: string;
  memo?: string;
}) {
  return [tx.counterpartyName, tx.description, tx.memo]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function appendDepositNameAlias(raw: string | undefined, alias: string) {
  const trimmed = String(alias || "").trim();
  if (!trimmed) return String(raw || "").trim();

  const existing = parseDepositNameAliases(raw);
  const key = normalizeMatchText(trimmed);
  if (existing.some((item) => normalizeMatchText(item) === key)) {
    return existing.join(", ");
  }
  return [...existing, trimmed].join(", ");
}

export function normalizeClientManagerName(raw?: string) {
  let text = String(raw || "").trim();
  if (!text) return "";
  text = text.replace(/^(?:\uB2F4\uB2F9|\uB2F4\uB2F9\uC790|\uB300\uD45C)\s*[:?]?\s*/u, "");
  text = text.replace(
    /(?:\uB2F4\uB2F9|\uB300\uD45C|\uC2E4\uC7A5|\uACFC\uC7A5|\uCC28\uC7A5|\uBD80\uC7A5|\uC774\uC0AC|\uD300\uC7A5|\uC18C\uC7A5|\uB2F4\uC784|\uB300\uD45C\uB2D8|\uB2F4\uB2D8|\uC120\uC0DD|\u69D8)+$/gu,
    ""
  );
  return text.trim();
}

function depositSubjectMatchesNameAndAliases(subject: string, name: string, aliases?: string) {
  const trimmedName = String(name || "").trim();
  if (trimmedName && includesDepositName(subject, trimmedName)) return true;
  const coreName = extractWorkerCoreName(trimmedName);
  if (coreName && coreName !== trimmedName && includesDepositName(subject, coreName)) return true;
  return parseDepositNameAliases(aliases).some((alias) => includesDepositName(subject, alias));
}

/** `황진성(단단팀)` → `황진성` */
export function extractWorkerCoreName(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  const parenMatch = trimmed.match(/^(.+?)\s*[\uFF08(]([^)\uFF09]+)[\uFF09)]\s*$/);
  if (parenMatch?.[1]) return parenMatch[1].trim();
  return trimmed;
}

function buildWorkerMatchTokens(worker: WorkerDepositMatchSource) {
  const tokens = new Set<string>();
  const name = String(worker.name || "").trim();
  if (name) {
    tokens.add(name);
    const core = extractWorkerCoreName(name);
    if (core) tokens.add(core);
    const teamMatch = name.match(/[\uFF08(]([^)\uFF09]+)[\uFF09)]/);
    const team = teamMatch?.[1]?.trim();
    if (team) tokens.add(team);
  }
  for (const alias of parseDepositNameAliases(worker.depositNameAliases)) {
    tokens.add(alias);
    const core = extractWorkerCoreName(alias);
    if (core) tokens.add(core);
  }
  return [...tokens].filter((token) => token.length >= 2);
}

export function bankTextMatchesWorker(text: string, worker: WorkerDepositMatchSource) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  const normalizedText = normalizeMatchText(trimmed);
  return buildWorkerMatchTokens(worker).some((token) => {
    const normalizedToken = normalizeMatchText(token);
    if (normalizedText === normalizedToken) return true;
    return includesDepositName(trimmed, token);
  });
}

export function collectBankTransactionWorkerMatchTexts(tx: {
  memo?: string;
  counterpartyName?: string;
  description?: string;
}) {
  return [
    ...new Set(
      [tx.memo, tx.counterpartyName, tx.description]
        .map((part) => String(part || "").trim())
        .filter(Boolean),
    ),
  ];
}

export function findWorkerForBankTransaction(
  tx: { memo?: string; counterpartyName?: string; description?: string },
  workers: WorkerDepositMatchSource[],
) {
  if (isInternalCompanyBankTransfer(tx)) return undefined;
  const texts = collectBankTransactionWorkerMatchTexts(tx);
  if (!texts.length) return undefined;
  return workers.find((worker) => texts.some((text) => bankTextMatchesWorker(text, worker)));
}

function clientManagerMatchesSubject(subject: string, client: ClientDepositMatchSource) {
  const manager = normalizeClientManagerName(client.manager);
  if (manager.length < 2) return false;
  return includesDepositName(subject, manager);
}

export function depositSubjectMatchesClientAliases(subject: string, client: ClientDepositMatchSource) {
  return parseDepositNameAliases(client.depositNameAliases).some((alias) => includesDepositName(subject, alias));
}

export function depositSubjectMatchesWorker(subject: string, worker: WorkerDepositMatchSource) {
  return bankTextMatchesWorker(subject, worker);
}

export function findWorkerByDepositSubject(workers: WorkerDepositMatchSource[], subject: string) {
  const trimmed = String(subject || "").trim();
  if (!trimmed) return undefined;
  return workers.find((worker) => bankTextMatchesWorker(trimmed, worker));
}

/** 시공자 마스터 이름 또는 괄호 앞 핵심 이름과 정확히 일치할 때 시공자 지출 분류에 사용 */
export function findWorkerByMasterName(workers: WorkerDepositMatchSource[], subject: string) {
  const normalizedSubject = normalizeMatchText(subject);
  if (!normalizedSubject) return undefined;
  return workers.find((worker) => {
    const name = String(worker.name || "").trim();
    if (!name) return false;
    if (normalizeMatchText(name) === normalizedSubject) return true;
    const core = extractWorkerCoreName(name);
    return Boolean(core && normalizeMatchText(core) === normalizedSubject);
  });
}

export function resolveBankWorkerFolderMatchSubject(tx: {
  counterpartyName?: string;
  description?: string;
  memo?: string;
}) {
  return [tx.memo, tx.counterpartyName, tx.description]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function canClassifyBankTransactionAsWorkerFolder(
  tx: { withdrawal?: number; counterpartyName?: string; description?: string; memo?: string },
  workers: WorkerDepositMatchSource[],
) {
  if (Number(tx.withdrawal || 0) <= 0) return false;
  if (isInternalCompanyBankTransfer(tx)) return false;
  return Boolean(findWorkerForBankTransaction(tx, workers));
}

export function depositSubjectMatchesClientManager(subject: string, client: ClientDepositMatchSource) {
  return clientManagerMatchesSubject(subject, client);
}

export function depositSubjectMatchesClient(subject: string, client: ClientDepositMatchSource) {
  if (depositSubjectMatchesNameAndAliases(subject, String(client.name || ""), client.depositNameAliases)) return true;
  if (clientManagerMatchesSubject(subject, client)) return true;
  return false;
}

export function resolveDepositSubjectClientMatch(
  subject: string,
  clientName: string,
  client: ClientDepositMatchSource | undefined,
  options?: {
    linkedSubject?: string;
    scores?: Partial<typeof DEFAULT_MATCH_SCORES>;
  }
): DepositClientMatchResult {
  const scores = { ...DEFAULT_MATCH_SCORES, ...options?.scores };
  const trimmedName = String(clientName || "").trim();

  if (trimmedName && includesDepositName(subject, trimmedName)) {
    return { matched: true, scoreBonus: scores.name, reason: "\uAC70\uB798\uCC98\uBA85 \uC77C\uCE58" };
  }

  const linkedSubject = String(options?.linkedSubject || "").trim();
  if (linkedSubject && trimmedName && includesDepositName(linkedSubject, trimmedName)) {
    return { matched: true, scoreBonus: scores.linked, reason: "\uBD84\uB958 \uAC70\uB798\uCC98 \uC77C\uCE68" };
  }

  if (client && depositSubjectMatchesClientAliases(subject, client)) {
    return { matched: true, scoreBonus: scores.alias, reason: "\uC608\uAE08\uC8FC \uBCC4\uCE59 \uC77C\uCE58" };
  }

  if (client && clientManagerMatchesSubject(subject, client)) {
    return { matched: true, scoreBonus: scores.manager, reason: "\uB2F4\uB2F9\uC790\uBA85 \uC77C\uCE58" };
  }

  return { matched: false, scoreBonus: 0, reason: "" };
}

export function findClientByDepositSubject(clients: ClientDepositMatchSource[], subject: string) {
  const trimmed = String(subject || "").trim();
  if (!trimmed) return undefined;
  return clients.find((client) => depositSubjectMatchesClient(trimmed, client));
}

export function resolveClientNameForDepositSubject(
  subject: string,
  clients: ClientDepositMatchSource[],
  preferredName?: string
) {
  const trimmed = String(subject || "").trim();
  if (!trimmed) return preferredName;

  if (preferredName) {
    const preferred = clients.find((client) => String(client.name || "").trim() === preferredName);
    if (preferred && depositSubjectMatchesClient(trimmed, preferred)) {
      return preferredName;
    }
  }

  return findClientByDepositSubject(clients, trimmed)?.name || preferredName;
}
