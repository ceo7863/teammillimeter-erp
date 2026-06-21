import * as XLSX from "xlsx";
import {
  buildWorkerFeeMap,
  calculateWorkerLineAmounts,
  calculateWorkerLineMetrics,
  parseWorkerMoney,
  resolveWorkerFeeRate,
} from "./workerLineMetrics";
import { formatKRW, monthStartISO, todayISO } from "./receivables";
import { includesDepositName, parseDepositNameAliases } from "./clientDepositAliases";

export { formatKRW, monthStartISO, todayISO };

export type WorkerCategory = "\uD300\uC6D0" | "\uC678\uC8FC";

export const WORKER_CATEGORY_TEAM: WorkerCategory = "\uD300\uC6D0";
export const WORKER_CATEGORY_OUTSOURCE: WorkerCategory = "\uC678\uC8FC";
export const WORKER_CATEGORY_OPTIONS: WorkerCategory[] = [WORKER_CATEGORY_TEAM, WORKER_CATEGORY_OUTSOURCE];

export type WorkerMasterLike = {
  id?: number | string;
  name?: string;
  phone?: string;
  vehicleNo?: string;
  bank?: string;
  account?: string;
  feeRate?: number;
  category?: string;
  isActive?: boolean;
  depositNameAliases?: string;
  grade?: string;
  hireDate?: string;
  /** E등급 종료일(승급 시 자동 기록) — 입사일 기준 월실지급 이력 유지용 */
  eGradeEndedAt?: string;
  /** 수습 종료 후 AI 규칙 자동 조정 적용일 */
  probationAdjustedAt?: string;
  /** 개별 수습 월실지급 (미설정 시 전역 AI 규칙) */
  probationNetPay?: number;
  /** 개별 수습 부가세 포함 여부 (undefined = 전역 규칙 따름) */
  probationPayWithVat?: boolean;
  /** 수습 종료 후 적용 시공비 (미설정 시 전역 AI 규칙) */
  postProbationConstructionCost?: number;
  /** 수습 종료 후 적용 개별청구단가 (미설정 시 전역 AI 규칙) */
  postProbationCustomChargeCost?: number;
  /** 수습 종료 후 적용 등급 (미설정 시 전역 AI 규칙) */
  postProbationGrade?: string;
  /** @deprecated workerMonthlyPaymentMemos 맵으로 이전됨 — 로드 시 마이그레이션만 사용 */
  monthlyPaymentMemo?: string;
  constructionCost?: number;
  customChargeCost?: number;
  /** 시공자 포털 로그인 ID (저장 시 서버에서만 비밀번호 해시 처리) */
  portalLoginId?: string;
  /** 저장 요청 시에만 전송 — 서버가 portalPasswordHash로 변환 */
  portalPassword?: string;
  /** 인사기록부용 증명사진 */
  photoFileId?: string;
  photoFileName?: string;
  photoUploadedAt?: string;
};

export function normalizeWorkerName(value?: string) {
  return String(value || "").trim();
}

export function normalizeWorkerRecordId(id?: number | string | null) {
  if (id == null || id === "") return "";
  return String(id);
}

export function workerIdsEqual(
  left?: number | string | null,
  right?: number | string | null,
) {
  const leftKey = normalizeWorkerRecordId(left);
  const rightKey = normalizeWorkerRecordId(right);
  return Boolean(leftKey) && leftKey === rightKey;
}

export function workerListIdentityKey(worker?: Pick<WorkerMasterLike, "id" | "name"> | null) {
  const id = normalizeWorkerRecordId(worker?.id);
  if (id) return `id:${id}`;
  const name = normalizeWorkerName(worker?.name).replace(/\s+/g, "");
  return name ? `name:${name.toLowerCase()}` : "";
}

/** 병합 결과에서 빠진 기존 시공자를 id·이름 기준으로 다시 붙입니다. */
export function preserveMissingWorkersInList(
  existing: WorkerMasterLike[] = [],
  merged: WorkerMasterLike[] = [],
) {
  const seen = new Set(merged.map((worker) => workerListIdentityKey(worker)).filter(Boolean));
  const next = [...merged];
  for (const worker of existing) {
    const key = workerListIdentityKey(worker);
    if (!key || seen.has(key)) continue;
    next.push(worker);
    seen.add(key);
  }
  return next;
}

