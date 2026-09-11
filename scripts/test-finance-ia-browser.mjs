/**
 * Finance IA browser gates (real SPA + throwaway DB/server).
 * Run: node --import tsx scripts/test-finance-ia-browser.mjs
 *
 * Bootstrap mirrors scripts/test-canonical-finance-browser.mjs (temp DB + Playwright Chromium)
 * and extends it with a local throwaway API that serves a built SPA so sidebar/login can be asserted.
 * NOT_RUN is not allowed — server/build failures exit 1.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifactsDir = path.join(root, "artifacts");
const resultsPath = path.join(artifactsDir, "finance-ia-browser-results.json");

const FINANCE_LABELS = [
  "\uB9E4\uCD9C\u00B7\uB0B4\uC5ED\uC11C",
  "\uC785\uAE08\u00B7\uBBF8\uC218",
  "\uC2DC\uACF5\uC790 \uC9C0\uAE09",
  "\uD1B5\uC7A5",
];
const FORBIDDEN_TOP_LEVEL = [
  "\uB9E4\uCD9C\uB4F1\uB85D",
  "\uB9E4\uCD9C\uC804\uD45C\uAC80\uC0C9",
  "\uC804\uD45C \uCF54\uBA58\uD2B8",
];
const STATEMENTS_LABEL = "\uB0B4\uC5ED\uC11C";
const RECEIVABLES_LABEL = FINANCE_LABELS[1];
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-finance-ia-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "browser-finance-ia";
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
    /favicon\\.ico/i.test(t) ||
    /ResizeObserver loop/i.test(t) ||
    /Failed to load resource: net::ERR_/i.test(t) ||
    /Failed to load resource: the server responded with a status of (404|500)/i.test(t) ||
    /\\[vite\\]/i.test(t)
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

let serverProc = null;
let browser = null;
const consoleErrors = [];

const expected = [
  "desktop login",
  "sidebar shows exactly the 4 finance labels and hides legacy top-level",
  "legacy statements key to sales hub",
  "legacy salesInput key to sales hub",
  "receivables title hub",
  "worker payments AP inactive notice + disbursement write disabled",
  "accounting bank via bankTransactions redirect",
  "mobile viewport 390x844 reaches 4 finance menus without white screen",
  "console errors = 0",
];

try {
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
      JWT_SECRET: "browser-finance-ia",
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

  async function sidebarLabels() {
    return page.locator("aside nav button span.min-w-0").allTextContents();
  }

  async function setActiveTabAndReload(key) {
    await page.evaluate(([storageKey, value]) => {
      window.sessionStorage.setItem(storageKey, value);
    }, [ACTIVE_TAB_KEY, key]);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
  }

  await run("desktop login", async () => { await login(); });

  await run("sidebar shows exactly the 4 finance labels and hides legacy top-level", async () => {
    const labels = await sidebarLabels();
    for (const label of FINANCE_LABELS) assert.ok(labels.includes(label), "missing finance label: " + label);
    for (const label of FORBIDDEN_TOP_LEVEL) assert.ok(!labels.includes(label), "legacy top-level still visible: " + label);
    assert.ok(!labels.includes(STATEMENTS_LABEL), "statements still a separate sidebar item");
    const financeHits = labels.filter((label) => FINANCE_LABELS.includes(label));
    assert.equal(financeHits.length, 4, "expected 4 finance labels, got " + financeHits.join(","));
  });

  await run("legacy statements key to sales hub", async () => {
    await setActiveTabAndReload("statements");
    await page.waitForSelector('[data-sales-statements-hub="true"]', { timeout: 60000 });
    assert.match((await page.locator("h1").first().textContent()) || "", new RegExp(FINANCE_LABELS[0]));
  });

  await run("legacy salesInput key to sales hub", async () => {
    await setActiveTabAndReload("salesInput");
    await page.waitForSelector('[data-sales-statements-hub="true"]', { timeout: 60000 });
  });

  await run("receivables title hub", async () => {
    const clicked = await page.locator("aside nav button", { hasText: RECEIVABLES_LABEL }).count();
    if (clicked) await page.locator("aside nav button", { hasText: RECEIVABLES_LABEL }).click();
    else await setActiveTabAndReload("receivables");
    await page.waitForSelector("h1.erp-payment-hub-title", { timeout: 60000 });
    assert.match((await page.locator("h1.erp-payment-hub-title").first().textContent()) || "", new RegExp(RECEIVABLES_LABEL));
    const inputTab = page.locator("button.erp-payment-tab", { hasText: "입금전표" });
    if (await inputTab.count()) await inputTab.click();
    await page.waitForSelector('[data-receipt-register-entry="true"]', { timeout: 30000 });
    await page.click('[data-receipt-register-entry="true"]');
    await page.waitForSelector('[data-receipt-register-modal="true"]', { timeout: 30000 });
    results.receipt_register_entry_meta = { entryPresent: true, modalPresent: true };
    const closeBtn = page.locator('[data-receipt-register-modal="true"] button', { hasText: /닫기|취소/ });
    if (await closeBtn.count()) await closeBtn.first().click();
  });

  await run("paymentInput session restore to receivables", async () => {
    await setActiveTabAndReload("paymentInput");
    await page.waitForSelector("h1.erp-payment-hub-title", { timeout: 60000 });
    assert.match((await page.locator("h1.erp-payment-hub-title").first().textContent()) || "", new RegExp(RECEIVABLES_LABEL));
  });

  await run("worker payments AP inactive notice + disbursement write disabled", async () => {
    await setActiveTabAndReload("workerPayments");
    await page.waitForSelector('[data-ap-inactive-hub-notice="true"]', { timeout: 60000 });
    const notice = (await page.locator('[data-ap-inactive-hub-notice="true"]').textContent()) || "";
    assert.match(notice, new RegExp("\uC2E0\uADDC \uC9C0\uAE09 \uC6D0\uC7A5 \uD65C\uC131\uD654 \uC804|\uC774\uC804 \uC9C0\uAE09"));
    assert.ok(await page.locator('[data-disbursement-register-entry="true"]').count());
    await page.click('[data-disbursement-register-entry="true"]');
    await page.waitForSelector('[data-disbursement-register-modal="true"]', { timeout: 30000 });
    const modalText = (await page.locator('[data-disbursement-register-modal="true"]').textContent()) || "";
    assert.match(modalText, new RegExp("\uD65C\uC131\uD654 \uC804|\uC800\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4|\uCEE7\uC624\uBC84"));
    const submit = page.locator('[data-disbursement-register-submit="true"]');
    if (await submit.count()) assert.ok(await submit.isDisabled(), "disbursement submit should be disabled while write OFF");
  });

  await run("accounting bank via bankTransactions redirect", async () => {
    await setActiveTabAndReload("bankTransactions");
    await page.waitForSelector("h1, .erp-accounting-hub-page", { timeout: 60000 });
    assert.match((await page.locator("h1").first().textContent()) || "", new RegExp(FINANCE_LABELS[3]));
  });

  await run("mobile viewport 390x844 reaches 4 finance menus without white screen", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('button[aria-label="\uBA54\uB274 \uC5F4\uAE30"], aside nav', { timeout: 90000 });
    if (await page.locator('button[aria-label="\uBA54\uB274 \uC5F4\uAE30"]').count()) {
      await page.click('button[aria-label="\uBA54\uB274 \uC5F4\uAE30"]');
    }
    await page.waitForSelector("aside nav button", { timeout: 30000 });
    const labels = await sidebarLabels();
    for (const label of FINANCE_LABELS) assert.ok(labels.includes(label), "mobile missing finance label: " + label);
    await page.locator("aside nav button", { hasText: RECEIVABLES_LABEL }).click();
    await page.waitForTimeout(500);
    const bodyText = ((await page.locator("main").innerText().catch(() => "")) || "").trim();
    const bg = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return "missing-main";
      const style = window.getComputedStyle(main);
      return style.backgroundColor + "|" + main.childElementCount + "|" + ((main.textContent || "").trim().length);
    });
    assert.ok(bodyText.length > 20 || !String(bg).includes("|0|0"), "possible white screen: " + bg);
    assert.ok(!labels.includes(FORBIDDEN_TOP_LEVEL[0]));
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
  console.error("finance IA browser gates failed: " + failed);
  process.exit(1);
}
console.log("finance IA browser: ALL PASS");
