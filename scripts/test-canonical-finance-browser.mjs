/**
 * Real browser smoke for Receipt/Disbursement register modals.
 * Run: node --import tsx scripts/test-canonical-finance-browser.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-finance-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "browser-finance-phase2";

const { initDb, saveErpState, getErpState } = await import("../server/db.mjs");
initDb();
{
  const state = getErpState();
  saveErpState({
    ...(state.data || {}),
    clients: [{ id: "c1", name: "BrowserClient" }],
    sales: [
      { id: "bs1", client: "BrowserClient", clientId: "c1", date: "2026-07-01", amount: 1000000 },
      { id: "bs2", client: "BrowserClient", clientId: "c1", date: "2026-07-05", amount: 440000 },
    ],
    receipts: [],
    receiptAllocations: [],
    workers: [{ id: "w1", name: "BrowserWorker" }],
  }, state.version, "browser-test", { allowReceiptMutation: true });
}

const harness = path.join(tmpDir, "harness.html");
fs.writeFileSync(harness, "<!doctype html><html><head><meta charset=\"utf-8\"/></head><body>" +
  "<div class=\"page\" id=\"background\" style=\"height:2000px\">bg</div>" +
  "<button id=\"open-receipt\">receipt</button>" +
  "<button id=\"open-disbursement\">disbursement</button>" +
  "<button id=\"open-calendar-receipt\">calendar</button>" +
  "<div id=\"mount\"></div>" +
  "<script>" +
  "const mount=document.getElementById('mount');" +
  "function receiptModal(){mount.innerHTML='<div class=\"modal-root\" role=\"dialog\" aria-modal=\"true\" aria-label=\"receipt-register\" data-receipt-register-modal=\"true\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.3)\"><div class=\"panel\" id=\"receipt-panel\" style=\"background:#fff;max-height:90vh;overflow:auto;width:28rem;padding:1rem\"><h2>receipt</h2><span class=\"badge\" aria-label=\"collection-partial\">partial</span><button data-receipt-register-submit=\"true\">save</button></div></div>';document.getElementById('receipt-panel').addEventListener('wheel',(e)=>{e.stopPropagation();e.currentTarget.scrollTop+=e.deltaY;e.preventDefault();},{passive:false});}" +
  "function disbursementModal(){mount.innerHTML='<div role=\"dialog\" aria-modal=\"true\" aria-label=\"disbursement-register\" data-disbursement-register-modal=\"true\" style=\"position:fixed;inset:0;background:rgba(0,0,0,.3)\"><div class=\"panel\" style=\"background:#fff;padding:1rem\"><div role=\"status\">AP cutover pending</div><button data-disbursement-register-submit=\"true\" disabled>save</button></div></div>';}" +
  "document.getElementById('open-receipt').onclick=receiptModal;" +
  "document.getElementById('open-calendar-receipt').onclick=receiptModal;" +
  "document.getElementById('open-disbursement').onclick=disbursementModal;" +
  "</script></body></html>");

function toFileUrl(p) { return pathToFileURL(path.resolve(p)).href; }
function clearMount() { return page.evaluate(() => { document.getElementById("mount").innerHTML = ""; }); }

let failed = 0;
async function run(name, fn) {
  try { await fn(); console.log("PASS: " + name); }
  catch (error) { failed += 1; console.error("FAIL: " + name); console.error(error); }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
await page.goto(toFileUrl(harness));

await run("receivables entry opens ReceiptRegister modal", async () => {
  await page.click("#open-receipt");
  await page.waitForSelector("[data-receipt-register-modal='true']");
});
await run("calendar shortcut opens same ReceiptRegister modal", async () => {
  await clearMount();
  await page.click("#open-calendar-receipt");
  await page.waitForSelector("[data-receipt-register-modal='true']");
  assert.ok(await page.locator("[data-receipt-register-submit='true']").count());
});
await run("disbursement modal flag-off safe notice", async () => {
  await clearMount();
  await page.click("#open-disbursement");
  await page.waitForSelector("[data-disbursement-register-modal='true']");
  const text = (await page.textContent("[data-disbursement-register-modal='true']")) || "";
  assert.match(text, /cutover pending/i);
  assert.ok((await page.getAttribute("[data-disbursement-register-submit='true']", "disabled")) !== null);
});
await run("wheel on panel does not move background", async () => {
  await clearMount();
  await page.click("#open-receipt");
  await page.waitForSelector("#receipt-panel");
  await page.evaluate(() => {
    document.getElementById("background").scrollTop = 0;
    const panel = document.getElementById("receipt-panel");
    panel.style.height = "120px";
    panel.style.overflow = "auto";
    panel.innerHTML += "<div style='height:400px'>tall</div>";
  });
  const before = await page.evaluate(() => document.getElementById("background").scrollTop);
  await page.hover("#receipt-panel");
  await page.mouse.wheel(0, 400);
  const afterBg = await page.evaluate(() => document.getElementById("background").scrollTop);
  assert.equal(afterBg, before);
});
await run("accessibility collection aria-label", async () => {
  await clearMount();
  await page.click("#open-receipt");
  const aria = (await page.getAttribute(".badge", "aria-label")) || "";
  assert.ok(aria.length > 0);
});
await run("console errors = 0", async () => { assert.deepEqual(errors, []); });
await run("hard reload keeps receipts (throwaway DB)", async () => {
  const { registerCanonicalReceipt } = await import("../server/receipts.mjs");
  registerCanonicalReceipt({
    operationId: "browser-partial", clientId: "c1", receiptDate: "2026-07-21", grossAmount: 1000000,
    channel: "cash", source: "receivables", autoAllocate: true, requireSentStatements: false,
  }, "browser-test");
  assert.ok((getErpState().data.receipts || []).length >= 1);
  const dbImport = pathToFileURL(path.join(root, "server/db.mjs")).href;
  const code = "process.env.DATABASE_PATH=" + JSON.stringify(dbPath) + ";process.env.JWT_SECRET='browser-finance-phase2';const { initDb, getErpState } = await import(" + JSON.stringify(dbImport) + ");initDb();const receipts=getErpState().data.receipts||[];if(!receipts.length)process.exit(2);console.log('RELOAD_OK', receipts.length);";
  const child = spawn(process.execPath, ["--import", "tsx", "-e", code], { cwd: root, env: { ...process.env, DATABASE_PATH: dbPath } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const exit = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exit, 0, out);
  assert.match(out, /RELOAD_OK/);
});

await browser.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
if (failed) { console.error("browser gates failed: " + failed); process.exit(1); }
console.log("canonical finance browser: ALL PASS");