export function resolveIncomingWorkerMasterList(
  serverWorkers: unknown,
  localWorkers: WorkerMasterLike[] = [],
  seedWorkers: WorkerMasterLike[] = [],
) {
  if (Array.isArray(serverWorkers) && serverWorkers.length > 0) {
    return serverWorkers as WorkerMasterLike[];
  }
  if (localWorkers.length > 0) return localWorkers;
  return seedWorkers;
}

const WORKER_MASTER_TEXT_FIELDS = [
  "hireDate",
  "eGradeEndedAt",
  "probationAdjustedAt",
  "grade",
  "category",
  "depositNameAliases",
  "portalLoginId",
  "postProbationGrade",
] as const;

const WORKER_MASTER_NUMERIC_FIELDS = [
  "customChargeCost",
  "constructionCost",
  "probationNetPay",
  "postProbationConstructionCost",
  "postProbationCustomChargeCost",
] as const;

function pickWorkerMasterNumeric(incoming?: number, local?: number) {
  const incomingNum = parseWorkerMoney(incoming);
  const localNum = parseWorkerMoney(local);
  if (incomingNum > 0) return incomingNum;
  if (localNum > 0) return localNum;
  return incomingNum || 0;
}

/** 개별청구단가: 0은 "미설정" — 서버·로컬 병합 시 빈 값이 기존 단가를 지우지 않도록 */
export function pickWorkerCustomChargeCost(incoming?: number, local?: number) {
  return pickWorkerMasterNumeric(incoming, local);
}

export function applyWorkerCustomChargeCostFromForm(worker: WorkerMasterLike, formValue: string) {
  const trimmed = String(formValue ?? "").trim();
  const next: WorkerMasterLike = { ...worker };
  if (!trimmed) {
    delete next.customChargeCost;
    return next;
  }
  const parsed = parseWorkerMoney(trimmed);
  if (parsed > 0) {
    next.customChargeCost = parsed;
    return next;
  }
  delete next.customChargeCost;
  return next;
}

export function applyWorkerCustomChargeCostFromInline(worker: WorkerMasterLike, rawValue: string) {
  const trimmed = String(rawValue ?? "").trim();
  const current = parseWorkerMoney(worker.customChargeCost);
  if (!trimmed) {
    return worker;
  }
  const parsed = parseWorkerMoney(trimmed);
  if (parsed <= 0) {
    if (worker.customChargeCost == null) return worker;
    const next: WorkerMasterLike = { ...worker };
    delete next.customChargeCost;
    return next;
  }
  if (parsed === parseWorkerMoney(worker.customChargeCost)) return worker;
  return { ...worker, customChargeCost: parsed };
}

function pickWorkerMasterText(serverValue?: string, localValue?: string) {
  const serverText = String(serverValue ?? "").trim();
  const localText = String(localValue ?? "").trim();
  if (!serverText) return localText;
  if (!localText) return serverText;
  if (localText === serverText) return serverText;
  return localText;
}

function coalesceWorkerMasterText(nextValue?: string, prevValue?: string) {
  const nextText = String(nextValue ?? "").trim();
  if (nextText) return nextText;
  const prevText = String(prevValue ?? "").trim();
  return prevText;
}


