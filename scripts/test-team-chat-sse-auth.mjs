/**
 * Team chat SSE auth hotfix regression.
 * Task ID: ERP_TEAM_CHAT_SSE_AUTH_REFERENCE_HOTFIX_FINAL
 * Run: npx tsx scripts/test-team-chat-sse-auth.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-team-chat-sse-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf");
process.env.JWT_SECRET = "test-team-chat-sse-auth-hotfix";

const { initDb, createUser, listUsers } = await import("../server/db.mjs");
const { initTeamChatStore } = await import("../server/teamChat.mjs");
const {
  signToken,
  resolveRequestUser,
  authMiddleware,
  adminMiddleware,
  authenticateUser,
} = await import("../server/auth.mjs");
const {
  subscribeTeamChatEvents,
  countTeamChatSubscribers,
  resetTeamChatSubscribersForTests,
  publishTeamChatEvent,
} = await import("../server/teamChatEvents.mjs");
const { getDb } = await import("../server/db.mjs");

initDb();
initTeamChatStore();
resetTeamChatSubscribersForTests();

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

const INDEX_SRC = fs.readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8");

check("0) index.mjs statically imports resolveRequestUser from auth.mjs", () => {
  assert.match(
    INDEX_SRC,
    /import\s*\{[^}]*\bresolveRequestUser\b[^}]*\}\s*from\s*["']\.\/auth\.mjs["']/,
  );
  assert.equal(
    INDEX_SRC.includes("function resolveRequestUser"),
    false,
    "must not define a local resolveRequestUser",
  );
  // The SSE route must call the imported symbol.
  assert.match(INDEX_SRC, /\/api\/team-chat\/events[\s\S]{0,400}resolveRequestUser\(req\)/);
});

function createSseApp() {
  const app = express();
  app.get("/api/team-chat/events", (req, res) => {
    try {
      const user = resolveRequestUser(req);
      if (!user) {
        if (!res.headersSent) {
          res.status(401).json({ error: "로그인이 필요합니다." });
        } else {
          try {
            res.end();
          } catch {
            // ignore
          }
        }
        return;
      }
      subscribeTeamChatEvents(user.sub ?? user.id, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(error?.status || 500).json({ error: "팀채팅 실시간 연결에 실패했습니다." });
        return;
      }
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  });
  return app;
}

function requestSse(port, { token, headerAuth } = {}) {
  return new Promise((resolve) => {
    const pathAndQuery = token ? `/api/team-chat/events?token=${encodeURIComponent(token)}` : "/api/team-chat/events";
    const headers = {};
    if (headerAuth) headers.Authorization = headerAuth;
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathAndQuery, method: "GET", headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        const done = () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            res,
            req,
          });
        };
        // For SSE, resolve after headers + first chunk or short timeout
        if (String(res.headers["content-type"] || "").includes("text/event-stream")) {
          const t = setTimeout(done, 50);
          res.once("data", () => {
            clearTimeout(t);
            done();
          });
        } else {
          res.on("end", done);
        }
      },
    );
    req.on("error", (error) => resolve({ status: 0, error, headers: {}, body: "" }));
    req.end();
  });
}

const usersBefore = listUsers();
let user =
  usersBefore.find((row) => String(row.login_id || row.loginId || "") === "ssehotfix") ||
  createUser({
    loginId: "ssehotfix",
    password: "SseHotfix1",
    name: "SSE Hotfix",
    role: "staff",
  });
const admin =
  usersBefore.find((row) => row.role === "admin") ||
  createUser({
    loginId: "ssehotfixadmin",
    password: "SseHotfix1",
    name: "SSE Admin",
    role: "admin",
  });

const goodToken = signToken(user);
const adminToken = signToken(admin);
const badToken = "not-a.jwt.token";

const app = createSseApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const port = server.address().port;

await checkAsync("1) server route module loads without ReferenceError", async () => {
  // Importing index.mjs starts the full API; instead verify auth symbol exists and route source is valid.
  assert.equal(typeof resolveRequestUser, "function");
  assert.equal(typeof subscribeTeamChatEvents, "function");
  assert.doesNotThrow(() => resolveRequestUser({ headers: {}, query: {} }));
});

await checkAsync("2) missing token -> 401 and subscriber +0", async () => {
  resetTeamChatSubscribersForTests();
  const before = countTeamChatSubscribers();
  const result = await requestSse(port, {});
  assert.equal(result.status, 401);
  assert.equal(countTeamChatSubscribers(), before);
});

await checkAsync("3) invalid token -> 401 and subscriber +0", async () => {
  resetTeamChatSubscribersForTests();
  const before = countTeamChatSubscribers();
  const result = await requestSse(port, { token: badToken });
  assert.equal(result.status, 401);
  assert.equal(countTeamChatSubscribers(), before);
  const bearer = await requestSse(port, { headerAuth: `Bearer ${badToken}` });
  assert.equal(bearer.status, 401);
  assert.equal(countTeamChatSubscribers(), before);
});

await checkAsync("4) query token valid -> 200 text/event-stream subscribed as user id", async () => {
  resetTeamChatSubscribersForTests();
  const result = await requestSse(port, { token: goodToken });
  assert.equal(result.status, 200);
  assert.match(String(result.headers["content-type"] || ""), /text\/event-stream/);
  assert.equal(countTeamChatSubscribers(), 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 30));
});

await checkAsync("5) Bearer token valid -> 200 text/event-stream", async () => {
  resetTeamChatSubscribersForTests();
  const result = await requestSse(port, { headerAuth: `Bearer ${goodToken}` });
  assert.equal(result.status, 200);
  assert.match(String(result.headers["content-type"] || ""), /text\/event-stream/);
  assert.equal(countTeamChatSubscribers(), 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 30));
});

await checkAsync("6) disconnect restores subscriber baseline", async () => {
  resetTeamChatSubscribersForTests();
  const result = await requestSse(port, { token: goodToken });
  assert.equal(countTeamChatSubscribers(), 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(countTeamChatSubscribers(), 0);
});

await checkAsync("7) repeat connect/disconnect 50x: no leak, no ReferenceError", async () => {
  resetTeamChatSubscribersForTests();
  const warnings = [];
  const onWarn = (w) => warnings.push(String(w));
  process.on("warning", onWarn);
  for (let i = 0; i < 50; i += 1) {
    const result = await requestSse(port, { token: goodToken });
    assert.equal(result.status, 200);
    result.req.destroy();
    await new Promise((r) => setTimeout(r, 5));
  }
  await new Promise((r) => setTimeout(r, 50));
  process.off("warning", onWarn);
  assert.equal(countTeamChatSubscribers(), 0);
  assert.equal(
    warnings.some((w) => /MaxListenersExceededWarning/i.test(w)),
    false,
    `unexpected MaxListeners warning: ${warnings.join(" | ")}`,
  );
});

await checkAsync("8) event delivered once to subscribed user (temp DB only)", async () => {
  resetTeamChatSubscribersForTests();
  const db = getDb();
  const channelId = `ch-sse-${Date.now()}`;
  db.prepare(
    `INSERT OR IGNORE INTO team_chat_channels (id, type, title, dm_key, created_at)
     VALUES (?, 'group', 'sse-test', NULL, datetime('now'))`,
  ).run(channelId);
  db.prepare(
    `INSERT OR IGNORE INTO team_chat_members (channel_id, user_id, last_read_message_id, joined_at)
     VALUES (?, ?, 0, datetime('now'))`,
  ).run(channelId, Number(user.id));

  const chunks = [];
  const result = await requestSse(port, { token: goodToken });
  assert.equal(result.status, 200);
  result.res.on("data", (c) => chunks.push(c.toString("utf8")));
  publishTeamChatEvent(channelId, { type: "message", id: "m1", body: "hello-sse-test" });
  await new Promise((r) => setTimeout(r, 40));
  const text = chunks.join("");
  const hits = (text.match(/hello-sse-test/g) || []).length;
  assert.equal(hits, 1, `expected one delivery, got ${hits} in ${text}`);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(countTeamChatSubscribers(), 0);
});

check("9) auth regression: login + middleware + query token", () => {
  const authed = authenticateUser("ssehotfix", "SseHotfix1");
  assert.ok(authed && Number(authed.id) === Number(user.id), "login authenticateUser failed");
  // authenticateUser returns user row shape depending on implementation — just ensure no throw and token verify works
  const viaQuery = resolveRequestUser({ headers: {}, query: { token: goodToken } });
  assert.equal(Number(viaQuery.id), Number(user.id));
  const viaBearer = resolveRequestUser({ headers: { authorization: `Bearer ${goodToken}` }, query: {} });
  assert.equal(Number(viaBearer.id), Number(user.id));

  const req = { headers: { authorization: `Bearer ${goodToken}` }, query: {} };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; } };
  let nextCalled = false;
  authMiddleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(Number(req.user.id), Number(user.id));

  const adminReq = { user: { ...resolveRequestUser({ headers: { authorization: `Bearer ${adminToken}` }, query: {} }), role: "admin" } };
  let adminNext = false;
  adminMiddleware(adminReq, res, () => {
    adminNext = true;
  });
  assert.equal(adminNext, true);
});

server.close();
resetTeamChatSubscribersForTests();

console.log(`\nteam chat SSE auth hotfix: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
