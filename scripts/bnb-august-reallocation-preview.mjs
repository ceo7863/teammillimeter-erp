/**
 * READ-ONLY preview: RCP-20260914-0001 / client 97 August 2026 reallocation candidates.
 *
 * NEVER calls saveErpState or replaceReceiptAllocations.
 *
 *   DATABASE_PATH=/path/to/erp.sqlite node scripts/bnb-august-reallocation-preview.mjs
 *   ERP_ROOT=/path/to/erp node scripts/bnb-august-reallocation-preview.mjs
 */

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

if (!process.env.DATABASE_PATH && process.env.ERP_ROOT) {
  process.env.DATABASE_PATH = path.join(process.env.ERP_ROOT, "data", "erp.sqlite");
}
if (!process.env.DATABASE_PATH) {
  // Prefer env; fall back to repo data path (may be empty in worktree).
  process.env.DATABASE_PATH = path.join(repoRoot, "data", "erp.sqlite");
}

const TARGET_RECEIPT_NO = "RCP-20260914-0001";
const TARGET_CLIENT_ID = "97";
const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function ymd(value) {
  return String(value || "").slice(0, 10);
}

function saleBelongsToClient(sale, clientId, clientName) {
  if (!sale) return false;
  if (sale.clientId != null && String(sale.clientId).trim() !== "") {
    return String(sale.clientId) === String(clientId);
  }
  const name = String(sale.client || "").trim();
  return Boolean(clientName) && name === String(clientName).trim();
}

