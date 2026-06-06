import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { config, seedUsers } from "./config.mjs";

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
    companyProfile: null,
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

function serializeSidebarOrder(pages) {
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

function seedErpIfNeeded(database) {
  const row = database.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
  if (row?.payload) {
    const parsed = JSON.parse(row.payload);
    if (
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
  `);

  migrateUsersTable(db);
  seedUsersIfNeeded(db);
  seedErpIfNeeded(db);
  return db;
}

export function getDb() {
  if (!db) initDb();
  return db;
}

const USER_SELECT = `
  SELECT id, login_id, email, password_hash, name, phone, role, is_active, allowed_pages, sidebar_order, attendance_view_user_ids, created_at, updated_at
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

export function updateSelfSidebarOrder(userId, sidebarOrder) {
  const existing = findUserById(Number(userId));
  if (!existing) {
    const err = new Error("사용자를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }

  if (sidebarOrder != null && !Array.isArray(sidebarOrder)) {
    const err = new Error("메뉴 순서 형식이 올바르지 않습니다.");
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(`
      UPDATE users
      SET sidebar_order = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(serializeSidebarOrder(sidebarOrder), now, existing.id);

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

export function getErpState() {
  const row = getDb()
    .prepare("SELECT payload, version, updated_at, updated_by FROM erp_state WHERE id = 1")
    .get();

  if (!row) {
    return { data: emptyErpPayload(), version: 0, updatedAt: null, updatedBy: null };
  }

  return {
    data: JSON.parse(row.payload),
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function saveErpState(payload, expectedVersion, updatedBy) {
  const database = getDb();
  const current = database.prepare("SELECT version FROM erp_state WHERE id = 1").get();

  if (!current) {
    const updatedAt = new Date().toISOString();
    database
      .prepare(`
        INSERT INTO erp_state (id, payload, version, updated_at, updated_by)
        VALUES (1, ?, 1, ?, ?)
      `)
      .run(JSON.stringify(payload), updatedAt, updatedBy);
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
  database
    .prepare(`
      UPDATE erp_state
      SET payload = ?, version = ?, updated_at = ?, updated_by = ?
      WHERE id = 1
    `)
    .run(JSON.stringify(payload), nextVersion, updatedAt, updatedBy);

  return { version: nextVersion, updatedAt };
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
