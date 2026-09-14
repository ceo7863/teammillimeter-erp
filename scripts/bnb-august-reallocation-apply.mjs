/**
 * B&B (client 97) August 2026 reallocation — preview (default) or guarded apply.
 *
 *   BNB_MODE=preview  (default) — read-only JSON before/after plan
 *   BNB_MODE=apply    — mutates ONLY when BNB_APPLY_CONFIRM=YES_REALLOCATE_BNB_AUGUST_2026
 *                       and every precondition passes (else mutations: 0)
 *
 * Do NOT run apply against production from an unattended agent session.
 *
 *   DATABASE_PATH=/path/to/erp.sqlite node scripts/bnb-august-reallocation-apply.mjs
 */

import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

if (!process.env.DATABASE_PATH && process.env.ERP_ROOT) {
  process.env.DATABASE_PATH = path.join(process.env.ERP_ROOT, "data", "erp.sqlite");
}
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(repoRoot, "data", "erp.sqlite");
}

export const BNB_TARGET = Object.freeze({
  receiptId: "rcp_mu0fx94z_becfadd2",
  receiptNo: "RCP-20260914-0001",
  clientId: "97",
  grossAmount: 15_000_000,
  channel: "cash",
  receiptDate: "2026-09-11",
  openAllocationCount: 20,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  operationId: "bnb-aug-realloc:rcp_mu0fx94z_becfadd2:2026-08",
  confirmToken: "YES_REALLOCATE_BNB_AUGUST_2026",
  reasonCode: "CUSTOMER_SPECIFIED_TARGET_PERIOD_CORRECTION",
  reasonText: "비앤비디자인 15,000,000원은 2026년 8월 매출분",
});

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

function isOpenAllocation(row) {
  if (!row) return false;
  if (row.auditOnly) return false;
  if (row.status === "reversed") return false;
  if (row.reversedEffectiveDate) return false;
  return true;
}

/**
 * Pure precondition + PERIOD plan. Never writes.
 * @returns {{ ok: boolean, code?: string, failures: string[], receipt, client, before, plan, afterPreview }}
 */
