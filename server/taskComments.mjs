import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "./config.mjs";
import { getDb, listUsers } from "./db.mjs";

export const TASK_COMMENT_REACTION_EMOJIS = new Set(["👍", "❤️", "😂", "😮", "😢", "😡"]);

function nowIso() {
  return new Date().toISOString();
}

function activeUsers() {
  return listUsers().filter((row) => row.isActive !== false);
}

function assertActiveUser(userId) {
  const uid = Number(userId);
  if (!activeUsers().some((row) => Number(row.id) === uid)) {
    const err = new Error("접근 권한이 없습니다.");
    err.status = 403;
    throw err;
  }
}

function extFromFileName(fileName) {
  const ext = path.extname(String(fileName || ""));
  return ext || "";
}

function rowToAttachment(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
  };
}

export function initTaskCommentStore() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS task_comment_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      edited_at TEXT,
      deleted_at TEXT,
      reply_to_message_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS task_comment_attachments (
      id TEXT PRIMARY KEY,
      message_id INTEGER NOT NULL DEFAULT 0,
      task_id TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_comment_reactions (
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_comment_messages_task ON task_comment_messages(task_id, id ASC);
    CREATE INDEX IF NOT EXISTS idx_task_comment_reactions_message ON task_comment_reactions(message_id);
  `);

  fs.mkdirSync(config.taskCommentAttachmentDir, { recursive: true });
}

function loadAttachmentsByMessageIds(messageIds) {
  const ids = [...new Set(messageIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT id, message_id, file_name, mime_type, file_size, created_at
       FROM task_comment_attachments
       WHERE message_id IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .all(...ids);
  const map = new Map();
  for (const row of rows) {
    const messageId = Number(row.message_id);
    if (!map.has(messageId)) map.set(messageId, []);
    map.get(messageId).push(rowToAttachment(row));
  }
  return map;
}

function loadReactionsByMessageIds(messageIds, currentUserId) {
  const ids = [...new Set(messageIds.map((id) => Number(id)).filter((id) => id > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT message_id, user_id, emoji
       FROM task_comment_reactions
       WHERE message_id IN (${placeholders})
       ORDER BY created_at ASC`,
    )
    .all(...ids);
  for (const row of rows) {
    const messageId = Number(row.message_id);
    const emoji = String(row.emoji || "").trim();
    if (!emoji) continue;
    if (!map.has(messageId)) map.set(messageId, new Map());
    const emojiMap = map.get(messageId);
    if (!emojiMap.has(emoji)) {
      emojiMap.set(emoji, { emoji, count: 0, reactedByMe: false });
    }
    const agg = emojiMap.get(emoji);
    agg.count += 1;
    if (Number(row.user_id) === Number(currentUserId)) agg.reactedByMe = true;
  }
  for (const [messageId, emojiMap] of map.entries()) {
    map.set(
      messageId,
      [...emojiMap.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)),
    );
  }
  return map;
}

const MESSAGE_SELECT = `
  SELECT m.id, m.task_id, m.user_id, m.user_name, m.body, m.created_at, m.edited_at, m.deleted_at,
         m.reply_to_message_id,
         r.user_name AS reply_user_name, r.body AS reply_body, r.deleted_at AS reply_deleted_at
  FROM task_comment_messages m
  LEFT JOIN task_comment_messages r ON r.id = m.reply_to_message_id
`;

function formatMessageRow(row, attachments = [], reactions = []) {
  const deletedAt = row.deleted_at ? String(row.deleted_at) : null;
  const replyTo = row.reply_to_message_id
    ? {
        id: Number(row.reply_to_message_id),
        userName: String(row.reply_user_name || "").trim(),
        body: String(row.reply_body || "").trim(),
        deleted: Boolean(row.reply_deleted_at),
      }
    : null;
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    userName: row.user_name,
    body: deletedAt ? "" : row.body,
    isDeleted: Boolean(deletedAt),
    editedAt: row.edited_at || null,
    replyTo,
    attachments: deletedAt ? [] : attachments,
    reactions: deletedAt ? [] : reactions,
    createdAt: row.created_at,
  };
}

function mapMessagesWithMeta(rows, userId) {
  const messageIds = rows.map((row) => row.id);
  const attachmentMap = loadAttachmentsByMessageIds(messageIds);
  const reactionMap = loadReactionsByMessageIds(messageIds, userId);
  return rows.map((row) =>
    formatMessageRow(
      row,
      attachmentMap.get(Number(row.id)) || [],
      reactionMap.get(Number(row.id)) || [],
    ),
  );
}

function loadTaskCommentMessageById(messageId, userId) {
  assertActiveUser(userId);
  const row = getDb().prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(Number(messageId));
  if (!row) return null;
  return mapMessagesWithMeta([row], userId)[0];
}

