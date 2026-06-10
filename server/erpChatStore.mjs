import { getDb } from "./db.mjs";

const MAX_LOGS_PER_USER = 200;
const MAX_LOGS_TOTAL = 5000;

function ensureChatTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS erp_chat_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT,
      user_role TEXT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      tools_json TEXT,
      engine TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_erp_chat_logs_user_id ON erp_chat_logs(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_erp_chat_logs_created_at ON erp_chat_logs(created_at DESC);
  `);
}

export function initErpChatStore() {
  ensureChatTable(getDb());
}

export function appendErpChatLog({
  userId,
  userName,
  userRole,
  question,
  answer,
  toolsJson,
  engine,
}) {
  initErpChatStore();
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO erp_chat_logs (user_id, user_name, user_role, question, answer, tools_json, engine, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Number(userId) || 0,
      String(userName || ""),
      String(userRole || ""),
      String(question || ""),
      String(answer || ""),
      String(toolsJson || "[]"),
      String(engine || ""),
      now,
    );

  const userIdNum = Number(userId) || 0;
  db.prepare(
    `DELETE FROM erp_chat_logs
     WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM erp_chat_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?
       )`,
  ).run(userIdNum, userIdNum, MAX_LOGS_PER_USER);

  const total = db.prepare("SELECT COUNT(*) AS count FROM erp_chat_logs").get()?.count || 0;
  if (total > MAX_LOGS_TOTAL) {
    db.prepare(
      `DELETE FROM erp_chat_logs
       WHERE id NOT IN (SELECT id FROM erp_chat_logs ORDER BY id DESC LIMIT ?)`,
    ).run(MAX_LOGS_TOTAL);
  }

  return {
    id: result.lastInsertRowid,
    createdAt: now,
  };
}

export function listErpChatLogs(userId, limit = 30) {
  initErpChatStore();
  const db = getDb();
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  return db
    .prepare(
      `SELECT id, question, answer, engine, tools_json AS toolsJson, created_at AS createdAt
       FROM erp_chat_logs
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(Number(userId) || 0, safeLimit)
    .reverse();
}

export function listErpChatLogsAdmin(limit = 100) {
  initErpChatStore();
  const db = getDb();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return db
    .prepare(
      `SELECT id, user_id AS userId, user_name AS userName, user_role AS userRole,
              question, answer, engine, tools_json AS toolsJson, created_at AS createdAt
       FROM erp_chat_logs
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(safeLimit);
}

export function clearErpChatLogsForUser(userId) {
  initErpChatStore();
  getDb().prepare("DELETE FROM erp_chat_logs WHERE user_id = ?").run(Number(userId) || 0);
}
