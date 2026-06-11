import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { config, seedUsers } from "./config.mjs";
import { ERP_DOMAIN_FIELDS, ERP_DOMAIN_NAMES, pickDomainPayload } from "./erpDomains.mjs";
import { queueCoalescedWrite } from "./erpWriteQueue.mjs";
import { migrateClientAichiToMiumu, needsClientAichiToMiumuMigration } from "./migrateClientAichiToMiumu.mjs";

let db;

const LOGIN_ID_RE = /^[a-zA-Z0-9]+$/;

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonSeed() {
  const candidates = [
    path.join(process.cwd(), "public", "erp-seed.json"),
    path.join(path.dirname(config.dbPath), "..", "public", "erp-seed.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, "utf-8"));
      }
    } catch {
      // try next
    }
  }
  return null;
}

function emptyErpPayload() {
  return {
    sales: [],
    paymentVouchers: [],
    paymentInputLogs: [],
    clients: [],
    workers: [],
    auditLogs: [],
    loginLogs: [],
    workerPortalStatementAcks: [],
    workerPaymentRecords: [],
    workerPayoutVouchers: [],
    workerMonthlyActualVouchers: [],
    workerPayWithVatLearnRules: [],
    companyExpenses: [],
    attendanceRecords: [],
    fixedExpenses: [],
    fixedExpensePayments: [],
    bankLedgerRules: [],
    expenseCategories: [],
    fixedExpenseCategories: [],
    accountCodes: [],
    ledgerCategories: [],
    companyNotices: [],
    workPosts: [],
    saleComments: [],
    taxInvoices: [],
    bankTransactions: [],
    bankTransactionFolders: [],
    statementGenerationLogs: [],
    statementFolders: [],
    clientContracts: [],
    clientSiteRequests: [],
    scSchedules: [],
    scScheduleSyncMeta: null,
    companyProfile: null,
    notificationSettings: {
      enabled: false,
      dailyReportEnabled: true,
      commentNotifyEnabled: true,
      scScheduleNotifyEnabled: true,
      dailyReportHour: 8,
      dailyReportMinute: 0,
      scScheduleNotifyHour: 18,
      scScheduleNotifyMinute: 0,
      recipients: [],
      dailyReportExtraPhones: [],
      scScheduleNotifyMode: "both",
    },
    saleAiRules: {
      shortShiftMaxHours: 5,
      shortShiftBaseAmount: 50000,
      shortShiftHourlyAmount: 50000,
      overtimeBaseHour: 17,
      overtimeStartHour: 19,
      normalEndHour: 18,
    },
    workerAiRules: {
      probationNetPay: 2_000_000,
      probationPayWithVat: true,
      probationMonths: 3,
      alertLeadDays: 3,
      autoAdjustOnProbationEnd: true,
      postProbationConstructionCost: 0,
      postProbationCustomChargeCost: 0,
      autoAdjustGradeOnProbationEnd: true,
      postProbationGrade: "D",
      enforceEGradeDuringProbation: true,
      probationEvalEnabled: true,
      probationEvalGrades: ["A"],
      probationEvalNotifyHour: 19,
      probationEvalNotifyMinute: 0,
      probationEvalReminderEnabled: true,
      probationEvalTemplateId: "default-v1",
    },
    probationEvalTemplates: [],
    probationEvalRequests: [],
    probationEvalNotifyMeta: null,
  };
}

function getUserColumns(database) {
  return new Set(database.prepare("PRAGMA table_info(users)").all().map((col) => col.name));
}

