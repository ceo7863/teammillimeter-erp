/**
 * ERP calendar multi-user realtime — Playwright 3-context latency gate.
 * Run: node --import tsx scripts/test-erp-calendar-realtime-browser.mjs
 *
 * NOT_RUN is not allowed for listed scenarios.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifactsDir = path.join(root, "artifacts");
const resultsPath = path.join(artifactsDir, "erp-calendar-realtime-browser-results.json");

const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const TOKEN_KEY = "teammillimeter-erp-token";
const CALENDAR_LABEL = "\uCE98\uB9B0\uB354";
const PEER_P95_TARGET_MS = 3000;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-calendar-realtime-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "browser-erp-calendar-realtime";
process.env.DIST_DIR = distDir;

fs.mkdirSync(artifactsDir, { recursive: true });

function writeResults(payload) {
  fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function runCommand(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: opts.shell === true,
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(command + " exited " + code + "\n" + out.slice(-4000)));
    });
  });
}

async function waitForUrl(url, timeoutMs = 120000) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401 || res.status === 404) return;
      lastErr = "HTTP " + res.status;
    } catch (error) {
      lastErr = String(error?.message || error);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not become ready at " + url + ": " + lastErr);
}

function isNoiseConsole(text) {
  const t = String(text || "");
  return (
    /Download the React DevTools/i.test(t) ||
    /favicon\.ico/i.test(t) ||
    /ResizeObserver loop/i.test(t) ||
    /Failed to load resource: net::ERR_/i.test(t) ||
    /Failed to load resource: the server responded with a status of (404|409|500|503)/i.test(t) ||
    /\[vite\]/i.test(t) ||
    /net::ERR_ABORTED/i.test(t) ||
    /net::ERR_FAILED/i.test(t) ||
    /bank-deposits\/unresolved/i.test(t) ||
    /\uB2E4\uB978 \uC0AC\uC6A9\uC790\uAC00 \uba3c\uc800 \uc800\uc7a5|\uC0C8\ub85c\uace0\uce68/i.test(t) ||
    /VERSION_CONFLICT/i.test(t)
  );
}

function formatKrw(value) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

const results = {};
let failed = 0;
async function run(name, fn) {
  try {
    await fn();
    results[name] = "PASS";
    console.log("PASS:", name);
  } catch (error) {
    failed += 1;
    results[name] = { status: "FAIL", message: String(error?.message || error) };
    console.error("FAIL:", name);
    console.error(error);
  }
}

const expected = [
  "seed users A and B",
  "context A login open calendar",
  "context B login open calendar idle",
  "peer visibility latency under target",
  "context C background catch-up",
  "stream disconnect fallback",
  "calwalk synthetic sale via saveErpDomains",
  "console errors = 0",
];

let serverProc = null;
let browser = null;
const consoleErrors = [];
const latencySamples = [];

function trackConsole(page) {
  page.on("pageerror", (err) => {
    const msg = String(err);
    if (!isNoiseConsole(msg)) consoleErrors.push("pageerror: " + msg);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isNoiseConsole(text)) consoleErrors.push(text);
  });
}

async function login(page, loginId, password = "1234") {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const userSel = 'input[autocomplete="username"], input[placeholder="\uB85C\uADF8\uC778 ID"]';
  await page.waitForSelector(userSel, { timeout: 60000 });
  await page.fill(userSel, loginId);
  await page.fill('input[autocomplete="current-password"], input[type="password"]', password);
  await page.click("button.erp-login-submit");
  await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
}

async function openCalendar(page) {
  const btn = page.locator("aside nav button", { hasText: CALENDAR_LABEL });
  let opened = false;
  if (await btn.count()) {
    try {
      await btn.first().click({ timeout: 4000 });
      opened = true;
    } catch {
      opened = false;
    }
  }
  if (!opened) {
    await page.evaluate(
      ([storageKey, value]) => {
        window.sessionStorage.setItem(storageKey, value);
      },
      [ACTIVE_TAB_KEY, "calendar"],
    );
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
  }
  await page.waitForSelector(".erp-calendar-page, .erp-calendar-grid", { timeout: 90000 });
}

async function waitForErpStreamReady(page, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => ({
      connected: document.documentElement.getAttribute("data-erp-stream-connected") === "true",
      degraded: Boolean(document.querySelector('[data-erp-sync-degraded="true"]')),
      hasCalendar: Boolean(document.querySelector(".erp-calendar-page, .erp-calendar-grid")),
    }));
    if (state.hasCalendar && state.connected && !state.degraded) return;
    await page.waitForTimeout(200);
  }
  throw new Error("ERP domain SSE stream not ready");
}

async function waitForSaleVisible(page, { client, site, amount }, timeoutMs = 15000) {
  const amountText = formatKrw(amount);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hit = await page.evaluate(
      ({ clientName, siteName, amountLabel }) => {
        const root = document.querySelector(".erp-calendar-page") || document.body;
        const text = root?.innerText || "";
        const hasClient = text.includes(clientName);
        const hasSite = text.includes(siteName);
        const hasAmount = text.includes(amountLabel);
        const entry = Array.from(document.querySelectorAll(".erp-calendar-cell-entry")).find((el) => {
          const t = el.textContent || "";
          return t.includes(clientName) && t.includes(siteName);
        });
        return Boolean(hasClient && hasSite && (hasAmount || entry));
      },
      { clientName: client, siteName: site, amountLabel: amountText },
    );
    if (hit) return Date.now();
    await page.waitForTimeout(100);
  }
  throw new Error(`sale not visible: ${client}/${site}/${amountText}`);
}

async function createSaleViaApi(page, sale) {
  const token = await page.evaluate((key) => {
    return (
      localStorage.getItem(key) ||
      sessionStorage.getItem(key) ||
      localStorage.getItem("teammillimeter-erp-auth-token") ||
      sessionStorage.getItem("teammillimeter-erp-auth-token") ||
      ""
    );
  }, TOKEN_KEY);
  assert.ok(token, "missing auth token");

  const t0 = Date.now();
  let t2xx = t0;
  let body = {};
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const domainsRes = await fetch(baseUrl + "/api/erp/domains?domains=sales", {
      headers: { Authorization: "Bearer " + token },
    });
    const domainsRaw = await domainsRes.text();
    assert.ok(domainsRes.ok, "domains GET failed " + domainsRes.status + " " + domainsRaw.slice(0, 300));
    const domains = domainsRaw ? JSON.parse(domainsRaw) : {};
    const existingSales = Array.isArray(domains.sales) ? domains.sales : [];
    const nextSales = [
      ...existingSales.filter((row) => String(row?.id) !== String(sale.id)),
      sale,
    ];
    const patchRes = await fetch(baseUrl + "/api/erp/domains", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: domains.version,
        domains: {
          sales: {
            sales: nextSales,
            paymentVouchers: Array.isArray(domains.paymentVouchers) ? domains.paymentVouchers : [],
            paymentInputLogs: Array.isArray(domains.paymentInputLogs) ? domains.paymentInputLogs : [],
            saleComments: Array.isArray(domains.saleComments) ? domains.saleComments : [],
          },
        },
      }),
    });
    t2xx = Date.now();
    const patchRaw = await patchRes.text();
    if (patchRes.ok) {
      body = patchRaw ? JSON.parse(patchRaw) : {};
      await page.evaluate(() => {
        try {
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
        } catch {}
      });
      return { t0, t2xx, version: body.version, status: patchRes.status };
    }
    lastErr = "domains PATCH failed " + patchRes.status + " " + patchRaw.slice(0, 500);
    // VERSION_CONFLICT retry when another client autosaved between GET and PATCH.
    if (patchRes.status !== 409) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.fail(lastErr || "domains PATCH failed");
}

let baseUrl = "";

try {
  console.log("Seeding throwaway DB (users A/B + client)...");
  const seedScript = path.join(tmpDir, "seed-calendar-realtime.mjs");
  const dbImportHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  fs.writeFileSync(
    seedScript,
    [
      "import { initDb, getErpState, saveErpState, createUser, listUsers } from " + JSON.stringify(dbImportHref) + ";",
      "initDb();",
      "const users = listUsers();",
      "const has = (id) => users.some((u) => String(u.login_id || u.loginId || '') === id);",
      "if (!has('caluserA')) createUser({ loginId: 'caluserA', password: '1234', name: 'Cal User A', role: 'admin' });",
      "if (!has('caluserB')) createUser({ loginId: 'caluserB', password: '1234', name: 'Cal User B', role: 'staff' });",
      "if (!has('caluserC')) createUser({ loginId: 'caluserC', password: '1234', name: 'Cal User C', role: 'staff' });",
      "const state = getErpState();",
      "saveErpState({",
      "  ...(state.data || {}),",
      "  clients: [{ id: 'c-rt', name: 'RealtimeClient', isActive: true }],",
      "  workers: [{ id: 'w-rt', name: 'RealtimeWorker', isActive: true }],",
      "  sales: [],",
      "  paymentVouchers: [],",
      "  paymentInputLogs: [],",
      "  saleComments: [],",
      "}, state.version, 'calendar-realtime-browser-seed');",
      "console.log('SEED_OK');",
    ].join("\n"),
    "utf8",
  );
  await runCommand(process.execPath, ["--import", "tsx", seedScript], {
    env: { DATABASE_PATH: dbPath, JWT_SECRET: "browser-erp-calendar-realtime" },
  });
  await run("seed users A and B", async () => {
    assert.ok(fs.existsSync(dbPath), "db missing after seed");
  });

  console.log("Building SPA into throwaway dist...");
  await runCommand(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "--outDir", distDir, "--emptyOutDir"],
    { shell: process.platform === "win32" },
  );
  assert.ok(fs.existsSync(path.join(distDir, "index.html")), "vite build missing index.html");

  const port = await getFreePort();
  baseUrl = "http://127.0.0.1:" + port;
  console.log("Starting throwaway server on " + baseUrl);
  serverProc = spawn(process.execPath, ["--import", "tsx", path.join(root, "server/index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      JWT_SECRET: "browser-erp-calendar-realtime",
      DIST_DIR: distDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  serverProc.stdout.on("data", (d) => { serverLog += d.toString(); });
  serverProc.stderr.on("data", (d) => { serverLog += d.toString(); });
  serverProc.on("exit", (code, signal) => {
    if (code && code !== 0) console.error("server exited early", code, signal, serverLog.slice(-2000));
  });

  try {
    await waitForUrl(baseUrl + "/api/health");
  } catch {
    await waitForUrl(baseUrl + "/");
  }

  browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();
  trackConsole(pageA);
  trackConsole(pageB);
  trackConsole(pageC);

  await run("context A login open calendar", async () => {
    await login(pageA, "caluserA");
    await openCalendar(pageA);
  });

  await run("context B login open calendar idle", async () => {
    await login(pageB, "caluserB");
    await openCalendar(pageB);
    await waitForErpStreamReady(pageB);
    await waitForErpStreamReady(pageA);
  });

  await run("peer visibility latency under target", async () => {
    const sale = {
      id: "sale-peer-" + Date.now(),
      client: "RealtimeClient",
      clientId: "c-rt",
      site: "PeerSiteAlpha",
      date: todayISO(),
      amount: 777000,
      paid: 0,
      updatedAt: new Date().toISOString(),
    };

    let detectionAt = null;
    const onResponse = (res) => {
      const url = res.url();
      if (!detectionAt && res.ok() && /\/api\/erp\/domains/.test(url) && res.request().method() === "GET") {
        detectionAt = Date.now();
      }
    };
    pageB.on("response", onResponse);

    const { t0, t2xx } = await createSaleViaApi(pageA, sale);
    const [actorDomAt, peerDomAt] = await Promise.all([
      waitForSaleVisible(pageA, sale, 12000).catch(() => t2xx),
      waitForSaleVisible(pageB, sale, 12000),
    ]);
    pageB.off("response", onResponse);
    if (!detectionAt) detectionAt = peerDomAt;

    const metrics = {
      actorLocalLatency: Math.max(0, actorDomAt - t0),
      peerDetectionLatency: Math.max(0, detectionAt - t2xx),
      peerDomLatency: Math.max(0, peerDomAt - detectionAt),
      totalPeerVisibilityLatency: Math.max(0, peerDomAt - t2xx),
      saveStatus2xxAt: t2xx,
      saleId: sale.id,
    };
    latencySamples.push(metrics);
    results.latency = metrics;
    console.log("LATENCY:", JSON.stringify(metrics));
    assert.ok(
      metrics.totalPeerVisibilityLatency <= PEER_P95_TARGET_MS,
      `peer visibility ${metrics.totalPeerVisibilityLatency}ms exceeds ${PEER_P95_TARGET_MS}ms`,
    );
  });

  await run("context C background catch-up", async () => {
    await login(pageC, "caluserC");
    await openCalendar(pageC);
    await pageC.waitForTimeout(1000);

    // Hide via CDP when available; fall back to visibility stubs.
    let usedCdp = false;
    try {
      const cdp = await contextC.newCDPSession(pageC);
      await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
      usedCdp = true;
    } catch {
      await pageC.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }

    const sale = {
      id: "sale-catchup-" + Date.now(),
      client: "RealtimeClient",
      clientId: "c-rt",
      site: "CatchupSite",
      date: todayISO(),
      amount: 888000,
      paid: 0,
      updatedAt: new Date().toISOString(),
    };
    await createSaleViaApi(pageA, sale);
    await pageC.waitForTimeout(800);

    if (usedCdp) {
      try {
        const cdp = await contextC.newCDPSession(pageC);
        await cdp.send("Page.setWebLifecycleState", { state: "active" });
      } catch {
        /* ignore */
      }
    }
    await pageC.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await waitForErpStreamReady(pageC, 20000).catch(() => null);
    await waitForSaleVisible(pageC, sale, 20000);
    results.contextC_catchup = { usedCdp, ok: true };
  });

  await run("stream disconnect fallback", async () => {
    await pageB.route("**/api/erp/events**", async (route) => {
      await route.abort("failed");
    });
    try {
      await pageB.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
        window.dispatchEvent(new Event("online"));
      });
      await pageB.waitForSelector('[data-erp-sync-degraded="true"]', { timeout: 15000 }).catch(() => null);

      const sale = {
        id: "sale-fallback-" + Date.now(),
        client: "RealtimeClient",
        clientId: "c-rt",
        site: "FallbackSite",
        date: todayISO(),
        amount: 999000,
        paid: 0,
        updatedAt: new Date().toISOString(),
      };
      const { t2xx } = await createSaleViaApi(pageA, sale);
      await waitForSaleVisible(pageB, sale, 16000);
      results.stream_disconnect_fallback = {
        ok: true,
        observedWithinMs: Date.now() - t2xx,
      };
    } finally {
      await pageB.unroute("**/api/erp/events**").catch(() => null);
      await pageB.evaluate(() => {
        window.dispatchEvent(new Event("online"));
      });
      await waitForErpStreamReady(pageB, 20000).catch(() => null);
    }
  });

  await run("calwalk synthetic sale via saveErpDomains", async () => {
    const sale = {
      id: "sale-calwalk-" + Date.now(),
      client: "RealtimeClient",
      clientId: "c-rt",
      site: "CalWalkSynthetic",
      date: todayISO(),
      amount: 654000,
      paid: 0,
      updatedAt: new Date().toISOString(),
      source: "calwalk_import_synthetic",
    };
    const { t2xx } = await createSaleViaApi(pageA, sale);
    await waitForSaleVisible(pageB, sale, 12000);
    results.calwalk_synthetic = { ok: true, latencyMs: Date.now() - t2xx, saleId: sale.id };
  });

  await run("console errors = 0", async () => {
    assert.deepEqual(consoleErrors, [], "console errors: " + consoleErrors.join(" || "));
  });
} catch (error) {
  failed += 1;
  results.bootstrap = { status: "FAIL", message: String(error?.message || error) };
  console.error("BOOTSTRAP FAIL:", error);
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (serverProc && !serverProc.killed) serverProc.kill("SIGTERM"); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

const notRun = expected.filter((name) => !(name in results));
if (notRun.length) {
  failed += notRun.length;
  for (const name of notRun) results[name] = { status: "FAIL", message: "NOT_RUN forbidden - suite aborted early" };
}

const peerLatencies = latencySamples.map((row) => row.totalPeerVisibilityLatency).filter((n) => Number.isFinite(n));
const p95 = peerLatencies.length
  ? peerLatencies.slice().sort((a, b) => a - b)[Math.min(peerLatencies.length - 1, Math.floor(peerLatencies.length * 0.95))]
  : null;

const payload = writeResults({
  ok: failed === 0,
  failed,
  results,
  latencySamples,
  peerVisibilityP95: p95,
  peerP95TargetMs: PEER_P95_TARGET_MS,
  consoleErrors,
  artifactsPath: resultsPath,
});
console.log(JSON.stringify(payload, null, 2));
if (failed) {
  console.error("erp calendar realtime browser gates failed: " + failed);
  process.exit(1);
}
console.log("erp calendar realtime browser: ALL PASS");
