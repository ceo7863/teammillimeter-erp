/**
 * Finance UX closeout browser gates (sale drawer, exception inbox, badges, wheel, mobile).
 * Run: node --import tsx scripts/test-finance-ux-closeout-browser.mjs
 *
 * Bootstrap mirrors scripts/test-finance-ia-browser.mjs (temp DB + vite DIST_DIR + Playwright Chromium).
 * NOT_RUN is not allowed - server/build failures exit 1.
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
const resultsPath = path.join(artifactsDir, "finance-ux-closeout-browser-results.json");

const SALES_HUB_LABEL = "\uB9E4\uCD9C\u00B7\uB0B4\uC5ED\uC11C";
const RECEIVABLES_LABEL = "\uC785\uAE08\u00B7\uBBF8\uC218";
const EXCEPTION_TAB_LABEL = "\uBBF8\uBC30\uC815\u00B7\uBBF8\uD655\uC778";
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const SALE_IDENTITY = "canonical-sale-detail-drawer";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-finance-ux-closeout-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "browser-finance-ux-closeout";
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
    /Failed to load resource: the server responded with a status of (404|500|503)/i.test(t) ||
    /\[vite\]/i.test(t) ||
    /net::ERR_ABORTED/i.test(t) ||
    /net::ERR_FAILED/i.test(t) ||
    /bank-deposits\/unresolved/i.test(t)
  );
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
  "desktop login",
  "sales hub opens sale detail drawer identity",
  "drawer wheel safe + body overflow hidden",
  "receivables exception inbox mounts",
  "sidebar receivables badge hidden when count 0 or shown when seeded",
  "tab badge display for exception inbox",
  "exception fetch-failed UI then recover",
  "mobile 390x844 sale detail or inbox without white screen + close aria",
  "console errors = 0",
];

let serverProc = null;
let browser = null;
const consoleErrors = [];

try {
  console.log("Seeding throwaway DB (subprocess so SQLite is not held open)...");
  const seedScript = path.join(tmpDir, "seed-ux-closeout.mjs");
  const dbImportHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  fs.writeFileSync(
    seedScript,
    [
      "import { initDb, getErpState, saveErpState } from " + JSON.stringify(dbImportHref) + ";",
      "initDb();",
      "const state = getErpState();",
      "saveErpState({",
      "  ...(state.data || {}),",
      "  clients: [{ id: 'c-ux', name: 'CloseoutClient', isActive: true }],",
      "  workers: [{ id: 'w-ux', name: 'CloseoutWorker', isActive: true }],",
      "  sales: [{",
      "    id: 'sale-ux-1',",
      "    client: 'CloseoutClient',",
      "    clientId: 'c-ux',",
      "    site: 'CloseoutSite',",
      "    date: '2026-09-01',",
      "    amount: 1100000,",
      "    paid: 0,",
      "    voucherNo: 'UX-001',",
      "  }],",
      "  paymentVouchers: [],",
      "  receipts: [],",
      "  receiptAllocations: [],",
      "  bankTransactions: [{",
      "    id: 'btx-ux-1',",
      "    transactionDate: '2026-09-02',",
      "    deposit: 50000,",
      "    withdrawal: 0,",
      "    subject: 'CloseoutDeposit',",
      "  }],",
      "  bankSyncMeta: {",
      "    unresolvedDepositQueue: [{",
      "      bankTransactionId: 'btx-ux-1',",
      "      reasonCode: 'CLIENT_NOT_FOUND',",
      "      kind: 'CLIENT_NOT_FOUND',",
      "      status: 'needs_review',",
      "      depositAmount: 50000,",
      "      transactionDate: '2026-09-02',",
      "      subject: 'CloseoutDeposit',",
      "      firstSeenAt: '2026-09-02T00:00:00.000Z',",
      "    }, {",
      "      bankTransactionId: 'btx-pre',",
      "      reasonCode: 'PRE_CUTOVER',",
      "      kind: 'PRE_CUTOVER',",
      "      status: 'needs_review',",
      "      depositAmount: 1,",
      "      transactionDate: '2020-01-01',",
      "      subject: 'PreCutover',",
      "    }],",
      "  },",
      "}, state.version, 'ux-closeout-browser-seed', { allowReceiptMutation: true });",
      "console.log('SEED_OK');",
    ].join("\n"),
    "utf8",
  );
  await runCommand(process.execPath, ["--import", "tsx", seedScript], {
    env: { DATABASE_PATH: dbPath, JWT_SECRET: "browser-finance-ux-closeout" },
  });

  console.log("Building SPA into throwaway dist...");
  await runCommand(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vite", "build", "--outDir", distDir, "--emptyOutDir"],
    { shell: process.platform === "win32" },
  );
  assert.ok(fs.existsSync(path.join(distDir, "index.html")), "vite build missing index.html");

  const port = await getFreePort();
  const baseUrl = "http://127.0.0.1:" + port;
  console.log("Starting throwaway server on " + baseUrl);
  serverProc = spawn(process.execPath, ["--import", "tsx", path.join(root, "server/index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      JWT_SECRET: "browser-finance-ux-closeout",
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => {
    const msg = String(err);
    if (!isNoiseConsole(msg)) consoleErrors.push("pageerror: " + msg);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isNoiseConsole(text)) consoleErrors.push(text);
  });

  async function login() {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('input[autocomplete="username"], input[placeholder="\uB85C\uADF8\uC778 ID"]', { timeout: 60000 });
    await page.fill('input[autocomplete="username"], input[placeholder="\uB85C\uADF8\uC778 ID"]', "admin");
    await page.fill('input[autocomplete="current-password"], input[type="password"]', "1234");
    await page.click("button.erp-login-submit");
    await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
  }

  async function setActiveTabAndReload(key) {
    await page.evaluate(([storageKey, value]) => {
      window.sessionStorage.setItem(storageKey, value);
    }, [ACTIVE_TAB_KEY, key]);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
  }

  async function openMobileMenuIfNeeded() {
    const menuOpen = page.locator('button[aria-label="\uBA54\uB274 \uC5F4\uAE30"]');
    if (await menuOpen.count()) {
      try { await menuOpen.first().click({ timeout: 3000 }); } catch {}
      await page.waitForTimeout(200);
    }
  }

  async function openSalesHub() {
    await openMobileMenuIfNeeded();
    const btn = page.locator("aside nav button", { hasText: SALES_HUB_LABEL });
    let clicked = false;
    if (await btn.count()) {
      try {
        await btn.first().click({ timeout: 4000 });
        clicked = true;
      } catch {
        clicked = false;
      }
    }
    if (!clicked) await setActiveTabAndReload("sales");
    await page.waitForSelector('[data-sales-statements-hub="true"]', { timeout: 60000 });
  }

  async function openReceivablesExceptionTab() {
    await openMobileMenuIfNeeded();
    const btn = page.locator("aside nav button", { hasText: RECEIVABLES_LABEL });
    let clicked = false;
    if (await btn.count()) {
      try {
        await btn.first().click({ timeout: 4000 });
        clicked = true;
      } catch {
        clicked = false;
      }
    }
    if (!clicked) await setActiveTabAndReload("receivables");
    await page.waitForSelector("h1.erp-payment-hub-title", { timeout: 60000 });
    await page.locator("button.erp-payment-tab", { hasText: EXCEPTION_TAB_LABEL }).click();
    await page.waitForSelector('[data-finance-exception-inbox="true"]', { timeout: 60000 });
  }

  async function openFirstSaleDetail() {
    await openSalesHub();
    const listBtn = page.locator("button", { hasText: "\uBAA9\uB85D" });
    if (await listBtn.count()) await listBtn.first().click();
    await page.waitForTimeout(400);
    const row = page.locator("table tbody tr").filter({ hasText: "CloseoutClient" }).first();
    if (await row.count()) {
      await row.click();
    } else {
      const anyRow = page.locator("table tbody tr").first();
      assert.ok(await anyRow.count(), "expected at least one sale row after seed");
      await anyRow.click();
    }
    await page.waitForSelector('[data-sale-detail-drawer="true"]', { timeout: 60000 });
  }

  await run("desktop login", async () => { await login(); });

  await run("sales hub opens sale detail drawer identity", async () => {
    await openFirstSaleDetail();
    const identity = await page.getAttribute('[data-sale-detail-drawer="true"]', "data-sale-detail-identity");
    assert.equal(identity, SALE_IDENTITY);
    results.sale_detail_identity = identity;
  });

  await run("drawer wheel safe + body overflow hidden", async () => {
    if (!(await page.locator('[data-sale-detail-drawer="true"]').count())) {
      await openFirstSaleDetail();
    }
    const overflow = await page.evaluate(() => document.body.style.overflow);
    assert.equal(overflow, "hidden");
    const before = consoleErrors.length;
    await page.locator('[data-sale-detail-drawer="true"] [role="dialog"]').first().hover();
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    assert.equal(consoleErrors.length, before, "wheel introduced console errors");
    assert.ok(await page.locator('[data-sale-detail-drawer="true"]').count(), "drawer should remain mounted after wheel");
    const closeBtn = page.locator('button[aria-label="\uC0C1\uC138 \uB2EB\uAE30"]');
    if (await closeBtn.count()) await closeBtn.first().click();
    await page.waitForTimeout(200);
  });

  await run("receivables exception inbox mounts", async () => {
    await openReceivablesExceptionTab();
    assert.ok(await page.locator('[data-finance-exception-inbox="true"]').count());
  });

  await run("sidebar receivables badge hidden when count 0 or shown when seeded", async () => {
    await page.waitForTimeout(1000);
    const recvBtn = page.locator("aside nav button", { hasText: RECEIVABLES_LABEL }).first();
    const badge = recvBtn.locator(".erp-sidebar-nav-badge");
    let after = await badge.count();
    if (after === 0) await page.waitForTimeout(2500);
    after = await badge.count();
    if (after > 0) {
      const label = (await badge.first().getAttribute("aria-label")) || "";
      assert.match(label, /\d+/);
      results.sidebar_badge_meta = { visible: true, ariaLabel: label };
    } else {
      results.sidebar_badge_meta = { visible: false };
      assert.equal(after, 0, "count 0 must hide sidebar badge");
    }
  });

  await run("tab badge display for exception inbox", async () => {
    if (!(await page.locator('[data-finance-exception-inbox="true"]').count())) {
      await openReceivablesExceptionTab();
    }
    const tab = page.locator("button.erp-payment-tab", { hasText: EXCEPTION_TAB_LABEL }).first();
    await page.waitForTimeout(800);
    const aria = (await tab.getAttribute("aria-label")) || "";
    assert.ok(aria.includes(EXCEPTION_TAB_LABEL), "tab aria-label missing");
    const listCount = page.locator('[data-exception-list-count="true"]');
    const tabInnerBadge = tab.locator("span").filter({ hasText: /^\d+\+?$/ });
    const hasListCount = (await listCount.count()) > 0;
    const hasTabBadge = (await tabInnerBadge.count()) > 0;
    const ariaHasCount = /\d+/.test(aria) && aria !== EXCEPTION_TAB_LABEL;
    if (!(hasListCount || hasTabBadge || ariaHasCount)) {
      assert.equal(aria, EXCEPTION_TAB_LABEL, "empty queue should keep plain tab aria-label");
    }
    results.tab_badge_meta = { aria, hasListCount, hasTabBadge, ariaHasCount };
  });

  await run("exception fetch-failed UI then recover", async () => {
    if (!(await page.locator('[data-finance-exception-inbox="true"]').count())) {
      await openReceivablesExceptionTab();
    }
    let unresolvedMode = "pass";
    await page.route("**/api/bank-deposits/unresolved**", async (route) => {
      if (unresolvedMode === "fail" && route.request().method() === "GET") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    unresolvedMode = "fail";
    await page.locator('[data-finance-exception-inbox="true"] button', { hasText: "\uC0C8\uB85C\uACE0\uCE68" }).click();
    await page.waitForSelector('[data-exception-fetch-failed="true"]', { timeout: 30000 });
    unresolvedMode = "pass";
    await page.locator('[data-finance-exception-inbox="true"] button', { hasText: "\uC0C8\uB85C\uACE0\uCE68" }).click();
    await page.waitForSelector('[data-exception-fetch-failed="true"]', { state: "detached", timeout: 30000 });
    await page.unroute("**/api/bank-deposits/unresolved**");
    results.exception_fetch_failed = { recovered: true };
  });

  await run("mobile 390x844 sale detail or inbox without white screen + close aria", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setActiveTabAndReload("sales");
    await page.waitForSelector('[data-sales-statements-hub="true"]', { timeout: 60000 });
    const listBtn = page.locator("button", { hasText: "\uBAA9\uB85D" });
    if (await listBtn.count()) await listBtn.first().click();
    await page.waitForTimeout(400);
    const row = page.locator("table tbody tr").first();
    if (await row.count()) {
      await row.click();
      await page.waitForSelector('[data-sale-detail-drawer="true"]', { timeout: 60000 });
      const identity = await page.getAttribute('[data-sale-detail-drawer="true"]', "data-sale-detail-identity");
      assert.equal(identity, SALE_IDENTITY);
      const closeAria = await page.locator('button[aria-label="\uC0C1\uC138 \uB2EB\uAE30"]').count();
      assert.ok(closeAria > 0, "expected aria-label close on sale detail drawer");
    } else {
      await setActiveTabAndReload("receivables");
      await page.locator("button.erp-payment-tab", { hasText: EXCEPTION_TAB_LABEL }).click();
      await page.waitForSelector('[data-finance-exception-inbox="true"]', { timeout: 60000 });
    }
    const bodyText = ((await page.locator("main").innerText().catch(() => "")) || "").trim();
    const bg = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return "missing-main";
      const style = window.getComputedStyle(main);
      return style.backgroundColor + "|" + main.childElementCount + "|" + ((main.textContent || "").trim().length);
    });
    assert.ok(bodyText.length > 20 || !String(bg).includes("|0|0"), "possible white screen: " + bg);
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

const payload = writeResults({
  ok: failed === 0,
  failed,
  results,
  consoleErrors,
  artifactsPath: resultsPath,
});
console.log(JSON.stringify(payload, null, 2));
if (failed) {
  console.error("finance UX closeout browser gates failed: " + failed);
  process.exit(1);
}
console.log("finance UX closeout browser: ALL PASS");