export function listTaskComments(taskId, userId, options = {}) {
  assertActiveUser(userId);
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) {
    const err = new Error("업무 ID가 필요합니다.");
    err.status = 400;
    throw err;
  }
  const afterId = Math.max(0, Number(options.afterId) || 0);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const rows = getDb()
    .prepare(
      `${MESSAGE_SELECT}
       WHERE m.task_id = ? AND m.id > ?
       ORDER BY m.id ASC
       LIMIT ?`,
    )
    .all(normalizedTaskId, afterId, limit);
  return mapMessagesWithMeta(rows, userId);
}

export function getTaskCommentHistory(taskId, userId, options = {}) {
  assertActiveUser(userId);
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) {
    const err = new Error("업무 ID가 필요합니다.");
    err.status = 400;
    throw err;
  }
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const rows = getDb()
    .prepare(
      `${MESSAGE_SELECT}
       WHERE m.task_id = ?
       ORDER BY m.id DESC
       LIMIT ?`,
    )
    .all(normalizedTaskId, limit);
  return mapMessagesWithMeta(rows.reverse(), userId);
}

export function createTaskCommentPendingAttachment(taskId, userId, buffer, meta = {}) {
  assertActiveUser(userId);
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) {
    const err = new Error("업무 ID가 필요합니다.");
    err.status = 400;
    throw err;
  }
  const fileName = String(meta.fileName || "").trim();
  if (!fileName) {
    const err = new Error("파일명이 없습니다.");
    err.status = 400;
    throw err;
  }
  const body = Buffer.from(buffer || []);
  if (!body.length) {
    const err = new Error("첨부파일이 비어 있습니다.");
    err.status = 400;
    throw err;
  }

  const id = `tca-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = extFromFileName(fileName);
  const storagePath = path.join(config.taskCommentAttachmentDir, `${id}${ext}`);
  fs.writeFileSync(storagePath, body);

  const createdAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO task_comment_attachments
       (id, message_id, task_id, file_name, mime_type, file_size, storage_path, created_at)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      normalizedTaskId,
      fileName,
      String(meta.mimeType || "application/octet-stream"),
      body.length,
      storagePath,
      createdAt,
    );

  return rowToAttachment({
    id,
    file_name: fileName,
    mime_type: String(meta.mimeType || "application/octet-stream"),
    file_size: body.length,
    created_at: createdAt,
  });
}

function linkTaskCommentAttachments(messageId, taskId, attachmentIds) {
  const ids = [...new Set(attachmentIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) return;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, message_id, task_id FROM task_comment_attachments
       WHERE id IN (${placeholders})`,
    )
    .all(...ids);
  if (rows.length !== ids.length) {
    const err = new Error("첨부파일을 찾을 수 없습니다.");
    err.status = 400;
    throw err;
  }
  for (const row of rows) {
    if (String(row.task_id || "") !== String(taskId)) {
      const err = new Error("업무의 첨부파일이 아닙니다.");
      err.status = 403;
      throw err;
    }
    if (Number(row.message_id) > 0) {
      const err = new Error("이미 사용 중인 첨부파일입니다.");
      err.status = 400;
      throw err;
    }
  }
  const update = db.prepare(
    `UPDATE task_comment_attachments SET message_id = ?, task_id = '' WHERE id = ? AND message_id = 0`,
  );
  for (const row of rows) {
    update.run(Number(messageId), row.id);
  }
}

