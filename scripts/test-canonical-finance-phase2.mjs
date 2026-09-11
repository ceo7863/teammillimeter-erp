/**
 * Phase 2 finance UX automated gates.
 * Run: node --import tsx scripts/test-canonical-finance-phase2.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-finance-phase2-"));
process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
process.env.JWT_SECRET = "test-finance-phase2";
process.env.PDF_ARCHIVE_DIR = path.join(tmpDir, "pdf");

const { initDb, getErpState, saveErpState } = await import("../server/db.mjs");
const { registerCanonicalReceipt, proposeFifoAllocations } = await import("../server/receipts.mjs");
const { collectSentStatementSaleIds } = await import("../server/canonicalCollection.mjs");
const { resolveBankDepositClient, upsertUnresolvedDepositQueue } = await import("../server/bankDepositDecision.mjs");
const { selectRecentUnlinkedDepositIds, buildSentStatementMatchCandidates } = await import("../src/utils/bankSentStatementMatch.ts");
const { applySentStatementAutoLinksToErpData } = await import("../server/bankSentStatementAutoLink.ts");
const { createAndPostDisbursement, reverseDisbursement, listContractorPayablesFromSales } = await import("../server/disbursements.mjs");
const { handleWheelScrollCapture } = await import("../src/utils/wheelScrollCapture.ts");
const { deriveCollectionStatus, collectionStatusLabel, derivePayoutStatus, payoutStatusLabel } = await import("../src/utils/calendarFinanceStatus.ts");
const { isDisbursementWriteEnabled } = await import("../src/utils/featureFlags.ts");

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("PASS: " + name); }
  catch (error) { failed += 1; console.error("FAIL: " + name); console.error(error); }
}
async function checkAsync(name, fn) {
  try { await fn(); console.log("PASS: " + name); }
  catch (error) { failed += 1; console.error("FAIL: " + name); console.error(error); }
}

initDb();
{
  const state = getErpState();
  saveErpState({
    ...(state.data || {}),
    clients: [{ id: "c1", name: "TestClient", depositNameAliases: "TestAlias" }],
    sales: [
      { id: "s1", client: "TestClient", clientId: "c1", date: "2026-07-01", amount: 8000000, workers: [{ name: "WorkerA", lineSpend: 1000000 }] },
      { id: "s2", client: "TestClient", clientId: "c1", date: "2026-07-05", amount: 6400000, workers: [{ name: "WorkerA", lineSpend: 500000 }] },
    ],
    receipts: [], receiptAllocations: [], bankTransactions: [], paymentVouchers: [],
    workers: [{ id: "w1", name: "WorkerA" }], disbursements: [], disbursementAllocations: [],
  }, state.version, "test", { allowReceiptMutation: true, allowDisbursementMutation: true });
}

check("overlapping statements: saleId union once", () => {
  const archives = [
    { id: "a10", category: "statement-client", subjectName: "TestClient", sentViaLink: true, statementSalesIds: ["s1"] },
    { id: "a20", category: "statement-client", subjectName: "TestClient", sentViaLink: true, statementSalesIds: ["s1", "s2"] },
  ];
  const union = collectSentStatementSaleIds(archives, { clientName: "TestClient", requireSent: true });
  assert.deepEqual(union.saleIds.sort(), ["s1", "s2"]);
});

check("partial receipt then new sale outstanding 940", () => {
  registerCanonicalReceipt({ operationId: "partial-1", clientId: "c1", receiptDate: "2026-07-21", grossAmount: 10000000, channel: "cash", source: "receivables", autoAllocate: true, requireSentStatements: false }, "test");
  const cur = getErpState();
  saveErpState({ ...cur.data, sales: [...(cur.data.sales || []), { id: "s3", client: "TestClient", clientId: "c1", date: "2026-07-25", amount: 5000000 }] }, cur.version, "test", { allowReceiptMutation: true });
  let outstanding = 0;
  const latest = getErpState().data;
  for (const sale of latest.sales || []) {
    if (String(sale.clientId) !== "c1" && sale.client !== "TestClient") continue;
    const billed = Math.round(Number(sale.amount) || 0);
    const applied = (latest.receiptAllocations || []).filter((a) => String(a.saleId) === String(sale.id) && a.status !== "reversed" && !a.reversedEffectiveDate && !a.auditOnly).reduce((s, a) => s + Math.round(Number(a.amount) || 0), 0);
    outstanding += Math.max(billed - applied, 0);
  }
  assert.equal(outstanding, 9400000);
  assert.ok(proposeFifoAllocations);
});

check("amount alone never resolves client", () => {
  assert.equal(resolveBankDepositClient({ id: "tx-amt", deposit: 14400000, counterpartyName: "UnknownPayer", transactionAt: "2026-07-22" }, [{ id: "c1", name: "TestClient" }]).reasonCode, "CLIENT_NOT_FOUND");
});
check("unique alias resolves", () => {
  assert.equal(resolveBankDepositClient({ id: "tx-alias", deposit: 100000, counterpartyName: "TestAlias", transactionAt: "2026-07-22" }, [{ id: "c1", name: "TestClient", depositNameAliases: "TestAlias" }]).status, "resolved");
});
check("ambiguous clients", () => {
  assert.equal(resolveBankDepositClient({ id: "tx-amb", deposit: 100000, counterpartyName: "SameName", transactionAt: "2026-07-22" }, [{ id: "a", name: "SameName" }, { id: "b", name: "SameName" }]).reasonCode, "CLIENT_AMBIGUOUS");
});
check("persistent unresolved older than 30d", () => {
  const txs = [{ id: "old", deposit: 50000, transactionAt: "2026-05-01", counterpartyName: "TestAlias" }];
  assert.ok(selectRecentUnlinkedDepositIds(txs, { lookbackDays: 30, asOfDate: "2026-07-20", minDate: "2026-01-01", persistent: true }).includes("old"));
  assert.ok(!selectRecentUnlinkedDepositIds(txs, { lookbackDays: 30, asOfDate: "2026-07-20", minDate: "2026-01-01", persistent: false }).includes("old"));
});
check("archive occupancy not blocking second partial", () => {
  const tx = { id: "tx-partial-2", deposit: 1000000, counterpartyName: "TestClient", transactionAt: "2026-07-22", linkedPdfArchiveId: "pdf-1" };
  const archives = [{ id: "pdf-1", fileName: "a.pdf", createdAt: "2026-07-10T00:00:00.000Z", category: "statement-client", subjectName: "TestClient", periodStart: "2026-07-01", periodEnd: "2026-07-20", fileSize: 1, pageCount: 1, sentViaLink: true, paymentStatus: "partial", statementTotalAmount: 5000000, linkedBankTransactionId: "tx-partial-1", statementSalesIds: ["s1", "s2"] }];
  const candidates = buildSentStatementMatchCandidates(tx, archives, { clients: [{ id: "c1", name: "TestClient" }], paymentVouchers: [{ linkedPdfArchiveId: "pdf-1", finalAmount: 2000000, bankTransactionId: "tx-partial-1" }], bankTransactions: [{ id: "tx-partial-1", linkedPdfArchiveId: "pdf-1" }] });
  assert.ok(candidates.length >= 1);
});
check("queue firstSeenAt preserved", () => {
  let q = upsertUnresolvedDepositQueue([], { bankTransactionId: "q1", reasonCode: "CLIENT_NOT_FOUND", firstSeenAt: "2026-01-01T00:00:00.000Z" });
  q = upsertUnresolvedDepositQueue(q, { bankTransactionId: "q1", reasonCode: "CLIENT_NOT_FOUND", lastCheckedAt: "2026-07-01T00:00:00.000Z" });
  assert.equal(q[0].firstSeenAt, "2026-01-01T00:00:00.000Z");
});
check("lineSpend no meal double-count", () => {
  assert.equal(listContractorPayablesFromSales([{ id: "sx", date: "2026-07-01", workers: [{ name: "WorkerA", lineSpend: 1100000, meal: 100000, expense: 0 }] }])[0].dueAmount, 1100000);
});
check("calendar status labels", () => {
  assert.equal(deriveCollectionStatus(100, 100), "paid");
  assert.equal(deriveCollectionStatus(100, 40), "partial");
  assert.equal(derivePayoutStatus(1000, 500), "partial");
  assert.ok(String(collectionStatusLabel("partial") || "").length > 0);
  assert.ok(String(payoutStatusLabel("partial") || "").length > 0);
});
check("disbursement write flag default off", () => { assert.equal(isDisbursementWriteEnabled(), false); });

await checkAsync("certain client bank deposit posts receipt", async () => {
  const data = { clients: [{ id: "c1", name: "TestClient", depositNameAliases: "AutoPayer" }], sales: [{ id: "s9", client: "TestClient", clientId: "c1", date: "2026-07-01", amount: 300000 }], receipts: [], receiptAllocations: [], paymentVouchers: [], bankTransactions: [{ id: "tx-client-first", deposit: 250000, counterpartyName: "AutoPayer", transactionAt: "2026-09-01", createdAt: "2026-09-01T00:00:00.000Z" }], bankSyncMeta: { bankReceiptCutoverAt: "2026-01-01T00:00:00.000Z" } };
  const result = await applySentStatementAutoLinksToErpData(data, { onlyTransactionIds: ["tx-client-first"], addedIds: ["tx-client-first"], updatedBy: "test", deferPdfMeta: true, nowIso: "2026-09-02T00:00:00.000Z" });
  assert.equal(result.receiptIds.length, 1);
});
await checkAsync("uncertain client persistent queue", async () => {
  const data = { clients: [{ id: "c1", name: "TestClient" }], sales: [], receipts: [], receiptAllocations: [], paymentVouchers: [], bankTransactions: [{ id: "tx-unknown", deposit: 100000, counterpartyName: "UnknownPerson", transactionAt: "2026-09-01", createdAt: "2026-09-01T00:00:00.000Z" }], bankSyncMeta: { bankReceiptCutoverAt: "2026-01-01T00:00:00.000Z" } };
  const result = await applySentStatementAutoLinksToErpData(data, { onlyTransactionIds: ["tx-unknown"], addedIds: ["tx-unknown"], deferPdfMeta: true, nowIso: "2026-09-02T00:00:00.000Z" });
  assert.equal(result.receiptIds.length, 0);
  assert.equal(result.unresolvedQueue.find((row) => row.bankTransactionId === "tx-unknown")?.reasonCode, "CLIENT_NOT_FOUND");
});
await checkAsync("partial disbursement + reverse", async () => {
  const created = createAndPostDisbursement({ __testBypassCutover: true,  operationId: "d1", workerName: "WorkerA", disbursementDate: "2026-07-10", grossAmount: 500000, channel: "bank", autoAllocate: true }, "test");
  createAndPostDisbursement({ __testBypassCutover: true,  operationId: "d2", workerName: "WorkerA", disbursementDate: "2026-07-11", grossAmount: 300000, channel: "bank", autoAllocate: true }, "test");
  createAndPostDisbursement({ __testBypassCutover: true,  operationId: "d3", workerName: "WorkerA", disbursementDate: "2026-07-12", grossAmount: 200000, channel: "bank", autoAllocate: true }, "test");
  reverseDisbursement(created.disbursement.id, { __testBypassCutover: true,  operationId: "d1-rev"  }, "test");
});
check("wheel helper", () => assert.equal(typeof handleWheelScrollCapture, "function"));

console.log(failed === 0 ? "\ncanonical finance phase2: ALL PASS" : ("\n" + failed + " failed"));
if (failed) process.exit(1);
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

