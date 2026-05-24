import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { config, seedUsers } from "./config.mjs";

let db;

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
    clients: [],
    workers: [],
    auditLogs: [],
  };
}

function seedUsersIfNeeded(database) {
  const count = database.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 0) return;

  const insert = database.prepare(`
    INSERT INTO users (email, password_hash, name, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const user of seedUsers) {
    insert.run(
      user.email.toLowerCase(),
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
    clients: seed.clients || [],
    workers: seed.workers || [],
    auditLogs: seed.auditLogs || [],
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

  seedUsersIfNeeded(db);
  seedErpIfNeeded(db);
  return db;
}

export function getDb() {
  if (!db) initDb();
  return db;
}

export function findUserByEmail(email) {
  return getDb()
    .prepare("SELECT id, email, password_hash, name, role, created_at FROM users WHERE email = ?")
    .get(String(email || "").trim().toLowerCase());
}

export function listUsers() {
  return getDb()
    .prepare("SELECT id, email, name, role, created_at FROM users ORDER BY id ASC")
    .all();
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