export function postTaskComment(taskId, user, input = {}) {
  assertActiveUser(user?.id);
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) {
    const err = new Error("업무 ID가 필요합니다.");
    err.status = 400;
    throw err;
  }
  const body = String(input.body || "").trim();
  const attachmentIds = Array.isArray(input.attachmentIds)
    ? input.attachmentIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!body && !attachmentIds.length) {
    const err = new Error("메시지를 입력해 주세요.");
    err.status = 400;
    throw err;
  }

  const replyToMessageId = Math.max(0, Number(input.replyToMessageId || input.replyTo?.id) || 0);
  if (replyToMessageId > 0) {
    const replyRow = getDb()
      .prepare("SELECT id, task_id FROM task_comment_messages WHERE id = ?")
      .get(replyToMessageId);
    if (!replyRow || String(replyRow.task_id) !== normalizedTaskId) {
      const err = new Error("답장할 메시지를 찾을 수 없습니다.");
      err.status = 400;
      throw err;
    }
  }

  const createdAt = nowIso();
  const result = getDb()
    .prepare(
      `INSERT INTO task_comment_messages
       (task_id, user_id, user_name, body, created_at, reply_to_message_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      normalizedTaskId,
      Number(user.id),
      String(user.name || user.loginId || "").trim(),
      body,
      createdAt,
      replyToMessageId > 0 ? replyToMessageId : null,
    );

  const messageId = Number(result.lastInsertRowid);
  if (attachmentIds.length) {
    linkTaskCommentAttachments(messageId, normalizedTaskId, attachmentIds);
  }

  return loadTaskCommentMessageById(messageId, user.id);
}

export function getTaskCommentAttachmentFile(id, userId) {
  assertActiveUser(userId);
  const row = getDb()
    .prepare(
      `SELECT a.storage_path, a.file_name, a.mime_type, a.task_id, a.message_id, m.task_id AS message_task_id
       FROM task_comment_attachments a
       LEFT JOIN task_comment_messages m ON m.id = a.message_id
       WHERE a.id = ?`,
    )
    .get(String(id));
  if (!row || !row.storage_path || !fs.existsSync(row.storage_path)) return null;
  const taskId = String(row.message_task_id || row.task_id || "").trim();
  if (!taskId) return null;
  return {
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type || "application/octet-stream",
  };
}

export function toggleTaskCommentReaction(messageId, userId, emojiInput) {
  assertActiveUser(userId);
  const emoji = String(emojiInput || "").trim();
  if (!TASK_COMMENT_REACTION_EMOJIS.has(emoji)) {
    const err = new Error("허용되지 않은 리액션입니다.");
    err.status = 400;
    throw err;
  }
  const row = getDb()
    .prepare("SELECT id, deleted_at FROM task_comment_messages WHERE id = ?")
    .get(Number(messageId));
  if (!row) {
    const err = new Error("메시지를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  if (row.deleted_at) {
    const err = new Error("삭제된 메시지에는 리액션을 담을 수 없습니다.");
    err.status = 400;
    throw err;
  }

  const mid = Number(messageId);
  const uid = Number(userId);
  const existing = getDb()
    .prepare("SELECT emoji FROM task_comment_reactions WHERE message_id = ? AND user_id = ?")
    .get(mid, uid);

  if (existing?.emoji === emoji) {
    getDb().prepare("DELETE FROM task_comment_reactions WHERE message_id = ? AND user_id = ?").run(mid, uid);
  } else if (existing) {
    getDb()
      .prepare("UPDATE task_comment_reactions SET emoji = ?, created_at = ? WHERE message_id = ? AND user_id = ?")
      .run(emoji, nowIso(), mid, uid);
  } else {
    getDb()
      .prepare("INSERT INTO task_comment_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)")
      .run(mid, uid, emoji, nowIso());
  }

  return loadTaskCommentMessageById(messageId, userId);
}

export function editTaskCommentMessage(messageId, userId, bodyInput) {
  assertActiveUser(userId);
  const body = String(bodyInput || "").trim();
  if (!body) {
    const err = new Error("메시지를 입력해 주세요.");
    err.status = 400;
    throw err;
  }
  const row = getDb()
    .prepare("SELECT id, user_id, deleted_at FROM task_comment_messages WHERE id = ?")
    .get(Number(messageId));
  if (!row) {
    const err = new Error("메시지를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  if (Number(row.user_id) !== Number(userId)) {
    const err = new Error("본인 메시지만 수정할 수 있습니다.");
    err.status = 403;
    throw err;
  }
  if (row.deleted_at) {
    const err = new Error("삭제된 메시지는 수정할 수 없습니다.");
    err.status = 400;
    throw err;
  }
  getDb()
    .prepare("UPDATE task_comment_messages SET body = ?, edited_at = ? WHERE id = ?")
    .run(body, nowIso(), Number(messageId));
  return loadTaskCommentMessageById(messageId, userId);
}

export function deleteTaskCommentMessage(messageId, userId) {
  assertActiveUser(userId);
  const row = getDb()
    .prepare("SELECT id, user_id, deleted_at FROM task_comment_messages WHERE id = ?")
    .get(Number(messageId));
  if (!row) {
    const err = new Error("메시지를 찾을 수 없습니다.");
    err.status = 404;
    throw err;
  }
  if (Number(row.user_id) !== Number(userId)) {
    const err = new Error("본인 메시지만 삭제할 수 있습니다.");
    err.status = 403;
    throw err;
  }
  getDb()
    .prepare("UPDATE task_comment_messages SET deleted_at = ?, body = '' WHERE id = ?")
    .run(nowIso(), Number(messageId));
  return loadTaskCommentMessageById(messageId, userId);
}

export function countTaskCommentsByTaskIds(taskIds) {
  const ids = [...new Set(taskIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return {};
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT task_id, COUNT(*) AS count
       FROM task_comment_messages
       WHERE task_id IN (${placeholders}) AND deleted_at IS NULL
       GROUP BY task_id`,
    )
    .all(...ids);
  const result = {};
  for (const row of rows) {
    result[row.task_id] = Number(row.count) || 0;
  }
  return result;
}
