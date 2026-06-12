import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "./config.mjs";
import { listUsers } from "./db.mjs";
import { getDb } from "./db.mjs";
import { publishTeamChatEvent } from "./teamChatEvents.mjs";
import { getUserProfilePhotoMetaByUserIds } from "./userProfilePhoto.mjs";

export const TEAM_CHAT_ALL_CHANNEL_ID = "team-all";
const TEAM_CHAT_REACTION_EMOJIS = new Set(["👍", "✅", "❤️", "😂", "👏"]);

function nowIso() {
  return new Date().toISOString();
}

function activeUsers() {
  return listUsers().filter((row) => row.isActive !== false);
}

function userNameById(userId) {
  const user = activeUsers().find((row) => Number(row.id) === Number(userId));
  return String(user?.name || "").trim() || `\uC0AC\uC6A9\uC790 #${userId}`;
}

export function initTeamChatStore() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS team_chat_channels (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      dm_key TEXT UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_chat_members (
      channel_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS team_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      link_type TEXT,
      link_id TEXT,
      link_label TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_chat_attachments (
      id TEXT PRIMARY KEY,
      message_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_team_chat_messages_channel_id ON team_chat_messages(channel_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_team_chat_members_user_id ON team_chat_members(user_id);

    CREATE TABLE IF NOT EXISTS team_chat_reactions (
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_team_chat_reactions_message ON team_chat_reactions(message_id);
  `);

  const db = getDb();
  const exists = db.prepare("SELECT id FROM team_chat_channels WHERE id = ?").get(TEAM_CHAT_ALL_CHANNEL_ID);
  if (!exists) {
    db.prepare(
      `INSERT INTO team_chat_channels (id, type, title, dm_key, created_at) VALUES (?, 'team', ?, NULL, ?)`,
    ).run(TEAM_CHAT_ALL_CHANNEL_ID, "#\uC804\uCCB4", nowIso());
  }
  migrateTeamChatAttachmentColumns();
  migrateTeamChatMessageColumns();
  initTeamChatAttachmentDir();
  syncTeamChatMemberships();
}

function migrateTeamChatMessageColumns() {
  for (const sql of [
    `ALTER TABLE team_chat_messages ADD COLUMN reply_to_message_id INTEGER`,
    `ALTER TABLE team_chat_messages ADD COLUMN edited_at TEXT`,
    `ALTER TABLE team_chat_messages ADD COLUMN deleted_at TEXT`,
  ]) {
    try {
      getDb().exec(sql);
    } catch {
      // column already exists
    }
  }
}
function migrateTeamChatAttachmentColumns() {
  try {
    getDb().exec(`ALTER TABLE team_chat_attachments ADD COLUMN channel_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    // column already exists
  }
}

export function initTeamChatAttachmentDir() {
  fs.mkdirSync(config.teamChatAttachmentDir, { recursive: true });
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

function loadAttachmentsByMessageIds(messageIds) {
  const ids = [...new Set(messageIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT id, message_id, file_name, mime_type, file_size, created_at
       FROM team_chat_attachments
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

export function createTeamChatPendingAttachment(channelId, userId, buffer, meta = {}) {
  assertChannelMember(channelId, userId);
  const fileName = String(meta.fileName || "").trim();
  if (!fileName) {
    const err = new Error("\uD30C\uC77C\uBA85\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }
  const body = Buffer.from(buffer || []);
  if (!body.length) {
    const err = new Error("\uCCA8\uBD80\uD30C\uC77C\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }

  const id = `tca-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const ext = extFromFileName(fileName);
  const storagePath = path.join(config.teamChatAttachmentDir, `${id}${ext}`);
  fs.writeFileSync(storagePath, body);

  const createdAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO team_chat_attachments
       (id, message_id, channel_id, file_name, mime_type, file_size, storage_path, created_at)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      String(channelId),
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

function linkTeamChatAttachments(messageId, channelId, userId, attachmentIds) {
  const ids = [...new Set(attachmentIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) return;
  assertChannelMember(channelId, userId);
  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, message_id, channel_id FROM team_chat_attachments
       WHERE id IN (${placeholders})`,
    )
    .all(...ids);
  if (rows.length !== ids.length) {
    const err = new Error("\uCCA8\uBD80\uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }
  for (const row of rows) {
    if (String(row.channel_id || "") !== String(channelId)) {
      const err = new Error("\uCC57 \uCC44\uB110\uC758 \uCCA8\uBD80\uD30C\uC77C\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
      err.status = 403;
      throw err;
    }
    if (Number(row.message_id) > 0) {
      const err = new Error("\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uCCA8\uBD80\uD30C\uC77C\uC785\uB2C8\uB2E4.");
      err.status = 400;
      throw err;
    }
  }
  const update = db.prepare(
    `UPDATE team_chat_attachments SET message_id = ?, channel_id = '' WHERE id = ? AND message_id = 0`,
  );
  for (const row of rows) {
    update.run(Number(messageId), row.id);
  }
}

export function getTeamChatAttachmentFile(id, userId) {
  const row = getDb()
    .prepare(
      `SELECT a.storage_path, a.file_name, a.mime_type, a.channel_id, a.message_id, m.channel_id AS message_channel_id
       FROM team_chat_attachments a
       LEFT JOIN team_chat_messages m ON m.id = a.message_id
       WHERE a.id = ?`,
    )
    .get(String(id));
  if (!row || !row.storage_path || !fs.existsSync(row.storage_path)) return null;
  const channelId = String(row.message_channel_id || row.channel_id || "").trim();
  if (!channelId) return null;
  assertChannelMember(channelId, userId);
  return {
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type || "application/octet-stream",
  };
}

export function syncTeamChatMemberships() {
  const db = getDb();
  const joinedAt = nowIso();
  for (const user of activeUsers()) {
    db.prepare(
      `INSERT OR IGNORE INTO team_chat_members (channel_id, user_id, last_read_message_id, joined_at)
       VALUES (?, ?, 0, ?)`,
    ).run(TEAM_CHAT_ALL_CHANNEL_ID, Number(user.id), joinedAt);
  }
}

function dmKeyFor(userIdA, userIdB) {
  const a = Number(userIdA);
  const b = Number(userIdB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return "";
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return `${min}:${max}`;
}

function assertChannelMember(channelId, userId) {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM team_chat_members WHERE channel_id = ? AND user_id = ?")
    .get(String(channelId), Number(userId));
  if (!row) {
    const err = new Error("\uCC57\uD305\uBC29\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 403;
    throw err;
  }
}

function resolveDmPeerUserId(channel, currentUserId) {
  const key = String(channel.dm_key || "").trim();
  if (!key) return null;
  const [a, b] = key.split(":").map((part) => Number(part));
  if (Number(currentUserId) === a) return b;
  if (Number(currentUserId) === b) return a;
  return null;
}

function formatChannelRow(row, currentUserId, context) {
  const type = String(row.type || "").trim();
  let title = String(row.title || "").trim();
  let peerUserId = null;

  if (type === "dm") {
    peerUserId = resolveDmPeerUserId(row, currentUserId);
    if (peerUserId) title = userNameById(peerUserId);
  }

  const lastMessage = context?.lastMessageByChannel?.get(row.id);
  const unreadCount = context?.unreadByChannel?.get(row.id) ?? 0;

  return {
    id: row.id,
    type,
    title: title || "1:1",
    peerUserId,
    unreadCount,
    lastMessageAt: lastMessage?.created_at || null,
    lastMessagePreview: lastMessage ? String(lastMessage.body || "").trim().slice(0, 120) : "",
    lastMessageUserName: lastMessage ? String(lastMessage.user_name || "").trim() : "",
  };
}

function buildChannelFormatContext(rows, currentUserId) {
  const channelIds = rows.map((row) => row.id).filter(Boolean);
  if (!channelIds.length) {
    return { lastMessageByChannel: new Map(), unreadByChannel: new Map() };
  }

  const db = getDb();
  const placeholders = channelIds.map(() => "?").join(", ");
  const userId = Number(currentUserId);

  const lastMessages = db
    .prepare(
      `SELECT m.channel_id, m.id, m.body, m.user_name, m.created_at
       FROM team_chat_messages m
       INNER JOIN (
         SELECT channel_id, MAX(id) AS max_id
         FROM team_chat_messages
         WHERE channel_id IN (${placeholders})
         GROUP BY channel_id
       ) latest ON m.channel_id = latest.channel_id AND m.id = latest.max_id`,
    )
    .all(...channelIds);

  const unreadRows = db
    .prepare(
      `SELECT m.channel_id AS channel_id, COUNT(*) AS count
       FROM team_chat_messages m
       INNER JOIN team_chat_members mem
         ON mem.channel_id = m.channel_id AND mem.user_id = ?
       WHERE m.channel_id IN (${placeholders})
         AND m.id > mem.last_read_message_id
         AND m.user_id != ?
       GROUP BY m.channel_id`,
    )
    .all(userId, ...channelIds, userId);

  return {
    lastMessageByChannel: new Map(lastMessages.map((row) => [row.channel_id, row])),
    unreadByChannel: new Map(unreadRows.map((row) => [row.channel_id, Number(row.count) || 0])),
  };
}

function formatChannelRows(rows, currentUserId) {
  const context = buildChannelFormatContext(rows, currentUserId);
  return rows.map((row) => formatChannelRow(row, currentUserId, context));
}

function countUnreadForMember(channelId, userId) {
  const member = getDb()
    .prepare("SELECT last_read_message_id FROM team_chat_members WHERE channel_id = ? AND user_id = ?")
    .get(String(channelId), Number(userId));
  if (!member) return 0;
  const lastRead = Number(member.last_read_message_id) || 0;
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM team_chat_messages
       WHERE channel_id = ? AND id > ? AND user_id != ?`,
    )
    .get(String(channelId), lastRead, Number(userId));
  return Number(row?.count) || 0;
}

export function listTeamChatChannels(userId) {
  syncTeamChatMemberships();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.type, c.title, c.dm_key, c.created_at
       FROM team_chat_channels c
       INNER JOIN team_chat_members m ON m.channel_id = c.id
       WHERE m.user_id = ?
       ORDER BY
         CASE WHEN c.id = ? THEN 0 ELSE 1 END,
         COALESCE(
           (SELECT created_at FROM team_chat_messages WHERE channel_id = c.id ORDER BY id DESC LIMIT 1),
           c.created_at
         ) DESC`,
    )
    .all(Number(userId), TEAM_CHAT_ALL_CHANNEL_ID);

  return formatChannelRows(rows, userId);
}

export function listTeamChatUsers(currentUserId) {
  syncTeamChatMemberships();
  const users = activeUsers()
    .filter((row) => Number(row.id) !== Number(currentUserId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
  const photoByUserId = getUserProfilePhotoMetaByUserIds(users.map((row) => row.id));
  return users.map((row) => {
    const photo = photoByUserId.get(Number(row.id));
    return {
      id: row.id,
      name: row.name,
      loginId: row.loginId,
      role: row.role,
      photoFileId: photo?.id || null,
      photoUploadedAt: photo?.updatedAt || null,
    };
  });
}

export function getOrCreateTeamChatDmChannel(currentUserId, otherUserId) {
  syncTeamChatMemberships();
  const selfId = Number(currentUserId);
  const peerId = Number(otherUserId);
  if (!Number.isFinite(peerId) || peerId <= 0) {
    const err = new Error("\uB300\uD654 \uC0C1\uB300\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 404;
    throw err;
  }
  if (selfId === peerId) {
    const err = new Error("\uBCF8\uC778\uACFC\uB294 1:1 \uB300\uD654\uB97C \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }
  const peer = activeUsers().find((row) => Number(row.id) === peerId);
  if (!peer) {
    const err = new Error("\uB300\uD654 \uC0C1\uB300\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 404;
    throw err;
  }

  const dmKey = dmKeyFor(selfId, peerId);
  const db = getDb();
  let row = db.prepare("SELECT id, type, title, dm_key, created_at FROM team_chat_channels WHERE dm_key = ?").get(dmKey);
  const joinedAt = nowIso();
  let created = false;
  if (!row) {
    const channelId = `dm-${crypto.randomBytes(8).toString("hex")}`;
    db.prepare(
      `INSERT INTO team_chat_channels (id, type, title, dm_key, created_at) VALUES (?, 'dm', '', ?, ?)`,
    ).run(channelId, dmKey, joinedAt);
    row = db.prepare("SELECT id, type, title, dm_key, created_at FROM team_chat_channels WHERE id = ?").get(channelId);
    created = true;
  }

  for (const uid of [selfId, peerId]) {
    db.prepare(
      `INSERT OR IGNORE INTO team_chat_members (channel_id, user_id, last_read_message_id, joined_at)
       VALUES (?, ?, 0, ?)`,
    ).run(row.id, uid, joinedAt);
  }

  if (created) {
    publishTeamChatEvent(row.id, { type: "channel.updated", channelId: row.id });
  }

  return formatChannelRows([row], selfId)[0];
}

function loadReactionsByMessageIds(messageIds, currentUserId) {
  const ids = [...new Set(messageIds.map((id) => Number(id)).filter((id) => id > 0))];
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT message_id, user_id, emoji
       FROM team_chat_reactions
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
    channelId: row.channel_id,
    userId: row.user_id,
    userName: row.user_name,
    body: deletedAt ? "" : row.body,
    isDeleted: Boolean(deletedAt),
    editedAt: row.edited_at || null,
    replyTo,
    link:
      deletedAt || !row.link_type || !row.link_id
        ? null
        : {
            type: row.link_type,
            id: row.link_id,
            label: String(row.link_label || "").trim(),
          },
    attachments: deletedAt ? [] : attachments,
    reactions: deletedAt ? [] : reactions,
    createdAt: row.created_at,
  };
}

const MESSAGE_SELECT = `
  SELECT m.id, m.channel_id, m.user_id, m.user_name, m.body, m.link_type, m.link_id, m.link_label,
         m.created_at, m.reply_to_message_id, m.edited_at, m.deleted_at,
         r.user_name AS reply_user_name, r.body AS reply_body, r.deleted_at AS reply_deleted_at
  FROM team_chat_messages m
  LEFT JOIN team_chat_messages r ON r.id = m.reply_to_message_id
`;

function mapMessagesWithAttachments(rows, userId) {
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

export function listTeamChatMessages(channelId, userId, options = {}) {
  assertChannelMember(channelId, userId);
  const afterId = Math.max(0, Number(options.afterId) || 0);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const rows = getDb()
    .prepare(
      `${MESSAGE_SELECT}
       WHERE m.channel_id = ? AND m.id > ?
       ORDER BY m.id ASC
       LIMIT ?`,
    )
    .all(String(channelId), afterId, limit);
  return mapMessagesWithAttachments(rows, userId);
}

export function getTeamChatMessageHistory(channelId, userId, options = {}) {
  assertChannelMember(channelId, userId);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const rows = getDb()
    .prepare(
      `${MESSAGE_SELECT}
       WHERE m.channel_id = ?
       ORDER BY m.id DESC
       LIMIT ?`,
    )
    .all(String(channelId), limit);
  return mapMessagesWithAttachments(rows.reverse(), userId);
}

export function postTeamChatMessage(channelId, user, input = {}) {
  assertChannelMember(channelId, user?.id);
  const body = String(input.body || "").trim();
  const linkType = String(input.linkType || input.link?.type || "").trim() || null;
  const linkId = String(input.linkId || input.link?.id || "").trim() || null;
  const linkLabel = String(input.linkLabel || input.link?.label || "").trim() || null;
  const attachmentIds = Array.isArray(input.attachmentIds)
    ? input.attachmentIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!body && !(linkType && linkId) && !attachmentIds.length) {
    const err = new Error("\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
    err.status = 400;
    throw err;
  }

  const replyToMessageId = Math.max(0, Number(input.replyToMessageId || input.replyTo?.id) || 0);
  if (replyToMessageId > 0) {
    const replyRow = getDb()
      .prepare("SELECT id, channel_id FROM team_chat_messages WHERE id = ?")
      .get(replyToMessageId);
    if (!replyRow || String(replyRow.channel_id) !== String(channelId)) {
      const err = new Error("\uB2F5\uC7A5\uD560 \uBA54\uC2DC\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      err.status = 400;
      throw err;
    }
  }

  const createdAt = nowIso();
  const result = getDb()
    .prepare(
      `INSERT INTO team_chat_messages
       (channel_id, user_id, user_name, body, link_type, link_id, link_label, created_at, reply_to_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      String(channelId),
      Number(user.id),
      String(user.name || user.loginId || "").trim(),
      body,
      linkType,
      linkId,
      linkLabel,
      createdAt,
      replyToMessageId > 0 ? replyToMessageId : null,
    );

  const messageId = Number(result.lastInsertRowid);
  if (attachmentIds.length) {
    linkTeamChatAttachments(messageId, channelId, user.id, attachmentIds);
  }

  const row = getDb()
    .prepare(`${MESSAGE_SELECT} WHERE m.id = ?`)
    .get(messageId);
  const attachments = loadAttachmentsByMessageIds([messageId]).get(messageId) || [];
  const message = formatMessageRow(row, attachments, []);
  publishTeamChatEvent(channelId, { type: "message.new", message });
  return message;
}

export function markTeamChatRead(channelId, userId, messageId) {
  assertChannelMember(channelId, userId);
  const latestId = Number(messageId) || 0;
  const maxRow = getDb()
    .prepare("SELECT MAX(id) AS maxId FROM team_chat_messages WHERE channel_id = ?")
    .get(String(channelId));
  const resolvedId = latestId > 0 ? latestId : Number(maxRow?.maxId) || 0;
  const member = getDb()
    .prepare("SELECT last_read_message_id FROM team_chat_members WHERE channel_id = ? AND user_id = ?")
    .get(String(channelId), Number(userId));
  const prevRead = Number(member?.last_read_message_id) || 0;
  const nextRead = Math.max(prevRead, resolvedId);
  if (nextRead <= prevRead) {
    return { ok: true, lastReadMessageId: prevRead };
  }
  getDb()
    .prepare(
      `UPDATE team_chat_members SET last_read_message_id = ? WHERE channel_id = ? AND user_id = ?`,
    )
    .run(nextRead, String(channelId), Number(userId));
  publishTeamChatEvent(channelId, {
    type: "read.updated",
    userId: Number(userId),
    lastReadMessageId: nextRead,
  });
  return { ok: true, lastReadMessageId: nextRead };
}

export function getTeamChatReadState(channelId, userId) {
  assertChannelMember(channelId, userId);
  const rows = getDb()
    .prepare("SELECT user_id, last_read_message_id FROM team_chat_members WHERE channel_id = ?")
    .all(String(channelId));
  return rows.map((row) => ({
    userId: Number(row.user_id),
    userName: userNameById(row.user_id),
    lastReadMessageId: Number(row.last_read_message_id) || 0,
  }));
}

export function getTeamChatUnreadCount(userId) {
  syncTeamChatMemberships();
  const normalizedUserId = Number(userId);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM team_chat_messages m
       INNER JOIN team_chat_members mem
         ON mem.channel_id = m.channel_id AND mem.user_id = ?
       WHERE m.id > mem.last_read_message_id
         AND m.user_id != ?`,
    )
    .get(normalizedUserId, normalizedUserId);
  return Number(row?.count) || 0;
}

export function createTeamChatGroupChannel(creatorId, input = {}) {
  syncTeamChatMemberships();
  const title = String(input.title || "").trim();
  if (!title) {
    const err = new Error("\uADF8\uB8F9 \uBC29 \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
    err.status = 400;
    throw err;
  }
  const memberIds = Array.isArray(input.memberIds)
    ? input.memberIds.map((value) => Number(value)).filter((id) => id > 0)
    : [];
  const creator = Number(creatorId);
  const uniqueMembers = [...new Set([creator, ...memberIds])];
  if (uniqueMembers.length < 2) {
    const err = new Error("\uADF8\uB8F9 \uCC44\uB110\uC740 2\uBA85 \uC774\uC0C1 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
    err.status = 400;
    throw err;
  }

  const db = getDb();
  const channelId = `grp-${crypto.randomBytes(8).toString("hex")}`;
  const joinedAt = nowIso();
  db.prepare(
    `INSERT INTO team_chat_channels (id, type, title, dm_key, created_at) VALUES (?, 'group', ?, NULL, ?)`,
  ).run(channelId, title, joinedAt);

  for (const uid of uniqueMembers) {
    if (!activeUsers().some((row) => Number(row.id) === uid)) continue;
    db.prepare(
      `INSERT OR IGNORE INTO team_chat_members (channel_id, user_id, last_read_message_id, joined_at)
       VALUES (?, ?, 0, ?)`,
    ).run(channelId, uid, joinedAt);
  }

  const row = db.prepare("SELECT id, type, title, dm_key, created_at FROM team_chat_channels WHERE id = ?").get(channelId);
  const channel = formatChannelRows([row], creator)[0];
  publishTeamChatEvent(channelId, { type: "channel.updated", channelId });
  return channel;
}

function loadTeamChatMessageById(messageId, userId) {
  const row = getDb().prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(Number(messageId));
  if (!row) return null;
  assertChannelMember(row.channel_id, userId);
  return mapMessagesWithAttachments([row], userId)[0];
}

export function toggleTeamChatReaction(messageId, userId, emojiInput) {
  const emoji = String(emojiInput || "").trim();
  if (!TEAM_CHAT_REACTION_EMOJIS.has(emoji)) {
    const err = new Error("\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uC740 \uB9AC\uC95C\uC785\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }
  const row = getDb()
    .prepare("SELECT id, channel_id, deleted_at FROM team_chat_messages WHERE id = ?")
    .get(Number(messageId));
  if (!row) {
    const err = new Error("\uBA54\uC2DC\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 404;
    throw err;
  }
  if (row.deleted_at) {
    const err = new Error("\uC0AD\uC81C\uB41C \uBA54\uC2DC\uC9C0\uC5D0\uB294 \uB9AC\uC95C\uC744 \uB2F4\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }
  assertChannelMember(row.channel_id, userId);
  const mid = Number(messageId);
  const uid = Number(userId);
  const existing = getDb()
    .prepare("SELECT 1 AS ok FROM team_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
    .get(mid, uid, emoji);
  if (existing) {
    getDb()
      .prepare("DELETE FROM team_chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
      .run(mid, uid, emoji);
  } else {
    getDb()
      .prepare("INSERT INTO team_chat_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)")
      .run(mid, uid, emoji, nowIso());
  }
  const message = loadTeamChatMessageById(messageId, userId);
  publishTeamChatEvent(row.channel_id, { type: "message.updated", message });
  return message;
}

export function editTeamChatMessage(messageId, userId, bodyInput) {
  const body = String(bodyInput || "").trim();
  if (!body) {
    const err = new Error("\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
    err.status = 400;
    throw err;
  }
  const row = getDb()
    .prepare("SELECT id, channel_id, user_id, deleted_at FROM team_chat_messages WHERE id = ?")
    .get(Number(messageId));
  if (!row) {
    const err = new Error("\uBA54\uC2DC\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 404;
    throw err;
  }
  if (Number(row.user_id) !== Number(userId)) {
    const err = new Error("\uBCF8\uC778 \uBA54\uC2DC\uC9C0\uB9CC \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    err.status = 403;
    throw err;
  }
  if (row.deleted_at) {
    const err = new Error("\uC0AD\uC81C\uB41C \uBA54\uC2DC\uC9C0\uB294 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }
  const editedAt = nowIso();
  getDb()
    .prepare("UPDATE team_chat_messages SET body = ?, edited_at = ? WHERE id = ?")
    .run(body, editedAt, Number(messageId));
  const message = loadTeamChatMessageById(messageId, userId);
  publishTeamChatEvent(row.channel_id, { type: "message.updated", message });
  return message;
}

export function deleteTeamChatMessage(messageId, userId) {
  const row = getDb()
    .prepare("SELECT id, channel_id, user_id, deleted_at FROM team_chat_messages WHERE id = ?")
    .get(Number(messageId));
  if (!row) {
    const err = new Error("\uBA54\uC2DC\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    err.status = 404;
    throw err;
  }
  if (Number(row.user_id) !== Number(userId)) {
    const err = new Error("\uBCF8\uC778 \uBA54\uC2DC\uC9C0\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    err.status = 403;
    throw err;
  }
  const deletedAt = nowIso();
  getDb()
    .prepare(
      `UPDATE team_chat_messages SET deleted_at = ?, body = '', link_type = NULL, link_id = NULL, link_label = NULL WHERE id = ?`,
    )
    .run(deletedAt, Number(messageId));
  const message = loadTeamChatMessageById(messageId, userId);
  publishTeamChatEvent(row.channel_id, { type: "message.deleted", message });
  return message;
}

export function searchTeamChatMessages(userId, query, options = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = getDb()
    .prepare(
      `${MESSAGE_SELECT}
       INNER JOIN team_chat_members mem ON mem.channel_id = m.channel_id AND mem.user_id = ?
       WHERE m.deleted_at IS NULL AND m.body LIKE ?
       ORDER BY m.id DESC
       LIMIT ?`,
    )
    .all(Number(userId), like, limit);
  return mapMessagesWithAttachments(rows, userId);
}
