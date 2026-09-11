/**
 * Finance IA / single-entry UX gates.
 * Run: node --import tsx scripts/test-finance-ia.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const {
  FINANCE_ROUTE_INVENTORY,
  listCompatibilityRedirects,
  migrateSalesStatementsPageKey,
  countActionableExceptionBadge,
  HISTORICAL_EXCEPTION_EXCLUDED,
  REPORTS_ANALYSIS_DECISION,
} = await import("../src/utils/financeInformationArchitecture.ts");

const { canonicalizeFinanceShellPage } = await import("../src/utils/sidebarOrder.ts");

let failed = 0;
const results = {};

function check(name, fn) {
  try {
    fn();
    results[name] = "PASS";
    console.log("PASS:", name);
  } catch (error) {
    failed += 1;
    results[name] = "FAIL";
    console.error("FAIL:", name);
    console.error(error?.message || error);
  }
}

check("redirect coverage 100% for decision===redirect rows", () => {
  const expected = FINANCE_ROUTE_INVENTORY.filter((row) => row.decision === "redirect");
  const actual = listCompatibilityRedirects();
  assert.equal(actual.length, expected.length, "redirect count mismatch");
  const keys = new Set(actual.map((row) => row.legacyKey));
  for (const row of expected) {
    assert.ok(keys.has(row.legacyKey), "missing redirect coverage for " + row.legacyKey);
    assert.ok(row.targetPage, "redirect " + row.legacyKey + " missing targetPage");
  }
  assert.equal(keys.size, expected.length);
});

check("salesInput to sales+register", () => {
  assert.deepEqual(migrateSalesStatementsPageKey("salesInput"), { page: "sales", salesTab: "register" });
});

check("statements to sales+statements", () => {
  assert.deepEqual(migrateSalesStatementsPageKey("statements"), { page: "sales", salesTab: "statements" });
});

check("pdfArchive to sales+statements", () => {
  assert.deepEqual(migrateSalesStatementsPageKey("pdfArchive"), { page: "sales", salesTab: "statements" });
});

check("paymentInput canonicalize to receivables", () => {
  assert.equal(canonicalizeFinanceShellPage("paymentInput"), "receivables");
});

check("bankTransactions canonicalize to accounting", () => {
  assert.equal(canonicalizeFinanceShellPage("bankTransactions"), "accounting");
});

check("badge excludes historical kinds", () => {
  const badge = countActionableExceptionBadge([
    { kind: "legacy_expense_mismatch", status: "open" },
    { kind: "legacy_unattributed_payment", status: "open" },
    { kind: "historical_expense_mismatch_492", status: "open" },
    { kind: "historical_unattributed_payout_156", status: "open" },
    { kind: "actionable_demo", status: "open" },
    { kind: "resolved_demo", status: "resolved" },
    { kind: "ignored_demo", ignored: true },
  ]);
  assert.equal(badge, 1);
});

check("historical excluded counts 492+156", () => {
  assert.equal(HISTORICAL_EXCEPTION_EXCLUDED.expenseMismatch, 492);
  assert.equal(HISTORICAL_EXCEPTION_EXCLUDED.unattributedPayment, 156);
  assert.equal(HISTORICAL_EXCEPTION_EXCLUDED.expenseMismatch + HISTORICAL_EXCEPTION_EXCLUDED.unattributedPayment, 648);
});

check("REPORTS_ANALYSIS_DECISION.merge === false", () => {
  assert.equal(REPORTS_ANALYSIS_DECISION.merge, false);
});

check("App.tsx mounts SalesStatementsHubPage", () => {
  const appSrc = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.ok(appSrc.includes("SalesStatementsHubPage"));
  assert.ok(appSrc.includes("migrateStoredActiveTab"));
  assert.ok(/<SalesStatementsHubPage[\s>]/.test(appSrc));
});

check("ReceiptRegisterModal is register component", () => {
  assert.ok(fs.existsSync(path.join(root, "src/components/ReceiptRegisterModal.tsx")));
  const appSrc = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const receivablesSrc = fs.readFileSync(path.join(root, "src/components/PaymentReceivablesPage.tsx"), "utf8");
  const importNeedle = "@/components/ReceiptRegisterModal";
  const importCount = [appSrc, receivablesSrc].filter((src) => src.includes(importNeedle)).length;
  assert.ok(importCount >= 1, "ReceiptRegisterModal import count < 1");
  assert.ok(receivablesSrc.includes("<ReceiptRegisterModal"));
});

check("DisbursementRegisterModal is register component", () => {
  assert.ok(fs.existsSync(path.join(root, "src/components/DisbursementRegisterModal.tsx")));
  const workerSrc = fs.readFileSync(path.join(root, "src/components/WorkerPaymentsPage.tsx"), "utf8");
  const bankSrc = fs.readFileSync(path.join(root, "src/components/BankTransactionsPage.tsx"), "utf8");
  const importNeedle = "@/components/DisbursementRegisterModal";
  const importCount = [workerSrc, bankSrc].filter((src) => src.includes(importNeedle)).length;
  assert.ok(importCount >= 1, "DisbursementRegisterModal import count < 1");
  assert.ok(workerSrc.includes("<DisbursementRegisterModal"));
});

const summary = {
  ok: failed === 0,
  failed,
  passed: Object.values(results).filter((v) => v === "PASS").length,
  results,
  redirectRows: listCompatibilityRedirects().map((row) => row.legacyKey),
  reportsAnalysisMerge: REPORTS_ANALYSIS_DECISION.merge,
  historicalExcluded: HISTORICAL_EXCEPTION_EXCLUDED,
};

console.log(JSON.stringify({ PASS: summary }, null, 2));
if (failed) {
  console.error("finance IA gates failed: " + failed);
  process.exit(1);
}
console.log("finance IA: ALL PASS");
