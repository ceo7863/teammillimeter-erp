/**
 * Taxable AR integrity — calendar tone, sale drawer tax card, new-sale default + server stamp,
 * receipt detail columns, peer realtime, hard reload, mobile (Chromium).
 * Run: node --import tsx scripts/test-taxable-ar-browser.mjs
 *
 * Seed (client vat=Y, one cash receipt of 2,000,000 allocated 1,000,000 + 1,000,000):
 *  - tax-legacy: legacy sale (no taxTreatment) supply 1,000,000 → gross 1,000,000, fully paid → GREEN, "과세유형 미확인"
 *  - tax-t10:   TAXABLE_10 supply 1,000,000 → gross 1,100,000, paid 1,000,000 → AMBER, outstanding 100,000
 *  - scSchedule tax-new: imported through the UI and saved → server stamps TAXABLE_10 (VAT 10%)
 * Payment channel (cash) never changes either treatment.
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
const resultsPath = path.join(artifactsDir, "taxable-ar-browser-results.json");
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const JWT = "browser-taxable-ar";
const PEER_TARGET_MS = 6000;
const REQUIRED_CHECKS = 9;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-taxable-ar-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
const distDir = path.join(tmpDir, "dist");
fs.mkdirSync(artifactsDir, { recursive: true });

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const CLIENT = { id: 701, name: "인디퍼" };
const SITE_LEGACY = "레거시현장";
const SITE_T10 = "과세현장";
const SITE_NEW = "신축동";
const LABEL_LEGACY = "과세유형 미확인";
const LABEL_T10 = "과세(10%)";

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

async function openTab(page, tab, readySelector) {
  await page.evaluate(([key, value]) => window.sessionStorage.setItem(key, value), [ACTIVE_TAB_KEY, tab]);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(readySelector, { timeout: 90000 });
  await waitForStream(page);
}

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

function readTones(sites) {
  const out = {};
  for (const site of sites) {
    const entry = Array.from(document.querySelectorAll(".erp-calendar-cell-entry")).find((el) => (el.textContent || "").includes(site));
    if (!entry) { out[site] = null; continue; }
    const cls = entry.className || "";
    out[site] = cls.includes("is-neutral") ? "NEUTRAL" : cls.includes("is-unpaid") ? "RED" : cls.includes("is-partial-paid") ? "AMBER" : "GREEN";
  }
  return out;
}

async function openSaleDrawer(page, site) {
  await openTab(page, "sales", '[data-sales-statements-hub="true"]');
  const listBtn = page.locator("button", { hasText: "목록" });
  if (await listBtn.count()) await listBtn.first().click();
  await page.waitForTimeout(400);
  const row = page.locator("table tbody tr").filter({ hasText: site }).first();
  await row.waitFor({ timeout: 20000 });
  await row.click();
  await page.waitForSelector('[data-sale-detail-drawer="true"]', { timeout: 60000 });
  return page.evaluate(() => {
    const drawer = document.querySelector('[data-sale-detail-drawer="true"]');
    const card = drawer?.querySelector("[data-sale-tax-treatment]");
    const select = drawer?.querySelector('[data-testid="sale-tax-treatment-select"]');
    return {
      identity: drawer?.getAttribute("data-sale-detail-identity") || "",
      treatment: card?.getAttribute("data-sale-tax-treatment") || null,
      cardText: (card?.textContent || "").replace(/\s+/g, " ").trim(),
      status: drawer?.querySelector("[data-sale-collection-status]")?.getAttribute("data-sale-collection-status") || null,
      selectValue: select ? select.value : null,
      selectDisabled: select ? select.disabled : null,
    };
  });
}

async function closeDrawer(page) {
  const closeBtn = page.locator('[data-sale-detail-drawer="true"] button', { hasText: "닫기" });
  if (await closeBtn.count()) await closeBtn.first().click().catch(() => {});
  else await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function readSavedSales() {
  const reader = path.join(tmpDir, "read.mjs");
  const dbHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  fs.writeFileSync(
    reader,
    [
      `import { initDb, getErpState } from ${JSON.stringify(dbHref)};`,
      "initDb();",
      "const sales = (getErpState().data?.sales || []).map((s) => ({ id: s.id, site: s.site, scScheduleId: s.scScheduleId, amount: s.amount, taxTreatment: s.taxTreatment ?? null, vatAmount: s.vatAmount ?? null, grossReceivableAmount: s.grossReceivableAmount ?? null, taxEvidenceStatus: s.taxEvidenceStatus ?? null }));",
      "console.log('SALES_JSON=' + JSON.stringify(sales));",
    ].join("\n"),
    "utf8",
  );
  const out = await runCommand(process.execPath, ["--import", "tsx", reader], { env: { DATABASE_PATH: dbPath, JWT_SECRET: JWT } });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("SALES_JSON="));
  return JSON.parse(line.slice("SALES_JSON=".length));
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(artifactsDir, `taxable-ar-${name}.png`), fullPage: false });
}

try {
  const seedScript = path.join(tmpDir, "seed.mjs");
  const dbHref = pathToFileURL(path.join(root, "server", "db.mjs")).href;
  const receiptsHref = pathToFileURL(path.join(root, "server", "receipts.mjs")).href;
  const participant = (name) => ({ participantName: name, name });
  fs.writeFileSync(
    seedScript,
    [
      `import { initDb, getErpState, saveErpState, createUser } from ${JSON.stringify(dbHref)};`,
      `import { createAndPostReceipt } from ${JSON.stringify(receiptsHref)};`,
      "initDb();",
      "for (const id of ['taxA', 'taxB', 'taxM']) createUser({ loginId: id, password: '1234', name: id, role: 'admin' });",
      "const state = getErpState();",
      "const line = (worker, amount) => ({ no: 1, worker, quantity: '1', unitCost: String(amount), chargeAmount: String(amount), meal: '', lodging: '', expense: '', overtimeHours: '', overtimeCost: '', memo: '' });",
      "saveErpState({",
      "  ...(state.data || {}),",
      `  clients: [{ id: ${CLIENT.id}, name: ${JSON.stringify(CLIENT.name)}, isActive: true, constructionCost: 330000, overtimeCost: 30000, mealIncluded: 'N', vat: 'Y' }],`,
      "  workers: [",
      "    { id: 1, name: '이서준', isActive: true, constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1 },",
      "    { id: 2, name: '문정학', isActive: true, constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 },",
      "    { id: 3, name: '최성훈', isActive: true, constructionCost: 300000, overtimeCost: 30000, feeRate: 0.1 },",
      "  ],",
      "  sales: [",
      `    { id: 'tax-legacy', date: '${TODAY}', client: ${JSON.stringify(CLIENT.name)}, clientId: ${CLIENT.id}, site: ${JSON.stringify(SITE_LEGACY)}, amount: 1000000, paid: 0, voucherNo: 'TAX-L', workers: [line('이서준', 1000000)] },`,
      `    { id: 'tax-t10', date: '${TODAY}', client: ${JSON.stringify(CLIENT.name)}, clientId: ${CLIENT.id}, site: ${JSON.stringify(SITE_T10)}, amount: 1000000, paid: 0, voucherNo: 'TAX-T',`,
      "      taxTreatment: 'TAXABLE_10', taxRate: 0.1, supplyAmount: 1000000, vatAmount: 100000, grossReceivableAmount: 1100000, taxEvidenceStatus: 'REVIEW_REQUIRED', workers: [line('문정학', 1000000)] },",
      "  ],",
      "  scSchedules: [",
      `    { id: 'tax-new', scProjectId: 'p1', clientId: ${CLIENT.id}, clientName: ${JSON.stringify(CLIENT.name)}, projectName: ${JSON.stringify(CLIENT.name)}, workDate: '${TODAY}', startTime: '09:00', endTime: '18:00', workType: ${JSON.stringify(SITE_NEW)}, expectedHeadcount: 1,`,
      `      participantNames: ['최성훈'], participantCount: 1, participants: ${JSON.stringify([participant("최성훈")])}, syncedAt: new Date().toISOString() },`,
      "  ],",
      "  scScheduleSyncMeta: { lastSyncSource: 'calwalk' },",
      "  paymentVouchers: [], paymentInputLogs: [], receipts: [], receiptAllocations: [],",
      "}, state.version, 'taxable-ar-browser-seed', { allowReceiptMutation: true, allowPaymentVoucherMutation: true });",
      "createAndPostReceipt({",
      `  operationId: 'tax-cash-1', clientId: ${CLIENT.id}, receiptDate: '${TODAY}', grossAmount: 2000000, channel: 'cash', source: 'receivables',`,
      "  allocations: [{ saleId: 'tax-legacy', amount: 1000000 }, { saleId: 'tax-t10', amount: 1000000 }],",
      "}, 'seed');",
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

  await run("calendar tone: legacy paid by supply GREEN, TAXABLE_10 paid supply-only AMBER (cash never flips)", async () => {
    await login(pageA, "taxA");
    await openCalendar(pageA);
    await waitFor(
      pageA,
      ([sites, fn]) => {
        const tones = new Function(`return (${fn})`)()(sites);
        return { ok: tones[sites[0]] === "GREEN" && tones[sites[1]] === "AMBER", tones };
      },
      [[SITE_LEGACY, SITE_T10], readTones.toString()],
      15000,
      "desktop tones",
    );
    await shot(pageA, "desktop-calendar");
  });

  await run("sale drawer: TAXABLE_10 shows 총채권 1,100,000 / 부가세 100,000 and locks the selector after allocation", async () => {
    const view = await openSaleDrawer(pageA, SITE_T10);
    assert.equal(view.treatment, "TAXABLE_10");
    assert.match(view.cardText, /1,100,000/);
    assert.ok(view.cardText.includes(LABEL_T10), view.cardText);
    assert.match(view.cardText, /부가세\s*100,000/);
    assert.equal(view.selectValue, "TAXABLE_10");
    assert.equal(view.selectDisabled, true);
    await shot(pageA, "desktop-drawer-t10");
    await closeDrawer(pageA);
  });

  await run("sale drawer: legacy sale shows 과세유형 미확인 and keeps gross = supply", async () => {
    const view = await openSaleDrawer(pageA, SITE_LEGACY);
    assert.equal(view.treatment, "LEGACY_UNSPECIFIED");
    assert.ok(view.cardText.includes(LABEL_LEGACY), view.cardText);
    assert.match(view.cardText, /1,000,000/);
    assert.match(view.cardText, /부가세\s*0/);
    await closeDrawer(pageA);
  });

  await run("receipt detail: gross allocation columns with per-sale taxTreatment, supply, VAT and remaining", async () => {
    await openTab(pageA, "receivables", "h1.erp-payment-hub-title");
    await pageA.locator("button.erp-payment-tab", { hasText: "입금전표" }).click();
    const row = pageA.locator("table.erp-payment-table--history tbody tr[data-receipt-id]").first();
    await row.waitFor({ timeout: 30000 });
    await row.click();
    await pageA.waitForSelector('[data-receipt-detail-drawer="true"]', { timeout: 30000 });
    const detail = await pageA.evaluate(() => {
      const drawer = document.querySelector('[data-receipt-detail-drawer="true"]');
      const headers = Array.from(drawer?.querySelectorAll("thead th") || []).map((th) => (th.textContent || "").trim());
      const rows = Array.from(drawer?.querySelectorAll("[data-receipt-detail-row]") || []).map((tr) => ({
        treatment: tr.getAttribute("data-tax-treatment"),
        cells: Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").replace(/\s+/g, " ").trim()),
      }));
      const dialog = drawer?.querySelector('[role="dialog"]') || drawer;
      const lastTh = drawer?.querySelector("thead th:last-child");
      const layout = {
        dialogWidth: Math.round(dialog?.getBoundingClientRect().width || 0),
        dialogClass: dialog?.className || "",
        lastHeaderRight: Math.round(lastTh?.getBoundingClientRect().right || 0),
        dialogRight: Math.round(dialog?.getBoundingClientRect().right || 0),
      };
      return { headers, rows, layout, text: (drawer?.textContent || "").replace(/\s+/g, " ") };
    });
    metrics.receiptDetailLayout = detail.layout;
    assert.ok(detail.layout.lastHeaderRight <= detail.layout.dialogRight, `receipt detail table clipped: ${JSON.stringify(detail.layout)}`);
    for (const h of ["매출일", "현장", "과세유형", "공급가액", "부가세", "총채권", "기존 충당", "이번 충당", "남은 미수"]) {
      assert.ok(detail.headers.includes(h), `header ${h}: ${JSON.stringify(detail.headers)}`);
    }
    const t10 = detail.rows.find((r) => r.treatment === "TAXABLE_10");
    const legacy = detail.rows.find((r) => r.treatment === "LEGACY_UNSPECIFIED");
    assert.ok(t10 && legacy, JSON.stringify(detail.rows));
    const col = (r, name) => r.cells[detail.headers.indexOf(name)];
    assert.equal(col(t10, "공급가액").replace(/[^\d]/g, ""), "1000000");
    assert.equal(col(t10, "부가세").replace(/[^\d]/g, ""), "100000");
    assert.equal(col(t10, "총채권").replace(/[^\d]/g, ""), "1100000");
    assert.equal(col(t10, "이번 충당").replace(/[^\d]/g, ""), "1000000");
    assert.equal(col(t10, "남은 미수").replace(/[^\d]/g, ""), "100000");
    assert.ok(col(legacy, "과세유형").includes(LABEL_LEGACY));
    assert.equal(col(legacy, "총채권").replace(/[^\d]/g, ""), "1000000");
    assert.equal(col(legacy, "남은 미수").replace(/[^\d]/g, ""), "0");
    assert.match(detail.text, /결제수단은 과세유형을 변경하지 않습니다/);
    await shot(pageA, "desktop-receipt-detail");
    await pageA.keyboard.press("Escape").catch(() => {});
  });

  await run("peer B opens calendar before A saves", async () => {
    await login(pageB, "taxB");
    await openCalendar(pageB);
  });

  await run("new sale form defaults to 과세(10%) and the server stores TAXABLE_10 with VAT 10%", async () => {
    await openCalendar(pageA);
    await pageA.click(`[data-calendar-date="${TODAY}"]`, { position: { x: 6, y: 6 } });
    const importBtn = pageA.getByRole("button", { name: /CalWalk 스케줄 가져오기/ });
    await importBtn.first().waitFor({ timeout: 20000 });
    await importBtn.first().click();
    const card = pageA.locator(".erp-calendar-sc-import-modal button", { hasText: SITE_NEW }).first();
    await card.waitFor({ timeout: 20000 });
    await card.click();
    await pageA.waitForSelector(".erp-calendar-new-sale-modal", { timeout: 20000 });
    const field = await pageA.evaluate(() => {
      const modal = document.querySelector(".erp-calendar-new-sale-modal");
      const select = modal?.querySelector('[data-testid="sale-tax-treatment-select"]');
      return {
        value: select ? select.value : null,
        amounts: modal?.querySelector('[data-testid="sale-tax-amounts"]')?.textContent || "",
        hint: modal?.querySelector(".erp-sale-tax-field-hint")?.textContent || "",
      };
    });
    assert.equal(field.value, "TAXABLE_10");
    assert.match(field.hint, /결제수단은 과세유형을 변경하지 않습니다/);
    await shot(pageA, "desktop-new-sale-form");
    await pageA.locator(".erp-calendar-new-sale-modal button", { hasText: "매출 저장" }).last().click();
    try {
      await pageA.waitForSelector(".erp-calendar-new-sale-modal", { state: "detached", timeout: 20000 });
    } catch (error) {
      await shot(pageA, "new-sale-not-saved");
      const text = await pageA.evaluate(() => (document.querySelector(".erp-calendar-new-sale-modal")?.textContent || "").replace(/\s+/g, " "));
      throw new Error(`new sale modal stayed open: ${text.slice(-600)}`);
    }
    let saved = null;
    for (let i = 0; i < 40 && !saved; i += 1) {
      saved = (await readSavedSales()).find((sale) => sale.scScheduleId === "tax-new") || null;
      if (!saved) await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(saved, "saved sale for tax-new");
    assert.equal(saved.taxTreatment, "TAXABLE_10");
    const supply = Number(saved.amount);
    assert.ok(supply > 0);
    assert.equal(Number(saved.vatAmount), Math.round(supply * 0.1));
    assert.equal(Number(saved.grossReceivableAmount), supply + Math.round(supply * 0.1));
    assert.equal(saved.taxEvidenceStatus, "REVIEW_REQUIRED");
    const all = await readSavedSales();
    assert.equal(all.find((s) => s.id === "tax-legacy")?.taxTreatment, null, "legacy sale must stay unclassified");
    assert.equal(all.find((s) => s.id === "tax-t10")?.taxTreatment, "TAXABLE_10");
  });

  await run("peer B sees the new sale live (RED) and existing tones unchanged, no reload", async () => {
    const ms = await waitFor(
      pageB,
      ([sites, fn]) => {
        const tones = new Function(`return (${fn})`)()(sites);
        return { ok: tones[sites[0]] === "GREEN" && tones[sites[1]] === "AMBER" && tones[sites[2]] === "RED", tones };
      },
      [[SITE_LEGACY, SITE_T10, SITE_NEW], readTones.toString()],
      PEER_TARGET_MS,
      "peer tones",
    );
    metrics.peerLatencyMs.push(ms);
    await shot(pageB, "peer-calendar");
  });

  await run("hard reload B + mobile: same tones and drawer tax card", async () => {
    await openCalendar(pageB);
    const tonesB = await pageB.evaluate(readTones, [SITE_LEGACY, SITE_T10, SITE_NEW]);
    assert.deepEqual(tonesB, { [SITE_LEGACY]: "GREEN", [SITE_T10]: "AMBER", [SITE_NEW]: "RED" });
    const viewB = await openSaleDrawer(pageB, SITE_NEW);
    assert.equal(viewB.treatment, "TAXABLE_10");
    assert.ok(viewB.cardText.includes(LABEL_T10));
    await closeDrawer(pageB);

    await login(pageM, "taxM");
    const viewM = await openSaleDrawer(pageM, SITE_T10);
    assert.equal(viewM.treatment, "TAXABLE_10");
    assert.match(viewM.cardText, /1,100,000/);
    const fits = await pageM.evaluate(() => {
      const card = document.querySelector('[data-sale-detail-drawer="true"] [data-sale-tax-treatment]');
      return card ? card.getBoundingClientRect().right <= window.innerWidth + 1 : false;
    });
    assert.ok(fits, "tax card fits mobile viewport");
    await shot(pageM, "mobile-drawer-t10");
    await closeDrawer(pageM);
    const viewML = await openSaleDrawer(pageM, SITE_LEGACY);
    assert.ok(viewML.cardText.includes(LABEL_LEGACY));
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