function migrateUsersTable(database) {
  const colNames = getUserColumns(database);

  if (!colNames.has("login_id")) {
    database.exec(`
      ALTER TABLE users ADD COLUMN login_id TEXT;
      ALTER TABLE users ADD COLUMN phone TEXT;
      ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE users ADD COLUMN updated_at TEXT;
    `);

    const users = database.prepare("SELECT id, email FROM users").all();
    const used = new Set(
      database
        .prepare("SELECT login_id FROM users WHERE login_id IS NOT NULL AND login_id != ''")
        .all()
        .map((row) => row.login_id),
    );

    for (const user of users) {
      let base =
        String(user.email || "")
          .split("@")[0]
          .replace(/[^a-zA-Z0-9]/g, "") || `user${user.id}`;
      if (!LOGIN_ID_RE.test(base)) base = `user${user.id}`;

      let loginId = base;
      let suffix = 1;
      while (used.has(loginId)) {
        loginId = `${base}${suffix++}`;
      }
      used.add(loginId);

      database
        .prepare("UPDATE users SET login_id = ?, is_active = COALESCE(is_active, 1) WHERE id = ?")
        .run(loginId, user.id);
    }
  }

  if (!colNames.has("allowed_pages")) {
    database.exec(`ALTER TABLE users ADD COLUMN allowed_pages TEXT;`);
  }

  if (!colNames.has("sidebar_order")) {
    database.exec(`ALTER TABLE users ADD COLUMN sidebar_order TEXT;`);
  }

  if (!colNames.has("sidebar_hidden")) {
    database.exec(`ALTER TABLE users ADD COLUMN sidebar_hidden TEXT;`);
  }

  if (!colNames.has("attendance_view_user_ids")) {
    database.exec(`ALTER TABLE users ADD COLUMN attendance_view_user_ids TEXT;`);
  }
}

function parseJsonStringArray(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return null;
    const values = [...new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean))];
    return values.length ? values : null;
  } catch {
    return null;
  }
}

function parseAllowedPages(raw) {
  return parseJsonStringArray(raw);
}

function serializeJsonStringArray(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const normalized = [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
  return normalized.length ? JSON.stringify(normalized) : null;
}

function serializeAllowedPages(pages) {
  return serializeJsonStringArray(pages);
}

export function parseAttendanceViewUserIds(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return null;
    const values = [...new Set(parsed.map((item) => Number(item)).filter((id) => Number.isFinite(id) && id > 0))];
    return values.length ? values : null;
  } catch {
    return null;
  }
}

function serializeAttendanceViewUserIds(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const normalized = [...new Set(values.map((item) => Number(item)).filter((id) => Number.isFinite(id) && id > 0))];
  return normalized.length ? JSON.stringify(normalized) : null;
}

export function parseSidebarOrder(raw) {
  return parseJsonStringArray(raw);
}

export function parseSidebarHidden(raw) {
  return parseJsonStringArray(raw);
}

function serializeSidebarOrder(pages) {
  return serializeJsonStringArray(pages);
}

function serializeSidebarHidden(pages) {
  return serializeJsonStringArray(pages);
}

function formatUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    loginId: row.login_id,
    email: displayEmail(row.email),
    name: row.name,
    phone: row.phone || null,
    role: row.role,
    isActive: Boolean(row.is_active),
    allowedPages: parseAllowedPages(row.allowed_pages),
    sidebarOrder: parseSidebarOrder(row.sidebar_order),
    sidebarHidden: parseSidebarHidden(row.sidebar_hidden),
    attendanceViewUserIds: parseAttendanceViewUserIds(row.attendance_view_user_ids),
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

export function validateLoginId(loginId) {
  const value = String(loginId || "").trim();
  if (!value) return { ok: false, error: "로그인 ID를 입력해 주세요." };
  if (!LOGIN_ID_RE.test(value)) {
    return { ok: false, error: "로그인 ID는 영문과 숫자만 사용할 수 있습니다." };
  }
  return { ok: true, value };
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return value || null;
}

function storageEmail(loginId, email) {
  const normalized = normalizeEmail(email);
  if (normalized) return normalized;
  return `${String(loginId || "").trim()}@local.teammillimeter`;
}

function displayEmail(email) {
  const value = String(email || "").trim();
  if (!value || value.endsWith("@local.teammillimeter")) return null;
  return value;
}

function countActiveAdmins(database, excludeId = null) {
  if (excludeId != null) {
    return database
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?")
      .get(excludeId).c;
  }
  return database.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1").get().c;
}

