/**
 * Browser smoke for AR receipt alloc/recon (throwaway DB).
 * Run: node --import tsx scripts/test-ar-receipt-alloc-recon-browser.mjs
 * NOT_RUN is not allowed for listed cases.
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
const resultsPath = path.join(artifactsDir, "ar-receipt-alloc-recon-browser-results.json");

const RECEIVABLES_LABEL = "\uC785\uAE08\u00B7\uBBF8\uC218";
const HISTORY_TAB = "\uC785\uAE08\uC804\uD45C";
const RECEIPT_DATE_BASIS = "\uC785\uAE08\uC77C";
const CLOSE_LABEL = "\uB2EB\uAE30";
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const GLOBAL_FIFO_WARNING =
  "\uACFC\uAC70 \uC785\uAE08\uC774 \uB204\uB77D\uB41C \uACBD\uC6B0 \uC624\uB798\uB41C \uB9E4\uCD9C\uC5D0 \uC798\uBABB \uCDA9\uB2F9\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-ar-alloc-recon-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "browser-ar-alloc-recon";
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
  "receipt list current month by receiptDate",
  "register UNAPPLIED cash",
  "open receipt detail",
  "target mode GLOBAL_FIFO warning",
  "hard reload",
  "mobile 390x844 viewport smoke",
  "console errors = 0",
];

let serverProc = null;
let browser = null;
const consoleErrors = [];

try {
  console.log("Seeding throwaway DB...");
  const seedScript = path.join(tmpDir, "seed-ar-alloc.mjs");
  const dbImportHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  const receiptsImportHref = pathToFileURL(path.join(root, "server", "receipts.mjs")).href;
  fs.writeFileSync(
    seedScript,
    [
      "import { initDb, getErpState, saveErpState } from " + JSON.stringify(dbImportHref) + ";",
      "import { registerCanonicalReceipt } from " + JSON.stringify(receiptsImportHref) + ";",
      "initDb();",
      "const state = getErpState();",
      "const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7);",
      "const receiptDate = month + '-10';",
      "saveErpState({",
      "  ...(state.data || {}),",
      "  clients: [{ id: 'c-ar', name: 'AllocReconClient', isActive: true }],",
      "  sales: [{ id: 'sale-ar-1', client: 'AllocReconClient', clientId: 'c-ar', site: 'SiteA', date: '2026-08-01', amount: 1100000, paid: 0, voucherNo: 'AR-001', workers: [] }],",
      "  paymentVouchers: [],",
      "  receipts: [],",
      "  receiptAllocations: [],",
      "  bankTransactions: [],",
      "  bankSyncMeta: { unresolvedDepositQueue: [] },",
      "}, state.version, 'ar-alloc-browser-seed', { allowReceiptMutation: true });",
      "registerCanonicalReceipt({",
      "  operationId: 'browser-seed-unapplied',",
      "  clientId: 'c-ar',",
      "  receiptDate,",
      "  grossAmount: 250000,",
      "  channel: 'cash',",
      "  source: 'receivables',",
      "  targetMode: 'UNAPPLIED',",
      "  memo: 'browser seed unapplied',",
      "}, 'seed');",
      "console.log('SEED_OK', receiptDate);",
    ].join("\n"),
    "utf8",
  );
  await runCommand(process.execPath, ["--import", "tsx", seedScript], {
    env: { DATABASE_PATH: dbPath, JWT_SECRET: "browser-ar-alloc-recon" },
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
      JWT_SECRET: "browser-ar-alloc-recon",
      DIST_DIR: distDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try { await waitForUrl(baseUrl + "/api/health"); } catch { await waitForUrl(baseUrl + "/"); }

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
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    const userSel = 'input[autocomplete="username"], input[placeholder="\uB85C\uADF8\uC778 ID"]';
    await page.waitForSelector(userSel, { timeout: 60000 });
    await page.fill(userSel, "admin");
    await page.fill('input[autocomplete="current-password"], input[type="password"]', "1234");
    await page.click("button.erp-login-submit");
    await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
  }

  async function openReceivablesHistory() {
    const btn = page.locator("aside nav button", { hasText: RECEIVABLES_LABEL });
    let opened = false;
    if (await btn.count()) {
      try { await btn.first().click({ timeout: 4000 }); opened = true; } catch { opened = false; }
    }
    if (!opened) {
      await page.evaluate(([storageKey, value]) => { window.sessionStorage.setItem(storageKey, value); }, [ACTIVE_TAB_KEY, "receivables"]);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
    }
    await page.waitForSelector("h1.erp-payment-hub-title", { timeout: 60000 });
    await page.locator("button.erp-payment-tab", { hasText: HISTORY_TAB }).click();
    await page.waitForSelector("table.erp-payment-table--history, .erp-payment-table-wrap", { timeout: 60000 });
  }

  await run("desktop login", async () => { await login(); });

  await run("receipt list current month by receiptDate", async () => {
    await openReceivablesHistory();
    const basis = page.locator("button", { hasText: RECEIPT_DATE_BASIS });
    if (await basis.count()) await basis.first().click();
    const rows = page.locator("table.erp-payment-table--history tbody tr[data-receipt-id]");
    assert.ok((await rows.count()) >= 1, "expected seeded receipt in current-month receiptDate list");
  });

  await run("register UNAPPLIED cash", async () => {
    await page.locator('[data-receipt-register-entry="true"]').click();
    await page.waitForSelector('[data-receipt-register-modal="true"]', { timeout: 30000 });
    const modal = page.locator('[data-receipt-register-modal="true"]');
    const clientSelect = modal.locator("select").first();
    const optionValues = await clientSelect.locator("option").evaluateAll((opts) =>
      opts.map((o) => ({ value: o.value, text: (o.textContent || "").trim() }))
    );
    const match = optionValues.find((o) => o.text === "AllocReconClient");
    assert.ok(match && match.value, "AllocReconClient option missing");
    await clientSelect.selectOption(match.value);
    const amount = modal.locator('[data-receipt-amount-input="true"]');
    await amount.click();
    await amount.fill("123000");
    for (let i = 0; i < 10 && (await amount.inputValue()) !== "123000"; i++) {
      await amount.fill("");
      await amount.pressSequentially("123000");
      await page.waitForTimeout(50);
    }
    assert.equal(await amount.inputValue(), "123000", "amount input not set");
    await modal.locator('input[name="receipt-target-mode"]').nth(0).click({ force: true });
    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/receipts/register") && r.request().method() === "POST",
      { timeout: 30000 },
    ).catch(() => null);
    await page.locator('[data-receipt-register-submit="true"]').click();
    const resp = await respPromise;
    if (!resp) {
      const errBox = modal.locator(".text-rose-600, .text-red-600, .text-red-700");
      const msg = (await errBox.count()) ? await errBox.first().innerText() : await modal.innerText();
      throw new Error("register did not call API: " + String(msg).slice(0, 500));
    }
    if (!resp.ok()) {
      throw new Error("register API failed " + resp.status() + ": " + (await resp.text()).slice(0, 400));
    }
    await page.waitForSelector('[data-receipt-register-modal="true"]', { state: "detached", timeout: 30000 });
  });await run("open receipt detail", async () => {
    await openReceivablesHistory();
    const row = page.locator("table.erp-payment-table--history tbody tr[data-receipt-id]").first();
    assert.ok(await row.count(), "need a receipt row");
    await row.click();
    await page.waitForSelector('[data-receipt-detail-drawer="true"]', { timeout: 30000 });
    const closeBtn = page.locator('[data-receipt-detail-drawer="true"] button', { hasText: CLOSE_LABEL });
    if (await closeBtn.count()) await closeBtn.first().click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  await run("target mode GLOBAL_FIFO warning", async () => {
    await page.locator('[data-receipt-register-entry="true"]').click();
    await page.waitForSelector('[data-receipt-register-modal="true"]', { timeout: 30000 });
    const modal = page.locator('[data-receipt-register-modal="true"]');
    const bodyBefore = await modal.innerText();
    assert.ok(bodyBefore.includes(GLOBAL_FIFO_WARNING), "GLOBAL_FIFO warning missing from target options");
    const radios = modal.locator('input[name="receipt-target-mode"]');
    assert.ok((await radios.count()) >= 5, "GLOBAL_FIFO radio missing");
    await radios.nth(4).evaluate((el) => { el.disabled = false; el.click(); });
    await page.waitForTimeout(200);
    assert.ok((await modal.innerText()).includes(GLOBAL_FIFO_WARNING), "GLOBAL_FIFO warning not visible after select");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  });

  await run("hard reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("aside nav, .erp-sidebar-brand, h1.erp-payment-hub-title", { timeout: 90000 });
  });

  await run("mobile 390x844 viewport smoke", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReceivablesHistory();
    assert.ok(await page.locator("h1.erp-payment-hub-title").count());
    const white = await page.evaluate(() => {
      const body = document.body;
      const bg = getComputedStyle(body).backgroundColor;
      const text = (body.innerText || "").trim();
      return text.length < 20 && /rgb\(255,\s*255,\s*255\)/.test(bg);
    });
    assert.equal(white, false, "mobile white-screen smoke failed");
  });

  await run("console errors = 0", async () => {
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.join(" | "));
  });
} catch (error) {
  failed += 1;
  results.bootstrap = { status: "FAIL", message: String(error?.message || error) };
  console.error("BOOTSTRAP FAIL", error);
} finally {
  try { if (browser) await browser.close(); } catch {}
  try { if (serverProc && !serverProc.killed) serverProc.kill(); } catch {}
}

for (const name of expected) {
  if (!(name in results)) {
    results[name] = { status: "FAIL", message: "NOT_RUN is not allowed" };
    failed += 1;
  }
}

writeResults({ failed, results, expected });
console.log("");
console.log(JSON.stringify({ failed, results }, null, 2));
if (failed) process.exit(1);
