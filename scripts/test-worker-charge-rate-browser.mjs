/**
 * Worker individual billing rate (개별청구단가) 0 / null consistency — UI, API, realtime, reload, CalWalk import.
 * Run: node --import tsx scripts/test-worker-charge-rate-browser.mjs
 *
 * Seed: worker 신동석(id 22) customChargeCost 350000, client default 300000, one existing confirmed sale at 350000,
 * two CalWalk schedules for 신동석 today.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifactsDir = path.join(root, "artifacts");
const resultsPath = path.join(artifactsDir, "worker-charge-rate-browser-results.json");
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const BASIC_INFO_TAB_KEY = "teammillimeter-erp-basic-info-tab";
const JWT = "browser-worker-rate";
const PEER_TARGET_MS = 6000;
const REQUIRED_CHECKS = 16;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-worker-rate-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
fs.mkdirSync(artifactsDir, { recursive: true });

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const YESTERDAY = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const WORKER_ID = 22;
const WORKER_NAME = "신동석";
const CLIENT = { id: 801, name: "단가테스트거래처" };
const SITE_EXISTING = "기존확정현장";
const SITE_IMPORT = "영원가져오기";
const SITE_IMPORT_NULL = "기본단가가져오기";
const CELL = `[data-worker-rate-cell="${WORKER_ID}"]`;

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
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}\n${out.slice(-4000)}`))));
  });
}

async function waitForUrl(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401 || res.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server not ready: " + url);
}

function isNoiseConsole(text) {
  const t = String(text || "");
  return (
    /Download the React DevTools/i.test(t) ||
    /favicon\.ico/i.test(t) ||
    /ResizeObserver loop/i.test(t) ||
    /Failed to load resource: net::ERR_/i.test(t) ||
    /Failed to load resource: the server responded with a status of (404|409|503)/i.test(t) ||
    /net::ERR_ABORTED|net::ERR_FAILED/i.test(t) ||
    /bank-deposits\/unresolved/i.test(t)
  );
}

const isHarnessOnlyFailure = (url) => /\/api\/(barobill|sc-schedules\/sync)/.test(String(url || ""));

const results = {};
const metrics = { peerLatencyMs: [] };
let failed = 0;
async function run(name, fn) {
  try {
    await fn();
    results[name] = "PASS";
    console.log("PASS:", name);
  } catch (error) {
    failed += 1;
    results[name] = { status: "FAIL", message: String(error?.message || error).slice(0, 800) };
    console.error("FAIL:", name);
    console.error(error);
  }
}

const consoleErrors = [];
function trackConsole(page, label) {
  page.on("pageerror", (err) => {
    const msg = String(err);
    if (!isNoiseConsole(msg)) consoleErrors.push(`${label} pageerror: ${msg}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const url = msg.location()?.url || "";
    if (isNoiseConsole(text) || isHarnessOnlyFailure(url)) return;
    consoleErrors.push(`${label}: ${text} @ ${url}`);
  });
  page.on("response", (res) => {
    if (res.status() < 500 || isHarnessOnlyFailure(res.url())) return;
    consoleErrors.push(`${label} HTTP ${res.status()} ${res.request().method()} ${res.url().replace(/^https?:\/\/[^/]+/, "")}`);
  });
}

const dialogs = [];
function acceptDialogs(page, label) {
  page.on("dialog", async (dialog) => {
    dialogs.push({ label, type: dialog.type(), message: dialog.message() });
    await dialog.accept().catch(() => {});
  });
}

let baseUrl = "";
let serverProc = null;
let browser = null;

async function login(page, loginId) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const userSel = 'input[autocomplete="username"], input[placeholder="로그인 ID"]';
  await page.waitForSelector(userSel, { timeout: 60000 });
  await page.fill(userSel, loginId);
  await page.fill('input[autocomplete="current-password"], input[type="password"]', "1234");
  await page.click("button.erp-login-submit");
  await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
}

async function waitForStream(page, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate(() => document.documentElement.getAttribute("data-erp-stream-connected") === "true");
    if (ok) return;
    await page.waitForTimeout(200);
  }
  throw new Error("ERP stream not connected");
}

async function openTab(page, tab, readySelector, extra = {}) {
  await page.evaluate(([key, value, more]) => {
    window.sessionStorage.setItem(key, value);
    for (const [k, v] of Object.entries(more)) window.sessionStorage.setItem(k, v);
  }, [ACTIVE_TAB_KEY, tab, extra]);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(readySelector, { timeout: 90000 });
  await waitForStream(page);
}

const openWorkers = (page) => openTab(page, "basicInfo", CELL, { [BASIC_INFO_TAB_KEY]: "workers" });
const openCalendar = (page) => openTab(page, "calendar", `[data-calendar-date="${TODAY}"]`);

async function waitFor(page, predicate, arg, timeoutMs = PEER_TARGET_MS, label = "condition") {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await page.evaluate(predicate, arg);
    if (last === true || (last && last.ok)) return Date.now() - start;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} not reached in ${timeoutMs}ms: ${JSON.stringify(last).slice(0, 600)}`);
}

function readCell(selector) {
  const cell = document.querySelector(selector);
  if (!cell) return null;
  return {
    state: cell.getAttribute("data-worker-rate-state"),
    value: cell.getAttribute("data-worker-rate-value"),
    status: cell.getAttribute("data-worker-rate-status"),
    input: cell.querySelector("input")?.value ?? null,
    badge: (cell.querySelector(".erp-worker-rate-badge")?.textContent || "").trim(),
    text: (cell.textContent || "").replace(/\s+/g, " ").trim(),
    hasDefaultButton: Boolean(cell.querySelector(".erp-worker-rate-default-btn")),
  };
}

async function waitCell(page, expect, timeoutMs = 10000, label = "cell") {
  return waitFor(
    page,
    ([sel, exp, fn]) => {
      const view = new Function(`return (${fn})`)()(sel);
      if (!view) return { ok: false, view };
      const ok = Object.entries(exp).every(([k, v]) => view[k] === v);
      return { ok, view };
    },
    [CELL, expect, readCell.toString()],
    timeoutMs,
    label,
  );
}

async function typeRate(page, raw) {
  const input = page.locator(`${CELL} input`);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.fill(raw);
  await input.press("Enter");
}

async function readState() {
  const reader = path.join(tmpDir, "read.mjs");
  const dbHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  fs.writeFileSync(
    reader,
    [
      `import { initDb, getErpState } from ${JSON.stringify(dbHref)};`,
      "initDb();",
      "const data = getErpState().data || {};",
      `const worker = (data.workers || []).find((w) => String(w.id) === '${WORKER_ID}') || null;`,
      "const out = {",
      "  worker: worker ? { has: Object.prototype.hasOwnProperty.call(worker, 'customChargeCost'), customChargeCost: worker.customChargeCost, updatedAt: worker.customChargeCostUpdatedAt ?? null, updatedBy: worker.customChargeCostUpdatedBy ?? null } : null,",
      "  audits: (data.auditLogs || []).filter((a) => a.entityType === 'worker' && a.field === 'customChargeCost').map((a) => ({ before: a.before, after: a.after, userName: a.userName, at: a.at })),",
      "  sales: (data.sales || []).map((s) => ({ id: s.id, site: s.site, scScheduleId: s.scScheduleId ?? null, amount: s.amount, workers: (s.workers || []).filter((l) => l.worker).map((l) => ({ worker: l.worker, chargeAmount: l.chargeAmount, lineBill: l.lineBill ?? null })) })),",
      "};",
      "console.log('STATE_JSON=' + JSON.stringify(out));",
    ].join("\n"),
    "utf8",
  );
  const out = await runCommand(process.execPath, ["--import", "tsx", reader], { env: { DATABASE_PATH: dbPath, JWT_SECRET: JWT } });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("STATE_JSON="));
  return JSON.parse(line.slice("STATE_JSON=".length));
}

const apiToken = (loginId) => jwt.sign({ sub: null, loginId, name: loginId, role: "admin" }, JWT, { expiresIn: "10m" });
async function api(method, url, body, loginId = "rateApi") {
  const res = await fetch(baseUrl + url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken(loginId)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const patchRate = (customChargeCost, expectedCustomChargeCost, loginId) =>
  api("PATCH", `/api/erp/workers/${WORKER_ID}/custom-charge-cost`, { customChargeCost, expectedCustomChargeCost }, loginId);

async function shot(page, name) {
  await page.screenshot({ path: path.join(artifactsDir, `worker-rate-${name}.png`), fullPage: false });
}

function readImportLine() {
  const modal = document.querySelector(".erp-calendar-new-sale-modal");
  const charge = modal?.querySelector('input[data-worker-row="0"][data-worker-col="chargeAmount"]');
  const worker = modal?.querySelector('input[data-worker-row="0"][data-worker-col="worker"]');
  const stale = modal?.querySelector("[data-worker-rate-stale]");
  return {
    open: Boolean(modal),
    worker: worker?.value,
    charge: (charge?.value || "").replace(/[^\d]/g, ""),
    stale: stale ? (stale.textContent || "").replace(/\s+/g, " ") : null,
  };
}

async function waitImportLine(page, check, timeoutMs, label) {
  return waitFor(
    page,
    ([fn, checkFn]) => {
      const v = new Function(`return (${fn})`)()();
      return { ok: new Function(`return (${checkFn})`)()(v), v };
    },
    [readImportLine.toString(), check.toString()],
    timeoutMs,
    label,
  );
}

async function openImport(page, site) {
  await openCalendar(page);
  await page.click(`[data-calendar-date="${TODAY}"]`, { position: { x: 6, y: 6 } });
  const importBtn = page.getByRole("button", { name: /CalWalk 스케줄 가져오기/ });
  await importBtn.first().waitFor({ timeout: 20000 });
  await importBtn.first().click();
  const card = page.locator(".erp-calendar-sc-import-modal button", { hasText: site }).first();
  await card.waitFor({ timeout: 20000 });
  await card.click();
  await page.waitForSelector(".erp-calendar-new-sale-modal", { timeout: 20000 });
}

async function selectManualWorker(page) {
  await openTab(page, "salesInput", 'input[data-worker-row="0"][data-worker-col="worker"]');
  const workerInput = page.locator('input[data-worker-row="0"][data-worker-col="worker"]');
  await workerInput.click();
  await workerInput.fill(WORKER_NAME);
  await workerInput.press("Enter");
}

let existingSaleBefore = null;

try {
  const seedScript = path.join(tmpDir, "seed.mjs");
  const dbHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  const schedule = (id, site) =>
    `    { id: '${id}', scProjectId: 'p1', clientId: ${CLIENT.id}, clientName: ${JSON.stringify(CLIENT.name)}, projectName: ${JSON.stringify(CLIENT.name)}, workDate: '${TODAY}', startTime: '09:00', endTime: '18:00', workType: ${JSON.stringify(site)}, expectedHeadcount: 1, participantNames: [${JSON.stringify(WORKER_NAME)}], participantCount: 1, participants: [{ participantName: ${JSON.stringify(WORKER_NAME)}, name: ${JSON.stringify(WORKER_NAME)} }], syncedAt: new Date().toISOString() },`;
  fs.writeFileSync(
    seedScript,
    [
      `import { initDb, getErpState, saveErpState, createUser } from ${JSON.stringify(dbHref)};`,
      "initDb();",
      "for (const id of ['rateA', 'rateB', 'rateM']) createUser({ loginId: id, password: '1234', name: id, role: 'admin' });",
      "const state = getErpState();",
      "const line = (worker, unit, charge) => ({ no: 1, worker, quantity: '1', unitCost: String(unit), chargeAmount: String(charge), lineBill: String(charge), meal: '', lodging: '', expense: '', overtimeHours: '', overtimeCost: '', memo: '' });",
      "saveErpState({",
      "  ...(state.data || {}),",
      `  clients: [{ id: ${CLIENT.id}, name: ${JSON.stringify(CLIENT.name)}, isActive: true, constructionCost: 300000, chargeCost: 300000, overtimeCost: 30000, mealIncluded: 'N', vat: 'Y' }],`,
      "  workers: [",
      `    { id: ${WORKER_ID}, name: ${JSON.stringify(WORKER_NAME)}, isActive: true, constructionCost: 250000, customChargeCost: 350000, overtimeCost: 30000, feeRate: 0.1, grade: 'C' },`,
      "    { id: 23, name: '기본단가시공자', isActive: true, constructionCost: 250000, overtimeCost: 30000, feeRate: 0.1 },",
      "  ],",
      "  sales: [",
      `    { id: 'rate-existing', date: '${YESTERDAY}', client: ${JSON.stringify(CLIENT.name)}, clientId: ${CLIENT.id}, site: ${JSON.stringify(SITE_EXISTING)}, amount: 350000, paid: 0, voucherNo: 'RATE-E', workers: [line(${JSON.stringify(WORKER_NAME)}, 250000, 350000)] },`,
      "  ],",
      "  scSchedules: [",
      schedule("rate-sc", SITE_IMPORT),
      schedule("rate-sc-null", SITE_IMPORT_NULL),
      "  ],",
      "  scScheduleSyncMeta: { lastSyncSource: 'calwalk' },",
      "  paymentVouchers: [], paymentInputLogs: [], receipts: [], receiptAllocations: [],",
      "}, state.version, 'worker-rate-browser-seed', { allowReceiptMutation: true, allowPaymentVoucherMutation: true });",
      "console.log('SEED_OK');",
    ].join("\n"),
    "utf8",
  );
  await runCommand(process.execPath, ["--import", "tsx", seedScript], { env: { DATABASE_PATH: dbPath, JWT_SECRET: JWT } });

  await runCommand(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--outDir", distDir, "--emptyOutDir"], {
    shell: process.platform === "win32",
  });

  const port = await getFreePort();
  baseUrl = "http://127.0.0.1:" + port;
  serverProc = spawn(process.execPath, ["--import", "tsx", path.join(root, "server/index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      JWT_SECRET: JWT,
      DIST_DIR: distDir,
      CALWALK_API_BASE_URL: "",
      CALWALK_ERP_EXPORT_SECRET: "",
      SC_SYNC_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  globalThis.__serverLog = "";
  serverProc.stdout.on("data", (d) => { globalThis.__serverLog += d.toString(); });
  serverProc.stderr.on("data", (d) => { globalThis.__serverLog += d.toString(); });
  await waitForUrl(baseUrl + "/api/health").catch(() => waitForUrl(baseUrl + "/"));

  existingSaleBefore = (await readState()).sales.find((s) => s.id === "rate-existing");

  browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const pageM = await ctxM.newPage();
  trackConsole(pageA, "A");
  trackConsole(pageB, "B");
  trackConsole(pageM, "M");
  acceptDialogs(pageA, "A");
  acceptDialogs(pageB, "B");
  acceptDialogs(pageM, "M");

  await run("initial: 350000 shown as explicit rate with 기본단가 사용 button and scope notice", async () => {
    await login(pageA, "rateA");
    await openWorkers(pageA);
    await waitCell(pageA, { state: "value", value: "350000", input: "350000", hasDefaultButton: true }, 15000, "initial A");
    const notice = await pageA.evaluate(() => document.querySelector("[data-worker-rate-scope-notice]")?.textContent || "");
    assert.match(notice, /기존 확정 매출전표는 자동 변경되지 않습니다/);
    await login(pageB, "rateB");
    await openWorkers(pageB);
    await waitCell(pageB, { state: "value", value: "350000" }, 15000, "initial B");
    await shot(pageA, "desktop-initial");
  });

  await run("350000 → 0: confirm, 저장완료, 0원 개별단가, DB 0, audit before/after/who/when", async () => {
    dialogs.length = 0;
    await typeRate(pageA, "0");
    await waitCell(pageA, { state: "zero", value: "0", status: "saved", badge: "0원 개별단가" }, 10000, "A zero saved");
    assert.ok(dialogs.some((d) => d.type === "confirm" && d.message.includes("신규 매출전표의 청구단가가 0원으로 적용됩니다.")), JSON.stringify(dialogs));
    const state = await readState();
    assert.deepEqual([state.worker.has, state.worker.customChargeCost], [true, 0]);
    assert.equal(state.worker.updatedBy, "rateA");
    const audit = state.audits.find((a) => a.before === "350,000" && a.after === "0");
    assert.ok(audit, JSON.stringify(state.audits));
    assert.equal(audit.userName, "rateA");
    assert.ok(audit.at);
    await shot(pageA, "desktop-zero-saved");
  });

  await run("peer B sees 0원 개별단가 live without reload", async () => {
    const ms = await waitCell(pageB, { state: "zero", value: "0" }, PEER_TARGET_MS, "peer zero");
    metrics.peerLatencyMs.push(ms);
    await shot(pageB, "peer-zero");
  });

  await run("hard reload keeps 0 (no fallback to 350000)", async () => {
    await openWorkers(pageA);
    await waitCell(pageA, { state: "zero", value: "0", input: "0" }, 15000, "A zero after reload");
  });

  await run("0 → null via 기본단가 사용 button: DB null, display 기본단가, survives reload, peer live", async () => {
    await pageA.locator(`${CELL} .erp-worker-rate-default-btn`).click();
    await waitCell(pageA, { state: "default", value: "", status: "saved", badge: "기본단가", input: "" }, 10000, "A default saved");
    const state = await readState();
    assert.deepEqual([state.worker.has, state.worker.customChargeCost], [true, null]);
    assert.ok(state.audits.some((a) => a.before === "0" && a.after === "기본단가"), JSON.stringify(state.audits));
    metrics.peerLatencyMs.push(await waitCell(pageB, { state: "default" }, PEER_TARGET_MS, "peer default"));
    await openWorkers(pageA);
    await waitCell(pageA, { state: "default", value: "" }, 15000, "A default after reload");
  });

  await run("mobile: null → 0 on 390px, cell fits viewport, persists", async () => {
    await login(pageM, "rateM");
    await openWorkers(pageM);
    await waitCell(pageM, { state: "default" }, 15000, "mobile default");
    await typeRate(pageM, "0");
    await waitCell(pageM, { state: "zero", status: "saved" }, 10000, "mobile zero saved");
    const fits = await pageM.evaluate((sel) => {
      const cell = document.querySelector(sel);
      cell?.scrollIntoView({ block: "center", inline: "center" });
      const r = cell?.getBoundingClientRect();
      return r ? r.width > 0 && r.width <= window.innerWidth : false;
    }, CELL);
    assert.ok(fits, "rate cell fits mobile viewport");
    await shot(pageM, "mobile-zero");
    assert.equal((await readState()).worker.customChargeCost, 0);
    await waitCell(pageA, { state: "zero" }, PEER_TARGET_MS, "A sees mobile edit");
  });

  await run("0 → 350000 then '' → null (empty never becomes 0 nor keeps 350000), survives reload", async () => {
    await typeRate(pageA, "350000");
    await waitCell(pageA, { state: "value", value: "350000", status: "saved" }, 10000, "A 350000");
    assert.equal((await readState()).worker.customChargeCost, 350000);
    await typeRate(pageA, "");
    await waitCell(pageA, { state: "default", value: "", status: "saved" }, 10000, "A empty → default");
    const state = await readState();
    assert.deepEqual([state.worker.has, state.worker.customChargeCost], [true, null]);
    await openWorkers(pageA);
    await waitCell(pageA, { state: "default", input: "" }, 15000, "A empty after reload");
  });

  await run("negative rate rejected in UI (no save) and by the API (400)", async () => {
    await typeRate(pageA, "-1000");
    await waitCell(pageA, { status: "error", state: "default" }, 5000, "A negative error");
    const view = await pageA.evaluate(readCell, CELL);
    assert.match(view.text, /저장 실패/);
    assert.doesNotMatch(view.text, /저장완료/);
    assert.equal((await readState()).worker.customChargeCost, null);
    const neg = await patchRate(-1000, null);
    assert.equal(neg.status, 400);
    assert.equal(neg.body.code, "WORKER_RATE_NEGATIVE");
    for (const bad of ["abc", "Infinity", 1.5]) {
      assert.equal((await patchRate(bad, null)).status, 400, `reject ${bad}`);
    }
    assert.equal((await readState()).worker.customChargeCost, null);
  });

  await run("version conflict: edit started from a stale value fails with 저장 실패 (no success) and adopts server value", async () => {
    const input = pageA.locator(`${CELL} input`);
    await input.click();
    const other = await patchRate(280000, null, "rateB-api");
    assert.equal(other.status, 200, JSON.stringify(other.body));
    await input.fill("0");
    await input.press("Enter");
    await waitCell(pageA, { status: "error", state: "value", value: "280000" }, 10000, "A conflict");
    const view = await pageA.evaluate(readCell, CELL);
    assert.match(view.text, /저장 실패/);
    assert.match(view.text, /다른 사용자가 먼저/);
    assert.doesNotMatch(view.text, /저장완료/);
    assert.equal((await readState()).worker.customChargeCost, 280000);
    await shot(pageA, "desktop-conflict");
  });

  await run("concurrent saves from the same base: exactly one wins, the other gets 409 with the winner's value", async () => {
    const [r1, r2] = await Promise.all([patchRate(0, 280000, "racer1"), patchRate(310000, 280000, "racer2")]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409], JSON.stringify([r1, r2]));
    const winner = r1.status === 200 ? r1 : r2;
    const loser = r1.status === 409 ? r1 : r2;
    assert.equal(loser.body.currentValue, winner.body.after);
    assert.equal((await readState()).worker.customChargeCost, winner.body.after);
    metrics.raceWinner = winner.body.after;
  });

  await run("stale generic workers save cannot write the old rate back", async () => {
    const current = (await readState()).worker.customChargeCost;
    if (current !== 0) {
      const set0 = await patchRate(0, current);
      assert.equal(set0.status, 200, JSON.stringify(set0.body));
    }
    const snapshot = await api("GET", "/api/erp");
    const staleWorkers = (snapshot.body.workers || []).map((w) => (String(w.id) === String(WORKER_ID) ? { ...w, customChargeCost: 350000 } : w));
    const res = await api("PATCH", "/api/erp/domains", { expectedVersion: snapshot.body.version, domains: { workers: { workers: staleWorkers } } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await readState()).worker.customChargeCost, 0);
    await waitCell(pageA, { state: "zero" }, PEER_TARGET_MS, "A zero after stale save");
  });

  await run("new manual sale: selecting 신동석 applies chargeAmount 0", async () => {
    await selectManualWorker(pageA);
    await waitFor(
      pageA,
      () => {
        const charge = document.querySelector('input[data-worker-row="0"][data-worker-col="chargeAmount"]');
        const worker = document.querySelector('input[data-worker-row="0"][data-worker-col="worker"]');
        return { ok: worker?.value === "신동석" && (charge?.value || "").replace(/[^\d]/g, "") === "0", worker: worker?.value, charge: charge?.value };
      },
      undefined,
      8000,
      "manual line charge 0",
    );
    await shot(pageA, "desktop-manual-sale-zero");
  });

  await run("new CalWalk import: line gets 0, rate change while drafting shows notice without auto-recalc, saved sale keeps 0", async () => {
    await openImport(pageA, SITE_IMPORT);
    await waitImportLine(pageA, (v) => v.worker === "신동석" && v.charge === "0", 8000, "import line 0");
    const bump = await patchRate(330000, 0, "rateB-api");
    assert.equal(bump.status, 200, JSON.stringify(bump.body));
    await waitImportLine(pageA, (v) => Boolean(v.stale) && v.charge === "0", PEER_TARGET_MS, "stale notice");
    await shot(pageA, "desktop-import-stale-notice");
    await pageA.locator(".erp-calendar-new-sale-modal [data-worker-rate-stale] button", { hasText: "현재 값 유지" }).click();
    await waitImportLine(pageA, (v) => !v.stale && v.charge === "0", 4000, "notice dismissed");

    await pageA.locator(".erp-calendar-new-sale-modal button", { hasText: "매출 저장" }).last().click();
    try {
      await pageA.waitForSelector(".erp-calendar-new-sale-modal", { state: "detached", timeout: 20000 });
    } catch {
      await shot(pageA, "import-not-saved");
      const text = await pageA.evaluate(() => (document.querySelector(".erp-calendar-new-sale-modal")?.textContent || "").replace(/\s+/g, " "));
      throw new Error(`import modal stayed open: ${text.slice(-700)}`);
    }
    let saved = null;
    for (let i = 0; i < 40 && !saved; i += 1) {
      saved = (await readState()).sales.find((s) => s.scScheduleId === "rate-sc") || null;
      if (!saved) await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(saved, "saved imported sale");
    assert.equal(String(saved.workers[0].chargeAmount), "0");
    metrics.importedSale = saved;
  });

  await run("null rate: new CalWalk import uses the client default 300000; 최신 단가 적용 applies a changed rate explicitly", async () => {
    const cleared = await patchRate(null, 330000);
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    await openImport(pageA, SITE_IMPORT_NULL);
    await waitImportLine(pageA, (v) => v.worker === "신동석" && v.charge === "300000", 8000, "null import line 300000");
    const set0 = await patchRate(0, null, "rateB-api");
    assert.equal(set0.status, 200);
    await waitImportLine(pageA, (v) => Boolean(v.stale) && v.charge === "300000", PEER_TARGET_MS, "stale notice (null→0)");
    await pageA.locator(".erp-calendar-new-sale-modal [data-worker-rate-stale] button", { hasText: "최신 단가 적용" }).click();
    await waitImportLine(pageA, (v) => !v.stale && v.charge === "0", 4000, "latest rate applied");
    await shot(pageA, "desktop-import-latest-applied");
  });

  await run("existing confirmed sale unchanged by every rate change", async () => {
    const after = (await readState()).sales.find((s) => s.id === "rate-existing");
    assert.deepEqual(after, existingSaleBefore);
    metrics.historicalSaleMutationCount = JSON.stringify(after) === JSON.stringify(existingSaleBefore) ? 0 : 1;
  });

  await run("console errors = 0", async () => {
    assert.deepEqual(consoleErrors, []);
  });
} catch (error) {
  failed += 1;
  results.harness = { status: "FAIL", message: String(error?.message || error).slice(0, 1500) };
  console.error(error);
  console.error(String(globalThis.__serverLog || "").slice(-3000));
} finally {
  await browser?.close().catch(() => {});
  serverProc?.kill();
  const requiredNotRunCount = REQUIRED_CHECKS - Object.keys(results).filter((k) => k !== "harness").length;
  fs.writeFileSync(resultsPath, JSON.stringify({ results, metrics, consoleErrors, dialogs, requiredNotRunCount }, null, 2));
  console.log(JSON.stringify({ failed, requiredNotRunCount, metrics, consoleErrors: consoleErrors.length }));
  process.exit(failed || requiredNotRunCount ? 1 : 0);
}