async function main() {
  const root = process.env.ERP_ROOT || path.resolve(__dirname, "..");
  process.chdir(root);
  const { getErpState, initDb } = await import(path.join(root, "server/db.mjs"));
  if (typeof initDb === "function") initDb();
  const { proposeFifoAllocations, listReceipts, listReceiptAllocations } = await import(
    path.join(root, "server/receipts.mjs")
  );
  const { proposeFifoAllocationsScoped, collectSentStatementSaleIds } = await import(
    path.join(root, "server/canonicalCollection.mjs")
  );
  const targetModule = process.env.ALLOCATION_TARGET_MODULE || path.join(root, "server/allocationTarget.mjs");
  const { planAllocationsForTarget } = await import(targetModule);
  let archives = [];
  try {
    const { listPdfArchiveMetas } = await import(path.join(root, "server/pdfArchive.mjs"));
    archives = listPdfArchiveMetas() || [];
  } catch {
    archives = [];
  }

  const state = getErpState();
  const data = state.data || {};
  const clients = data.clients || [];
  const sales = data.sales || [];
  const receipts = listReceipts(data);
  const allocations = listReceiptAllocations(data);

  const client =
    clients.find((row) => String(row.id) === TARGET_CLIENT_ID) ||
    clients.find((row) => String(row.name || "").includes("비앤비"));

  const receipt =
    receipts.find((row) => String(row.receiptNo) === TARGET_RECEIPT_NO) ||
    receipts.find((row) => String(row.id) === "rcp_mu0fx94z_becfadd2");

  const clientId = String(client?.id || TARGET_CLIENT_ID);
  const clientName = String(client?.name || "비앤비디자인");

  const augustSales = sales
    .filter((sale) => saleBelongsToClient(sale, clientId, clientName))
    .filter((sale) => {
      const d = ymd(sale.date);
      return d >= PERIOD_START && d <= PERIOD_END;
    })
    .filter((sale) => sale.status !== "cancelled" && sale.cancelled !== true)
    .map((sale) => ({
      id: sale.id,
      date: ymd(sale.date),
      amount: money(sale.amount),
      site: sale.site || "",
      voucherNo: sale.voucherNo || "",
      memo: sale.memo || "",
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));

  const augustTotal = augustSales.reduce((sum, row) => sum + money(row.amount), 0);

  const statementScope = collectSentStatementSaleIds(archives, {
    clientId,
    clientName,
    requireSent: false,
  });

  const augustStatements = (statementScope.documents || [])
    .map((doc) => {
      const archive = (archives || []).find((row) => String(row.id) === String(doc.archiveId));
      const saleIds = Array.isArray(archive?.statementSalesIds) ? archive.statementSalesIds.map(String) : [];
      const augustIds = saleIds.filter((id) => augustSales.some((s) => String(s.id) === id));
      const periodStart = ymd(doc.periodStart || archive?.periodStart);
      const periodEnd = ymd(doc.periodEnd || archive?.periodEnd);
      const overlapsAugust =
        (periodStart && periodStart <= PERIOD_END && (!periodEnd || periodEnd >= PERIOD_START)) ||
        augustIds.length > 0;
      if (!overlapsAugust) return null;
      return {
        archiveId: doc.archiveId,
        subjectName: doc.subjectName,
        periodStart,
        periodEnd,
        sent: doc.sent,
        saleIds,
        augustSaleIds: augustIds,
        augustSaleCount: augustIds.length,
      };
    })
    .filter(Boolean);

  const uniqueStatementSaleUnions = new Map();
  for (const doc of augustStatements) {
    const key = [...doc.augustSaleIds].sort().join(",");
    if (!uniqueStatementSaleUnions.has(key)) {
      uniqueStatementSaleUnions.set(key, []);
    }
    uniqueStatementSaleUnions.get(key).push(doc);
  }

  const currentAllocations = receipt
    ? allocations
        .filter((row) => String(row.receiptId) === String(receipt.id))
        .filter((row) => row.status !== "reversed" && !row.reversedEffectiveDate && !row.auditOnly)
        .map((row) => {
          const sale = sales.find((s) => String(s.id) === String(row.saleId));
          return {
            allocationId: row.id,
            saleId: row.saleId,
            amount: money(row.amount),
            saleDate: ymd(sale?.date),
            site: sale?.site || "",
            status: row.status || "posted",
            effectiveFrom: row.effectiveFrom || row.allocationEffectiveDate || null,
          };
        })
        .sort(
          (a, b) =>
            String(a.saleDate).localeCompare(String(b.saleDate)) ||
            String(a.saleId).localeCompare(String(b.saleId)),
        )
    : [];

  const currentAllocatedTotal = currentAllocations.reduce((sum, row) => sum + money(row.amount), 0);
  const grossAmount = money(receipt?.grossAmount || 15_000_000);

  const existingAllocationsExcludingReceipt = allocations.filter(
    (row) => !receipt || String(row.receiptId) !== String(receipt.id),
  );

  const candidatePlans = [];

  // STATEMENT candidates — one plan per unique august saleId union; list all if ambiguous
  if (uniqueStatementSaleUnions.size === 1) {
    const [saleKey, docs] = [...uniqueStatementSaleUnions.entries()][0];
    const saleIds = saleKey ? saleKey.split(",").filter(Boolean) : [];
    const plan = planAllocationsForTarget({
      mode: "STATEMENT",
      sales,
      client: client || { id: clientId, name: clientName },
      clients,
      grossAmount,
      existingAllocations: existingAllocationsExcludingReceipt,
      receipts,
      asOfDate: receipt?.receiptDate || PERIOD_END,
      statementSaleIds: saleIds,
      proposeFifoAllocations,
      proposeFifoAllocationsScoped,
    });
    candidatePlans.push({
      kind: "STATEMENT",
      unique: true,
      statements: docs,
      saleIds,
      plan,
    });
  } else if (uniqueStatementSaleUnions.size > 1) {
    for (const [saleKey, docs] of uniqueStatementSaleUnions.entries()) {
      const saleIds = saleKey ? saleKey.split(",").filter(Boolean) : [];
      const plan = planAllocationsForTarget({
        mode: "STATEMENT",
        sales,
        client: client || { id: clientId, name: clientName },
        clients,
        grossAmount,
        existingAllocations: existingAllocationsExcludingReceipt,
        receipts,
        asOfDate: receipt?.receiptDate || PERIOD_END,
        statementSaleIds: saleIds,
        proposeFifoAllocations,
        proposeFifoAllocationsScoped,
      });
      candidatePlans.push({
        kind: "STATEMENT",
        unique: false,
        ambiguous: true,
        statements: docs,
        saleIds,
        plan,
      });
    }
  } else {
    candidatePlans.push({
      kind: "STATEMENT",
      unique: false,
      available: false,
      message: "8월 관련 발송 내역서 후보가 없습니다.",
      plan: null,
    });
  }

  // PERIOD Aug 1–31
  const periodPlan = planAllocationsForTarget({
    mode: "PERIOD",
    sales,
    client: client || { id: clientId, name: clientName },
    clients,
    grossAmount,
    existingAllocations: existingAllocationsExcludingReceipt,
    receipts,
    asOfDate: receipt?.receiptDate || PERIOD_END,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    proposeFifoAllocations,
    proposeFifoAllocationsScoped,
  });
  candidatePlans.push({
    kind: "PERIOD",
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    plan: periodPlan,
  });

  // SELECTED_SALES — all august sale ids FIFO within allowlist
  const selectedPlan = planAllocationsForTarget({
    mode: "SELECTED_SALES",
    sales,
    client: client || { id: clientId, name: clientName },
    clients,
    grossAmount,
    existingAllocations: existingAllocationsExcludingReceipt,
    receipts,
    asOfDate: receipt?.receiptDate || PERIOD_END,
    saleIds: augustSales.map((row) => row.id),
    proposeFifoAllocations,
    proposeFifoAllocationsScoped,
  });
  candidatePlans.push({
    kind: "SELECTED_SALES",
    saleIds: augustSales.map((row) => row.id),
    plan: selectedPlan,
  });

  // Partial + prepaid: allocate min(gross, august unpaid) then leave remainder unapplied
  const augustUnpaidEstimate = augustSales.reduce((sum, row) => {
    const already = existingAllocationsExcludingReceipt
      .filter((a) => String(a.saleId) === String(row.id))
      .filter((a) => a.status !== "reversed" && !a.reversedEffectiveDate && !a.auditOnly)
      .reduce((s, a) => s + money(a.amount), 0);
    return sum + Math.max(money(row.amount) - already, 0);
  }, 0);
  const partialApply = Math.min(grossAmount, augustUnpaidEstimate);
  const partialPlan = planAllocationsForTarget({
    mode: "SELECTED_SALES",
    sales,
    client: client || { id: clientId, name: clientName },
    clients,
    grossAmount: partialApply,
    existingAllocations: existingAllocationsExcludingReceipt,
    receipts,
    asOfDate: receipt?.receiptDate || PERIOD_END,
    saleIds: augustSales.map((row) => row.id),
    proposeFifoAllocations,
    proposeFifoAllocationsScoped,
  });
  candidatePlans.push({
    kind: "PARTIAL_PLUS_PREPAID",
    applyAmount: partialApply,
    prepaidRemainder: Math.max(grossAmount - partialApply, 0),
    augustUnpaidEstimate,
    plan: {
      ...partialPlan,
      unallocatedAmount: money(partialPlan.unallocatedAmount) + Math.max(grossAmount - partialApply, 0),
      grossAmount,
    },
  });

  const ambiguous =
    uniqueStatementSaleUnions.size > 1 ||
    (augustTotal > 0 && augustTotal !== grossAmount) ||
    candidatePlans.filter((c) => c.kind === "STATEMENT" && c.plan).length > 1;

  const result = {
    readOnly: true,
    mutatesProduction: false,
    receipt: receipt
      ? {
          id: receipt.id,
          receiptNo: receipt.receiptNo,
          clientId: receipt.clientId,
          clientName: receipt.clientName,
          receiptDate: receipt.receiptDate,
          createdAt: receipt.createdAt,
          grossAmount: money(receipt.grossAmount),
          status: receipt.status,
          channel: receipt.channel,
          source: receipt.source,
        }
      : null,
    client: { id: clientId, name: clientName },
    augustSales: {
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      count: augustSales.length,
      totalAmount: augustTotal,
      rows: augustSales,
    },
    statements: augustStatements,
    currentAllocations: {
      count: currentAllocations.length,
      totalAmount: currentAllocatedTotal,
      rows: currentAllocations,
      note: "현재 6~7월 배정(read-only). 이번 스크립트는 변경하지 않습니다.",
    },
    candidatePlans,
    ambiguous,
    autoPick: null,
    message: ambiguous
      ? "후보가 복수이거나 금액이 불일치합니다. 자동 선택하지 않습니다."
      : "후보를 검토하세요. 운영 apply는 별도 승인 전까지 금지입니다.",
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error), code: error?.code || null }));
  process.exitCode = 1;
});
