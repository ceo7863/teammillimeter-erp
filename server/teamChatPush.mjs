import crypto from "crypto";
import fs from "fs";
import path from "path";
import webpush from "web-push";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";
import { listTeamChatChannelMemberIds } from "./teamChatEvents.mjs";

const VAPID_FILE = path.join(path.dirname(config.dbPath), "team-chat-vapid.json");

function loadOrCreateVapidKeys() {
  const fromEnv = {
    publicKey: String(process.env.VAPID_PUBLIC_KEY || "").trim(),
    privateKey: String(process.env.VAPID_PRIVATE_KEY || "").trim(),
  };
  if (fromEnv.publicKey && fromEnv.privateKey) return fromEnv;

  try {
    if (fs.existsSync(VAPID_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
      if (parsed.publicKey && parsed.privateKey) return parsed;
    }
  } catch {
    // ignore
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.mkdirSync(path.dirname(VAPID_FILE), { recursive: true });
    fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), "utf8");
    console.log("[team-chat-push] Generated VAPID keys at", VAPID_FILE);
  } catch (error) {
    console.warn("[team-chat-push] Failed to persist VAPID keys:", error?.message || error);
  }
  return generated;
}

let vapidKeys = null;
let pushReady = false;

export function initTeamChatPushStore() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS team_chat_push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_team_chat_push_user_id ON team_chat_push_subscriptions(user_id);
  `);

  try {
    vapidKeys = loadOrCreateVapidKeys();
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@teammillimeter.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey,
    );
    pushReady = true;
  } catch (error) {
    pushReady = false;
    console.warn("[team-chat-push] VAPID setup failed:", error?.message || error);
  }
}

export function getTeamChatPushPublicKey() {
  if (!vapidKeys?.publicKey) return "";
  return vapidKeys.publicKey;
}

export function isTeamChatPushReady() {
  return pushReady;
}

function subscriptionId(userId, endpoint) {
  return crypto.createHash("sha256").update(`${userId}:${endpoint}`).digest("hex").slice(0, 32);
}

export function saveTeamChatPushSubscription(userId, body = {}) {
  const endpoint = String(body.endpoint || "").trim();
  const keys = body.keys || {};
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    const err = new Error("\uD478\uC2DC \uAD6C\uB3C5 \uC815\uBCF4\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    err.status = 400;
    throw err;
  }
  const id = subscriptionId(userId, endpoint);
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO team_chat_push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(id, Number(userId), endpoint, p256dh, auth, createdAt);
  return { ok: true };
}

export function removeTeamChatPushSubscription(userId, endpoint) {
  getDb()
    .prepare("DELETE FROM team_chat_push_subscriptions WHERE user_id = ? AND endpoint = ?")
    .run(Number(userId), String(endpoint || "").trim());
  return { ok: true };
}

function listSubscriptionsForUser(userId) {
  return getDb()
    .prepare("SELECT endpoint, p256dh, auth FROM team_chat_push_subscriptions WHERE user_id = ?")
    .all(Number(userId));
}

async function sendPushToSubscription(row, payload) {
  await webpush.sendNotification(
    {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    },
    JSON.stringify(payload),
  );
}

export async function notifyTeamChatPush(userId, payload) {
  if (!pushReady || !userId) return;
  const rows = listSubscriptionsForUser(userId);
  await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await sendPushToSubscription(row, payload);
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          getDb().prepare("DELETE FROM team_chat_push_subscriptions WHERE endpoint = ?").run(row.endpoint);
        }
      }
    }),
  );
}

export async function notifyTeamChatChannelPush(channelId, excludeUserId, payload) {
  if (!pushReady) return;
  const memberIds = listTeamChatChannelMemberIds(channelId).filter((id) => id !== Number(excludeUserId));
  await Promise.allSettled(memberIds.map((userId) => notifyTeamChatPush(userId, payload)));
}