/** 단일 시공자 마스터 병합 — 빈 incoming 값이 기존 입사일·등급·단가를 지우지 않도록 */
export function mergeWorkerMasterRecord(
  prev?: WorkerMasterLike | null,
  incoming?: WorkerMasterLike | null,
  options?: { preferLocalOnConflict?: boolean },
): WorkerMasterLike {
  if (!incoming) return { ...(prev || {}) };
  if (!prev) return { ...incoming };

  const preferLocal = options?.preferLocalOnConflict === true;
  const merged: WorkerMasterLike = {
    ...prev,
    ...incoming,
    id: incoming.id ?? prev.id,
    name: coalesceWorkerMasterText(incoming.name, prev.name) || prev.name || incoming.name,
    isActive: incoming.isActive !== undefined ? incoming.isActive : prev.isActive,
  };

  for (const key of WORKER_MASTER_TEXT_FIELDS) {
    const incomingVal = incoming[key as keyof WorkerMasterLike] as string | undefined;
    const prevVal = prev[key as keyof WorkerMasterLike] as string | undefined;
    const value = preferLocal ? pickWorkerMasterText(incomingVal, prevVal) : coalesceWorkerMasterText(incomingVal, prevVal);
    if (value) {
      (merged as Record<string, string>)[key] = value;
    } else {
      delete (merged as Record<string, unknown>)[key];
    }
  }

  for (const key of WORKER_MASTER_NUMERIC_FIELDS) {
    const incomingVal = incoming[key as keyof WorkerMasterLike] as number | undefined;
    const prevVal = prev[key as keyof WorkerMasterLike] as number | undefined;
    const value = preferLocal
      ? key === "customChargeCost"
        ? pickWorkerCustomChargeCost(incomingVal, prevVal)
        : pickWorkerMasterNumeric(incomingVal, prevVal)
      : key === "customChargeCost"
        ? pickWorkerCustomChargeCost(incomingVal, prevVal)
        : pickWorkerMasterNumeric(incomingVal, prevVal);
    if (value > 0) {
      (merged as Record<string, number>)[key] = value;
    } else {
      delete (merged as Record<string, unknown>)[key];
    }
  }

  if (incoming.probationPayWithVat !== undefined) {
    merged.probationPayWithVat = incoming.probationPayWithVat;
  } else if (prev.probationPayWithVat !== undefined) {
    merged.probationPayWithVat = prev.probationPayWithVat;
  } else {
    delete merged.probationPayWithVat;
  }

  if (incoming.portalPasswordHash || prev.portalPasswordHash) {
    merged.portalPasswordHash = incoming.portalPasswordHash || prev.portalPasswordHash;
  }

  if (incoming.portalMustChangePassword === true) {
    merged.portalMustChangePassword = true;
  } else if (incoming.portalMustChangePassword === false) {
    merged.portalMustChangePassword = false;
  } else if (prev.portalMustChangePassword === true) {
    merged.portalMustChangePassword = true;
  } else {
    delete merged.portalMustChangePassword;
  }

  return merged;
}

function findLocalWorkerMatch(
  worker: WorkerMasterLike,
  localById: Map<string, WorkerMasterLike>,
  localByName: Map<string, WorkerMasterLike>,
) {
  const workerId = normalizeWorkerRecordId(worker.id);
  if (workerId && localById.has(workerId)) {
    return localById.get(workerId);
  }
  return localByName.get(normalizeWorkerName(worker.name));
}

function mergeWorkerMasterPair(incoming: WorkerMasterLike, local?: WorkerMasterLike): WorkerMasterLike {
  if (!local) return incoming;
  return mergeWorkerMasterRecord(local, incoming, { preferLocalOnConflict: true });
}

/** 서버 새로고침 시 로컬에만 있는 시공자 마스터 필드가 지워지지 않도록 병합 */
export function mergeWorkerMasterFieldsFromLocal(
  incoming: WorkerMasterLike[] = [],
  local: WorkerMasterLike[] = [],
) {
  const localById = new Map(
    local
      .filter((worker) => normalizeWorkerRecordId(worker.id))
      .map((worker) => [normalizeWorkerRecordId(worker.id), worker]),
  );
  const localByName = new Map(local.map((worker) => [normalizeWorkerName(worker.name), worker]));
  const seenIds = new Set<string | number>();
  const seenNames = new Set<string>();

  const merged = incoming.map((worker) => {
    if (worker.id != null) seenIds.add(worker.id);
    const normalizedName = normalizeWorkerName(worker.name);
    if (normalizedName) seenNames.add(normalizedName);
    const prev = findLocalWorkerMatch(worker, localById, localByName);
    return mergeWorkerMasterPair(worker, prev);
  });

  for (const worker of local) {
    const idSeen = worker.id != null && seenIds.has(worker.id);
    const nameSeen = seenNames.has(normalizeWorkerName(worker.name));
    if (!idSeen && !nameSeen) {
      merged.push(worker);
      if (worker.id != null) seenIds.add(worker.id);
      const normalizedName = normalizeWorkerName(worker.name);
      if (normalizedName) seenNames.add(normalizedName);
    }
  }

  return merged;
}

export function mergeIncomingWorkerMasterList(
  incoming: WorkerMasterLike[] = [],
  local: WorkerMasterLike[] = [],
) {
  return preserveMissingWorkersInList(local, mergeWorkerMasterFieldsFromLocal(incoming, local));
}

/** 부분 업데이트 시 ref에 있는 입사일·등급 등 마스터 필드가 빠지지 않도록 병합 */
export function reconcileWorkerListUpdates(
  current: WorkerMasterLike[] = [],
  next: WorkerMasterLike[] = [],
) {
  const currentById = new Map(
    current
      .filter((worker) => normalizeWorkerRecordId(worker.id))
      .map((worker) => [normalizeWorkerRecordId(worker.id), worker]),
  );
  const merged = next.map((worker) => {
    const workerId = normalizeWorkerRecordId(worker.id);
    const prev = workerId ? currentById.get(workerId) : undefined;
    return prev ? mergeWorkerMasterRecord(prev, worker) : worker;
  });

  return preserveMissingWorkersInList(current, merged);
}

