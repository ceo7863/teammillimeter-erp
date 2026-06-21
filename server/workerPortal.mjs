import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import {
  getWorkerPortalStatementStartDate,
  getWorkerProbationEndDate,
  isWorkerInProbationForPortal,
  resolveWorkerPortalCalendarMonthPeriod,
  saleDateEligibleForWorkerPortal,
} from "../src/utils/workerPortalProbation.ts";

const MAX_PORTAL_LOGIN_LOGS = 3000;
export const WORKER_PORTAL_DEFAULT_PASSWORD = "1234";

let defaultPortalPasswordHashCache = null;

function getDefaultPortalPasswordHash() {
  if (!defaultPortalPasswordHashCache) {
    defaultPortalPasswordHashCache = hashPortalPassword(WORKER_PORTAL_DEFAULT_PASSWORD);
  }
  return defaultPortalPasswordHashCache;
}

export function workerHasPortalLoginId(worker) {
  return Boolean(normalizePortalLoginId(worker?.portalLoginId));
}

export function workerPortalMustChangePassword(worker) {
  return worker?.portalMustChangePassword === true;
}

export function applyDefaultPortalPasswordToWorker(worker, { force = false } = {}) {
  if (!workerHasPortalLoginId(worker) || worker?.isActive === false) return worker;
  if (!force && worker?.portalPasswordHash) return worker;
  return {
    ...worker,
    portalPasswordHash: getDefaultPortalPasswordHash(),
    portalMustChangePassword: true,
  };
}

/** 포털 ID는 있는데 비밀번호 해시가 없는 시공자에 기본 비밀번호(1234)를 채웁니다. */
export function ensureWorkersPortalDefaultPasswords(workers = []) {
  let changed = false;
  const next = (workers || []).map((worker) => {
    if (!workerHasPortalLoginId(worker) || worker.isActive === false) return worker;
    if (worker.portalPasswordHash) return worker;
    changed = true;
    return applyDefaultPortalPasswordToWorker(worker);
  });
  return { workers: next, changed };
}

/** 활성 시공자 포털 비밀번호를 기본값(1234)으로 통일하고 다음 로그인 시 변경을 요구합니다. */
export function resetAllWorkerPortalPasswordsToDefault(workers = []) {
  let changed = false;
  const next = (workers || []).map((worker) => {
    if (!workerHasPortalLoginId(worker) || worker.isActive === false) return worker;
    const updated = applyDefaultPortalPasswordToWorker(worker, { force: true });
    if (
      updated.portalPasswordHash !== worker.portalPasswordHash ||
      worker.portalMustChangePassword !== true
    ) {
      changed = true;
    }
    return updated;
  });
  return { workers: next, changed, updatedCount: next.filter((w, i) => w !== workers[i]).length };
}

export function normalizeWorkerName(value) {
  return String(value || "").trim();
}

export function normalizePortalLoginId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function portalLoginIdsEquivalent(left, right) {
  const a = normalizePortalLoginId(left);
  const b = normalizePortalLoginId(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const aTrim = a.replace(/^0+/, "") || "0";
    const bTrim = b.replace(/^0+/, "") || "0";
    return aTrim === bTrim;
  }
  return false;
}

export function findWorkerByPortalLoginId(workers = [], loginId) {
  const target = normalizePortalLoginId(loginId);
  if (!target) return null;
  return (
    workers.find((worker) => portalLoginIdsEquivalent(worker.portalLoginId, target)) || null
  );
}

function normalizeWorkerListMatchKey(name) {
  return normalizeWorkerName(name).replace(/\s+/g, "");
}

function parseDepositNameAliases(raw) {
  return String(raw || "")
    .split(/[,??]/)
    .map((part) => normalizeWorkerName(part))
    .filter(Boolean);
}

export function findWorkerMasterByListName(workers = [], name) {
  const target = normalizeWorkerName(name);
  if (!target) return undefined;
  const targetKey = normalizeWorkerListMatchKey(target);

  for (const worker of workers) {
    if (normalizeWorkerName(worker.name) === target) return worker;
    if (normalizeWorkerListMatchKey(worker.name) === targetKey) return worker;
  }

  for (const worker of workers) {
    const aliases = parseDepositNameAliases(worker.depositNameAliases);
    if (aliases.some((alias) => normalizeWorkerName(alias) === target)) return worker;
    if (aliases.some((alias) => normalizeWorkerListMatchKey(alias) === targetKey)) return worker;
  }

  return undefined;
}

