import { getDb } from "./db.mjs";

const subscribers = new Map();

function heartbeat(res) {
  try {
    res.write(": ping\n\n");
  } catch {
    // ignore
  }
}

export function subscribeTeamChatEvents(userId, res) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(": connected\n\n");

  if (!subscribers.has(uid)) subscribers.set(uid, new Set());
  subscribers.get(uid).add(res);

  const timer = setInterval(() => heartbeat(res), 25000);
  res.on("close", () => {
    clearInterval(timer);
    subscribers.get(uid)?.delete(res);
    if (subscribers.get(uid)?.size === 0) subscribers.delete(uid);
  });
}

function writeEvent(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // ignore
  }
}

export function listTeamChatChannelMemberIds(channelId) {
  const rows = getDb()
    .prepare("SELECT user_id FROM team_chat_members WHERE channel_id = ?")
    .all(String(channelId));
  return rows.map((row) => Number(row.user_id)).filter((id) => id > 0);
}

export function publishTeamChatEvent(channelId, event) {
  const memberIds = listTeamChatChannelMemberIds(channelId);
  const payload = { ...event, channelId: String(channelId) };
  for (const userId of memberIds) {
    for (const res of subscribers.get(userId) || []) {
      writeEvent(res, payload);
    }
  }
}
