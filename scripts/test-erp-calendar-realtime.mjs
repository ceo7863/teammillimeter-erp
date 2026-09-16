/**
 * ERP calendar multi-user realtime - Node unit / integration gates.
 * Run: node --import tsx scripts/test-erp-calendar-realtime.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifactsDir = path.join(root, "artifacts");
const resultsPath = path.join(artifactsDir, "erp-calendar-realtime-results.json");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-calendar-realtime-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf");
process.env.JWT_SECRET = "test-erp-calendar-realtime";

fs.mkdirSync(artifactsDir, { recursive: true });

const { initDb, createUser, listUsers, getErpState, saveErpDomains } = await import("../server/db.mjs");
const { signToken, resolveBearerRequestUser } = await import("../server/auth.mjs");
const {
  subscribeErpDomainEvents,
  countErpDomainSubscribers,
  resetErpDomainSubscribersForTests,
  listRecentErpDomainEventsForTests,
  assertErpDomainEventPrivacy,
  buildErpDomainChangeEvent,
} = await import("../server/erpDomainEvents.mjs");
const {
  coalesceDomainEvents,
  shouldRefetchForViewport,
  isStaleDomainResponse,
  detectSaleEditConflict,
} = await import("../src/utils/erpDomainSync.ts");

initDb();
resetErpDomainSubscribersForTests();

let passed = 0;
let failed = 0;
const results = {};

function check(name, fn) {
  try {
    fn();
    passed += 1;
    results[name] = "PASS";
    console.log("PASS: " + name);
  } catch (error) {
    failed += 1;
    results[name] = { status: "FAIL", message: String(error && error.message || error) };
    console.error("FAIL: " + name);
    console.error(error);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    results[name] = "PASS";
    console.log("PASS: " + name);
  } catch (error) {
    failed += 1;
    results[name] = { status: "FAIL", message: String(error && error.message || error) };
    console.error("FAIL: " + name);
    console.error(error);
  }
}

function createSseApp() {
  const app = express();
  app.get("/api/erp/events", (req, res) => {
    try {
      const user = resolveBearerRequestUser(req);
      if (!user) {
        if (!res.headersSent) res.status(401).json({ error: "login required" });
        else { try { res.end(); } catch (e) {} }
        return;
      }
      const version = Number(getErpState()?.version) || 0;
      subscribeErpDomainEvents(user.sub ?? user.id, res, { globalVersion: version });
    } catch (error) {
      if (!res.headersSent) res.status((error && error.status) || 500).json({ error: "sse failed" });
      else { try { res.end(); } catch (e) {} }
    }
  });
  return app;
}

function parseSseDataPayloads(body) {
  const out = [];
  for (const line of String(body || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // ignore non-JSON data lines
    }
  }
  return out;
}

function requestSse(port, opts = {}) {
  return new Promise((resolve) => {
    const pathAndQuery = opts.queryToken
      ? "/api/erp/events?token=" + encodeURIComponent(opts.queryToken)
      : "/api/erp/events";
    const headers = { Accept: "text/event-stream" };
    if (opts.bearer) headers.Authorization = "Bearer " + opts.bearer;
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathAndQuery, method: "GET", headers },
      (res) => {
        const chunks = [];
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            res,
            req,
          });
        };
        res.on("data", (c) => {
          chunks.push(c);
          if (!String(res.headers["content-type"] || "").includes("text/event-stream")) return;
          const body = Buffer.concat(chunks).toString("utf8");
          const payloads = parseSseDataPayloads(body);
          if (opts.waitForHello) {
            if (payloads.some((p) => p && p.type === "erp.hello")) finish();
            return;
          }
          if (payloads.length > 0 || body.includes(": connected")) finish();
        });
        if (String(res.headers["content-type"] || "").includes("text/event-stream")) {
          setTimeout(finish, opts.waitMs || 250);
        } else {
          res.on("end", finish);
        }
      },
    );
    req.on("error", (error) => resolve({ status: 0, error, headers: {}, body: "", req: null, res: null }));
    req.end();
  });
}

const usersBefore = listUsers();
const user =
  usersBefore.find((row) => String(row.loginId || row.login_id || "") === "admin") ||
  createUser({ loginId: "calrtadmin", password: "CalRt1", name: "Cal RT Admin", role: "admin" });
const goodToken = signToken(user);

const app = createSseApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const port = server.address().port;

await checkAsync("saveErpDomains publishes exactly 1 event AFTER commit", async () => {
  resetErpDomainSubscribersForTests();
  const before = listRecentErpDomainEventsForTests().length;
  const state = getErpState();
  const saleId = "sale-rt-" + Date.now();
  const today = new Date().toISOString().slice(0, 10);
  await saveErpDomains(
    {
      sales: {
        sales: [{
          id: saleId,
          client: "RtClient",
          clientId: "c-rt",
          site: "RtSite",
          date: today,
          amount: 550000,
          paid: 0,
          updatedAt: new Date().toISOString(),
        }],
        paymentVouchers: [],
        paymentInputLogs: [],
        saleComments: [],
      },
    },
    state.version,
    "calendar-realtime-test",
  );
  const events = listRecentErpDomainEventsForTests();
  assert.equal(events.length, before + 1, "expected +1 event, got " + (events.length - before));
  const published = events[events.length - 1];
  assert.equal(published.type, "erp.domain_change");
  assert.ok(published.globalVersion > state.version);
  assert.equal(published.domainRevision, published.globalVersion);
  assert.ok(published.domains.includes("sales"));
  assert.ok(published.entityIds.includes(saleId));
});

await checkAsync("failed VERSION_CONFLICT publishes 0 new events", async () => {
  const before = listRecentErpDomainEventsForTests().length;
  const state = getErpState();
  let caught = null;
  try {
    await saveErpDomains(
      {
        sales: {
          sales: [{ id: "conflict-sale", client: "X", date: "2026-09-01", amount: 1 }],
          paymentVouchers: [],
          paymentInputLogs: [],
          saleComments: [],
        },
      },
      state.version - 1,
      "calendar-realtime-conflict",
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, "expected VERSION_CONFLICT");
  assert.equal(caught.message, "VERSION_CONFLICT");
  assert.equal(listRecentErpDomainEventsForTests().length, before);
});

check("assertErpDomainEventPrivacy on published event", () => {
  const events = listRecentErpDomainEventsForTests();
  assert.ok(events.length >= 1, "need at least one published event");
  assertErpDomainEventPrivacy(events[events.length - 1]);
  const safe = buildErpDomainChangeEvent({
    globalVersion: 99,
    domains: ["sales"],
    entityIds: ["x1"],
    affectedDateFrom: "2026-09-14",
    affectedDateTo: "2026-09-14",
    actorUserId: "tester",
    source: "privacy-check",
  });
  assert.equal(safe.domainRevision, 99);
  assertErpDomainEventPrivacy(safe);
  assert.throws(
    () => assertErpDomainEventPrivacy({ type: "erp.domain_change", amount: 1000, clientName: "leak" }),
    /forbidden key/i,
  );
});

check("buildErpDomainChangeEvent includes domainRevision alias", () => {
  const event = buildErpDomainChangeEvent({
    globalVersion: 42,
    domains: ["sales"],
    entityIds: ["s1"],
  });
  assert.equal(event.globalVersion, 42);
  assert.equal(event.domainRevision, 42);
  assertErpDomainEventPrivacy(event);
});

await checkAsync("GET /api/erp/events sends erp.hello on subscribe", async () => {
  resetErpDomainSubscribersForTests();
  const before = countErpDomainSubscribers();
  const expectedVersion = Number(getErpState()?.version) || 0;
  const result = await requestSse(port, { bearer: goodToken, waitForHello: true, waitMs: 400 });
  assert.equal(result.status, 200);
  assert.match(String(result.headers["content-type"] || ""), /text\/event-stream/);
  const payloads = parseSseDataPayloads(result.body);
  const hello = payloads.find((p) => p && p.type === "erp.hello");
  assert.ok(hello, "expected erp.hello in first SSE payloads, body=" + result.body.slice(0, 400));
  assert.ok(hello.eventId, "erp.hello missing eventId");
  assert.equal(Number(hello.globalVersion) || 0, expectedVersion);
  assert.equal(countErpDomainSubscribers(), before + 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(countErpDomainSubscribers(), before);
});

await checkAsync("GET /api/erp/events with Bearer works (subscribe count)", async () => {
  resetErpDomainSubscribersForTests();
  const before = countErpDomainSubscribers();
  const result = await requestSse(port, { bearer: goodToken });
  assert.equal(result.status, 200);
  assert.match(String(result.headers["content-type"] || ""), /text\/event-stream/);
  assert.equal(countErpDomainSubscribers(), before + 1);
  result.req.destroy();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(countErpDomainSubscribers(), before);
});

await checkAsync("GET /api/erp/events?token=... rejected (401)", async () => {
  resetErpDomainSubscribersForTests();
  const before = countErpDomainSubscribers();
  const result = await requestSse(port, { queryToken: goodToken });
  assert.equal(result.status, 401);
  assert.equal(countErpDomainSubscribers(), before);
  const fakeReq = { headers: {}, query: { token: goodToken } };
  assert.equal(resolveBearerRequestUser(fakeReq), null);
});

check("coalesceDomainEvents merges burst + max globalVersion", () => {
  const plan = coalesceDomainEvents([
    {
      type: "erp.domain_change",
      eventId: "e1",
      globalVersion: 10,
      domains: ["sales"],
      entityIds: ["s1"],
      affectedDateFrom: "2026-09-10",
      affectedDateTo: "2026-09-10",
    },
    {
      type: "erp.domain_change",
      eventId: "e2",
      globalVersion: 12,
      domains: ["settings", "sales"],
      entityIds: ["s2"],
      affectedDateFrom: "2026-09-01",
      affectedDateTo: "2026-09-15",
    },
    { type: "erp.hello", globalVersion: 99 },
  ]);
  assert.equal(plan.globalVersion, 12);
  assert.deepEqual(plan.domains.sort(), ["sales", "settings"]);
  assert.deepEqual(plan.entityIds.sort(), ["s1", "s2"]);
  assert.equal(plan.affectedDateFrom, "2026-09-01");
  assert.equal(plan.affectedDateTo, "2026-09-15");
  assert.deepEqual(plan.eventIds, ["e1", "e2"]);
});

check("shouldRefetchForViewport date overlap rules", () => {
  assert.equal(shouldRefetchForViewport({
    domains: ["sales"], affectedDateFrom: "2026-09-14", affectedDateTo: "2026-09-14", viewingMonthKey: "2026-09",
  }), true);
  assert.equal(shouldRefetchForViewport({
    domains: ["sales"], affectedDateFrom: "2026-08-01", affectedDateTo: "2026-08-31", viewingMonthKey: "2026-09",
  }), false);
  assert.equal(shouldRefetchForViewport({
    domains: ["workers"], affectedDateFrom: "2026-08-01", affectedDateTo: "2026-08-31", viewingMonthKey: "2026-09",
  }), true);
  assert.equal(shouldRefetchForViewport({
    domains: ["sales"], affectedDateFrom: null, affectedDateTo: null, viewingMonthKey: "2026-09",
  }), true);
});

check("isStaleDomainResponse + out-of-order lower globalVersion ignored", () => {
  assert.equal(isStaleDomainResponse({ responseVersion: 5, knownVersion: 10 }), true);
  assert.equal(isStaleDomainResponse({ responseVersion: 10, knownVersion: 10 }), false);
  assert.equal(isStaleDomainResponse({ responseVersion: 11, knownVersion: 10 }), false);
  const plan = coalesceDomainEvents([
    { type: "erp.domain_change", eventId: "late", globalVersion: 8, domains: ["sales"] },
    { type: "erp.domain_change", eventId: "early", globalVersion: 14, domains: ["sales"] },
  ]);
  assert.equal(plan.globalVersion, 14);
  assert.equal(isStaleDomainResponse({ responseVersion: 8, knownVersion: plan.globalVersion }), true);
});

check("detectSaleEditConflict when server updatedAt is newer", () => {
  const conflict = detectSaleEditConflict({
    editingSaleId: "s1",
    editingSnapshotUpdatedAt: "2026-09-14T01:00:00.000Z",
    incomingSales: [{ id: "s1", updatedAt: "2026-09-14T02:00:00.000Z" }],
  });
  assert.ok(conflict);
  assert.equal(conflict.saleId, "s1");
  assert.ok(String(conflict.message || "").length > 0);
  assert.equal(detectSaleEditConflict({
    editingSaleId: "s1",
    editingSnapshotUpdatedAt: "2026-09-14T02:00:00.000Z",
    incomingSales: [{ id: "s1", updatedAt: "2026-09-14T02:00:00.000Z" }],
  }), null);
  assert.equal(detectSaleEditConflict({
    editingSaleId: null,
    editingSnapshotUpdatedAt: "2026-09-14T01:00:00.000Z",
    incomingSales: [{ id: "s1", updatedAt: "2026-09-14T02:00:00.000Z" }],
  }), null);
});

server.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

const payload = { ok: failed === 0, passed, failed, results, artifactsPath: resultsPath };
fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2), "utf8");
console.log(JSON.stringify(payload, null, 2));
if (failed) {
  console.error("erp calendar realtime gates failed: " + failed);
  process.exit(1);
}
console.log("erp calendar realtime: ALL PASS");