function seedUsersIfNeeded(database) {
  const count = database.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return;

  const colNames = getUserColumns(database);
  const hasLoginId = colNames.has("login_id");
  const now = new Date().toISOString();

  if (hasLoginId) {
    const insert = database.prepare(`
      INSERT INTO users (login_id, email, password_hash, name, phone, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    for (const user of seedUsers) {
      insert.run(
        user.loginId,
        user.email || null,
        bcrypt.hashSync(user.password, 10),
        user.name,
        null,
        user.role,
        now,
        now,
      );
    }
    return;
  }

  const insert = database.prepare(`
    INSERT INTO users (email, password_hash, name, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const user of seedUsers) {
    insert.run(
      (user.email || `${user.loginId}@teammillimeter.com`).toLowerCase(),
      bcrypt.hashSync(user.password, 10),
      user.name,
      user.role,
      now,
    );
  }
}

function splitPayloadIntoDomains(payload) {
  const domains = {};
  for (const domain of ERP_DOMAIN_NAMES) {
    domains[domain] = pickDomainPayload(payload, domain) || {};
  }
  return domains;
}

function writeDomainRows(database, domains, updatedAt) {
  const stamp = updatedAt || new Date().toISOString();
  const upsert = database.prepare(`
    INSERT INTO erp_domain_state (domain, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(domain) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);
  for (const [domain, chunk] of Object.entries(domains)) {
    upsert.run(domain, JSON.stringify(chunk), stamp);
  }
}

function seedEmptyDomainRows(database, updatedAt) {
  writeDomainRows(database, splitPayloadIntoDomains(emptyErpPayload()), updatedAt);
}

function assemblePayloadFromDomainRows(database) {
  const rows = database.prepare("SELECT domain, payload FROM erp_domain_state").all();
  if (!rows.length) return null;

  const payload = emptyErpPayload();
  for (const row of rows) {
    let chunk = {};
    try {
      chunk = JSON.parse(row.payload);
    } catch {
      chunk = {};
    }
    Object.assign(payload, chunk);
  }
  return normalizeErpPayload(payload);
}

function migrateLegacyBlobToDomains(database) {
  const domainCount = database.prepare("SELECT COUNT(*) AS c FROM erp_domain_state").get().c;
  if (domainCount > 0) return false;

  const row = database.prepare("SELECT payload, updated_at FROM erp_state WHERE id = 1").get();
  if (!row?.payload) {
    seedEmptyDomainRows(database, new Date().toISOString());
    return true;
  }

  let payload = normalizeErpPayload(JSON.parse(row.payload));
  payload = applyWorkerMonthlyPaymentMemoMigration(payload).payload;
  writeDomainRows(database, splitPayloadIntoDomains(payload), row.updated_at || new Date().toISOString());
  return true;
}

function normalizeWorkerRecordId(id) {
  if (id == null || id === "") return "";
  return String(id);
}

function normalizeWorkerMonthlyPaymentMemos(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const idKey = normalizeWorkerRecordId(key);
    const text = String(value ?? "").trim();
    if (idKey && text) out[idKey] = text;
  }
  return out;
}

function syncWorkerMonthlyPaymentMemosFromWorkers(workers = [], memos = {}) {
  const next = { ...memos };
  for (const worker of workers) {
    const idKey = normalizeWorkerRecordId(worker?.id);
    const text = String(worker?.monthlyPaymentMemo || "").trim();
    if (idKey && text && !next[idKey]) next[idKey] = text;
  }
  return next;
}

function stripMonthlyPaymentMemoFromWorkers(workers = []) {
  return workers.map(({ monthlyPaymentMemo: _legacy, portalPassword: _pw, ...worker }) => worker);
}

function applyWorkerMonthlyPaymentMemoMigration(data = {}) {
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const storedMemos = normalizeWorkerMonthlyPaymentMemos(data.workerMonthlyPaymentMemos);
  const workerMonthlyPaymentMemos = syncWorkerMonthlyPaymentMemosFromWorkers(workers, storedMemos);
  const strippedWorkers = stripMonthlyPaymentMemoFromWorkers(workers);
  const migrated =
    JSON.stringify(workerMonthlyPaymentMemos) !== JSON.stringify(storedMemos) ||
    workers.some((worker) => String(worker?.monthlyPaymentMemo || "").trim());
  return {
    migrated,
    payload: migrated
      ? { ...data, workers: strippedWorkers, workerMonthlyPaymentMemos }
      : data,
  };
}

export function runErpStartupMigrations() {
  const database = getDb();
  migrateLegacyBlobToDomains(database);

  let state = getErpState();
  let payload = state.data || {};
  let version = state.version;
  let changed = false;

  const memoMigration = applyWorkerMonthlyPaymentMemoMigration(payload);
  if (memoMigration.migrated) {
    payload = memoMigration.payload;
    changed = true;
  }

  if (needsClientAichiToMiumuMigration(payload)) {
    migrateClientAichiToMiumu(payload, { updatePdfArchives: true, getDb: () => database });
    changed = true;
  }

  if (!changed) return;

  try {
    saveErpState(payload, version, "startup-migration");
  } catch (error) {
    console.error("[startup-migration] save failed", error);
  }
}

function seedErpIfNeeded(database) {
  const row = database.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
  const domainCount = database.prepare("SELECT COUNT(*) AS c FROM erp_domain_state").get().c;
  if (row?.payload) {
    const parsed = JSON.parse(row.payload);
    if (
      domainCount > 0 ||
      (parsed.sales?.length || 0) +
        (parsed.clients?.length || 0) +
        (parsed.workers?.length || 0) +
        (parsed.paymentVouchers?.length || 0) >
        0
    ) {
      return;
    }
  }

  const seed = readJsonSeed() || emptyErpPayload();
  const payload = {
    ...emptyErpPayload(),
    sales: seed.sales || [],
    paymentVouchers: seed.paymentVouchers || [],
    paymentInputLogs: seed.paymentInputLogs || [],
    clients: seed.clients || [],
    workers: seed.workers || [],
    auditLogs: seed.auditLogs || [],
    loginLogs: seed.loginLogs || [],
    workerPaymentRecords: seed.workerPaymentRecords || [],
    companyExpenses: seed.companyExpenses || [],
    attendanceRecords: seed.attendanceRecords || [],
    fixedExpenses: seed.fixedExpenses || [],
    fixedExpensePayments: seed.fixedExpensePayments || [],
    bankLedgerRules: seed.bankLedgerRules || [],
    expenseCategories: seed.expenseCategories || [],
    companyNotices: seed.companyNotices || [],
    workPosts: seed.workPosts || [],
    saleComments: seed.saleComments || [],
    taxInvoices: seed.taxInvoices || [],
    bankTransactions: seed.bankTransactions || [],
    bankTransactionFolders: seed.bankTransactionFolders || [],
    statementGenerationLogs: seed.statementGenerationLogs || [],
    statementFolders: seed.statementFolders || [],
  };

  const now = new Date().toISOString();
  database
    .prepare(`
      INSERT INTO erp_state (id, payload, version, updated_at, updated_by)
      VALUES (1, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        version = 1,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `)
    .run(JSON.stringify(payload), now, "system");
  writeDomainRows(database, splitPayloadIntoDomains(payload), now);
}

export function initDb() {
  ensureDir(config.dbPath);
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS erp_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS erp_domain_state (
      domain TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  migrateUsersTable(db);
  seedUsersIfNeeded(db);
  seedErpIfNeeded(db);
  migrateLegacyBlobToDomains(db);
  return db;
}

export function getDb() {
  if (!db) initDb();
  return db;
}

/** node:sqlite DatabaseSync has no .transaction(); use SQL BEGIN/COMMIT/ROLLBACK. */
export function runInTransaction(database, callback) {
  const nested = database.isTransaction;
  if (!nested) {
    database.exec("BEGIN IMMEDIATE");
  }
  try {
    const result = callback();
    if (!nested) {
      database.exec("COMMIT");
    }
    return result;
  } catch (error) {
    if (!nested) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // ignore rollback failure after primary error
      }
    }
    throw error;
  }
}

const USER_SELECT = `
  SELECT id, login_id, email, password_hash, name, phone, role, is_active, allowed_pages, sidebar_order, sidebar_hidden, attendance_view_user_ids, created_at, updated_at
  FROM users
`;

export function findUserByLoginId(loginId) {
  const validated = validateLoginId(loginId);
  if (!validated.ok) return null;
  return getDb().prepare(`${USER_SELECT} WHERE login_id = ?`).get(validated.value);
}

export function findUserById(id) {
  return getDb().prepare(`${USER_SELECT} WHERE id = ?`).get(Number(id));
}

export function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return getDb().prepare(`${USER_SELECT} WHERE email = ?`).get(normalized);
}

export function listUsers() {
  return getDb()
    .prepare(`${USER_SELECT} ORDER BY id ASC`)
    .all()
    .map(formatUserRow);
}

export function createUser({ loginId, password, name, phone, email, role, allowedPages, attendanceViewUserIds }) {
  const database = getDb();
  const loginCheck = validateLoginId(loginId);
  if (!loginCheck.ok) {
    const err = new Error(loginCheck.error);
    err.status = 400;
    throw err;
  }

  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    const err = new Error("이름을 입력해 주세요.");
    err.status = 400;
    throw err;
  }

  const pwd = String(password || "");
  if (pwd.length < 4) {
    const err = new Error("비밀번호는 4자 이상이어야 합니다.");
    err.status = 400;
    throw err;
  }

  const nextRole = role === "admin" ? "admin" : "staff";
  const nextAllowedPages = nextRole === "admin" ? null : serializeAllowedPages(allowedPages);
  const nextAttendanceViewUserIds = nextRole === "admin" ? null : serializeAttendanceViewUserIds(attendanceViewUserIds);
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail && findUserByEmail(normalizedEmail)) {
    const err = new Error("이미 사용 중인 이메일입니다.");
    err.status = 409;
    throw err;
  }

  if (findUserByLoginId(loginCheck.value)) {
    const err = new Error("이미 사용 중인 로그인 ID입니다.");
    err.status = 409;
    throw err;
  }

  const now = new Date().toISOString();
  const result = database
    .prepare(`
      INSERT INTO users (login_id, email, password_hash, name, phone, role, allowed_pages, attendance_view_user_ids, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)
    .run(
      loginCheck.value,
      storageEmail(loginCheck.value, normalizedEmail),
      bcrypt.hashSync(pwd, 10),
      trimmedName,
      String(phone || "").trim() || null,
      nextRole,
      nextAllowedPages,
      nextAttendanceViewUserIds,
      now,
      now,
    );

  return formatUserRow(findUserById(result.lastInsertRowid));
}

export function updateUser(id, { name, phone, email, role, allowedPages, attendanceViewUserIds }, actorUserId) {
  const database = getDb();
  const userId = Number(id);
  const existing = findUserById(userId);
  if (!existing) {
    const err = new Error("사용자를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    const err = new Error("이름을 입력해 주세요.");
    err.status = 400;
    throw err;
  }

  const nextRole = role === "admin" ? "admin" : "staff";
  const nextAllowedPages = nextRole === "admin" ? null : serializeAllowedPages(allowedPages);
  const nextAttendanceViewUserIds = nextRole === "admin" ? null : serializeAttendanceViewUserIds(attendanceViewUserIds);
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const emailOwner = findUserByEmail(normalizedEmail);
    if (emailOwner && emailOwner.id !== userId) {
      const err = new Error("이미 사용 중인 이메일입니다.");
      err.status = 409;
      throw err;
    }
  }

  if (existing.role === "admin" && nextRole !== "admin") {
    const otherAdmins = countActiveAdmins(database, userId);
    if (otherAdmins === 0) {
      const err = new Error("마지막 관리자의 권한은 변경할 수 없습니다.");
      err.status = 400;
      throw err;
    }
    if (actorUserId === userId) {
      const err = new Error("본인의 관리자 권한은 해제할 수 없습니다.");
      err.status = 400;
      throw err;
    }
  }

  const now = new Date().toISOString();
  database
    .prepare(`
      UPDATE users
      SET name = ?, phone = ?, email = ?, role = ?, allowed_pages = ?, attendance_view_user_ids = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      trimmedName,
      String(phone || "").trim() || null,
      storageEmail(existing.login_id, normalizedEmail),
      nextRole,
      nextAllowedPages,
      nextAttendanceViewUserIds,
      now,
      userId,
    );

  return formatUserRow(findUserById(userId));
}

export function updateSelfProfile(userId, { name, phone, email }) {
  const database = getDb();
  const existing = findUserById(Number(userId));
  if (!existing) {
    const err = new Error("사용자를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    const err = new Error("이름을 입력해 주세요.");
    err.status = 400;
    throw err;
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const emailOwner = findUserByEmail(normalizedEmail);
    if (emailOwner && emailOwner.id !== existing.id) {
      const err = new Error("이미 사용 중인 이메일입니다.");
      err.status = 409;
      throw err;
    }
  }

  const now = new Date().toISOString();
  database
    .prepare(`
      UPDATE users
      SET name = ?, phone = ?, email = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      trimmedName,
      String(phone || "").trim() || null,
      storageEmail(existing.login_id, normalizedEmail),
      now,
      existing.id,
    );

  return formatUserRow(findUserById(existing.id));
}

export function updateSelfSidebarOrder(userId, sidebarOrder, sidebarHidden) {
  const existing = findUserById(Number(userId));
  if (!existing) {
    const err = new Error("사용자를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  if (sidebarOrder !== undefined && sidebarOrder != null && !Array.isArray(sidebarOrder)) {
    const err = new Error("메뉴 순서 형식이 올바르지 않습니다.");
    err.status = 400;
    throw err;
  }

  if (sidebarHidden !== undefined && sidebarHidden != null && !Array.isArray(sidebarHidden)) {
    const err = new Error("숨김 메뉴 형식이 올바르지 않습니다.");
    err.status = 400;
    throw err;
  }

  const fields = [];
  const values = [];
  if (sidebarOrder !== undefined) {
    fields.push("sidebar_order = ?");
    values.push(serializeSidebarOrder(sidebarOrder));
  }
  if (sidebarHidden !== undefined) {
    fields.push("sidebar_hidden = ?");
    values.push(serializeSidebarHidden(sidebarHidden));
  }
  if (!fields.length) {
    return formatUserRow(findUserById(existing.id));
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(`
      UPDATE users
      SET ${fields.join(", ")}, updated_at = ?
      WHERE id = ?
    `)
    .run(...values, now, existing.id);

  return formatUserRow(findUserById(existing.id));
}

export function verifyUserPassword(userId, password) {
  const existing = findUserById(Number(userId));
  if (!existing) return false;
  return bcrypt.compareSync(String(password || ""), existing.password_hash);
}

export function updateUserPassword(id, password) {
  const userId = Number(id);
  const existing = findUserById(userId);
  if (!existing) {
    const err = new Error("사용자를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  const pwd = String(password || "");
  if (pwd.length < 4) {
    const err = new Error("비밀번호는 4자 이상이어야 합니다.");
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(bcrypt.hashSync(pwd, 10), now, userId);

  return formatUserRow(findUserById(userId));
}

export function setUserActive(id, isActive, actorUserId) {
  const database = getDb();
  const userId = Number(id);
  const existing = findUserById(userId);
  if (!existing) {
    const err = new Error("사용자를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  const nextActive = Boolean(isActive);

  if (!nextActive && existing.role === "admin") {
    const otherAdmins = countActiveAdmins(database, userId);
    if (otherAdmins === 0) {
      const err = new Error("마지막 관리자는 비활성화할 수 없습니다.");
      err.status = 400;
      throw err;
    }
    if (actorUserId === userId) {
      const err = new Error("본인 계정은 비활성화할 수 없습니다.");
      err.status = 400;
      throw err;
    }
  }

  const now = new Date().toISOString();
  database
    .prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?")
    .run(nextActive ? 1 : 0, now, userId);

  return formatUserRow(findUserById(userId));
}

const MAX_LOGIN_LOGS = 3000;

export function recordLoginLog(user) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : emptyErpPayload();
  const loginLogs = Array.isArray(data.loginLogs) ? data.loginLogs : [];
  const loginId = String(user?.loginId || user?.login_id || user?.email || "").trim();
  const entry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    at: new Date().toISOString(),
    userId: user?.id ?? loginId ?? "unknown",
    userName: String(user?.name || loginId || "사용자"),
    loginId: loginId || "-",
    role: String(user?.role || ""),
  };
  const nextLogs = [entry, ...loginLogs].slice(0, MAX_LOGIN_LOGS);
  const saved = saveErpState({ ...data, loginLogs: nextLogs }, state.version, loginId || user?.name || "login");
  return { entry, version: saved.version };
}

export function getErpVersionMeta() {
  const row = getDb().prepare("SELECT version, updated_at, updated_by FROM erp_state WHERE id = 1").get();
  if (!row) {
    return { version: 0, updatedAt: null, updatedBy: null };
  }
  return {
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function getErpDomainPayloads(domainNames = ERP_DOMAIN_NAMES) {
  const names = Array.isArray(domainNames) ? domainNames.filter(Boolean) : ERP_DOMAIN_NAMES;
  if (!names.length) return {};

  const placeholders = names.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(`SELECT domain, payload FROM erp_domain_state WHERE domain IN (${placeholders})`)
    .all(...names);

  const map = {};
  for (const row of rows) {
    try {
      map[row.domain] = JSON.parse(row.payload);
    } catch {
      map[row.domain] = {};
    }
  }
  return map;
}

export function getErpState(domainNames = null) {
  const row = getDb()
    .prepare("SELECT payload, version, updated_at, updated_by FROM erp_state WHERE id = 1")
    .get();

  if (!row) {
    return { data: emptyErpPayload(), version: 0, updatedAt: null, updatedBy: null };
  }

  let data = assemblePayloadFromDomainRows(getDb());
  if (!data) {
    data = normalizeErpPayload(JSON.parse(row.payload));
  } else if (domainNames?.length) {
    const allowedFields = new Set();
    for (const domain of domainNames) {
      for (const field of ERP_DOMAIN_FIELDS[domain] || []) {
        allowedFields.add(field);
      }
    }
    const full = data;
    data = emptyErpPayload();
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(full, field)) {
        data[field] = full[field];
      }
    }
  }

  return {
    data,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function normalizeErpPayload(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.data &&
    typeof payload.data === "object" &&
    Array.isArray(payload.data.bankTransactions)
  ) {
    const inner = { ...payload.data };
    // Recover fields that were accidentally written on the wrapper by legacy saveErpState calls.
    if (Array.isArray(payload.clientSiteRequests) && payload.clientSiteRequests.length) {
      const existing = Array.isArray(inner.clientSiteRequests) ? inner.clientSiteRequests : [];
      const seen = new Set(existing.map((row) => String(row?.id ?? "")));
      const merged = [...existing];
      for (const row of payload.clientSiteRequests) {
        const id = String(row?.id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
      }
      inner.clientSiteRequests = merged;
    } else if (!Array.isArray(inner.clientSiteRequests)) {
      inner.clientSiteRequests = [];
    }
    if (Array.isArray(payload.clients) && payload.clients.length) {
      const byId = new Map(
        (Array.isArray(inner.clients) ? inner.clients : []).map((row) => [String(row?.id ?? ""), row]),
      );
      for (const row of payload.clients) {
        const id = String(row?.id ?? "");
        if (!id) continue;
        byId.set(id, { ...(byId.get(id) || {}), ...row });
      }
      inner.clients = [...byId.values()];
    }
    return inner;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload.clientSiteRequests)) {
    return { ...payload, clientSiteRequests: [] };
  }
  return payload;
}

function saveErpStateImmediate(payload, expectedVersion, updatedBy) {
  const normalizedPayload = normalizeErpPayload(payload);
  const database = getDb();
  const current = database.prepare("SELECT version FROM erp_state WHERE id = 1").get();

  if (!current) {
    const updatedAt = new Date().toISOString();
    const updatedByValue = updatedBy == null || updatedBy === "" ? "system" : String(updatedBy);
    database
      .prepare(`
        INSERT INTO erp_state (id, payload, version, updated_at, updated_by)
        VALUES (1, ?, 1, ?, ?)
      `)
      .run(JSON.stringify(normalizedPayload), updatedAt, updatedByValue);
    writeDomainRows(database, splitPayloadIntoDomains(normalizedPayload), updatedAt);
    return { version: 1, updatedAt };
  }

  if (expectedVersion != null && current.version !== expectedVersion) {
    const err = new Error("VERSION_CONFLICT");
    err.status = 409;
    err.currentVersion = current.version;
    throw err;
  }

  const nextVersion = current.version + 1;
  const updatedAt = new Date().toISOString();
  const updatedByValue = updatedBy == null || updatedBy === "" ? "system" : String(updatedBy);
  runInTransaction(database, () => {
    database
      .prepare(`
        UPDATE erp_state
        SET payload = ?, version = ?, updated_at = ?, updated_by = ?
        WHERE id = 1
      `)
      .run(JSON.stringify(normalizedPayload), nextVersion, updatedAt, updatedByValue);
    writeDomainRows(database, splitPayloadIntoDomains(normalizedPayload), updatedAt);
  });

  return { version: nextVersion, updatedAt };
}

export function saveErpState(payload, expectedVersion, updatedBy) {
  return saveErpStateImmediate(payload, expectedVersion, updatedBy);
}

export function saveErpDomain(domain, domainPayload, expectedVersion, updatedBy) {
  if (!ERP_DOMAIN_FIELDS[domain]) {
    const err = new Error("UNKNOWN_DOMAIN");
    err.status = 400;
    throw err;
  }
  return queueCoalescedWrite(`erp:domain:${domain}`, { domain, domainPayload, expectedVersion, updatedBy }, async ({
    domain: nextDomain,
    domainPayload: nextDomainPayload,
    expectedVersion: nextExpectedVersion,
    updatedBy: nextUpdatedBy,
  }) => {
    const database = getDb();
    const current = database.prepare("SELECT version FROM erp_state WHERE id = 1").get();
    if (!current) {
      const err = new Error("ERP_NOT_INITIALIZED");
      err.status = 500;
      throw err;
    }
    if (nextExpectedVersion != null && current.version !== nextExpectedVersion) {
      const err = new Error("VERSION_CONFLICT");
      err.status = 409;
      err.currentVersion = current.version;
      throw err;
    }

    const assembled = assemblePayloadFromDomainRows(database) || emptyErpPayload();
    const merged = { ...assembled, ...nextDomainPayload };
    const chunk = pickDomainPayload(merged, nextDomain) || nextDomainPayload;
    const nextVersion = current.version + 1;
    const updatedAt = new Date().toISOString();
    const updatedByValue = nextUpdatedBy == null || nextUpdatedBy === "" ? "system" : String(nextUpdatedBy);

    runInTransaction(database, () => {
      database
        .prepare(`
          INSERT INTO erp_domain_state (domain, payload, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(domain) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        `)
        .run(nextDomain, JSON.stringify(chunk), updatedAt);

      const fullPayload = assemblePayloadFromDomainRows(database) || merged;
      database
        .prepare(`
          UPDATE erp_state
          SET payload = ?, version = ?, updated_at = ?, updated_by = ?
          WHERE id = 1
        `)
        .run(JSON.stringify(normalizeErpPayload(fullPayload)), nextVersion, updatedAt, updatedByValue);
    });

    return { version: nextVersion, updatedAt, domain: nextDomain };
  });
}

export function saveErpDomains(domainPayloads, expectedVersion, updatedBy) {
  const domains = Object.keys(domainPayloads || {}).filter((name) => ERP_DOMAIN_FIELDS[name]);
  if (!domains.length) {
    const err = new Error("NO_DOMAINS");
    err.status = 400;
    throw err;
  }
  return queueCoalescedWrite(
    `erp:domains:${domains.sort().join(",")}`,
    { domainPayloads, expectedVersion, updatedBy },
    async ({ domainPayloads: nextDomainPayloads, expectedVersion: nextExpectedVersion, updatedBy: nextUpdatedBy }) => {
      const database = getDb();
      const current = database.prepare("SELECT version FROM erp_state WHERE id = 1").get();
      if (!current) {
        const err = new Error("ERP_NOT_INITIALIZED");
        err.status = 500;
        throw err;
      }
      if (nextExpectedVersion != null && current.version !== nextExpectedVersion) {
        const err = new Error("VERSION_CONFLICT");
        err.status = 409;
        err.currentVersion = current.version;
        throw err;
      }

      const assembled = assemblePayloadFromDomainRows(database) || emptyErpPayload();
      let merged = assembled;
      for (const domain of domains) {
        merged = { ...merged, ...nextDomainPayloads[domain] };
      }

      const nextVersion = current.version + 1;
      const updatedAt = new Date().toISOString();
      const updatedByValue = nextUpdatedBy == null || nextUpdatedBy === "" ? "system" : String(nextUpdatedBy);
      const domainRows = {};
      for (const domain of domains) {
        domainRows[domain] = pickDomainPayload(merged, domain) || nextDomainPayloads[domain];
      }

      runInTransaction(database, () => {
        writeDomainRows(database, domainRows, updatedAt);
        database
          .prepare(`
            UPDATE erp_state
            SET payload = ?, version = ?, updated_at = ?, updated_by = ?
            WHERE id = 1
          `)
          .run(JSON.stringify(normalizeErpPayload(merged)), nextVersion, updatedAt, updatedByValue);
      });

      return { version: nextVersion, updatedAt, domains };
    },
  );
}

export function listAttendanceViewableUsers(viewerId) {
  const viewer = formatUserRow(findUserById(viewerId));
  if (!viewer) return [];

  if (viewer.role === "admin") {
    return listUsers()
      .filter((user) => user.isActive !== false)
      .map((user) => ({ id: user.id, name: user.name }));
  }

  const ids = viewer.attendanceViewUserIds || [];
  if (!ids.length) return [];

  return ids
    .map((id) => formatUserRow(findUserById(id)))
    .filter(Boolean)
    .map((user) => ({ id: user.id, name: user.name }));
}
