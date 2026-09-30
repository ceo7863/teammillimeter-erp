/**
 * Bank · calendar · 입금·미수 · report parity across two live sessions (Chromium).
 * Run: node --import tsx scripts/test-bank-calendar-parity-browser.mjs
 *
 * Session A changes the canonical ledger through the Receipt APIs; session B (and a mobile
 * session) must show the same conclusion on every screen without reloading, then again
 * after a hard reload. A bank link alone never paints a sale green.
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
const resultsPath = path.join(artifactsDir, "bank-calendar-parity-browser-results.json");
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const ACCOUNTING_TAB_KEY = "teammillimeter-erp-accounting-tab";
const TOKEN_KEY = "teammillimeter-erp-token";
const JWT = "browser-bank-calendar-parity";
const PEER_TARGET_MS = 5000;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-bank-cal-parity-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
fs.mkdirSync(artifactsDir, { recursive: true });

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const MONTH = TODAY.slice(0, 7);
const DAY1 = `${MONTH}-01`;
const DAY2 = TODAY === DAY1 ? DAY1 : `${MONTH}-02`;
const CLIENT = { id: 901, name: "인디퍼" };
const TX_ID = "btx-parity-1";
const SITE1 = "패리티A현장";
const SITE2 = "패리티B현장";

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

// The throwaway server has no Barobill credentials, so the scrap-status probe fails before any
// provider call. Production has credentials; everything else must stay error-free.
const isHarnessOnlyFailure = (url) => /\/api\/barobill\//.test(String(url || ""));

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

async function openPage(page, key, readySelector, extra = {}) {
  await page.evaluate(
    ([tabKey, value, accKey, accValue]) => {
      window.sessionStorage.setItem(tabKey, value);
      if (accValue) window.sessionStorage.setItem(accKey, accValue);
    },
    [ACTIVE_TAB_KEY, key, ACCOUNTING_TAB_KEY, extra.accountingTab || ""],
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("aside nav, .erp-sidebar-brand", { timeout: 90000 });
  if (readySelector) await page.waitForSelector(readySelector, { timeout: 90000 });
  await waitForStream(page);
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

/** Calendar entry tone class for a site, desktop grid. */
function entryTone({ site }) {
  const entry = Array.from(document.querySelectorAll(".erp-calendar-cell-entry")).find((el) =>
    (el.textContent || "").includes(site),
  );
  if (!entry) return null;
  const cls = entry.className;
  return {
    tone: cls.includes("is-neutral") ? "NEUTRAL" : cls.includes("is-unpaid") ? "RED" : cls.includes("is-partial-paid") ? "AMBER" : "GREEN",
    credit: cls.includes("has-unapplied-credit"),
  };
}