export function stripMonthlyPaymentMemoFromWorkers(workers: WorkerMasterLike[] = []) {
  return workers.map(({ monthlyPaymentMemo: _legacy, ...worker }) => worker);
}

/** worker.monthlyPaymentMemo → workerMonthlyPaymentMemos (1회 마이그레이션) */
export function migrateWorkerMonthlyPaymentMemosFromWorkers(
  workers: WorkerMasterLike[] = [],
  memos: WorkerMonthlyPaymentMemos = {},
): WorkerMonthlyPaymentMemos {
  const next = { ...memos };
  for (const worker of workers) {
    const idKey = normalizeWorkerRecordId(worker.id);
    const text = String(worker.monthlyPaymentMemo || "").trim();
    if (idKey && text && !next[idKey]) next[idKey] = text;
  }
  return next;
}

/** @deprecated migrateWorkerMonthlyPaymentMemosFromWorkers 사용 */
export const syncWorkerMonthlyPaymentMemosFromWorkers = migrateWorkerMonthlyPaymentMemosFromWorkers;

export function readWorkerMonthlyPaymentMemo(
  workers: WorkerMasterLike[] = [],
  workerId?: number | string | null,
  listName?: string,
  memos: WorkerMonthlyPaymentMemos = {},
) {
  let idKey = workerId != null ? normalizeWorkerRecordId(workerId) : "";
  if (!idKey && listName) {
    const master = findWorkerMasterByListName(workers, listName);
    idKey = master?.id != null ? normalizeWorkerRecordId(master.id) : "";
  }
  if (idKey && Object.prototype.hasOwnProperty.call(memos, idKey)) {
    return String(memos[idKey]).trim();
  }
  return "";
}

export type WorkerMonthlyPaymentMemos = Record<string, string>;

export function normalizeWorkerMonthlyPaymentMemos(raw: unknown): WorkerMonthlyPaymentMemos {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: WorkerMonthlyPaymentMemos = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const idKey = normalizeWorkerRecordId(key);
    const text = String(value ?? "").trim();
    if (idKey && text) out[idKey] = text;
  }
  return out;
}

export function patchWorkerMonthlyPaymentMemos(
  memos: WorkerMonthlyPaymentMemos = {},
  workerId?: number | string | null,
  memo?: string,
): WorkerMonthlyPaymentMemos {
  const idKey = normalizeWorkerRecordId(workerId);
  if (!idKey) return memos;
  const trimmed = String(memo ?? "").trim();
  const next = { ...memos };
  if (trimmed) next[idKey] = trimmed;
  else delete next[idKey];
  return next;
}

export function mergeWorkerMonthlyPaymentMemosForSave(
  existing: WorkerMonthlyPaymentMemos = {},
  incoming: WorkerMonthlyPaymentMemos = {},
): WorkerMonthlyPaymentMemos {
  return { ...existing, ...incoming };
}

export function normalizeWorkerCategory(value?: string): WorkerCategory {
  return String(value || "").trim() === WORKER_CATEGORY_OUTSOURCE ? WORKER_CATEGORY_OUTSOURCE : WORKER_CATEGORY_TEAM;
}

export function isWorkerExplicitTeamMember(worker?: Pick<WorkerMasterLike, "category"> | null) {
  return String(worker?.category || "").trim() === WORKER_CATEGORY_TEAM;
}

export function isWorkerExplicitOutsourceMember(worker?: Pick<WorkerMasterLike, "category"> | null) {
  return String(worker?.category || "").trim() === WORKER_CATEGORY_OUTSOURCE;
}

export function findWorkerMasterByExactName(
  workers: WorkerMasterLike[] = [],
  name?: string,
): WorkerMasterLike | undefined {
  const target = normalizeWorkerName(name);
  if (!target) return undefined;
  return workers.find((worker) => normalizeWorkerName(worker.name) === target);
}

function stripLeadingAPrefix(name: string) {
  const normalized = normalizeWorkerName(name);
  if (!normalized) return normalized;
  const stripped = normalized.replace(/^[A-Za-z]+/, "").trimStart();
  return stripped || normalized;
}