export function resolveWorkerListName(workers = [], workerName) {
  const trimmed = normalizeWorkerName(workerName);
  if (!trimmed) return "";
  const master = findWorkerMasterByListName(workers, trimmed);
  return master ? normalizeWorkerName(master.name) : trimmed;
}

export function hashPortalPassword(password) {
  return bcrypt.hashSync(String(password || ""), 10);
}

export function verifyPortalPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(String(password || ""), String(hash));
}

export function signWorkerPortalToken(worker) {
  return jwt.sign(
    {
      type: "worker-portal",
      workerId: worker.id,
      workerName: normalizeWorkerName(worker.name),
      portalLoginId: normalizePortalLoginId(worker.portalLoginId),
    },
    config.jwtSecret,
    { expiresIn: process.env.WORKER_PORTAL_TOKEN_EXPIRES || "30d" },
  );
}

export function verifyWorkerPortalToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload?.type !== "worker-portal") {
    const error = new Error("invalid token type");
    error.status = 401;
    throw error;
  }
  return payload;
}

export function workerPortalAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    return;
  }
  try {
    req.workerPortal = verifyWorkerPortalToken(token);
    next();
  } catch {
    res.status(401).json({ error: "\uC138\uC158\uC774 \uB9CC\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694." });
  }
}

export function stripWorkerPortalSecrets(worker) {
  if (!worker || typeof worker !== "object") return worker;
  const { portalPassword: _pw, portalPasswordHash: _hash, ...safe } = worker;
  return safe;
}

export function sanitizeWorkersForClient(workers = []) {
  return workers.map(stripWorkerPortalSecrets);
}

function parseWorkerMoney(value) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function normalizeFeeRate(value) {
  const raw = parseWorkerMoney(value);
  return raw > 1 ? raw / 100 : raw;
}

function buildWorkerFeeMap(workers = []) {
  return new Map(workers.map((worker) => [normalizeWorkerName(worker.name), normalizeFeeRate(worker.feeRate)]));
}

function resolveWorkerFeeRate(line, feeMap) {
  if (line.feeRate != null && line.feeRate !== "") return normalizeFeeRate(line.feeRate);
  const name = normalizeWorkerName(line.worker);
  if (feeMap && name && feeMap.has(name)) return feeMap.get(name) || 0;
  return 0;
}

function hasExplicitWorkerField(value) {
  return value != null && String(value).trim() !== "";
}

function readFieldExtrasTotal(line) {
  const meal = parseWorkerMoney(line.meal);
  const lodging = parseWorkerMoney(line.lodging || line.accommodation || line.room);
  const expense = parseWorkerMoney(line.expense || line.extraExpense);
  const overtime = parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
  return meal + lodging + expense + overtime;
}

function isLineBillStaleUnitCostFallback(line) {
  if (!hasExplicitWorkerField(line.lineBill)) return false;
  const bill = parseWorkerMoney(line.lineBill);
  const quantity = parseWorkerMoney(line.quantity || "1") || 1;
  const unitCost = parseWorkerMoney(line.unitCost);
  if (!unitCost) return false;
  const unitTotal = quantity * unitCost;
  const extras = readFieldExtrasTotal(line);
  return bill === unitTotal || bill === unitTotal + extras;
}

function usesChargeAmountForBill(line) {
  if (hasExplicitWorkerField(line.chargeAmount)) return true;
  if (Object.prototype.hasOwnProperty.call(line, "chargeAmount")) {
    if (hasExplicitWorkerField(line.lineBill) && !isLineBillStaleUnitCostFallback(line)) return false;
    return true;
  }
  return false;
}

function calculateWorkerLineAmounts(line) {
  const quantity = parseWorkerMoney(line.quantity || "1") || 1;
  const unitCost = parseWorkerMoney(line.unitCost);
  const chargeAmount = parseWorkerMoney(line.chargeAmount);
  const meal = parseWorkerMoney(line.meal);
  const lodging = parseWorkerMoney(line.lodging || line.accommodation || line.room);
  const expense = parseWorkerMoney(line.expense || line.extraExpense);
  const overtime = parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
  const extras = meal + lodging + expense + overtime;
  return {
    staffCount: quantity,
    spend: quantity * unitCost + extras,
    bill: quantity * chargeAmount + extras,
  };
}

function calculateWorkerMargin(bill, spend, feeRate) {
  return bill - spend + Math.round(spend * feeRate);
}

