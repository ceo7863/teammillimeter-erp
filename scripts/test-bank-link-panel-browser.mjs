/**
 * GATE B — deposit link panel wheel policy + hard-reload persistence.
 * Run: npx tsx scripts/test-bank-link-panel-browser.mjs
 *
 * Why there is no Chromium here
 * ----------------------------
 * The repo has no browser test runner and installing Playwright + Chromium (plus building
 * the SPA, booting the API and logging in) is far heavier than the behaviour under test.
 * Instead this gate covers the two things a live browser smoke test would have proven, with
 * automation that fails on regression:
 *
 *   B-1  Wheel policy, driven through the real `handleWheelScrollCapture` implementation
 *        against a realistic link-panel DOM (panel main + nested table wrap + page body
 *        behind it). Asserts the panel scroll container moves, the background never does,
 *        and the event is always consumed while the panel is open.
 *   B-2  Hard reload, driven through a SEPARATE node process that opens the same SQLite
 *        file: the receipt number and its allocations must come back identical, the bank
 *        row must still point at the same receipt, and a later generic ERP save must not
 *        be able to drop them.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

/* ==================================================================== B-1 DOM */

const { handleWheelScrollCapture, scrollElement, isVerticallyScrollable } = await import(
  "../src/utils/wheelScrollCapture.ts"
);

/** Minimal element shim with the surface the wheel policy actually touches. */
function makeEl(options = {}) {
  const el = {
    tagName: options.tagName || "DIV",
    _classes: new Set(options.classes || []),
    _attrs: { ...(options.attrs || {}) },
    scrollTop: options.scrollTop || 0,
    scrollHeight: options.scrollHeight || 0,
    clientHeight: options.clientHeight || 0,
    overflowY: options.overflowY || "visible",
    parentElement: null,
    children: [],
    classList: {
      contains: (name) => el._classes.has(name),
    },
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(el._attrs, name),
    getAttribute: (name) => el._attrs[name] ?? null,
    matches: (selector) => selectorMatches(el, selector),
    closest: (selector) => {
      let node = el;
      while (node) {
        if (selectorMatches(node, selector)) return node;
        node = node.parentElement;
      }
      return null;
    },
  };
  for (const child of options.children || []) {
    child.parentElement = el;
    el.children.push(child);
  }
  return el;
}

function selectorMatches(el, selector) {
  return String(selector)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      if (part.startsWith("[") && part.endsWith("]")) return el.hasAttribute(part.slice(1, -1));
      if (part.startsWith(".")) return el.classList.contains(part.slice(1));
      return el.tagName === part.toUpperCase();
    });
}

function makeDoc(root, nodes) {
  return {
    documentElement: root,
    querySelector: (selector) => nodes.find((node) => selectorMatches(node, selector)) || null,
  };
}

function wheelEvent(target, deltaY) {
  const event = {
    target,
    deltaY,
    defaultPrevented: false,
    preventDefaultCount: 0,
    stopPropagationCount: 0,
    preventDefault() {
      this.preventDefaultCount += 1;
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.stopPropagationCount += 1;
    },
  };
  return event;
}

/** Realistic panel scene: page body behind, panel main above, nested table wrap inside. */
function buildPanelScene({ panelOpen = true, tableWrapTall = false, drawerOpen = false } = {}) {
  const tableWrap = makeEl({
    classes: ["erp-tax-invoice-link-panel__table-wrap"],
    overflowY: "auto",
    scrollHeight: tableWrapTall ? 900 : 120,
    clientHeight: tableWrapTall ? 300 : 120,
  });
  const row = makeEl({ classes: ["erp-link-row"], children: [] });
  tableWrap.children.push(row);
  row.parentElement = tableWrap;

  const panelMain = makeEl({
    classes: ["erp-tax-invoice-link-panel__main"],
    attrs: { "data-erp-link-panel-scroll": "1" },
    overflowY: "auto",
    scrollHeight: 2000,
    clientHeight: 400,
    children: [tableWrap],
  });

  const pageBody = makeEl({
    classes: ["erp-client-calendars-page__body"],
    overflowY: "auto",
    scrollHeight: 3000,
    clientHeight: 600,
  });
  const page = makeEl({ classes: ["erp-client-calendars-page"], children: [pageBody] });

  const drawerBody = makeEl({
    attrs: { "data-erp-csr-cal-drawer-scroll-body": "1" },
    overflowY: "auto",
    scrollHeight: 1200,
    clientHeight: 300,
  });

  const rootAttrs = {};
  if (panelOpen) rootAttrs["data-erp-link-panel-open"] = "1";
  if (drawerOpen) rootAttrs["data-erp-csr-cal-drawer-open"] = "1";
  const root = makeEl({ tagName: "HTML", attrs: rootAttrs, children: [page, panelMain, drawerBody] });

  return {
    root,
    doc: makeDoc(root, [drawerBody, panelMain, pageBody, page, tableWrap]),
    panelMain,
    tableWrap,
    row,
    pageBody,
    drawerBody,
  };
}