function normalizeWorkerListMatchKey(name: string) {
  return stripLeadingAPrefix(normalizeWorkerName(name)).replace(/\s+/g, "");
}

/** 시공자 목록 매칭: 정확한 이름 → 선행 영문 접두 보정 → 입금 별칭 */
export function findWorkerMasterByListName(
  workers: WorkerMasterLike[] = [],
  name?: string,
): WorkerMasterLike | undefined {
  const exact = findWorkerMasterByExactName(workers, name);
  if (exact) return exact;

  const target = normalizeWorkerName(name);
  if (!target) return undefined;
  const targetCore = stripLeadingAPrefix(target);
  const targetKey = normalizeWorkerListMatchKey(target);

  for (const worker of workers) {
    const workerName = normalizeWorkerName(worker.name);
    if (!workerName) continue;
    if (stripLeadingAPrefix(workerName) === targetCore) return worker;
    if (normalizeWorkerListMatchKey(workerName) === targetKey) return worker;
  }

  for (const worker of workers) {
    const aliases = parseDepositNameAliases(worker.depositNameAliases);
    if (aliases.some((alias) => normalizeWorkerName(alias) === target)) return worker;
    if (aliases.some((alias) => normalizeWorkerListMatchKey(alias) === targetKey)) return worker;
  }

  return undefined;
}

/** 매출·지급 라벨을 시공자 목록의 표준 이름으로 변환 */
export function resolveWorkerListName(workers: WorkerMasterLike[] = [], workerName?: string) {
  const trimmed = normalizeWorkerName(workerName);
  if (!trimmed) return "";
  const master = findWorkerMasterByListName(workers, trimmed);
  return master ? normalizeWorkerName(master.name) : trimmed;
}

/** 시공자 목록의 구분(category) 필드만 사용 */
export function resolveWorkerCategoryFromList(
  workers: WorkerMasterLike[] = [],
  workerName: string,
  master?: WorkerMasterLike | null,
): WorkerCategory {
  const source = master ?? findWorkerMasterByListName(workers, workerName);
  return normalizeWorkerCategory(source?.category);
}

export function workerCategorySortRank(value?: string) {
  return normalizeWorkerCategory(value) === WORKER_CATEGORY_OUTSOURCE ? 1 : 0;
}

export function isWorkerActive(worker?: Pick<WorkerMasterLike, "isActive"> | null) {
  return worker?.isActive !== false;
}

export function filterActiveWorkers(workers: WorkerMasterLike[] = []) {
  return workers.filter((worker) => isWorkerActive(worker));
}

export function workerActiveSortRank(worker: Pick<WorkerMasterLike, "isActive">) {
  return isWorkerActive(worker) ? 0 : 1;
}

export function compareWorkerMastersDefault(a: WorkerMasterLike, b: WorkerMasterLike) {
  const activeDiff = workerActiveSortRank(a) - workerActiveSortRank(b);
  if (activeDiff !== 0) return activeDiff;
  const categoryDiff = workerCategorySortRank(a.category) - workerCategorySortRank(b.category);
  if (categoryDiff !== 0) return categoryDiff;
  return normalizeWorkerName(a.name).localeCompare(normalizeWorkerName(b.name), "ko");
}

/** Folder lists: keep each category in one block (team, then outsource). */
export function compareWorkerFolderRows<
  T extends { category: WorkerCategory; isActive?: boolean; worker?: string; workerName?: string },
>(a: T, b: T) {
  const categoryDiff = workerCategorySortRank(a.category) - workerCategorySortRank(b.category);
  if (categoryDiff !== 0) return categoryDiff;
  const activeDiff = workerActiveSortRank(a) - workerActiveSortRank(b);
  if (activeDiff !== 0) return activeDiff;
  const aName = normalizeWorkerName(a.worker || a.workerName);
  const bName = normalizeWorkerName(b.worker || b.workerName);
  return aName.localeCompare(bName, "ko");
}

export function findWorkerMasterByName(
  workers: WorkerMasterLike[] = [],
  name?: string,
): WorkerMasterLike | undefined {
  const target = normalizeWorkerName(name);
  if (!target) return undefined;

  for (const worker of workers) {
    if (normalizeWorkerName(worker.name) === target) return worker;
  }

  for (const worker of workers) {
    const aliases = parseDepositNameAliases(worker.depositNameAliases);
    if (aliases.some((alias) => normalizeWorkerName(alias) === target)) return worker;
    if (includesDepositName(worker.name || "", target)) return worker;
  }

  return undefined;
}