export function diagnoseBnbAugustReallocation(data, deps = {}) {
  const {
    planAllocationsForTarget,
    proposeFifoAllocations,
    proposeFifoAllocationsScoped,
    listReceipts,
    listReceiptAllocations,
  } = deps;

  const failures = [];
  const T = BNB_TARGET;
  const clients = data.clients || [];
  const sales = data.sales || [];
  const receipts = typeof listReceipts === "function" ? listReceipts(data) : data.receipts || [];
  const allocations =
    typeof listReceiptAllocations === "function" ? listReceiptAllocations(data) : data.receiptAllocations || [];

  const client =
    clients.find((row) => String(row.id) === T.clientId) ||
    clients.find((row) => String(row.name || "").includes("비앤비"));
  if (!client || String(client.id) !== T.clientId) {
    failures.push(`clientId ${T.clientId} not found/active`);
  }
  const clientName = String(client?.name || "비앤비디자인");

  const receipt =
    receipts.find((row) => String(row.id) === T.receiptId) ||
    receipts.find((row) => String(row.receiptNo) === T.receiptNo);

  if (!receipt) failures.push("target receipt not found");
  if (receipt && String(receipt.id) !== T.receiptId) failures.push(`receiptId mismatch: ${receipt.id}`);
  if (receipt && String(receipt.receiptNo) !== T.receiptNo) failures.push(`receiptNo mismatch: ${receipt.receiptNo}`);
  if (receipt && String(receipt.clientId) !== T.clientId) failures.push(`receipt clientId mismatch: ${receipt.clientId}`);
  if (receipt && money(receipt.grossAmount) !== T.grossAmount) {
    failures.push(`grossAmount mismatch: ${receipt.grossAmount}`);
  }
  if (receipt && String(receipt.channel) !== T.channel) failures.push(`channel mismatch: ${receipt.channel}`);
  if (receipt && ymd(receipt.receiptDate) !== T.receiptDate) {
    failures.push(`receiptDate mismatch: ${receipt.receiptDate}`);
  }
  if (receipt && String(receipt.status) !== "posted") failures.push(`status not posted: ${receipt.status}`);
  if (receipt && (receipt.reversedEffectiveDate || receipt.status === "reversed")) {
    failures.push("receipt is reversed");
  }
  if (receipt && receipt.reversalOfReceiptId) failures.push("receipt is a reversal document");

  const openAllocs = receipt
    ? allocations.filter((row) => String(row.receiptId) === String(receipt.id) && isOpenAllocation(row))
    : [];
  const openSum = openAllocs.reduce((sum, row) => sum + money(row.amount), 0);
  if (openAllocs.length !== T.openAllocationCount) {
    failures.push(`open allocation count ${openAllocs.length} !== ${T.openAllocationCount}`);
  }
  if (openSum !== T.grossAmount) failures.push(`open allocation sum ${openSum} !== ${T.grossAmount}`);

  const unallocated = receipt ? Math.max(money(receipt.grossAmount) - openSum, 0) : null;
  if (unallocated !== 0 && receipt) failures.push(`unallocated ${unallocated} !== 0`);

  const events = Array.isArray(receipt?.reallocationEvents) ? receipt.reallocationEvents : [];
  const alreadyApplied = events.some((ev) => String(ev?.operationId || "") === T.operationId);
  const unexpectedEvents = events.filter((ev) => String(ev?.operationId || "") !== T.operationId);
  if (unexpectedEvents.length > 0 && !alreadyApplied) {
    failures.push(`unexpected reallocationEvents: ${unexpectedEvents.map((e) => e.operationId).join(",")}`);
  }

  const augustSales = sales
    .filter((sale) => saleBelongsToClient(sale, T.clientId, clientName))
    .filter((sale) => {
      const d = ymd(sale.date);
      return d >= T.periodStart && d <= T.periodEnd;
    })
    .filter((sale) => sale.status !== "cancelled" && sale.cancelled !== true);

  if (augustSales.length === 0) failures.push("no August 2026 eligible sales for client 97");
  for (const sale of augustSales) {
    if (sale.clientId != null && String(sale.clientId) !== T.clientId) {
      failures.push(`august sale ${sale.id} clientId ${sale.clientId} !== 97`);
    }
  }

  const existingExcluding = allocations.filter(
    (row) => !receipt || String(row.receiptId) !== String(receipt.id),
  );

  let plan = null;
  if (receipt && typeof planAllocationsForTarget === "function") {
    plan = planAllocationsForTarget({
      mode: "PERIOD",
      sales,
      client: client || { id: T.clientId, name: clientName },
      clients,
      grossAmount: T.grossAmount,
      existingAllocations: existingExcluding,
      receipts,
      asOfDate: T.receiptDate,
      periodStart: T.periodStart,
      periodEnd: T.periodEnd,
      proposeFifoAllocations,
      proposeFifoAllocationsScoped,
    });
  }

  const planAllocSum = (plan?.allocations || []).reduce((sum, row) => sum + money(row.amount), 0);
  const planUnapplied = money(plan?.unallocatedAmount);
  if (plan && planAllocSum + planUnapplied !== T.grossAmount) {
    failures.push(`plan identity fail: alloc ${planAllocSum} + unapplied ${planUnapplied} !== ${T.grossAmount}`);
  }
  const outsideAugust = (plan?.allocations || []).filter((row) => {
    const sale = sales.find((s) => String(s.id) === String(row.saleId));
    const d = ymd(sale?.date);
    return !d || d < T.periodStart || d > T.periodEnd;
  });
  if (outsideAugust.length) failures.push(`plan spills outside August: ${outsideAugust.length}`);

  const before = {
    receipt: receipt
      ? {
          id: receipt.id,
          receiptNo: receipt.receiptNo,
          clientId: receipt.clientId,
          grossAmount: money(receipt.grossAmount),
          channel: receipt.channel,
          receiptDate: ymd(receipt.receiptDate),
          status: receipt.status,
          reallocationEventCount: events.length,
        }
      : null,
    openAllocations: {
      count: openAllocs.length,
      sum: openSum,
      unallocated,
      rows: openAllocs.map((row) => {
        const sale = sales.find((s) => String(s.id) === String(row.saleId));
        return {
          allocationId: row.id,
          saleId: row.saleId,
          amount: money(row.amount),
          saleDate: ymd(sale?.date),
        };
      }),
    },
    augustEligibleSales: {
      count: augustSales.length,
      totalAmount: augustSales.reduce((sum, s) => sum + money(s.amount), 0),
    },
    alreadyApplied,
  };

  const afterPreview = plan
    ? {
        operationId: T.operationId,
        effectiveDate: T.receiptDate,
        newAllocationCount: (plan.allocations || []).length,
        newAllocationAmount: planAllocSum,
        unappliedAmount: planUnapplied,
        outsideAugustCount: outsideAugust.length,
        allocations: (plan.allocations || []).map((row) => {
          const sale = sales.find((s) => String(s.id) === String(row.saleId));
          return {
            saleId: row.saleId,
            amount: money(row.amount),
            saleDate: ymd(sale?.date),
          };
        }),
      }
    : null;

  const ok = failures.length === 0 || (alreadyApplied && unexpectedEvents.length === 0 && openAllocs.every((row) => {
    const sale = sales.find((s) => String(s.id) === String(row.saleId));
    const d = ymd(sale?.date);
    return d >= T.periodStart && d <= T.periodEnd;
  }));

  // If already applied idempotently with August opens, treat as ready for idempotent replay.
  let ready = failures.length === 0;
  if (alreadyApplied) {
    const allAugust =
      openAllocs.length > 0 &&
      openAllocs.every((row) => {
        const sale = sales.find((s) => String(s.id) === String(row.saleId));
        const d = ymd(sale?.date);
        return d >= T.periodStart && d <= T.periodEnd;
      });
    if (allAugust && openSum === T.grossAmount) {
      ready = true;
    }
  }

  return {
    ok: ready,
    code: ready ? (alreadyApplied ? "ALREADY_APPLIED" : "READY") : "NOT_READY",
    failures: ready ? [] : failures,
    receipt,
    client: client ? { id: String(client.id), name: clientName } : null,
    before,
    plan,
    afterPreview,
    target: { ...T },
  };
}