async function readTones(page) {
  return page.evaluate(
    ([s1, s2, fnSrc]) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${fnSrc})`)();
      return { s1: fn({ site: s1 }), s2: fn({ site: s2 }), badge: document.querySelectorAll(".erp-calendar-unapplied-credit").length };
    },
    [SITE1, SITE2, entryTone.toString()],
  );
}

async function waitTones(page, expected, timeoutMs = PEER_TARGET_MS) {
  return waitFor(
    page,
    ([s1, s2, fnSrc, want]) => {
      const fn = new Function(`return (${fnSrc})`)();
      const a = fn({ site: s1 });
      const b = fn({ site: s2 });
      const ok = a?.tone === want.s1 && b?.tone === want.s2 && (want.credit == null || Boolean(b?.credit) === want.credit);
      return { ok, a, b };
    },
    [SITE1, SITE2, entryTone.toString(), expected],
    timeoutMs,
    `calendar tones ${JSON.stringify(expected)}`,
  );
}

/**
 * Canonical deposit status of the bank row (attribute) plus its label. Once an 입금전표 exists the
 * label must be visible cell text; only the pre-receipt 거래처 확인 필요 state lives in the 찾기 tooltip.
 */
async function waitBankStatus(page, status, label, timeoutMs = PEER_TARGET_MS) {
  return waitFor(
    page,
    ([client, wantStatus, wantLabel]) => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const hit = rows.find((el) => (el.textContent || "").includes(client) && /7,700,000/.test(el.textContent || ""));
      const cell = hit?.querySelector("[data-deposit-status]");
      const got = cell?.getAttribute("data-deposit-status") || null;
      const visible = cell?.textContent || "";
      const labelText =
        wantStatus === "client_review"
          ? `${visible} ${cell?.querySelector("[title]")?.getAttribute("title") || ""}`
          : visible;
      return { ok: got === wantStatus && labelText.includes(wantLabel), got, labelText: labelText.trim().slice(0, 200) };
    },
    [CLIENT.name, status, label],
    timeoutMs,
    `bank status ${status}`,
  );
}

async function readReportCards(page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-testid="report-collection-summary"]');
    if (!grid) return null;
    const out = {};
    for (const card of Array.from(grid.children)) {
      const text = (card.textContent || "").replace(/\s+/g, " ");
      const title = ["실제입금", "매출충당(입금전표)", "미배정 선수금", "미수조정", "잔여미수"].find((t) => text.includes(t));
      const amount = text.replace(title || "", "").match(/-?\d{1,3}(?:,\d{3})*/);
      if (title) out[title] = amount ? Number(amount[0].replace(/,/g, "")) : null;
    }
    return out;
  });
}

async function waitReport(page, expected, timeoutMs = PEER_TARGET_MS) {
  return waitFor(
    page,
    (want) => {
      const grid = document.querySelector('[data-testid="report-collection-summary"]');
      if (!grid) return { ok: false, reason: "no grid" };
      const out = {};
      for (const card of Array.from(grid.children)) {
        const text = (card.textContent || "").replace(/\s+/g, " ");
        const title = ["실제입금", "매출충당(입금전표)", "미배정 선수금", "미수조정", "잔여미수"].find((t) => text.includes(t));
        const amount = text.replace(title || "", "").match(/-?\d{1,3}(?:,\d{3})*/);
        if (title) out[title] = amount ? Number(amount[0].replace(/,/g, "")) : null;
      }
      const ok = Object.entries(want).every(([k, v]) => out[k] === v);
      return { ok, out };
    },
    expected,
    timeoutMs,
    `report ${JSON.stringify(expected)}`,
  );
}

async function api(page, method, urlPath, body) {
  const token = await page.evaluate((key) => localStorage.getItem(key) || sessionStorage.getItem(key) || "", TOKEN_KEY);
  assert.ok(token, "missing token");
  const res = await fetch(baseUrl + urlPath, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  assert.ok(res.ok, `${method} ${urlPath} -> ${res.status} ${raw.slice(0, 400)}`);
  return raw ? JSON.parse(raw) : {};
}

async function shot(page, name) {
  const file = path.join(artifactsDir, `bank-cal-parity-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

try {
  const seedScript = path.join(tmpDir, "seed.mjs");
  const dbHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  const bankHref = pathToFileURL(path.join(root, "src", "utils", "bankTransactions.ts")).href;
  fs.writeFileSync(
    seedScript,
    [
      `import { initDb, getErpState, saveErpState, createUser } from ${JSON.stringify(dbHref)};`,
      `import { normalizeBankTransaction } from ${JSON.stringify(bankHref)};`,
      "initDb();",
      "for (const id of ['parityA', 'parityB', 'parityM']) createUser({ loginId: id, password: '1234', name: id, role: 'admin' });",
      "const state = getErpState();",
      "saveErpState({",
      "  ...(state.data || {}),",
      `  clients: [{ id: ${CLIENT.id}, name: ${JSON.stringify(CLIENT.name)}, isActive: true }],`,
      "  workers: [],",
      "  sales: [",
      `    { id: 'ps-1', date: '${DAY1}', client: ${JSON.stringify(CLIENT.name)}, clientId: ${CLIENT.id}, site: ${JSON.stringify(SITE1)}, amount: 4000000, paid: 0 },`,
      `    { id: 'ps-2', date: '${DAY2}', client: ${JSON.stringify(CLIENT.name)}, clientId: ${CLIENT.id}, site: ${JSON.stringify(SITE2)}, amount: 3000000, paid: 0 },`,
      "  ],",
      "  paymentVouchers: [], paymentInputLogs: [], receipts: [], receiptAllocations: [],",
      "  bankTransactions: [normalizeBankTransaction({",
      `    id: '${TX_ID}', accountNumber: '000-000000-00-000', bankName: 'IBK', balanceAfter: 0, withdrawal: 0,`,
      `    deposit: 7700000, description: '입금', counterpartyName: ${JSON.stringify(CLIENT.name)},`,
      `    transactionAt: '${TODAY}T10:00:00+09:00', createdAt: new Date().toISOString(),`,
      "  })],",
      "  bankSyncMeta: {},",
      "}, state.version, 'parity-browser-seed', { allowReceiptMutation: true, allowPaymentVoucherMutation: true });",
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
    env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, JWT_SECRET: JWT, DIST_DIR: distDir, AUTO_DEPOSIT_RECEIPT_CUTOVER_AT: "" },
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

  let receiptId = "";

  await run("A bank before: 거래처 확인 필요", async () => {
    await login(pageA, "parityA");
    await openPage(pageA, "accounting", null, { accountingTab: "bank" });
    await waitBankStatus(pageA, "client_review", "거래처 확인 필요", 30000);
    await shot(pageA, "bank-before");
  });

  await run("B calendar before: sales RED", async () => {
    await login(pageB, "parityB");
    await openPage(pageB, "calendar", ".erp-calendar-page, .erp-calendar-grid");
    await waitTones(pageB, { s1: "RED", s2: "RED", credit: false }, 15000);
    await shot(pageB, "calendar-before");
  });

  await run("partial receipt: B calendar s1 GREEN, s2 RED + 미배정 badge; A bank 부분 충당 (no reload)", async () => {
    const created = await api(pageA, "POST", `/api/bank-transactions/${TX_ID}/receipt`, {
      operationId: `bank-receipt:manual:${TX_ID}:parity`,
      clientId: CLIENT.id,
      allocations: [{ saleId: "ps-1", amount: 4_000_000 }],
    });
    receiptId = String(created.receipt?.id || "");
    assert.ok(receiptId, "receipt id");
    const peer = await waitTones(pageB, { s1: "GREEN", s2: "RED", credit: true });
    metrics.peerLatencyMs.push(peer);
    const tones = await readTones(pageB);
    assert.ok(tones.badge >= 1, "미배정 입금 있음 badge");
    await waitBankStatus(pageA, "partial", "부분 충당");
    await shot(pageB, "calendar-partial");
    await shot(pageA, "bank-partial");
  });

  await run("B 입금·미수 shows the same open balance", async () => {
    await openPage(pageB, "receivables", null);
    await waitFor(
      pageB,
      (client) => {
        const text = document.querySelector("main")?.innerText || document.body.innerText;
        return { ok: text.includes(client) && text.includes("3,000,000"), sample: text.slice(0, 400) };
      },
      CLIENT.name,
      20000,
      "receivables outstanding 3,000,000",
    );
    await shot(pageB, "receivables-partial");
  });

  await run("B reports: 실제입금 / 매출충당 / 미배정 / 잔여미수 from ledgers", async () => {
    await openPage(pageB, "reports", '[data-testid="report-collection-summary"]');
    await waitReport(pageB, { 실제입금: 7_700_000, "매출충당(입금전표)": 4_000_000, "미배정 선수금": 3_700_000, 잔여미수: 3_000_000 }, 15000);
    await shot(pageB, "reports-partial");
  });

  await run("reallocation by A updates B reports live (reallocation nets once)", async () => {
    await api(pageA, "POST", `/api/receipts/${receiptId}/allocations`, {
      operationId: "parity-realloc-1",
      effectiveDate: TODAY,
      allocations: [
        { saleId: "ps-1", amount: 4_000_000 },
        { saleId: "ps-2", amount: 3_000_000 },
      ],
    });
    const peer = await waitReport(pageB, { 실제입금: 7_700_000, "매출충당(입금전표)": 7_000_000, "미배정 선수금": 700_000, 잔여미수: 0 });
    metrics.peerLatencyMs.push(peer);
    await waitBankStatus(pageA, "partial", "부분 충당");
    await shot(pageB, "reports-reallocated");
  });

  await run("hard reload B: calendar GREEN/GREEN and reports unchanged", async () => {
    await openPage(pageB, "calendar", ".erp-calendar-page, .erp-calendar-grid");
    await waitTones(pageB, { s1: "GREEN", s2: "GREEN", credit: false }, 15000);
    await openPage(pageB, "reports", '[data-testid="report-collection-summary"]');
    const cards = await readReportCards(pageB);
    assert.deepEqual(
      { a: cards["실제입금"], b: cards["매출충당(입금전표)"], c: cards["미배정 선수금"], d: cards["잔여미수"] },
      { a: 7_700_000, b: 7_000_000, c: 700_000, d: 0 },
    );
  });

  await run("mobile 390x844 side panel shows GREEN cards", async () => {
    await login(pageM, "parityM");
    await openPage(pageM, "calendar", ".erp-calendar-page, .erp-calendar-grid");
    const cell = `[data-calendar-date="${DAY2}"]`;
    await pageM.waitForSelector(cell, { timeout: 20000 });
    await pageM.locator(cell).first().click();
    await waitFor(
      pageM,
      (site) => {
        const card = Array.from(document.querySelectorAll(".erp-calendar-side-card")).find((el) => (el.textContent || "").includes(site));
        return { ok: Boolean(card && card.className.includes("is-paid")), cls: card?.className || null };
      },
      SITE2,
      15000,
      "mobile side card paid",
    );
    await shot(pageM, "mobile-reallocated");
  });

  await run("reversal by A: B calendar RED/RED live, mobile RED, A bank 취소", async () => {
    await openPage(pageB, "calendar", ".erp-calendar-page, .erp-calendar-grid");
    await api(pageA, "POST", `/api/bank-transactions/${TX_ID}/receipt/reverse`, {
      operationId: "parity-reverse-1",
      reversalEffectiveDate: TODAY,
    });
    const peer = await waitTones(pageB, { s1: "RED", s2: "RED", credit: false });
    metrics.peerLatencyMs.push(peer);
    await waitFor(
      pageM,
      (site) => {
        const card = Array.from(document.querySelectorAll(".erp-calendar-side-card")).find((el) => (el.textContent || "").includes(site));
        return { ok: Boolean(card && card.className.includes("is-unpaid")), cls: card?.className || null };
      },
      SITE2,
      PEER_TARGET_MS,
      "mobile side card unpaid",
    );
    await waitBankStatus(pageA, "reversed", "취소");
    await shot(pageB, "calendar-reversed");
    await shot(pageA, "bank-reversed");
    await shot(pageM, "mobile-reversed");
  });

  await run("ledger integrity via API: exactly 1 receipt + 1 reversal, no duplicates", async () => {
    const data = await api(pageA, "GET", "/api/erp/domains?domains=receipts");
    const receipts = data.receipts || [];
    const brief = JSON.stringify(receipts.map((row) => [row.id, row.bankTransactionId, row.reversalOfReceiptId || null, row.status]));
    assert.equal(receipts.filter((row) => String(row.bankTransactionId) === TX_ID && !row.reversalOfReceiptId).length, 1, brief);
    assert.equal(receipts.filter((row) => row.reversalOfReceiptId).length, 1);
    const ops = receipts.map((row) => row.operationId).filter(Boolean);
    assert.equal(new Set(ops).size, ops.length);
  });

  await run("console errors = 0", async () => {
    assert.deepEqual(consoleErrors, []);
  });
} catch (error) {
  failed += 1;
  results.fatal = String(error?.stack || error).slice(0, 2000);
  console.error(error);
} finally {
  try { await browser?.close(); } catch {}
  try { serverProc?.kill(); } catch {}
  const payload = {
    ranAt: new Date().toISOString(),
    results,
    serverErrors: (globalThis.__serverLog || "")
      .split("\n")
      .filter((line) => /error|Error|500/.test(line))
      .slice(-40),
    peerLatencyMs: metrics.peerLatencyMs,
    consoleErrors,
    failed,
  };
  fs.writeFileSync(resultsPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify({ failed, peerLatencyMs: metrics.peerLatencyMs, consoleErrors: consoleErrors.length }));
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  process.exit(failed ? 1 : 0);
}