export type SaleLike = {
  id?: number | string;
  voucherNo?: string | number;
  date?: string;
  client?: string;
  site?: string;
  worker?: string;
  workers?: WorkerLineLike[];
  memo?: string;
  amount?: number;
};

export type WorkerLineLike = {
  worker?: string;
  quantity?: string | number;
  unitCost?: string | number;
  chargeAmount?: string | number;
  meal?: string | number;
  lodging?: string | number;
  accommodation?: string | number;
  room?: string | number;
  expense?: string | number;
  extraExpense?: string | number;
  overtimeHours?: string | number;
  overtimeCost?: string | number;
  feeRate?: string | number;
  lineBill?: string | number;
  lineSpend?: string | number;
  lineMargin?: string | number;
  memo?: string;
  no?: string | number;
};

export type WorkerPaymentDetailRow = {
  id: string;
  saleId: number | string;
  voucherNo: string;
  date: string;
  client: string;
  site: string;
  worker: string;
  quantity: number;
  unitCost: number;
  basePay: number;
  meal: number;
  lodging: number;
  expense: number;
  overtime: number;
  totalPay: number;
  feeRate: number;
  fee: number;
  netPay: number;
  bill: number;
  margin: number;
  memo: string;
};

export type WorkerPaymentSummaryRow = {
  workerId?: number | string;
  name: string;
  phone?: string;
  bank?: string;
  account?: string;
  feeRate: number;
  lineCount: number;
  headcount: number;
  grossPay: number;
  fee: number;
  netPay: number;
};

export function formatStatementDate(value: string) {
  if (!value) return "";
  const normalized = String(value).trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!year || !month || !day) return normalized;
    return `${year}년 ${month}월 ${day}일`;
  }
  return normalized;
}

/** 시공비내역서 표 시공일: 6/1 형식 */
export function formatStatementTableDate(value: string) {
  if (!value) return "";
  const normalized = String(value).trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!month || !day) return normalized;
    return `${month}/${day}`;
  }
  return normalized;
}

/** 시공자 시공내역서: 5/22/26 형식 */
export function formatWorkerStatementDate(value: string) {
  if (!value) return "";
  const normalized = String(value).trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]) % 100;
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!month || !day) return normalized;
    return `${month}/${day}/${year}`;
  }
  return normalized;
}

export const WORKER_STATEMENT_VAT_RATE = 0.1;

export function workerStatementAmountWithVat(netAmount: number, payWithVat = false) {
  const net = Math.round(Number(netAmount) || 0);
  if (!payWithVat || net <= 0) return net;
  return net + Math.round(net * WORKER_STATEMENT_VAT_RATE);
}

export function formatWorkerStatementDashAmount(netAmount: number, payWithVat = false) {
  const amount = workerStatementAmountWithVat(netAmount, payWithVat);
  return amount ? formatKRW(amount) : "-";
}

export function formatWorkerStatementBankAccount(workerInfo: WorkerMasterLike = {}, workerName = "") {
  const bank = String(workerInfo.bank || "").trim();
  const account = String(workerInfo.account || "").trim();
  const holder = String(workerName || workerInfo.name || "").trim();
  const core = [bank, account].filter(Boolean).join(" ");
  if (!core && !holder) return "-";
  if (holder) return core ? `${core} (${holder})` : holder;
  return core;
}

export function workerStatementRowVat(netAmount: number) {
  const net = Math.round(Number(netAmount) || 0);
  if (net <= 0) return { net: 0, vat: 0, withVat: 0 };
  const vat = Math.round(net * WORKER_STATEMENT_VAT_RATE);
  return { net, vat, withVat: net + vat };
}

export function formatWorkerStatementVatAmount(netAmount: number) {
  const { vat } = workerStatementRowVat(netAmount);
  return vat ? formatKRW(vat) : "-";
}

export function formatWorkerStatementWithVatAmount(netAmount: number) {
  const { withVat } = workerStatementRowVat(netAmount);
  return withVat ? formatKRW(withVat) : "-";
}

export function buildWorkerStatementVatBreakdown(summary: { grossPay: number; netPay: number }) {
  const gross = workerStatementRowVat(summary.grossPay);
  const net = workerStatementRowVat(summary.netPay);
  return {
    grossPay: gross.net,
    grossVatAmount: gross.vat,
    grossPayWithVat: gross.withVat,
    netPay: net.net,
    netVatAmount: net.vat,
    netPayWithVat: net.withVat,
  };
}