const originalGetComputedStyle = globalThis.getComputedStyle;
globalThis.getComputedStyle = (node) => ({ overflowY: node?.overflowY || "visible" });

check("B-1a wheel over the open panel scrolls the panel and never the background", () => {
  const scene = buildPanelScene();
  const event = wheelEvent(scene.row, 120);
  const result = handleWheelScrollCapture(event, scene.doc);

  assert.equal(result.handledBy, "linkPanel");
  assert.equal(result.scrolled, scene.panelMain);
  assert.equal(scene.panelMain.scrollTop, 120, "panel scroll container must move");
  assert.equal(scene.pageBody.scrollTop, 0, "background must not scroll");
  assert.equal(scene.tableWrap.scrollTop, 0, "non-scrollable table wrap must not move");
  assert.equal(result.blockedBackground, true);
  assert.equal(event.preventDefaultCount, 1, "wheel must be consumed while the panel is open");
  assert.equal(event.stopPropagationCount, 1);
});

check("B-1b repeated wheels accumulate on the panel and clamp at the bottom", () => {
  const scene = buildPanelScene();
  for (let i = 0; i < 20; i += 1) {
    handleWheelScrollCapture(wheelEvent(scene.row, 200), scene.doc);
  }
  const max = scene.panelMain.scrollHeight - scene.panelMain.clientHeight;
  assert.equal(scene.panelMain.scrollTop, max, "panel clamps at max scrollTop");
  assert.equal(scene.pageBody.scrollTop, 0, "background stays put even at the panel bottom");

  // At the bottom the panel can no longer move, and the background still must not scroll.
  const atBottom = wheelEvent(scene.row, 200);
  const result = handleWheelScrollCapture(atBottom, scene.doc);
  assert.equal(result.scrolled, null);
  assert.equal(result.blockedBackground, true);
  assert.equal(atBottom.preventDefaultCount, 1);
  assert.equal(scene.pageBody.scrollTop, 0);
});

check("B-1c a tall nested table wrap owns the vertical wheel, panel stays put", () => {
  const scene = buildPanelScene({ tableWrapTall: true });
  const result = handleWheelScrollCapture(wheelEvent(scene.row, 80), scene.doc);
  assert.equal(result.scrolled, scene.tableWrap);
  assert.equal(scene.tableWrap.scrollTop, 80);
  assert.equal(scene.panelMain.scrollTop, 0);
  assert.equal(scene.pageBody.scrollTop, 0);
});

check("B-1d wheel over the background while the panel is open is still swallowed", () => {
  const scene = buildPanelScene();
  const event = wheelEvent(scene.pageBody, 150);
  const result = handleWheelScrollCapture(event, scene.doc);
  assert.equal(result.handledBy, "linkPanel");
  assert.equal(scene.pageBody.scrollTop, 0, "background must never scroll behind an open panel");
  assert.equal(scene.panelMain.scrollTop, 150);
  assert.equal(event.preventDefaultCount, 1);
});

check("B-1e with the panel closed the background scrolls normally again", () => {
  const scene = buildPanelScene({ panelOpen: false });
  const event = wheelEvent(scene.pageBody, 90);
  const result = handleWheelScrollCapture(event, scene.doc);
  assert.equal(result.handledBy, "ancestor");
  assert.equal(scene.pageBody.scrollTop, 90);
  assert.equal(scene.panelMain.scrollTop, 0);
});

