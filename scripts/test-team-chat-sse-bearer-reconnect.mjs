/**
 * Team chat SSE Bearer-only auth + reconnect + parser regressions.
 * Task ID: ERP_TEAM_CHAT_SSE_BEARER_STREAM_SECURITY_RECONNECT_FINAL
 * Run: npx tsx scripts/test-team-chat-sse-bearer-reconnect.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-team-chat-sse-bearer-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf");
process.env.JWT_SECRET = "test-team-chat-sse-bearer-reconnect";

const { initDb, createUser, listUsers, getDb } = await import("../server/db.mjs");
const { initTeamChatStore } = await import("../server/teamChat.mjs");
const {
  signToken,
  resolveRequestUser,
  resolveBearerRequestUser,
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
const { SseJsonStreamParser, computeSseRetryDelayMs } = await import("../src/utils/teamChatSseParser.ts");

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
const HUB_SRC = fs.readFileSync(new URL("../src/utils/teamChatEventHub.ts", import.meta.url), "utf8");
const NGX_SITE = fs.readFileSync(new URL("../deploy/nginx/erp.conf", import.meta.url), "utf8");
const NGX_FMT = fs.readFileSync(new URL("../deploy/nginx/teamchat-sse-log-format.conf", import.meta.url), "utf8");

check("0) static: Bearer-only SSE route + no client query token", () => {
  assert.match(INDEX_SRC, /resolveBearerRequestUser/);
  assert.match(INDEX_SRC, /\/api\/team-chat\/events[\s\S]{0,500}resolveBearerRequestUser\(req\)/);
  assert.equal(INDEX_SRC.includes("function resolveBearerRequestUser"), false);
  assert.equal(/team-chat\/events\?token=/.test(HUB_SRC), false);
  assert.equal(/\bticket=/.test(HUB_SRC), false);
  assert.match(HUB_SRC, /Authorization/);
  assert.match(HUB_SRC, /Bearer/);
  assert.match(HUB_SRC, /fetch\(/);
  assert.match(NGX_FMT, /log_format\s+teamchat_sse_safe/);
  assert.match(NGX_SITE, /location\s+=\s+\/api\/team-chat\/events/);
  assert.match(NGX_SITE, /teamchat_sse_safe/);
  assert.equal(/\$http_authorization/.test(NGX_FMT), false);
});

function createSseApp() {
  const app = express();
  app.get("/api/team-chat/events", (req, res) => {
    try {
      const user = resolveBearerRequestUser(req);
      if (!user) {
        if (!res.headersSent) res.status(401).json({ error: "login required" });
        else {
          try { res.end(); } catch { /* ignore */ }
        }
        return;
      }
      subscribeTeamChatEvents(user.sub ?? user.id, res);
    } catch (error) {
      if (!res.headersSent) res.status(error?.status || 500).json({ error: "sse failed" });
      else {
        try { res.end(); } catch { /* ignore */ }
      }
    }
  });
  return app;
}

function requestSse(port, { queryToken, bearer } = {}) {
  return new Promise((resolve) => {
    const pathAndQuery = queryToken
      ? `/api/team-chat/events?token=${encodeURIComponent(queryToken)}`
      : "/api/team-chat/events";
    const headers = { Accept: "text/event-stream" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const req = http.request({ hostname: "127.0.0.1", port, path: pathAndQuery, method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      const done = () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          res,
          req,
        });
      if (String(res.headers["content-type"] || "").includes("text/event-stream")) {
        const t = setTimeout(done, 60);
        res.once("data", () => {
          clearTimeout(t);
          done();
        });
      } else {
        res.on("end", done);
      }
    });
    req.on("error", (error) => resolve({ status: 0, error, headers: {}, body: "", req: null, res: null }));
    req.end();
  });
}

const usersBefore = listUsers();
const user =
  usersBefore.find((row) => String(row.login_id || "") === "ssebearer") ||
  createUser({ loginId: "ssebearer", password: "SseBearer1", name: "SSE Bearer", role: "staff" });
const admin =
  usersBefore.find((row) => row.role === "admin") ||
  createUser({ loginId: "ssebeareradmin", password: "SseBearer1", name: "SSE Admin", role: "admin" });

