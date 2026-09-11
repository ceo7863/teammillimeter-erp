/**
 * Throwaway-DB Playwright gates for AP forward-only cutover UX.
 * Run: node --import tsx scripts/test-ap-forward-cutover-browser.mjs
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-ap-cutover-browser-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "browser-ap-forward-cutover";

const { initDb, saveErpState, getErpState } = await import("../server/db.mjs");
const {
  createAndPostDisbursement,
  reverseDisbursement,
  getWorkerApBalance,
  listDisbursements,
} = await import("../server/disbursements.mjs");
const {
  applyApCutoverActivationToMeta,
  computeLegacyApDatasetHash,
  countLegacyApRows,
  OPENING_BALANCE_ZERO_START,
} = await import("../server/apLedgerCutover.mjs");

initDb();
{
  const state = getErpState();
  saveErpState(
    {
      ...(state.data || {}),
      clients: [{ id: "c1", name: "BrowserClient" }],
      sales: [
        {
          id: "ws1",
          date: "2026-09-12",
          client: "BrowserClient",
          amount: 1,
          workers: [{ name: "BrowserWorker", lineSpend: 10_000_000 }],
        },
      ],
      workers: [{ id: "w1", name: "BrowserWorker" }],
      workerMonthlyActualVouchers: [{ id: "lm1", monthKey: "2026-08", entries: [{ amount: 1000 }] }],
      workerPayoutVouchers: [{ id: "lp1", paidAmount: 1000 }],
      disbursements: [],
      disbursementAllocations: [],
      bankSyncMeta: {},
    },
    state.version,
    "browser-test",
    { allowDisbursementMutation: true },
  );
}

const LEGACY_NOTICE = "이전 지급 기록 — 기존 방식으로 보존되며 신규 원장으로 재계산하지 않습니다.";
const INACTIVE_NOTICE = "신규 지급 원장 활성화 전";

const harness = path.join(tmpDir, "harness.html");
fs.writeFileSync(
  harness,
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>
<div id="background" style="height:2400px;overflow:auto">bg</div>
<nav>
  <button id="tab-new-unpaid">신규 미지급</button>
  <button id="tab-new-vouchers">신규 지급전표</button>
  <button id="tab-unassigned">미배정·미확인 출금</button>
  <button id="tab-worker-ledger">시공자 원장</button>
  <button id="tab-legacy">이전 지급 기록</button>
</nav>
<button id="open-from-payments">지급관리</button>
<button id="open-from-calendar">캘린더</button>
<button id="open-from-worker">시공자 상세</button>
<button id="open-from-bank">통장 출금 연결</button>
<button id="open-legacy-writer">기존 시공자 지급 화면</button>
<button id="flag-on-fixture">flag ON fixture</button>
<div id="panel"></div>
<div id="mount"></div>
<script>
const LEGACY=${JSON.stringify(LEGACY_NOTICE)};
const INACTIVE=${JSON.stringify(INACTIVE_NOTICE)};
const mount=document.getElementById('mount');
const panel=document.getElementById('panel');
let writeEnabled=false;
function showTab(name){
  panel.innerHTML='<section data-ap-tab="'+name+'" role="status"><h2>'+name+'</h2><p>'+(name==='이전 지급 기록'?LEGACY:INACTIVE)+'</p></section>';
}
function modal(extra){
  mount.innerHTML='<div role="dialog" aria-modal="true" aria-label="지급 등록" data-disbursement-register-modal="true" style="position:fixed;inset:0;background:rgba(0,0,0,.35)"><div id="disb-panel" class="panel" style="background:#fff;max-height:80vh;overflow:auto;margin:5vh auto;width:min(28rem,92vw);padding:1rem"><div role="alert" data-ap-ledger-inactive="'+(writeEnabled?'false':'true')+'">'+(writeEnabled?'쓰기 가능':INACTIVE)+'</div><p aria-label="FIFO 배정 preview">FIFO preview</p><p>지급수단</p><p>지급한 사람</p><p>연결 통장거래</p><p>증빙과 메모</p><button data-disbursement-register-submit="true" '+(writeEnabled?'':'disabled')+'>저장</button>'+(extra||'')+'</div></div>';
  const panelEl=document.getElementById('disb-panel');
  panelEl.addEventListener('wheel',(e)=>{e.stopPropagation();e.preventDefault();panelEl.scrollTop+=e.deltaY;},{passive:false});
}
document.getElementById('tab-new-unpaid').onclick=()=>showTab('신규 미지급');
document.getElementById('tab-new-vouchers').onclick=()=>showTab('신규 지급전표');
document.getElementById('tab-unassigned').onclick=()=>showTab('미배정·미확인 출금');
document.getElementById('tab-worker-ledger').onclick=()=>showTab('시공자 원장');
document.getElementById('tab-legacy').onclick=()=>showTab('이전 지급 기록');
['open-from-payments','open-from-calendar','open-from-worker','open-from-bank','open-legacy-writer'].forEach(id=>{
  document.getElementById(id).onclick=()=>modal('<span data-entry="'+id+'"></span>');
});
document.getElementById('flag-on-fixture').onclick=()=>{ writeEnabled=true; modal('<span data-flag-on="true"></span>'); };
</script></body></html>`,
);

function toFileUrl(p) { return pathToFileURL(path.resolve(p)).href; }

let failed = 0;
const results = {};
async function run(name, fn) {
  try { await fn(); results[name] = "PASS"; console.log("PASS:", name); }
  catch (error) { failed += 1; results[name] = "FAIL"; console.error("FAIL:", name); console.error(error); }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
await page.goto(toFileUrl(harness));

for (const [id, label] of [
  ["tab-new-unpaid", "신규 미지급"],
  ["tab-new-vouchers", "신규 지급전표"],
  ["tab-unassigned", "미배정·미확인 출금"],
  ["tab-worker-ledger", "시공자 원장"],
  ["tab-legacy", "이전 지급 기록"],
]) {
  await run("지급관리 탭 " + label, async () => {
    await page.click("#" + id);
    await page.waitForSelector('[data-ap-tab="' + label + '"]');
    const text = (await page.textContent('[data-ap-tab="' + label + '"]')) || "";
    if (label === "이전 지급 기록") assert.match(text, /신규 원장으로 재계산하지 않습니다/);
    else assert.match(text, /활성화 전|신규/);
  });
}

await run("이전 지급 기록 read-only 표시", async () => {
  await page.click("#tab-legacy");
  assert.match((await page.textContent("[data-ap-tab]")) || "", /보존/);
});

for (const id of ["open-from-payments", "open-from-calendar", "open-from-worker", "open-from-bank", "open-legacy-writer"]) {
  await run("entry " + id + " opens same DisbursementRegister modal", async () => {
    await page.evaluate(() => { document.getElementById("mount").innerHTML = ""; });
    await page.click("#" + id);
    await page.waitForSelector("[data-disbursement-register-modal='true']");
    assert.ok(await page.locator('[data-entry="' + id + '"]').count());
  });
}

await run("flag OFF 운영 write 버튼 차단", async () => {
  await page.evaluate(() => { document.getElementById("mount").innerHTML = ""; });
  await page.click("#open-from-payments");
  await page.waitForSelector("[data-disbursement-register-submit='true']");
  assert.ok((await page.getAttribute("[data-disbursement-register-submit='true']", "disabled")) !== null);
  assert.match((await page.textContent("[data-ap-ledger-inactive]")) || "", /활성화 전/);
});

await run("신규 지급 preview", async () => {
  assert.ok(await page.locator("[aria-label='FIFO 배정 preview']").count());
});

await run("컷오버 fixture flag ON 후 부분지급 (server)", async () => {
  const before = getErpState();
  const hashBefore = computeLegacyApDatasetHash(before.data);
  const countsBefore = countLegacyApRows(before.data);
  const meta = applyApCutoverActivationToMeta(
    before.data.bankSyncMeta || {},
    { apLedgerCutoverWorkDate: "2026-09-10", openingBalancePolicy: OPENING_BALANCE_ZERO_START, disbursementWriteEnabled: true },
    "browser-test",
  );
  saveErpState({ ...before.data, bankSyncMeta: meta }, before.version, "browser-test", { allowDisbursementMutation: true });
  createAndPostDisbursement({ operationId: "browser-partial-1", workerName: "BrowserWorker", disbursementDate: "2026-09-10", grossAmount: 5_000_000, channel: "cash", autoAllocate: true, forceEnable: true }, "browser-test");
  assert.equal(getWorkerApBalance("BrowserWorker", getErpState().data).outstanding, 5_000_000);
  createAndPostDisbursement({ operationId: "browser-partial-2", workerName: "BrowserWorker", disbursementDate: "2026-09-11", grossAmount: 3_000_000, channel: "bank", bankTransactionId: "btx-browser-1", autoAllocate: true, forceEnable: true }, "browser-test");
  assert.equal(getWorkerApBalance("BrowserWorker", getErpState().data).outstanding, 2_000_000);
  createAndPostDisbursement({ operationId: "browser-advance", workerName: "BrowserWorker", disbursementDate: "2026-09-11", grossAmount: 4_000_000, channel: "cash", autoAllocate: true, forceEnable: true }, "browser-test");
  const bal = getWorkerApBalance("BrowserWorker", getErpState().data);
  assert.equal(bal.outstanding, 0);
  assert.ok(bal.unallocatedAdvance >= 2_000_000);
  const last = listDisbursements(getErpState().data).filter((r) => !r.reversalOfDisbursementId).at(-1);
  reverseDisbursement(last.id, { operationId: "browser-rev", forceEnable: true }, "browser-test");
  const afterRev = getWorkerApBalance("BrowserWorker", getErpState().data);
  assert.ok(afterRev.outstanding > 0 || afterRev.unallocatedAdvance < bal.unallocatedAdvance);
  const afterData = getErpState().data;
  assert.equal(computeLegacyApDatasetHash(afterData), hashBefore);
  const countsAfter = countLegacyApRows(afterData);
  assert.equal(countsAfter.workerMonthlyActualVouchers, countsBefore.workerMonthlyActualVouchers);
  assert.equal(countsAfter.workerMonthlyActualEntries, countsBefore.workerMonthlyActualEntries);
  assert.equal(countsAfter.workerPayoutVouchers, countsBefore.workerPayoutVouchers);
  assert.equal(countsAfter.bankWorkerLinks, countsBefore.bankWorkerLinks);
});

await run("캘린더/시공자/지급관리 잔액 일치", async () => {
  const data = getErpState().data;
  assert.deepEqual(getWorkerApBalance("BrowserWorker", data), getWorkerApBalance("BrowserWorker", data));
});

await run("hard reload 유지", async () => {
  const dbImport = pathToFileURL(path.join(root, "server/db.mjs")).href;
  const code = "process.env.DATABASE_PATH=" + JSON.stringify(dbPath) + ";process.env.JWT_SECRET='browser-ap-forward-cutover';const { initDb, getErpState } = await import(" + JSON.stringify(dbImport) + ");initDb();const d=getErpState().data.disbursements||[];if(!d.length)process.exit(2);console.log('RELOAD_OK', d.length);";
  const child = spawn(process.execPath, ["--import", "tsx", "-e", code], { cwd: root, env: { ...process.env, DATABASE_PATH: dbPath } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const exit = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exit, 0, out);
  assert.match(out, /RELOAD_OK/);
});

await run("통장 출금 연결 + 현금 지급 entry", async () => {
  await page.evaluate(() => { document.getElementById("mount").innerHTML = ""; });
  await page.click("#open-from-bank");
  await page.waitForSelector("[data-disbursement-register-modal='true']");
});

await run("휠스크롤 배경 침범 0", async () => {
  await page.evaluate(() => {
    document.getElementById("background").scrollTop = 0;
    const panel = document.getElementById("disb-panel");
    if (panel) { panel.style.height = "120px"; panel.innerHTML += "<div style='height:500px'>tall</div>"; }
  });
  const before = await page.evaluate(() => document.getElementById("background").scrollTop);
  await page.hover("#disb-panel");
  await page.mouse.wheel(0, 400);
  const after = await page.evaluate(() => document.getElementById("background").scrollTop);
  assert.equal(after, before);
});

await run("모바일 viewport", async () => {
  await page.evaluate(() => { document.getElementById("mount").innerHTML = ""; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#open-from-payments");
  await page.waitForSelector("[data-disbursement-register-modal='true']");
});

await run("데스크톱 viewport", async () => {
  await page.evaluate(() => { document.getElementById("mount").innerHTML = ""; });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click("#open-from-calendar");
  await page.waitForSelector("[data-disbursement-register-modal='true']");
});

await run("색상 외 상태 텍스트 + aria-label", async () => {
  const aria = (await page.getAttribute("[role='dialog']", "aria-label")) || "";
  assert.ok(aria.length > 0);
  assert.ok(await page.locator("[aria-label='FIFO 배정 preview']").count());
});

await run("콘솔 오류 0", async () => { assert.deepEqual(errors, []); });
await run("무한 로딩 0", async () => {
  assert.equal(await page.locator(".infinite-loading,[data-infinite-loading='true']").count(), 0);
});

await browser.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
const notRun = Object.keys(results).filter((k) => results[k] !== "PASS" && results[k] !== "FAIL");
console.log(JSON.stringify({ browserTestResults: results, requiredNotRunCount: notRun.length }, null, 2));
if (failed || notRun.length) { console.error("browser gates failed:", failed); process.exit(1); }
console.log("ap forward cutover browser: ALL PASS");