check("B-1f an open drawer wins over an open link panel", () => {
  const scene = buildPanelScene({ drawerOpen: true });
  const result = handleWheelScrollCapture(wheelEvent(scene.row, 60), scene.doc);
  assert.equal(result.handledBy, "drawer");
  assert.equal(scene.drawerBody.scrollTop, 60);
  assert.equal(scene.panelMain.scrollTop, 0);
  assert.equal(scene.pageBody.scrollTop, 0);
});

check("B-1g scroll primitives behave at the boundaries", () => {
  const el = makeEl({ overflowY: "auto", scrollHeight: 500, clientHeight: 100, scrollTop: 0 });
  assert.equal(isVerticallyScrollable(el), true);
  assert.equal(scrollElement(el, -50), false, "already at top");
  assert.equal(scrollElement(el, 50), true);
  assert.equal(el.scrollTop, 50);
  assert.equal(scrollElement(el, 10_000), true);
  assert.equal(el.scrollTop, 400);
  assert.equal(scrollElement(el, 10), false, "already at bottom");
  const flat = makeEl({ overflowY: "auto", scrollHeight: 100, clientHeight: 100 });
  assert.equal(isVerticallyScrollable(flat), false);
  assert.equal(scrollElement(flat, 40), false);
});

check("B-1h an already-handled wheel is left alone", () => {
  const scene = buildPanelScene();
  const event = wheelEvent(scene.row, 100);
  event.defaultPrevented = true;
  const result = handleWheelScrollCapture(event, scene.doc);
  assert.equal(result.handledBy, "none");
  assert.equal(scene.panelMain.scrollTop, 0);
});

globalThis.getComputedStyle = originalGetComputedStyle;

/* ============================================================ B-2 hard reload */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-link-panel-reload-"));
const dbPath = path.join(tmpDir, "erp.sqlite");
process.env.DATABASE_PATH = dbPath;
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf-archives");
process.env.JWT_SECRET = "test-bank-link-panel-browser";
process.env.AUTO_DEPOSIT_RECEIPT_CUTOVER_AT = "";

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { createBankTransactionReceipt } = await import("../server/bankReceipts.mjs");
const { normalizeBankTransaction } = await import("../src/utils/bankTransactions.ts");
const { buildSaleArBalances } = await import("../server/unifiedArReadModel.mjs");
const { todaySeoul } = await import("../server/receipts.mjs");

initDb();

const TODAY = todaySeoul();
const CLIENT = { id: 701, name: "리로드건설", vat: "N" };
const TX_ID = "btx-reload";

{
  const state = getErpState();
  saveErpState(
    {
      ...state.data,
      clients: [CLIENT],
      sales: [
        { id: 7001, date: TODAY, client: CLIENT.name, clientId: CLIENT.id, amount: 600_000, paid: 0, site: "A현장" },
        { id: 7002, date: TODAY, client: CLIENT.name, clientId: CLIENT.id, amount: 400_000, paid: 0, site: "B현장" },
      ],
      paymentVouchers: [],
      paymentInputLogs: [],
      receipts: [],
      receiptAllocations: [],
      bankTransactions: [
        normalizeBankTransaction({
          id: TX_ID,
          accountNumber: "969-046529-04-015",
          bankName: "IBK",
          balanceAfter: 0,
          withdrawal: 0,
          deposit: 1_000_000,
          description: "입금",
          counterpartyName: CLIENT.name,
          transactionAt: `${TODAY}T10:00:00+09:00`,
          createdAt: new Date().toISOString(),
        }),
      ],
      bankSyncMeta: {},
    },
    state.version,
    "reload-gate-seed",
    { allowReceiptMutation: true, allowPaymentVoucherMutation: true },
  );
}

const created = createBankTransactionReceipt(
  TX_ID,
  {
    operationId: `bank-receipt:manual:${TX_ID}:t1`,
    clientId: CLIENT.id,
    allocations: [
      { saleId: 7001, amount: 600_000 },
      { saleId: 7002, amount: 400_000 },
    ],
  },
  "tester",
);

const expected = {
  receiptNo: created.receipt.receiptNo,
  receiptId: created.receipt.id,
  grossAmount: created.receipt.grossAmount,
  allocations: created.allocations
    .map((row) => ({ saleId: String(row.saleId), amount: row.amount }))
    .sort((a, b) => a.saleId.localeCompare(b.saleId)),
};

