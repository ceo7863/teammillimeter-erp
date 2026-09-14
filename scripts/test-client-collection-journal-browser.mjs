/**
 * Browser smoke for client collection journal (throwaway DB).
 * Run: node --import tsx scripts/test-client-collection-journal-browser.mjs
 * NOT_RUN is not allowed for listed cases. Hangul via \\u escapes only.
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
const resultsPath = path.join(artifactsDir, "client-collection-journal-browser-results.json");

const RECEIVABLES_LABEL = "\uC785\uAE08\u00B7\uBBF8\uC218";
const JOURNAL_TAB = "\uC218\uAE08\uC6D0\uC7A5";
const FILTER_RECEIPTS = "\uC2E4\uC81C \uC785\uAE08\uB9CC";
const FILTER_ADJUSTMENTS = "\uBBF8\uC218\uC870\uC815\uB9CC";
const FILTER_SALES = "\uB9E4\uCD9C\uB9CC";
const CLOSE_LABEL = "\uB2EB\uAE30";
const CLIENT_NAME = "JournalBrowserClient";
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-collection-journal-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "browser-collection-journal";
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
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      out += d.toString();
    });
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
    /bank-deposits\/unresolved/i.test(t) ||
    /bank-deposits\/classification-coverage/i.test(t)
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
  "open receivables then journal tab",
  "month summary visible",
  "filter receipts only",
  "filter adjustments only",
  "filter sales only",
  "click receipt row",
  "hard reload",
  "desktop 1280 viewport",
  "mobile 390x844 viewport smoke",
  "no infinite loading",
  "console errors = 0",
];

let serverProc = null;
let browser = null;
const consoleErrors = [];

try {
  console.log("Seeding throwaway DB...");
  const seedScript = path.join(tmpDir, "seed-collection-journal.mjs");
  const dbImportHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  const receiptsImportHref = pathToFileURL(path.join(root, "server", "receipts.mjs")).href;
  const adjImportHref = pathToFileURL(path.join(root, "server", "arAdjustments.mjs")).href;
  fs.writeFileSync(
    seedScript,
    [
      "import { initDb, getErpState, saveErpState } from " + JSON.stringify(dbImportHref) + ";",
      "import { createAndPostReceipt } from " + JSON.stringify(receiptsImportHref) + ";",
      "import { createArAdjustment } from " + JSON.stringify(adjImportHref) + ";",
      "initDb();",
      "const state = getErpState();",
      "const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7);",
      "const saleDate = month + '-05';",
      "const receiptDate = month + '-12';",
      "const adjDate = month + '-15';",
      "saveErpState({",
      "  ...(state.data || {}),",
      "  clients: [{ id: 'c-journal', name: 'JournalBrowserClient', isActive: true }],",
      "  sales: [{ id: 'sale-journal-1', client: 'JournalBrowserClient', clientId: 'c-journal', site: 'SiteJ', date: saleDate, amount: 1000000, paid: 0, basePaid: 0, voucherNo: 'JB-001', workers: [] }],",
      "  paymentVouchers: [],",
      "  receipts: [],",
      "  receiptAllocations: [],",
      "  arAdjustments: [],",
      "  arAdjustmentEvents: [],",
      "  bankTransactions: [],",
      "  bankSyncMeta: { unresolvedDepositQueue: [] },",
      "}, state.version, 'collection-journal-browser-seed', { allowReceiptMutation: true, allowArAdjustmentMutation: true });",
      "createAndPostReceipt({",
      "  operationId: 'browser-journal-cash',",
      "  clientId: 'c-journal',",
      "  receiptDate,",
      "  grossAmount: 400000,",
      "  channel: 'cash',",
      "  source: 'receivables',",
      "  allocations: [{ saleId: 'sale-journal-1', amount: 400000 }],",
      "}, 'seed');",
      "createArAdjustment({",
      "  operationId: 'browser-journal-adj',",
      "  clientId: 'c-journal',",
      "  effectiveDate: adjDate,",
      "  adjustmentType: 'CREDIT_AR_ADJUSTMENT',",
      "  amount: 50000,",
      "  memo: 'browser journal adj',",
      "  targets: [{ saleId: 'sale-journal-1', amount: 50000 }],",
      "}, 'seed');",
      "console.log('SEED_OK', month, saleDate, receiptDate, adjDate);",
    ].join("\n"),
    "utf8",
  );
  await runCommand(process.execPath, ["--import", "tsx", seedScript], {
    env: { DATABASE_PATH: dbPath, JWT_SECRET: "browser-collection-journal" },
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
      JWT_SECRET: "browser-collection-journal",
      DIST_DIR: distDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForUrl(baseUrl + "/api/health");
  } catch {
    await waitForUrl(baseUrl + "/");
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    const userSel = 'input[autocomplete="username"], input[placeholder="\uB85C\uADF8\uC778 ID"]';
    await page.waitForSelector(userSel, { timeout: 60000 });
    await page.fill(userSel, "admin");
    await page.fill('input[autocomplete="current-password"], input[type="password"]', "1234");
    await page.click("button.erp-login-submit");
    await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
  }

  async function openReceivables() {
    const btn = page.locator("aside nav button", { hasText: RECEIVABLES_LABEL });
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
        [ACTIVE_TAB_KEY, "receivables"],
      );
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
    }
    await page.waitForSelector("h1.erp-payment-hub-title", { timeout: 60000 });
  }

  async function openJournalTab() {
    await page.locator("button.erp-payment-tab", { hasText: JOURNAL_TAB }).click();
    await page.waitForSelector('[data-client-collection-journal="true"]', { timeout: 60000 });
  }

  async function selectClientAndWait() {
    const panel = page.locator('[data-client-collection-journal="true"]');
    const input = panel.locator("input").first();
    await input.click();
    await input.fill(CLIENT_NAME);
    await page.waitForTimeout(200);
    const option = page.locator("text=" + CLIENT_NAME).first();
    if (await option.count()) {
      try {
        await option.click({ timeout: 2000 });
      } catch {}
    }
    await page.waitForFunction(
      () => !document.querySelector('[data-journal-loading="true"]'),
      null,
      { timeout: 60000 },
    );
    await page.waitForSelector('[data-journal-row="true"]', { timeout: 60000 });
  }

  async function setFilter(label) {
    const select = page.locator('select[aria-label="' + JOURNAL_TAB + ' \uD544\uD130"]');
    assert.ok(await select.count(), "journal filter select missing");
    await select.selectOption({ label });
    await page.waitForFunction(
      () => !document.querySelector('[data-journal-loading="true"]'),
      null,
      { timeout: 60000 },
    );
  }

  await run("desktop login", async () => {
    await login();
  });

  await run("open receivables then journal tab", async () => {
    await openReceivables();
    await openJournalTab();
    await selectClientAndWait();
  });

  await run("month summary visible", async () => {
    const monthly = page.locator('[data-journal-monthly-summary="true"], [data-collection-journal-monthly="true"]');
    assert.ok((await monthly.count()) >= 1, "month summary missing");
    assert.ok(await page.locator('[data-journal-row="true"]').count(), "journal rows missing");
  });

  await run("filter receipts only", async () => {
    await setFilter(FILTER_RECEIPTS);
    const types = await page.locator("[data-journal-entry-type]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-journal-entry-type") || ""),
    );
    assert.ok(types.length >= 1, "expected receipt rows");
    assert.ok(
      types.every((t) => String(t).startsWith("RECEIPT_")),
      "non-receipt in receipts filter: " + types.join(","),
    );
  });

  await run("filter adjustments only", async () => {
    await setFilter(FILTER_ADJUSTMENTS);
    const types = await page.locator("[data-journal-entry-type]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-journal-entry-type") || ""),
    );
    assert.ok(types.length >= 1, "expected adjustment rows");
    assert.ok(
      types.every((t) => /ADJUSTMENT|OPENING/i.test(t)),
      "non-adjustment in adjustments filter: " + types.join(","),
    );
  });

  await run("filter sales only", async () => {
    await setFilter(FILTER_SALES);
    const types = await page.locator("[data-journal-entry-type]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-journal-entry-type") || ""),
    );
    assert.ok(types.length >= 1, "expected sale rows");
    assert.ok(types.some((t) => t === "SALE"), "expected at least one SALE row");
    assert.ok(
      types.every((t) => t === "SALE" || t === "OPENING"),
      "non-sale in sales filter: " + types.join(","),
    );
    assert.ok(!types.some((t) => String(t).startsWith("RECEIPT_")), "receipts should be hidden");
  });

  await run("click receipt row", async () => {
    await setFilter(FILTER_RECEIPTS);
    const receiptRow = page.locator('[data-journal-row="true"][data-journal-ref-kind="receipt"]').first();
    assert.ok(await receiptRow.count(), "receipt journal row missing");
    await receiptRow.click();
    await page.waitForSelector('[data-receipt-detail-drawer="true"]', { timeout: 30000 });
    const closeBtn = page.locator('[data-receipt-detail-drawer="true"] button', { hasText: CLOSE_LABEL });
    if (await closeBtn.count()) await closeBtn.first().click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  await run("hard reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("aside nav, .erp-sidebar-brand, h1.erp-payment-hub-title", {
      timeout: 90000,
    });
  });

  await run("desktop 1280 viewport", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openReceivables();
    await openJournalTab();
    await selectClientAndWait();
    assert.ok(await page.locator('[data-client-collection-journal="true"]').count());
  });

  await run("mobile 390x844 viewport smoke", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReceivables();
    await openJournalTab();
    await selectClientAndWait();
    const white = await page.evaluate(() => {
      const body = document.body;
      const bg = getComputedStyle(body).backgroundColor;
      const text = (body.innerText || "").trim();
      return text.length < 20 && /rgb\(255,\s*255,\s*255\)/.test(bg);
    });
    assert.equal(white, false, "mobile white-screen smoke failed");
  });

  await run("no infinite loading", async () => {
    const loadingVisible = await page.locator('[data-journal-loading="true"]').count();
    assert.equal(loadingVisible, 0, "journal still showing loading indicator");
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-journal-loading="true"]').count(), 0, "loading reappeared");
    assert.ok(await page.locator('[data-journal-row="true"]').count(), "rows disappeared after wait");
  });

  await run("console errors = 0", async () => {
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.join(" | "));
  });
} catch (error) {
  failed += 1;
  results.bootstrap = { status: "FAIL", message: String(error?.message || error) };
  console.error("BOOTSTRAP FAIL", error);
} finally {
  try {
    if (browser) await browser.close();
  } catch {}
  try {
    if (serverProc && !serverProc.killed) serverProc.kill();
  } catch {}
}

let requiredNotRunCount = 0;
for (const name of expected) {
  if (!(name in results)) {
    results[name] = { status: "FAIL", message: "NOT_RUN is not allowed" };
    failed += 1;
    requiredNotRunCount += 1;
  }
}

writeResults({ failed, requiredNotRunCount, results, expected });
console.log("");
console.log(JSON.stringify({ failed, requiredNotRunCount, results }, null, 2));
if (failed) process.exit(1);