async function loadDeps(root) {
  const { getErpState, initDb } = await import(pathToFileURL(path.join(root, "server/db.mjs")).href);
  if (typeof initDb === "function") initDb();
  const receiptsMod = await import(pathToFileURL(path.join(root, "server/receipts.mjs")).href);
  const { planAllocationsForTarget } = await import(
    pathToFileURL(path.join(root, "server/allocationTarget.mjs")).href,
  );
  const { proposeFifoAllocationsScoped } = await import(
    pathToFileURL(path.join(root, "server/canonicalCollection.mjs")).href,
  );
  return {
    getErpState,
    ...receiptsMod,
    planAllocationsForTarget,
    proposeFifoAllocationsScoped,
  };
}

export async function runBnbAugustReallocation({ mode = "preview", confirm = "" } = {}) {
  const root = process.env.ERP_ROOT || repoRoot;
  process.chdir(root);
  const deps = await loadDeps(root);
  const state = deps.getErpState();
  const data = state.data || {};

  const diagnosis = diagnoseBnbAugustReallocation(data, {
    planAllocationsForTarget: deps.planAllocationsForTarget,
    proposeFifoAllocations: deps.proposeFifoAllocations,
    proposeFifoAllocationsScoped: deps.proposeFifoAllocationsScoped,
    listReceipts: deps.listReceipts,
    listReceiptAllocations: deps.listReceiptAllocations,
  });

  const resolvedMode = String(mode || process.env.BNB_MODE || "preview").toLowerCase();
  const result = {
    mode: resolvedMode,
    mutatesProduction: false,
    mutations: 0,
    diagnosis,
    apply: null,
  };

  if (resolvedMode !== "apply") {
    result.message = "preview only — no mutations";
    return result;
  }

  const confirmToken = String(confirm || process.env.BNB_APPLY_CONFIRM || "").trim();
  if (confirmToken !== BNB_TARGET.confirmToken) {
    result.code = "CONFIRM_REQUIRED";
    result.message = `apply aborted: set BNB_APPLY_CONFIRM=${BNB_TARGET.confirmToken}`;
    return result;
  }

  if (!diagnosis.ok) {
    result.code = "NOT_READY";
    result.message = "preconditions failed — mutations: 0";
    return result;
  }

  const T = BNB_TARGET;
  const allocationsPayload = (diagnosis.plan?.allocations || []).map((row) => ({
    saleId: row.saleId,
    amount: money(row.amount),
  }));

  try {
    const out = deps.replaceReceiptAllocations(
      T.receiptId,
      {
        operationId: T.operationId,
        effectiveDate: T.receiptDate,
        allocations: allocationsPayload,
        memo: T.reasonText,
        reasonCode: T.reasonCode,
        reasonText: T.reasonText,
        targetMode: "PERIOD",
        targetFrom: T.periodStart,
        targetTo: T.periodEnd,
        periodStart: T.periodStart,
        periodEnd: T.periodEnd,
      },
      "bnb-august-reallocation",
    );

    const afterState = deps.getErpState();
    const afterData = afterState.data || {};
    const afterReceipts = deps.listReceipts(afterData);
    const afterAllocs = deps.listReceiptAllocations(afterData);
    const afterReceipt = afterReceipts.find((row) => String(row.id) === T.receiptId);
    const afterOpen = afterAllocs.filter(
      (row) => String(row.receiptId) === T.receiptId && isOpenAllocation(row),
    );
    const afterOpenSum = afterOpen.reduce((sum, row) => sum + money(row.amount), 0);
    const afterUnapplied = Math.max(money(afterReceipt?.grossAmount) - afterOpenSum, 0);
    const afterOutside = afterOpen.filter((row) => {
      const sale = (afterData.sales || []).find((s) => String(s.id) === String(row.saleId));
      const d = ymd(sale?.date);
      return !d || d < T.periodStart || d > T.periodEnd;
    });

    const closedOld = (diagnosis.before.openAllocations.rows || []).filter((old) => {
      const still = afterAllocs.find((row) => String(row.id) === String(old.allocationId));
      return still && (still.status === "reversed" || still.reversedEffectiveDate);
    });

    const physicalDeleteCount = (diagnosis.before.openAllocations.rows || []).filter((old) => {
      return !afterAllocs.some((row) => String(row.id) === String(old.allocationId));
    }).length;

    const verifyOk =
      money(afterReceipt?.grossAmount) === T.grossAmount &&
      afterOpenSum + afterUnapplied === T.grossAmount &&
      afterOutside.length === 0 &&
      physicalDeleteCount === 0 &&
      String(afterReceipt?.clientId) === T.clientId &&
      ymd(afterReceipt?.receiptDate) === T.receiptDate &&
      String(afterReceipt?.channel) === T.channel;

    result.mutatesProduction = !out.idempotent;
    result.mutations = out.idempotent ? 0 : 1;
    result.apply = {
      ok: verifyOk,
      idempotent: Boolean(out.idempotent),
      operationId: T.operationId,
      effectiveDate: T.receiptDate,
      recordedAt: out.reallocationEvent?.at || out.receipt?.lastReallocationAt || null,
      closedOldAllocationCount: closedOld.length,
      physicalDeletedAllocationCount: physicalDeleteCount,
      newAllocationCount: afterOpen.length,
      newAllocationAmount: afterOpenSum,
      unappliedAmountAfter: afterUnapplied,
      outsideAugustAllocationCount: afterOutside.length,
      receiptIdentityChanged: !(
        money(afterReceipt?.grossAmount) === T.grossAmount &&
        String(afterReceipt?.clientId) === T.clientId &&
        ymd(afterReceipt?.receiptDate) === T.receiptDate &&
        String(afterReceipt?.channel) === T.channel
      ),
      summary: out.summary || null,
    };
    result.code = verifyOk ? (out.idempotent ? "IDEMPOTENT_OK" : "APPLIED_OK") : "VERIFY_FAILED";
    result.message = verifyOk ? "apply completed" : "apply ran but post-verify failed";
  } catch (error) {
    result.code = error?.code || "APPLY_ERROR";
    result.message = error?.message || String(error);
    result.mutations = 0;
    result.apply = { ok: false, error: result.message, code: result.code };
  }

  return result;
}

async function main() {
  const mode = String(process.env.BNB_MODE || "preview").toLowerCase();
  const result = await runBnbAugustReallocation({ mode, confirm: process.env.BNB_APPLY_CONFIRM });
  console.log(JSON.stringify(result, null, 2));
  if (mode === "apply" && result.code !== "APPLIED_OK" && result.code !== "IDEMPOTENT_OK") {
    process.exitCode = 1;
  }
  if (mode !== "apply" && result.diagnosis && !result.diagnosis.ok) {
    process.exitCode = 0; // preview of NOT_READY is still a successful preview
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }));
    process.exitCode = 1;
  });
}