const goodToken = signToken(user);
const adminToken = signToken(admin);

const app = createSseApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const port = server.address().port;

await checkAsync("1) missing Authorization -> 401, subscriber +0", async () => {
  const before = countTeamChatSubscribers();
  const result = await requestSse(port, {});
  assert.equal(result.status, 401);
  assert.equal(countTeamChatSubscribers(), before);
});

await checkAsync("2) query token only -> 401, subscriber +0", async () => {
  const before = countTeamChatSubscribers();
  const result = await requestSse(port, { queryToken: goodToken });
  assert.equal(result.status, 401);
  assert.equal(countTeamChatSubscribers(), before);
});

await checkAsync("3) invalid Bearer -> 401, subscriber +0", async () => {
  const before = countTeamChatSubscribers();
  const result = await requestSse(port, { bearer: "not-a.jwt.token" });
  assert.equal(result.status, 401);
  assert.equal(countTeamChatSubscribers(), before);
});

await checkAsync("4) valid Bearer -> 200 text/event-stream subscribed", async () => {
  const before = countTeamChatSubscribers();
  const result = await requestSse(port, { bearer: goodToken });
  assert.equal(result.status, 200);
  assert.match(String(result.headers["content-type"] || ""), /text\/event-stream/);
  assert.equal(countTeamChatSubscribers(), before + 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(countTeamChatSubscribers(), before);
});

await checkAsync("5) disconnect cleanup restores baseline", async () => {
  resetTeamChatSubscribersForTests();
  const result = await requestSse(port, { bearer: goodToken });
  assert.equal(countTeamChatSubscribers(), 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(countTeamChatSubscribers(), 0);
});

await checkAsync("6) repeat connect/disconnect 50x no leak", async () => {
  resetTeamChatSubscribersForTests();
  const warnings = [];
  const onWarn = (w) => warnings.push(String(w));
  process.on("warning", onWarn);
  for (let i = 0; i < 50; i++) {
    const result = await requestSse(port, { bearer: goodToken });
    assert.equal(result.status, 200);
    result.req.destroy();
    await new Promise((r) => setTimeout(r, 4));
  }
  await new Promise((r) => setTimeout(r, 40));
  process.off("warning", onWarn);
  assert.equal(countTeamChatSubscribers(), 0);
  assert.equal(warnings.some((w) => /MaxListenersExceededWarning/i.test(w)), false);
});

await checkAsync("7) event delivered once (temp DB)", async () => {
  resetTeamChatSubscribersForTests();
  const db = getDb();
  const channelId = `ch-bearer-${Date.now()}`;
  db.prepare(
    `INSERT OR IGNORE INTO team_chat_channels (id, type, title, dm_key, created_at)
     VALUES (?, 'group', 'sse-bearer', NULL, datetime('now'))`,
  ).run(channelId);
  db.prepare(
    `INSERT OR IGNORE INTO team_chat_members (channel_id, user_id, last_read_message_id, joined_at)
     VALUES (?, ?, 0, datetime('now'))`,
  ).run(channelId, Number(user.id));

  const chunks = [];
  const result = await requestSse(port, { bearer: goodToken });
  assert.equal(result.status, 200);
  result.res.on("data", (c) => chunks.push(c.toString("utf8")));
  publishTeamChatEvent(channelId, { type: "message.new", id: "m1", body: "hello-bearer-sse" });
  await new Promise((r) => setTimeout(r, 40));
  const text = chunks.join("");
  assert.equal((text.match(/hello-bearer-sse/g) || []).length, 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(countTeamChatSubscribers(), 0);
});

check("8) stream chunk parser: split JSON + multi-event + heartbeat/malformed", () => {
  const events = [];
  const malformed = [];
  const parser = new SseJsonStreamParser((p) => events.push(p), (raw) => malformed.push(raw));
  const payload = JSON.stringify({ type: "message.new", channelId: "c1", message: { body: "abc" } });
  const mid = Math.floor(payload.length / 2);
  parser.push(`data: ${payload.slice(0, mid)}`);
  parser.push(`${payload.slice(mid)}\n\n`);
  parser.push(": ping\n\n");
  parser.push("data: not-json\n\n");
  parser.push('data: {"type":"channel.updated","channelId":"c2"}\n\n');
  parser.push('data: {"type":"a"}\n\ndata: {"type":"b"}\n\n');
  assert.equal(events.length, 4);
  assert.equal(events[0].message.body, "abc");
  assert.equal(events[1].type, "channel.updated");
  assert.equal(events[2].type, "a");
  assert.equal(events[3].type, "b");
  assert.equal(malformed.length, 1);
});

check("9) retry delay backoff bounds with jitter", () => {
  const d0 = computeSseRetryDelayMs(0, { random: () => 0 });
  const d5 = computeSseRetryDelayMs(5, { random: () => 0 });
  const d99 = computeSseRetryDelayMs(99, { random: () => 1 });
  assert.ok(d0 >= 300 && d0 <= 500);
  assert.ok(d5 > d0);
  assert.ok(d99 <= 10_000);
});

check("10) auth regression login + middleware + bearer/query policies", () => {
  const authed = authenticateUser("ssebearer", "SseBearer1");
  assert.ok(authed && Number(authed.id) === Number(user.id));
  assert.equal(resolveBearerRequestUser({ headers: {}, query: { token: goodToken } }), null);
  assert.equal(
    Number(resolveBearerRequestUser({ headers: { authorization: `Bearer ${goodToken}` }, query: {} }).id),
    Number(user.id),
  );
  assert.equal(Number(resolveRequestUser({ headers: {}, query: { token: goodToken } }).id), Number(user.id));

  const req = { headers: { authorization: `Bearer ${goodToken}` }, query: {} };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; },
  };
  let nextCalled = false;
  authMiddleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  const adminReq = {
    user: { ...resolveRequestUser({ headers: { authorization: `Bearer ${adminToken}` }, query: {} }), role: "admin" },
  };
  let adminNext = false;
  adminMiddleware(adminReq, res, () => { adminNext = true; });
  assert.equal(adminNext, true);
});

server.close();
resetTeamChatSubscribersForTests();

await checkAsync("11) reconnect policy: server restart / offline-online / visibility / 401 stop", async () => {
  let portNow = port;
  const localApp = createSseApp();
  const localServer = await new Promise((resolve) => {
    const s = localApp.listen(0, "127.0.0.1", () => resolve(s));
  });
  portNow = localServer.address().port;

  // server restart recovery without browser reload (raw HTTP client loop)
  let recovered = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await requestSse(portNow, { bearer: goodToken });
      if (result.status === 200) {
        recovered = true;
        result.req.destroy();
        break;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(recovered, true);

  localServer.close();
  await new Promise((r) => setTimeout(r, 30));
  const restarted = await new Promise((resolve) => {
    const s = createSseApp().listen(0, "127.0.0.1", () => resolve(s));
  });
  portNow = restarted.address().port;
  const afterRestart = await requestSse(portNow, { bearer: goodToken });
  assert.equal(afterRestart.status, 200);
  afterRestart.req.destroy();

  // offline storm guard (policy function: no schedule when offline — validated by navigator gate in hub source)
  assert.match(HUB_SRC, /navigator\.onLine === false/);
  assert.match(HUB_SRC, /visibilitychange/);
  assert.match(HUB_SRC, /addEventListener\("online"/);
  assert.match(HUB_SRC, /status === 401/);

  // 401 does not leave subscribers
  const bad = await requestSse(portNow, { bearer: "bad" });
  assert.equal(bad.status, 401);
  assert.equal(countTeamChatSubscribers(), 0);
  restarted.close();
});

check("12) nginx apply script is non-destructive", () => {
  const apply = fs.readFileSync(new URL("../scripts/apply-nginx-team-chat-sse-log.sh", import.meta.url), "utf8");
  assert.match(apply, /nginx -t/);
  assert.match(apply, /backup/);
  assert.match(apply, /reload/);
  assert.equal(/rm\s+-f\s+\/var\/log\/nginx\/access\.log/.test(apply), false);
});

console.log(`\nteam chat SSE bearer reconnect: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