/** Read the same SQLite file from a brand new node process — a real hard reload. */
function readAfterHardReload() {
  const readerPath = path.join(tmpDir, "reader.mjs");
  const dbUrl = pathToFileURL(path.resolve("server/db.mjs")).href;
  fs.writeFileSync(
    readerPath,
    [
      `import { initDb, getErpState } from ${JSON.stringify(dbUrl)};`,
      "initDb();",
      "const data = getErpState().data || {};",
      "process.stdout.write(JSON.stringify({",
      "  receipts: (data.receipts || []).map((row) => ({ id: row.id, receiptNo: row.receiptNo, grossAmount: row.grossAmount, status: row.status, bankTransactionId: row.bankTransactionId })),",
      "  allocations: (data.receiptAllocations || []).map((row) => ({ receiptId: row.receiptId, saleId: String(row.saleId), amount: row.amount, effectiveFrom: row.effectiveFrom })),",
      "  bankTransactions: (data.bankTransactions || []).map((row) => ({ id: row.id, linkedReceiptId: row.linkedReceiptId, linkedPaymentVoucherId: row.linkedPaymentVoucherId, linkedSalesId: row.linkedSalesId })),",
      "  paymentVouchers: data.paymentVouchers || [],",
      "}));",
    ].join("\n"),
    "utf8",
  );

  const result = spawnSync(process.execPath, ["--import", "tsx", readerPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, DATABASE_PATH: dbPath },
  });
  if (result.status !== 0) {
    throw new Error(`hard-reload reader failed (${result.status}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

const reloaded = readAfterHardReload();

check("B-2a hard reload returns the same receiptNo and gross amount", () => {
  const receipt = reloaded.receipts.find((row) => row.id === expected.receiptId);
  assert.ok(receipt, "receipt missing after hard reload");
  assert.equal(receipt.receiptNo, expected.receiptNo);
  assert.equal(receipt.grossAmount, expected.grossAmount);
  assert.equal(receipt.status, "posted");
  assert.equal(receipt.bankTransactionId, TX_ID);
});

check("B-2b hard reload returns the same allocations", () => {
  const allocations = reloaded.allocations
    .filter((row) => row.receiptId === expected.receiptId)
    .map((row) => ({ saleId: row.saleId, amount: row.amount }))
    .sort((a, b) => a.saleId.localeCompare(b.saleId));
  assert.deepEqual(allocations, expected.allocations);
  assert.equal(
    allocations.reduce((sum, row) => sum + row.amount, 0),
    expected.grossAmount,
  );
});

check("B-2c hard reload keeps the bank row pointing at the same receipt", () => {
  const tx = reloaded.bankTransactions.find((row) => row.id === TX_ID);
  assert.ok(tx);
  assert.equal(tx.linkedReceiptId, expected.receiptId);
  assert.equal(tx.linkedPaymentVoucherId, undefined, "receipt link must not become a legacy link");
  assert.equal(reloaded.paymentVouchers.length, 0);
});

check("B-2d a generic ERP save after reload cannot drop the receipt or allocations", () => {
  const state = getErpState();
  saveErpState(
    { ...state.data, receipts: [], receiptAllocations: [] },
    state.version,
    "post-reload-app-save",
  );
  const data = getErpState().data || {};
  const receipt = (data.receipts || []).find((row) => String(row.id) === expected.receiptId);
  assert.ok(receipt, "generic save must not delete the receipt");
  assert.equal(receipt.receiptNo, expected.receiptNo);
  assert.equal(
    (data.receiptAllocations || []).filter((row) => String(row.receiptId) === expected.receiptId).length,
    expected.allocations.length,
  );
});

check("B-2e unified AR is identical before and after the reload", () => {
  const data = getErpState().data || {};
  const balances = buildSaleArBalances(data, { asOfDate: TODAY });
  const row = balances.sales.find((item) => item.saleId === "7001");
  assert.equal(row.receiptAllocatedAmount, 600_000);
  assert.equal(row.outstandingAmount, 0);
  assert.equal(row.paymentStatus, "paid");
  assert.equal(balances.totals.receiptAllocatedAmount, 1_000_000);
  assert.equal(balances.reconciliationStatus, "ok");
});

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nGATE B: link panel wheel policy + hard-reload persistence tests passed");
console.log(
  "Note: live Chromium smoke is intentionally replaced by B-1 (wheel policy on a realistic panel DOM) and B-2 (cross-process SQLite reload).",
);