type WorkerStatementPayWithVatRecord = { key?: string; payWithVat?: boolean };
type WorkerStatementPayWithVatRule = { worker?: string; payWithVat?: boolean };

export function resolveWorkerStatementPayWithVat(
  worker: string,
  periodAnchorDate: string,
  records: WorkerStatementPayWithVatRecord[] = [],
  learnRules: WorkerStatementPayWithVatRule[] = [],
) {
  const trimmed = normalizeWorkerName(worker);
  if (!trimmed) return false;

  const monthKey = String(periodAnchorDate || "").slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(monthKey)) {
    const recordKey = `${monthKey}::${trimmed}`;
    const record = records.find((row) => String(row.key || "") === recordKey);
    if (record?.payWithVat) return true;
  }

  return Boolean(learnRules.find((row) => normalizeWorkerName(row.worker) === trimmed)?.payWithVat);
}

export function sortWorkerPaymentRowsByDate<T extends { date?: string; id?: string }>(rows: T[] = []) {
  return [...rows].sort((a, b) => {
    const byDate = String(a.date || "").localeCompare(String(b.date || ""));
    if (byDate !== 0) return byDate;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/** 시공내역서: 최근 시공일이 위로 오도록 */
export function sortWorkerPaymentRowsByDateDesc<T extends { date?: string; id?: string }>(rows: T[] = []) {
  return [...rows].sort((a, b) => {
    const byDate = String(b.date || "").localeCompare(String(a.date || ""));
    if (byDate !== 0) return byDate;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

export function formatStatementDashAmount(value: number) {
  const amount = Number(value) || 0;
  return amount ? formatKRW(amount) : "-";
}

export function filterSalesByDate(sales: SaleLike[] = [], startDate = "", endDate = "") {
  return sales.filter((sale) => {
    const startMatch = startDate ? String(sale.date || "") >= startDate : true;
    const endMatch = endDate ? String(sale.date || "") <= endDate : true;
    return startMatch && endMatch;
  });
}

function saleWorkerLines(sale: SaleLike): WorkerLineLike[] {
  if (sale.workers?.length) {
    return sale.workers.filter((line) => String(line.worker || "").trim());
  }
  if (!sale.worker) return [];

  return String(sale.worker || "")
    .split(",")
    .map((name) => ({
      worker: name.trim(),
      quantity: "1",
      unitCost: String(sale.amount || 0),
      chargeAmount: String(sale.amount || 0),
      meal: "",
      overtimeHours: "",
      overtimeCost: "30000",
      memo: "",
    }))
    .filter((line) => line.worker);
}

export function flattenSalesToWorkerPaymentRows(
  sales: SaleLike[] = [],
  workersMaster: WorkerMasterLike[] = []
): WorkerPaymentDetailRow[] {
  const feeMap = buildWorkerFeeMap(workersMaster);

  return sales.flatMap((sale) => {
    const lines = saleWorkerLines(sale);

    return lines.map((line, lineIndex) => {
      const calculated = calculateWorkerLineAmounts(line);
      const feeRate = resolveWorkerFeeRate(line, feeMap);
      const quantity = parseWorkerMoney(line.quantity || "1") || 1;
      const unitCost = parseWorkerMoney(line.unitCost);
      const meal = parseWorkerMoney(line.meal);
      const lodging = parseWorkerMoney(line.lodging || line.accommodation || line.room);
      const expense = parseWorkerMoney(line.expense || line.extraExpense);
      const overtime = parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
      const basePay = quantity * unitCost;
      const totalPay = calculated.spend;
      const fee = Math.round(totalPay * feeRate);
      const metrics = calculateWorkerLineMetrics(line, feeRate);

      return {
        id: `${sale.id}-${line.worker}-${line.no ?? lineIndex}`,
        saleId: sale.id ?? "",
        voucherNo: String(sale.voucherNo ?? sale.id ?? ""),
        date: sale.date || "",
        client: sale.client || "",
        site: sale.site || "",
        worker: String(line.worker || "").trim(),
        quantity,
        unitCost,
        basePay,
        meal,
        lodging,
        expense,
        overtime,
        totalPay,
        feeRate,
        fee,
        netPay: totalPay - fee,
        bill: metrics.bill,
        margin: metrics.margin,
        memo: String(line.memo || "").trim(),
      };
    });
  });
}

export function listWorkersWithPaymentRows(
  sales: SaleLike[] = [],
  dateFilter: { startDate?: string; endDate?: string } = {},
  workersMaster: WorkerMasterLike[] = []
) {
  const filtered = filterSalesByDate(sales, dateFilter.startDate, dateFilter.endDate);
  const rows = flattenSalesToWorkerPaymentRows(filtered, workersMaster);
  const grouped = new Map<string, number>();

  for (const row of rows) {
    if (!row.worker) continue;
    grouped.set(row.worker, (grouped.get(row.worker) || 0) + 1);
  }

  return [...grouped.entries()]
    .map(([name, rowCount]) => ({ name, rowCount }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function buildWorkerStatementSummary(rows: WorkerPaymentDetailRow[], workerInfo: WorkerMasterLike = {}) {
  const grossPay = rows.reduce((sum, row) => sum + (row.totalPay || 0), 0);
  const feeRate = workerInfo?.feeRate || 0;
  const fee = Math.round(grossPay * feeRate);
  return { grossPay, fee, netPay: grossPay - fee };
}

export function summarizeWorkerPaymentRows(
  rows: WorkerPaymentDetailRow[] = [],
  workersMaster: WorkerMasterLike[] = []
): WorkerPaymentSummaryRow[] {
  const masterByName = new Map(workersMaster.map((worker) => [String(worker.name || "").trim(), worker]));
  const grouped = new Map<string, { lineCount: number; headcount: number; grossPay: number; fee: number }>();

  for (const row of rows) {
    if (!row.worker) continue;
    const current = grouped.get(row.worker) || { lineCount: 0, headcount: 0, grossPay: 0, fee: 0 };
    current.lineCount += 1;
    current.headcount += row.quantity || 0;
    current.grossPay += row.totalPay || 0;
    current.fee += row.fee || 0;
    grouped.set(row.worker, current);
  }

  const names = new Set([
    ...workersMaster.map((worker) => String(worker.name || "").trim()).filter(Boolean),
    ...grouped.keys(),
  ]);

  return [...names]
    .map((name) => {
      const master = masterByName.get(name) || {};
      const totals = grouped.get(name) || { lineCount: 0, headcount: 0, grossPay: 0, fee: 0 };
      const feeRate = master.feeRate ?? 0;
      const grossPay = totals.grossPay;
      const fee = totals.grossPay > 0 ? Math.round(grossPay * feeRate) : totals.fee;
      const netPay = grossPay - fee;

      return {
        workerId: master.id,
        name,
        phone: master.phone,
        bank: master.bank,
        account: master.account,
        feeRate,
        lineCount: totals.lineCount,
        headcount: totals.headcount,
        grossPay,
        fee,
        netPay,
      };
    })
    .sort((a, b) => b.grossPay - a.grossPay || a.name.localeCompare(b.name, "ko"));
}

export function summarizeWorkerPaymentDetailTotals(rows: WorkerPaymentDetailRow[] = []) {
  return rows.reduce(
    (acc, row) => {
      acc.lineCount += 1;
      acc.headcount += row.quantity || 0;
      acc.basePay += row.basePay || 0;
      acc.meal += row.meal || 0;
      acc.lodging += row.lodging || 0;
      acc.expense += row.expense || 0;
      acc.overtime += row.overtime || 0;
      acc.grossPay += row.totalPay || 0;
      acc.fee += row.fee || 0;
      acc.netPay += row.netPay || 0;
      return acc;
    },
    {
      lineCount: 0,
      headcount: 0,
      basePay: 0,
      meal: 0,
      lodging: 0,
      expense: 0,
      overtime: 0,
      grossPay: 0,
      fee: 0,
      netPay: 0,
    }
  );
}

export function downloadWorkerPaymentExcel(rows: WorkerPaymentDetailRow[], filenamePrefix = "시공자지급") {
  const header = ["일자", "전표", "거래처", "현장", "시공자", "인원", "지급단가", "시공비", "식대", "숙박", "경비", "야근", "지급합계", "수수료", "실지급", "비고"];
  const dataRows = rows.map((row) => [
    row.date,
    row.voucherNo,
    row.client,
    row.site,
    row.worker,
    row.quantity,
    row.unitCost,
    row.basePay,
    row.meal || "",
    row.lodging || "",
    row.expense || "",
    row.overtime || "",
    row.totalPay,
    row.fee,
    row.netPay,
    row.memo,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  worksheet["!cols"] = [
    { wch: 11 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 5 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "시공자지급");
  XLSX.writeFile(workbook, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
