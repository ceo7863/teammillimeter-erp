/**
 * CalWalk schedule meal/expense import — preview, save, realtime peer, hard reload (Chromium desktop + mobile).
 * Run: node --import tsx scripts/test-calwalk-expense-import-browser.mjs
 *
 * Stored CalWalk rows (no live CalWalk; sync is not configured so the modal falls back to stored rows):
 *  - cw-new: 이서준 meal 24,000 (no expense) / 문정학 no meal, no expense / 최성훈 expense explicit 0
 *  - cw-reg: already registered; ERP line for 문정학 carries a legacy 24,000 expense with no provenance
 * Expectations: preview shows CalWalk values verbatim (null → "-", 0 → "0원"), the saved sale has no invented
 * amounts, meal never lands in expense, the legacy phantom is flagged as 출처 불명, and peers see the same data.
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
const resultsPath = path.join(artifactsDir, "calwalk-expense-import-browser-results.json");
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const JWT = "browser-calwalk-expense-import";
const PEER_TARGET_MS = 6000;
const REQUIRED_CHECKS = 8;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-calwalk-expense-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
fs.mkdirSync(artifactsDir, { recursive: true });

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const CLIENT = { id: 701, name: "인디퍼" };
const SITE_NEW = "역삼 현대까르띠에";
const SITE_REG = "청담 자이";

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

// The throwaway server has no CalWalk/Barobill credentials; those probes fail before any provider call.
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

async function openCalendar(page) {
  await page.evaluate(([key]) => window.sessionStorage.setItem(key, "calendar"), [ACTIVE_TAB_KEY]);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(`[data-calendar-date="${TODAY}"]`, { timeout: 90000 });
  await waitForStream(page);
}

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

async function openImportModal(page) {
  // Top-left corner: the centre of a populated cell is a sale entry (client spotlight), not the date.
  await page.click(`[data-calendar-date="${TODAY}"]`, { position: { x: 6, y: 6 } });
  const button = page.getByRole("button", { name: /CalWalk 스케줄 가져오기/ });
  try {
    await button.first().waitFor({ timeout: 20000 });
  } catch (error) {
    await shot(page, `no-import-button-${Date.now()}`);
    throw error;
  }
  await button.first().click();
  await page.waitForSelector(".erp-calendar-sc-import-modal", { timeout: 20000 });
  await waitFor(
    page,
    () => ({ ok: document.querySelectorAll(".erp-calendar-sc-import-modal [data-sc-schedule-id]").length >= 2 }),
    null,
    20000,
    "import modal schedules",
  );
}

async function readExtras(page, scheduleId) {
  return page.evaluate((id) => {
    const card = document.querySelector(`.erp-calendar-sc-import-modal [data-sc-schedule-id="${id}"]`);
    if (!card) return null;
    const out = {};
    for (const row of Array.from(card.querySelectorAll("[data-calwalk-worker]"))) {
      out[row.getAttribute("data-calwalk-worker")] = {
        meal: row.getAttribute("data-calwalk-meal"),
        expense: row.getAttribute("data-calwalk-expense"),
        text: (row.textContent || "").replace(/\s+/g, " ").trim(),
      };
    }
    const diffRows = Array.from(card.querySelectorAll("[data-testid='calwalk-reimport-diff'] tr[data-diff-status]")).map((tr) => ({
      status: tr.getAttribute("data-diff-status"),
      text: (tr.textContent || "").replace(/\s+/g, " ").trim(),
    }));
    const diffText = card.querySelector("[data-testid='calwalk-reimport-diff']")?.textContent || "";
    return { extras: out, diffRows, diffText };
  }, scheduleId);
}

async function readSavedSales() {
  const reader = path.join(tmpDir, "read.mjs");
  const dbHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  fs.writeFileSync(
    reader,
    [
      `import { initDb, getErpState } from ${JSON.stringify(dbHref)};`,
      "initDb();",
      "const sales = (getErpState().data?.sales || []).map((s) => ({ id: s.id, scScheduleId: s.scScheduleId, workers: (s.workers || []).filter((l) => l.worker) }));",
      "console.log('SALES_JSON=' + JSON.stringify(sales));",
    ].join("\n"),
    "utf8",
  );
  const out = await runCommand(process.execPath, ["--import", "tsx", reader], { env: { DATABASE_PATH: dbPath, JWT_SECRET: JWT } });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("SALES_JSON="));
  return JSON.parse(line.slice("SALES_JSON=".length));
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(artifactsDir, `calwalk-expense-${name}.png`), fullPage: false });
}

try {
  const seedScript = path.join(tmpDir, "seed.mjs");
  const dbHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  const participant = (name, extra = {}) => ({ participantName: name, name, ...extra });
  fs.writeFileSync(
    seedScript,
    [
      `import { initDb, getErpState, saveErpState, createUser } from ${JSON.stringify(dbHref)};`,
      "initDb();",
      "for (const id of ['cwA', 'cwB', 'cwM']) createUser({ loginId: id, password: '1234', name: id, role: 'admin' });",
      "const state = getErpState();",
      "saveErpState({",
      "  ...(state.data || {}),",
      `  clients: [{ id: ${CLIENT.id}, name: ${JSON.stringify(CLIENT.name)}, isActive: true, constructionCost: 330000, overtimeCost: 30000, mealIncluded: 'N', vat: 'Y' }],`,
      "  workers: [",
      "    { id: 1, name: '이서준', isActive: true, constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1 },",
      "    { id: 2, name: '문정학', isActive: true, constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 },",
      "    { id: 3, name: '최성훈', isActive: true, constructionCost: 300000, overtimeCost: 30000, feeRate: 0.1 },",
      "  ],",
      "  sales: [",
      `    { id: 'cw-sale-reg', date: '${TODAY}', client: ${JSON.stringify(CLIENT.name)}, clientId: ${CLIENT.id}, site: ${JSON.stringify(SITE_REG)}, amount: 330000, paid: 0, scScheduleId: 'cw-reg',`,
      "      workers: [{ no: 1, worker: '문정학', quantity: '1', unitCost: '330000', chargeAmount: '330000', meal: '', lodging: '', expense: '24000', overtimeHours: '', overtimeCost: '', memo: '' }] },",
      "  ],",
      "  scSchedules: [",
      `    { id: 'cw-new', scProjectId: 'p1', clientId: ${CLIENT.id}, clientName: ${JSON.stringify(CLIENT.name)}, projectName: ${JSON.stringify(CLIENT.name)}, workDate: '${TODAY}', startTime: '09:00', endTime: '18:00', workType: ${JSON.stringify(SITE_NEW)}, expectedHeadcount: 3,`,
      `      participantNames: ['이서준', '문정학', '최성훈'], participantCount: 3, participants: ${JSON.stringify([
        participant("이서준", { meal: 24000 }),
        participant("문정학"),
        participant("최성훈", { expense: 0 }),
      ])}, syncedAt: new Date().toISOString() },`,
      `    { id: 'cw-reg', scProjectId: 'p1', clientId: ${CLIENT.id}, clientName: ${JSON.stringify(CLIENT.name)}, projectName: ${JSON.stringify(CLIENT.name)}, workDate: '${TODAY}', startTime: '09:00', endTime: '18:00', workType: ${JSON.stringify(SITE_REG)}, expectedHeadcount: 1,`,
      `      participantNames: ['문정학'], participantCount: 1, participants: ${JSON.stringify([participant("문정학")])}, syncedAt: new Date().toISOString() },`,
      "  ],",
      "  scScheduleSyncMeta: { lastSyncSource: 'calwalk' },",
      "  paymentVouchers: [], paymentInputLogs: [], receipts: [], receiptAllocations: [],",
      "}, state.version, 'calwalk-browser-seed', { allowReceiptMutation: true, allowPaymentVoucherMutation: true });",
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

  await run("desktop preview: CalWalk values verbatim (null '-', explicit 0, meal≠expense)", async () => {
    await login(pageA, "cwA");
    await openCalendar(pageA);
    await openImportModal(pageA);
    const view = await readExtras(pageA, "cw-new");
    assert.ok(view, "cw-new card");
    assert.deepEqual(
      { meal: view.extras["이서준"].meal, expense: view.extras["이서준"].expense },
      { meal: "24000", expense: "" },
    );
    assert.deepEqual(
      { meal: view.extras["문정학"].meal, expense: view.extras["문정학"].expense },
      { meal: "", expense: "" },
    );
    assert.equal(view.extras["최성훈"].expense, "0");
    assert.match(view.extras["최성훈"].text, /경비 0원/);
    assert.match(view.extras["문정학"].text, /경비 -/);
    await shot(pageA, "desktop-preview");
  });

  await run("desktop preview: registered schedule flags legacy 24,000 as 출처 불명 (no auto change)", async () => {
    const view = await readExtras(pageA, "cw-reg");
    assert.ok(view.diffRows.some((row) => row.status === "source_unclear" && row.text.includes("문정학") && row.text.includes("24,000")), JSON.stringify(view.diffRows));
    assert.match(view.diffText, /변경되지 않음/);
  });

  await run("peer B opens calendar before A saves", async () => {
    await login(pageB, "cwB");
    await openCalendar(pageB);
  });

  await run("import → form → save: no invented amounts, explicit 0 kept, provenance stored", async () => {
    await pageA.click('.erp-calendar-sc-import-modal [data-sc-schedule-id="cw-new"] button');
    await pageA.waitForSelector(".erp-calendar-new-sale-modal", { timeout: 20000 });
    const grid = await pageA.evaluate(() => {
      const modal = document.querySelector(".erp-calendar-new-sale-modal");
      const read = (row, col) => {
        const value = modal?.querySelector(`[data-worker-row="${row}"][data-worker-col="${col}"]`)?.value;
        return value == null ? null : String(value).replace(/,/g, "");
      };
      return [0, 1, 2].map((row) => ({ meal: read(row, "meal"), expense: read(row, "expense") }));
    });
    assert.deepEqual(grid, [
      { meal: "24000", expense: "" },
      { meal: "", expense: "" },
      { meal: "", expense: "0" },
    ]);
    await shot(pageA, "desktop-form");
    await pageA.locator(".erp-calendar-new-sale-modal button", { hasText: "매출 저장" }).last().click();
    await pageA.waitForSelector(".erp-calendar-new-sale-modal", { state: "detached", timeout: 20000 });
    let saved = null;
    for (let i = 0; i < 40 && !saved; i += 1) {
      saved = (await readSavedSales()).find((sale) => sale.scScheduleId === "cw-new") || null;
      if (!saved) await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(saved, "saved sale for cw-new");
    const byName = Object.fromEntries(saved.workers.map((l) => [l.worker, l]));
    assert.equal(byName["이서준"].meal, "24000");
    assert.equal(byName["이서준"].expense, "");
    assert.equal(byName["문정학"].meal, "");
    assert.equal(byName["문정학"].expense, "");
    assert.equal(byName["최성훈"].expense, "0");
    for (const l of saved.workers) {
      assert.equal(l.sourceType, "CALWALK");
      assert.equal(l.sourceScheduleId, "cw-new");
      assert.match(String(l.sourceHash || ""), /^cw1:/);
    }
    assert.equal(byName["문정학"].sourceExpense, null);
    assert.equal(byName["최성훈"].sourceExpense, 0);
  });

  await run("peer B sees the saved sale live and the reimport diff is clean (no reload)", async () => {
    const liveMs = await waitFor(
      pageB,
      (site) => ({
        ok: Array.from(document.querySelectorAll(".erp-calendar-cell-entry")).some((el) => (el.textContent || "").includes(site)),
      }),
      SITE_NEW,
      PEER_TARGET_MS,
      "peer calendar entry",
    );
    metrics.peerLatencyMs.push(liveMs);
    await openImportModal(pageB);
    const ms = await waitFor(
      pageB,
      () => {
        const card = document.querySelector('.erp-calendar-sc-import-modal [data-sc-schedule-id="cw-new"]');
        const diff = card?.querySelector("[data-testid='calwalk-reimport-diff']");
        return { ok: Boolean(diff && /일치합니다/.test(diff.textContent || "")), text: (diff?.textContent || "").slice(0, 200) };
      },
      null,
      PEER_TARGET_MS,
      "peer clean diff",
    );
    assert.ok(ms < PEER_TARGET_MS);
    await shot(pageB, "peer-diff");
  });

  await run("hard reload B: same preview and clean diff", async () => {
    await pageB.keyboard.press("Escape").catch(() => {});
    await openCalendar(pageB);
    await openImportModal(pageB);
    const view = await readExtras(pageB, "cw-new");
    assert.match(view.diffText, /일치합니다/);
    assert.equal(view.extras["문정학"].expense, "");
    const reg = await readExtras(pageB, "cw-reg");
    assert.ok(reg.diffRows.some((row) => row.status === "source_unclear"));
  });

  await run("mobile preview: same CalWalk values and legacy warning", async () => {
    await login(pageM, "cwM");
    await openCalendar(pageM);
    await openImportModal(pageM);
    const view = await readExtras(pageM, "cw-new");
    assert.equal(view.extras["최성훈"].expense, "0");
    assert.equal(view.extras["문정학"].expense, "");
    assert.equal(view.extras["이서준"].meal, "24000");
    const reg = await readExtras(pageM, "cw-reg");
    assert.ok(reg.diffRows.some((row) => row.status === "source_unclear"));
    const fits = await pageM.evaluate(() => {
      const modal = document.querySelector(".erp-calendar-sc-import-modal");
      return modal ? modal.getBoundingClientRect().right <= window.innerWidth + 1 : false;
    });
    assert.ok(fits, "modal fits mobile viewport");
    await shot(pageM, "mobile-preview");
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
  fs.writeFileSync(resultsPath, JSON.stringify({ results, metrics, consoleErrors, requiredNotRunCount }, null, 2));
  console.log(JSON.stringify({ failed, requiredNotRunCount, metrics, consoleErrors: consoleErrors.length }));
  process.exit(failed || requiredNotRunCount ? 1 : 0);
}