function calculateWorkerLineMetrics(line, feeRate = 0) {
  const normalizedFee =
    line.feeRate != null && line.feeRate !== "" ? normalizeFeeRate(line.feeRate) : normalizeFeeRate(feeRate);

  if (usesChargeAmountForBill(line)) {
    const amounts = calculateWorkerLineAmounts(line);
    return {
      bill: amounts.bill,
      spend: amounts.spend,
      margin: calculateWorkerMargin(amounts.bill, amounts.spend, normalizedFee),
      feeRate: normalizedFee,
    };
  }

  if (hasExplicitWorkerField(line.lineBill)) {
    const sheetBill = parseWorkerMoney(line.lineBill);
    const sheetSpend = parseWorkerMoney(line.lineSpend);
    const sheetMargin = parseWorkerMoney(line.lineMargin);
    return {
      bill: sheetBill,
      spend: sheetSpend,
      margin: sheetMargin || calculateWorkerMargin(sheetBill, sheetSpend, normalizedFee),
      feeRate: normalizedFee,
    };
  }

  const sheetSpend = parseWorkerMoney(line.lineSpend);
  const sheetMargin = parseWorkerMoney(line.lineMargin);
  if (sheetSpend || sheetMargin) {
    return {
      bill: 0,
      spend: sheetSpend,
      margin: sheetMargin || calculateWorkerMargin(0, sheetSpend, normalizedFee),
      feeRate: normalizedFee,
    };
  }

  const amounts = calculateWorkerLineAmounts(line);
  return {
    bill: amounts.bill,
    spend: amounts.spend,
    margin: calculateWorkerMargin(amounts.bill, amounts.spend, normalizedFee),
    feeRate: normalizedFee,
  };
}

