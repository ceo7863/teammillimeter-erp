import crypto from "crypto";
import { listUsers } from "./db.mjs";
import { getDb } from "./db.mjs";

export const TEAM_CHAT_ALL_CHANNEL_ID = "team-all";

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
  `);

  const db = getDb();
  const exists = db.prepare("SELECT id FROM team_chat_channels WHERE id = ?").get(TEAM_CHAT_ALL_CHANNEL_ID);
  if (!exists) {
    db.prepare(
      `INSERT INTO team_chat_channels (id, type, title, dm_key, created_at) VALUES (?, 'team', ?, NULL, ?)`,
    ).run(TEAM_CHAT_ALL_CHANNEL_ID, "#\uC804\uCCB4", nowIso());
  }
  syncTeamChatMemberships();
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

function formatChannelRow(row, currentUserId) {
  const lastMessage = getDb()
    .prepare(
      `SELECT id, body, user_name, created_at FROM team_chat_messages
       WHERE channel_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(row.id);

  const unreadCount = countUnreadForMember(row.id, currentUserId);
  const type = String(row.type || "").trim();
  let title = String(row.title || "").trim();
  let peerUserId = null;

  if (type === "dm") {
    peerUserId = resolveDmPeerUserId(row, currentUserId);
    if (peerUserId) title = userNameById(peerUserId);
  }

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

  return rows.map((row) => formatChannelRow(row, userId));
}

export function listTeamChatUsers(currentUserId) {
  syncTeamChatMemberships();
  return activeUsers()
    .filter((row) => Number(row.id) !== Number(currentUserId))
    .map((row) => ({
      id: row.id,
      name: row.name,
      loginId: row.loginId,
      role: row.role,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
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
  if (!row) {
    const channelId = `dm-${crypto.randomBytes(8).toString("hex")}`;
    db.prepare(
      `INSERT INTO team_chat_channels (id, type, title, dm_key, created_at) VALUES (?, 'dm', '', ?, ?)`,
    ).run(channelId, dmKey, joinedAt);
    row = db.prepare("SELECT id, type, title, dm_key, created_at FROM team_chat_channels WHERE id = ?").get(channelId);
  }

  for (const uid of [selfId, peerId]) {
    db.prepare(
      `INSERT OR IGNORE INTO team_chat_members (channel_id, user_id, last_read_message_id, joined_at)
       VALUES (?, ?, 0, ?)`,
    ).run(row.id, uid, joinedAt);
  }

  return formatChannelRow(row, selfId);
}

function formatMessageRow(row) {
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    userName: row.user_name,
    body: row.body,
    link:
      row.link_type && row.link_id
        ? {
            type: row.link_type,
            id: row.link_id,
            label: String(row.link_label || "").trim(),
          }
        : null,
    createdAt: row.created_at,
  };
}

export function listTeamChatMessages(channelId, userId, options = {}) {
  assertChannelMember(channelId, userId);
  const afterId = Math.max(0, Number(options.afterId) || 0);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const rows = getDb()
    .prepare(
      `SELECT id, channel_id, user_id, user_name, body, link_type, link_id, link_label, created_at
       FROM team_chat_messages
       WHERE channel_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(String(channelId), afterId, limit);
  return rows.map(formatMessageRow);
}

export function getTeamChatMessageHistory(channelId, userId, options = {}) {
  assertChannelMember(channelId, userId);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
  const rows = getDb()
    .prepare(
      `SELECT id, channel_id, user_id, user_name, body, link_type, link_id, link_label, created_at
       FROM team_chat_messages
       WHERE channel_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(String(channelId), limit);
  return rows.reverse().map(formatMessageRow);
}

export function postTeamChatMessage(channelId, user, input = {}) {
  assertChannelMember(channelId, user?.id);
  const body = String(input.body || "").trim();
  const linkType = String(input.linkType || input.link?.type || "").trim() || null;
  const linkId = String(input.linkId || input.link?.id || "").trim() || null;
  const linkLabel = String(input.linkLabel || input.link?.label || "").trim() || null;
  if (!body && !(linkType && linkId)) {
    const err = new Error("\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
    err.status = 400;
    throw err;
  }

  const createdAt = nowIso();
  const result = getDb()
    .prepare(
      `INSERT INTO team_chat_messages
       (channel_id, user_id, user_name, body, link_type, link_id, link_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );

  return formatMessageRow({
    id: result.lastInsertRowid,
    channel_id: channelId,
    user_id: user.id,
    user_name: String(user.name || user.loginId || "").trim(),
    body,
    link_type: linkType,
    link_id: linkId,
    link_label: linkLabel,
    created_at: createdAt,
  });
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
  getDb()
    .prepare(
      `UPDATE team_chat_members SET last_read_message_id = ? WHERE channel_id = ? AND user_id = ?`,
    )
    .run(nextRead, String(channelId), Number(userId));
  return { ok: true, lastReadMessageId: nextRead };
}

export function getTeamChatUnreadCount(userId) {
  syncTeamChatMemberships();
  const channels = listTeamChatChannels(userId);
  return channels.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0);
}
