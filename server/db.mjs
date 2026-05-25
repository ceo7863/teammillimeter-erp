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
    workerPaymentRecords: [],
    companyExpenses: [],
    fixedExpenses: [],
    companyNotices: [],
    workPosts: [],
    taxInvoices: [],
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
    fixedExpenses: seed.fixedExpenses || [],
    companyNotices: seed.companyNotices || [],
    workPosts: seed.workPosts || [],
    taxInvoices: seed.taxInvoices || [],
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
  SELECT id, login_id, email, password_hash, name, phone, role, is_active, created_at, updated_at
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

export function createUser({ loginId, password, name, phone, email, role }) {
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
      INSERT INTO users (login_id, email, password_hash, name, phone, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)
    .run(
      loginCheck.value,
      storageEmail(loginCheck.value, normalizedEmail),
      bcrypt.hashSync(pwd, 10),
      trimmedName,
      String(phone || "").trim() || null,
      nextRole,
      now,
      now,
    );

  return formatUserRow(findUserById(result.lastInsertRowid));
}

export function updateUser(id, { name, phone, email, role }, actorUserId) {
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
      SET name = ?, phone = ?, email = ?, role = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      trimmedName,
      String(phone || "").trim() || null,
      storageEmail(existing.login_id, normalizedEmail),
      nextRole,
      now,
      userId,
    );

  return formatUserRow(findUserById(userId));
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