function saleWorkerLines(sale) {
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

function flattenSalesToWorkerPaymentRows(sales = [], workersMaster = []) {
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
      const overtime =
        parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
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
        worker: normalizeWorkerName(line.worker),
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

function filterSalesByDate(sales = [], startDate = "", endDate = "") {
  return sales.filter((sale) => {
    const startMatch = startDate ? String(sale.date || "") >= startDate : true;
    const endMatch = endDate ? String(sale.date || "") <= endDate : true;
    return startMatch && endMatch;
  });
}

function lineBelongsToWorker(lineWorker, canonicalName, workers) {
  const resolved = resolveWorkerListName(workers, lineWorker);
  return resolved === canonicalName || normalizeWorkerName(lineWorker) === canonicalName;
}

function resolveWorkerPortalRecord(workers = [], workerName) {
  const canonicalName = resolveWorkerListName(workers, workerName) || normalizeWorkerName(workerName);
  const workerRecord =
    workers.find((w) => normalizeWorkerName(w.name) === canonicalName) ||
    findWorkerMasterByListName(workers, canonicalName);
  return { canonicalName, workerRecord };
}

export function buildWorkerPortalMonths(workerName, sales = [], workers = []) {
  const { canonicalName, workerRecord } = resolveWorkerPortalRecord(workers, workerName);
  if (isWorkerInProbationForPortal(workerRecord)) return [];

  const months = new Set();
  for (const sale of sales) {
    const date = String(sale.date || "");
    const monthKey = date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (!saleDateEligibleForWorkerPortal(date, workerRecord)) continue;
    const lines = saleWorkerLines(sale);
    if (lines.some((line) => lineBelongsToWorker(line.worker, canonicalName, workers))) {
      months.add(monthKey);
    }
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

export function buildWorkerPortalProbationMeta(workerName, workers = []) {
  const { workerRecord } = resolveWorkerPortalRecord(workers, workerName);
  const probationActive = isWorkerInProbationForPortal(workerRecord);
  const statementStartDate = getWorkerPortalStatementStartDate(workerRecord);
  const probationEndDate = getWorkerProbationEndDate(workerRecord);
  return { probationActive, statementStartDate, probationEndDate };
}

export function buildWorkerPortalStatement(workerName, monthKey, erpState = {}) {
  const workers = Array.isArray(erpState.workers) ? erpState.workers : [];
  const sales = Array.isArray(erpState.sales) ? erpState.sales : [];
  const { canonicalName, workerRecord } = resolveWorkerPortalRecord(workers, workerName);

  const resolvedPeriod = resolveWorkerPortalCalendarMonthPeriod(monthKey, workerRecord);
  const periodStart = resolvedPeriod?.periodStart || `${monthKey}-01`;
  const periodEnd = resolvedPeriod?.periodEnd || monthKey;

  if (!resolvedPeriod || isWorkerInProbationForPortal(workerRecord)) {
    const workerInfo = workerRecord
      ? {
          id: workerRecord.id,
          name: normalizeWorkerName(workerRecord.name),
          phone: String(workerRecord.phone || "").trim(),
          bank: String(workerRecord.bank || "").trim(),
          account: String(workerRecord.account || "").trim(),
          feeRate: normalizeFeeRate(workerRecord.feeRate),
          grade: String(workerRecord.grade || "").trim(),
          category: String(workerRecord.category || "").trim(),
        }
      : { name: canonicalName, feeRate: 0 };

    return {
      workerName: canonicalName,
      monthKey,
      periodStart,
      periodEnd,
      rows: [],
      workerInfo,
      summary: { grossPay: 0, fee: 0, netPay: 0 },
      companyProfile:
        erpState.companyProfile && typeof erpState.companyProfile === "object"
          ? {
              name: String(erpState.companyProfile.name || "").trim(),
              businessNo: String(erpState.companyProfile.businessNo || "").trim(),
              phone: String(erpState.companyProfile.phone || "").trim(),
              fax: String(erpState.companyProfile.fax || "").trim(),
              address: String(erpState.companyProfile.address || "").trim(),
              bankAccountVatIncluded: String(erpState.companyProfile.bankAccountVatIncluded || "").trim(),
              bankAccountVatExcluded: String(erpState.companyProfile.bankAccountVatExcluded || "").trim(),
              website: String(erpState.companyProfile.website || "").trim(),
              instagram: String(erpState.companyProfile.instagram || "").trim(),
              youtube: String(erpState.companyProfile.youtube || "").trim(),
            }
          : null,
      probationActive: isWorkerInProbationForPortal(workerRecord),
      statementStartDate: getWorkerPortalStatementStartDate(workerRecord),
    };
  }

  const monthSales = filterSalesByDate(sales, periodStart, periodEnd).filter((sale) =>
    saleWorkerLines(sale).some((line) => lineBelongsToWorker(line.worker, canonicalName, workers)),
  );

  const allRows = flattenSalesToWorkerPaymentRows(monthSales, workers);
  const rows = allRows.filter((row) => row.worker === canonicalName || lineBelongsToWorker(row.worker, canonicalName, workers));

  const feeRate = normalizeFeeRate(workerRecord?.feeRate);
  const grossPay = rows.reduce((sum, row) => sum + (row.totalPay || 0), 0);
  const fee = Math.round(grossPay * feeRate);
  const summary = { grossPay, fee, netPay: grossPay - fee };

  const workerInfo = workerRecord
    ? {
        id: workerRecord.id,
        name: normalizeWorkerName(workerRecord.name),
        phone: String(workerRecord.phone || "").trim(),
        bank: String(workerRecord.bank || "").trim(),
        account: String(workerRecord.account || "").trim(),
        feeRate,
        grade: String(workerRecord.grade || "").trim(),
        category: String(workerRecord.category || "").trim(),
      }
    : { name: canonicalName, feeRate };

  const companyProfile =
    erpState.companyProfile && typeof erpState.companyProfile === "object"
      ? {
          name: String(erpState.companyProfile.name || "").trim(),
          businessNo: String(erpState.companyProfile.businessNo || "").trim(),
          phone: String(erpState.companyProfile.phone || "").trim(),
          fax: String(erpState.companyProfile.fax || "").trim(),
          address: String(erpState.companyProfile.address || "").trim(),
          bankAccountVatIncluded: String(erpState.companyProfile.bankAccountVatIncluded || "").trim(),
          bankAccountVatExcluded: String(erpState.companyProfile.bankAccountVatExcluded || "").trim(),
          website: String(erpState.companyProfile.website || "").trim(),
          instagram: String(erpState.companyProfile.instagram || "").trim(),
          youtube: String(erpState.companyProfile.youtube || "").trim(),
        }
      : null;

  return {
    workerName: canonicalName,
    monthKey,
    periodStart,
    periodEnd,
    rows,
    workerInfo,
    summary,
    companyProfile,
    probationActive: false,
    statementStartDate: getWorkerPortalStatementStartDate(workerRecord),
  };
}

export function buildWorkerPortalLoginLogEntry(worker) {
  const safe = stripWorkerPortalSecrets(worker);
  const portalLoginId = normalizePortalLoginId(safe.portalLoginId);
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    at: new Date().toISOString(),
    userId: safe.id ?? portalLoginId ?? "unknown",
    userName: normalizeWorkerName(safe.name) || portalLoginId || "\uC2DC\uACF5\uC790",
    loginId: portalLoginId || "-",
    role: "worker-portal",
    loginType: "worker-portal",
  };
}

export function recordWorkerPortalLoginLog(worker) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const loginLogs = Array.isArray(data.loginLogs) ? data.loginLogs : [];
  const entry = buildWorkerPortalLoginLogEntry(worker);
  const nextLogs = [entry, ...loginLogs].slice(0, MAX_PORTAL_LOGIN_LOGS);
  const saved = saveErpState(
    { ...data, loginLogs: nextLogs },
    state.version,
    `portal-login:${entry.userName}`,
  );
  return { entry, version: saved.version };
}

export function authenticateWorkerPortal(workers = [], loginId, password) {
  const worker = findWorkerByPortalLoginId(workers, loginId);
  if (!worker) return null;
  if (worker.isActive === false) return null;
  if (!normalizePortalLoginId(worker.portalLoginId)) return null;
  if (!worker.portalPasswordHash) return null;
  if (!verifyPortalPassword(password, worker.portalPasswordHash)) return null;
  return worker;
}

function workerRecordIdsEqual(left, right) {
  if (left == null || right == null || left === "" || right === "") return false;
  return String(left) === String(right);
}

export function validateWorkerPortalNewPassword(password) {
  const text = String(password ?? "").trim();
  if (text.length < 4) {
    return { ok: false, error: "\uBE44\uBC00\uBC88\uD638\uB294 4\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." };
  }
  if (text.length > 64) {
    return { ok: false, error: "\uBE44\uBC00\uBC88\uD638\uB294 64\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }
  return { ok: true, password: text };
}

export function changeWorkerPortalPassword(workers = [], loginId, currentPassword, newPassword) {
  const worker = authenticateWorkerPortal(workers, loginId, currentPassword);
  if (!worker) {
    return {
      ok: false,
      error: "\uB85C\uADF8\uC778 ID \uB610\uB294 \uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uAC00 \uB9DE\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    };
  }

  const nextCheck = validateWorkerPortalNewPassword(newPassword);
  if (!nextCheck.ok) {
    return { ok: false, error: nextCheck.error };
  }

  if (verifyPortalPassword(nextCheck.password, worker.portalPasswordHash)) {
    return {
      ok: false,
      error: "\uC0C8 \uBE44\uBC00\uBC88\uD638\uB294 \uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uC640 \uB2E4\uB974\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
    };
  }

  const portalPasswordHash = hashPortalPassword(nextCheck.password);
  const nextWorkers = workers.map((row) =>
    workerRecordIdsEqual(row.id, worker.id)
      ? { ...row, portalPasswordHash, portalMustChangePassword: false }
      : row,
  );

  return { ok: true, workers: nextWorkers, worker };
}

/** 비밀번호 변경 안내를 건너뛰고 현재 비밀번호를 유지합니다. */
export function keepWorkerPortalPassword(workers = [], loginId, password) {
  const worker = authenticateWorkerPortal(workers, loginId, password);
  if (!worker) {
    return {
      ok: false,
      error: "\uB85C\uADF8\uC778 ID \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uB9DE\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    };
  }

  if (!workerPortalMustChangePassword(worker)) {
    return { ok: true, workers, worker, unchanged: true };
  }

  const nextWorkers = workers.map((row) =>
    workerRecordIdsEqual(row.id, worker.id) ? { ...row, portalMustChangePassword: false } : row,
  );

  return { ok: true, workers: nextWorkers, worker };
}

export function processWorkersPortalCredentials(incomingWorkers = [], existingWorkers = []) {
  const existingById = new Map(
    (existingWorkers || [])
      .filter((w) => w?.id != null && w.id !== "")
      .map((w) => [String(w.id), w]),
  );

  return (incomingWorkers || []).map((worker) => {
    const prev = worker?.id != null ? existingById.get(String(worker.id)) : undefined;
    const next = { ...worker };
    const plainPassword = String(next.portalPassword ?? "").trim();

    if (plainPassword) {
      next.portalPasswordHash = hashPortalPassword(plainPassword);
      next.portalMustChangePassword = false;
    } else if (!next.portalPasswordHash && prev?.portalPasswordHash) {
      next.portalPasswordHash = prev.portalPasswordHash;
      if (prev.portalMustChangePassword === true) {
        next.portalMustChangePassword = true;
      }
    } else if (workerHasPortalLoginId(next) && !next.portalPasswordHash) {
      return applyDefaultPortalPasswordToWorker(next);
    }

    delete next.portalPassword;
    return next;
  });
}
