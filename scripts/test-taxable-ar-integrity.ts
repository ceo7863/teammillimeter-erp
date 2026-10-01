/**
 * B11 — sale tax treatment, gross receivable AR, payment-channel isolation.
 * Run: npx tsx scripts/test-taxable-ar-integrity.ts
 */
import assert from "node:assert/strict";
import {
  buildStatementTaxTotals,
  checkTaxTreatmentChange,
  computeSaleTaxAmounts,
  splitGrossForSale,
  TAX_UX_TEXT,
} from "../src/utils/saleTaxTreatment.ts";
import {
  applyUnifiedArBalancesToSales,
  buildPrepaidByClientName,
  buildSaleArBalances,
  buildStatementPaymentStatus,
  dedupeStatementSaleIdsAcrossVersions,
} from "../src/utils/unifiedArReadModel.ts";
import { resolveCanonicalSaleCollection } from "../src/utils/calendarFinanceStatus.ts";
import { buildCollectionLedgerSummary } from "../src/utils/reportCollectionSummary.ts";
import { buildReceivableRowsFromSales, getUnpaid } from "../src/utils/receivables.ts";
import { getSaleUnpaid } from "../src/utils/salesStatement.ts";
import { buildClientStatementRows, buildClientStatementSummary } from "../src/utils/statementSheets.ts";
import { buildReceiptAllocationDetailRows } from "../src/utils/receiptAllocationDetail.ts";
import { buildBankDepositMatchCandidates } from "../src/utils/bankReceivableMatch.ts";
import { buildSaleFromForm, emptySaleForm, saleRowToForm, validateSaleFormTax } from "../src/utils/saleForm.ts";
import { planCreateAndPostReceipt, proposeFifoAllocations } from "../server/receipts.mjs";
import { buildStatementSalesSnapshot } from "../server/pdfArchive.mjs";
import { applySaleTaxGuard, collectTaxLockedSaleIds, planSaleTaxCorrection } from "../server/saleTaxGuard.mjs";

type Check = { name: string; ok: boolean; detail?: unknown };
const checks: Check[] = [];

function check(name: string, fn: () => unknown) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) });
  } catch (error) {
    checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const CLIENT = { id: 1, name: "테스트거래처", vat: "Y" };
const CLIENT_N = { id: 2, name: "면세거래처", vat: "N" };
const AS_OF = "2026-09-30";

function sale(id: number, amount: number, taxTreatment?: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-09-01",
    client: CLIENT.name,
    site: `현장${id}`,
    amount,
    workers: [{ worker: "홍길동", quantity: "1", chargeAmount: String(amount), unitCost: String(amount) }],
    ...(taxTreatment ? { taxTreatment } : {}),
    ...extra,
  };
}

function receipt(id: string, gross: number, channel = "bank", extra: Record<string, unknown> = {}) {
  return {
    id,
    clientId: String(CLIENT.id),
    clientName: CLIENT.name,
    receiptDate: "2026-09-10",
    grossAmount: gross,
    channel,
    status: "posted",
    ...extra,
  };
}

function alloc(id: string, receiptId: string, saleId: number, amount: number, extra: Record<string, unknown> = {}) {
  return { id, receiptId, saleId: String(saleId), amount, status: "posted", effectiveFrom: "2026-09-10", ...extra };
}

function balances(data: Record<string, unknown>) {
  return buildSaleArBalances({ clients: [CLIENT, CLIENT_N], ...data }, { asOfDate: AS_OF });
}

function row(result: ReturnType<typeof balances>, saleId: number) {
  const found = result.sales.find((r) => r.saleId === String(saleId));
  assert.ok(found, `sale ${saleId} row`);
  return found!;
}

/* ------------------------------------------------------------- tax core */

check("taxable 10,000,000 + VAT 1,000,000 = gross 11,000,000", () => {
  const tax = computeSaleTaxAmounts({ amount: 10_000_000, taxTreatment: "TAXABLE_10" });
  assert.equal(tax.supplyAmount, 10_000_000);
  assert.equal(tax.vatAmount, 1_000_000);
  assert.equal(tax.grossReceivableAmount, 11_000_000);
  return tax;
});

check("legacy sale keeps stored supply as receivable (no invented VAT)", () => {
  const tax = computeSaleTaxAmounts({ amount: 10_000_000 });
  assert.equal(tax.taxTreatment, "LEGACY_UNSPECIFIED");
  assert.equal(tax.vatAmount, 0);
  assert.equal(tax.grossReceivableAmount, 10_000_000);
});

check("exempt VAT = 0, zero-rated VAT = 0 and reported in separate buckets", () => {
  const exempt = computeSaleTaxAmounts({ amount: 5_000_000, taxTreatment: "EXEMPT" });
  const zero = computeSaleTaxAmounts({ amount: 3_000_000, taxTreatment: "ZERO_RATED" });
  assert.equal(exempt.vatAmount, 0);
  assert.equal(zero.vatAmount, 0);
  const totals = buildStatementTaxTotals([
    { supplyAmount: 5_000_000, taxTreatment: "EXEMPT" },
    { supplyAmount: 3_000_000, taxTreatment: "ZERO_RATED" },
  ]);
  assert.equal(totals.exemptSupply, 5_000_000);
  assert.equal(totals.zeroRatedSupply, 3_000_000);
  assert.equal(totals.vatAmount, 0);
  return totals;
});

check("mixed statement: taxable + exempt + legacy (client VAT Y) split per sale", () => {
  const totals = buildStatementTaxTotals(
    [
      { supplyAmount: 1_000_000, taxTreatment: "TAXABLE_10" },
      { supplyAmount: 500_000, taxTreatment: "EXEMPT" },
      { supplyAmount: 300_000, taxTreatment: null },
    ],
    { legacyClientVat: "Y" },
  );
  assert.equal(totals.taxableSupply, 1_000_000);
  assert.equal(totals.exemptSupply, 500_000);
  assert.equal(totals.legacySupply, 300_000);
  assert.equal(totals.vatAmount, 100_000 + 30_000);
  assert.equal(totals.grossTotal, 1_800_000 + 130_000);
  return totals;
});

check("statement summary: all-legacy rows reproduce the old client.vat formula exactly", () => {
  const rows = buildClientStatementRows([sale(1, 1_234_567), sale(2, 765_433)]);
  const summaryY = buildClientStatementSummary(rows, { vat: "Y" });
  const summaryN = buildClientStatementSummary(rows, { vat: "N" });
  assert.equal(summaryY.vatAmount, Math.round(2_000_000 * 0.1));
  assert.equal(summaryY.grandTotal, 2_200_000);
  assert.equal(summaryN.vatAmount, 0);
  assert.equal(summaryN.grandTotal, 2_000_000);
});

check("statement summary: explicit treatments override client flag per sale", () => {
  const rows = buildClientStatementRows([sale(1, 1_000_000, "TAXABLE_10"), sale(2, 500_000, "EXEMPT")]);
  const summaryN = buildClientStatementSummary(rows, { vat: "N" });
  assert.equal(summaryN.vatAmount, 100_000, "TAXABLE_10 for a vat=N client still carries VAT");
  assert.equal(summaryN.exemptSupply, 500_000);
  assert.equal(summaryN.grandTotal, 1_600_000);
});

check("rounding: split of gross across allocations — last allocation absorbs remainder", () => {
  const s = { amount: 333_333, taxTreatment: "TAXABLE_10" };
  const tax = computeSaleTaxAmounts(s);
  assert.equal(tax.vatAmount, 33_333);
  assert.equal(tax.grossReceivableAmount, 366_666);
  const a = splitGrossForSale(s, 122_222);
  const b = splitGrossForSale(s, 122_222, { alreadySplitVat: a.vatAmount });
  const c = splitGrossForSale(s, 122_222, { alreadySplitVat: a.vatAmount + b.vatAmount, isLastForSale: true });
  assert.equal(a.vatAmount + b.vatAmount + c.vatAmount, 33_333);
  assert.equal(a.supplyAmount + b.supplyAmount + c.supplyAmount, 333_333);
  return { a, b, c };
});

/* ------------------------------------------------ AR + channel isolation */

for (const channel of ["bank", "cash", "personal_account", "card", "other"]) {
  check(`gross 11,000,000 received via ${channel} → PAID, treatment unchanged`, () => {
    const s = sale(1, 10_000_000, "TAXABLE_10");
    const result = balances({
      sales: [s],
      receipts: [receipt("r1", 11_000_000, channel)],
      receiptAllocations: [alloc("a1", "r1", 1, 11_000_000)],
    });
    const r = row(result, 1);
    assert.equal(r.billedAmount, 11_000_000);
    assert.equal(r.outstandingAmount, 0);
    assert.equal(r.taxTreatment, "TAXABLE_10");
    assert.equal(computeSaleTaxAmounts(s).taxTreatment, "TAXABLE_10");
  });
}

check("cash 5,500,000 → PARTIAL, outstanding 5,500,000", () => {
  const result = balances({
    sales: [sale(1, 10_000_000, "TAXABLE_10")],
    receipts: [receipt("r1", 5_500_000, "cash")],
    receiptAllocations: [alloc("a1", "r1", 1, 5_500_000)],
  });
  const r = row(result, 1);
  assert.equal(r.outstandingAmount, 5_500_000);
  const tone = resolveCanonicalSaleCollection(
    applyUnifiedArBalancesToSales([sale(1, 10_000_000, "TAXABLE_10")], result)[0] as never,
  );
  assert.equal(tone.tone, "AMBER");
});

check("overpayment 12,000,000: sale paid at 11,000,000, remainder 1,000,000 stays prepaid", () => {
  const data = {
    sales: [sale(1, 10_000_000, "TAXABLE_10")],
    clients: [CLIENT],
    receipts: [],
    receiptAllocations: [],
  };
  const plan = planCreateAndPostReceipt(data, {
    operationId: "op-over",
    clientId: CLIENT.id,
    receiptDate: "2026-09-10",
    grossAmount: 12_000_000,
    channel: "personal_account",
    source: "receivables",
    allocations: [{ saleId: 1, amount: 11_000_000 }],
  });
  assert.equal(plan.value.summary.allocatedAmount, 11_000_000);
  assert.equal(plan.value.summary.unallocatedAmount, 1_000_000);
  const prepaid = buildPrepaidByClientName(
    { clients: [CLIENT], receipts: plan.receipts, receiptAllocations: plan.allocations },
    { asOfDate: AS_OF },
  );
  assert.equal(prepaid[CLIENT.name], 1_000_000);
  const r = row(balances({ sales: data.sales, receipts: plan.receipts, receiptAllocations: plan.allocations }), 1);
  assert.equal(r.outstandingAmount, 0);
});

check("receipt API capacity is the gross receivable (11,000,001 rejected, 11,000,000 accepted)", () => {
  const data = { sales: [sale(1, 10_000_000, "TAXABLE_10")], clients: [CLIENT], receipts: [], receiptAllocations: [] };
  assert.throws(
    () =>
      planCreateAndPostReceipt(data, {
        operationId: "op-cap",
        clientId: CLIENT.id,
        receiptDate: "2026-09-10",
        grossAmount: 11_000_001,
        channel: "bank",
        source: "receivables",
        allocations: [{ saleId: 1, amount: 11_000_001 }],
      }),
    (error: { code?: string }) => error.code === "ALLOCATION_EXCEEDS_SALE",
  );
  const legacy = { ...data, sales: [sale(1, 10_000_000)] };
  assert.throws(
    () =>
      planCreateAndPostReceipt(legacy, {
        operationId: "op-cap-legacy",
        clientId: CLIENT.id,
        receiptDate: "2026-09-10",
        grossAmount: 10_000_001,
        channel: "bank",
        source: "receivables",
        allocations: [{ saleId: 1, amount: 10_000_001 }],
      }),
    (error: { code?: string }) => error.code === "ALLOCATION_EXCEEDS_SALE",
    "legacy capacity stays the stored amount",
  );
  const ok = planCreateAndPostReceipt(data, {
    operationId: "op-cap-ok",
    clientId: CLIENT.id,
    receiptDate: "2026-09-10",
    grossAmount: 11_000_000,
    channel: "cash",
    source: "receivables",
    allocations: [{ saleId: 1, amount: 11_000_000 }],
  });
  assert.equal(ok.value.summary.allocatedAmount, 11_000_000);
});

check("FIFO proposal allocates gross oldest-first within scope; excess becomes unallocated", () => {
  const sales = [
    sale(1, 1_000_000, "TAXABLE_10", { date: "2026-09-01" }),
    sale(2, 500_000, "EXEMPT", { date: "2026-09-02", taxReason: "기초생활" }),
  ];
  const proposal = proposeFifoAllocations(sales, CLIENT, 2_000_000, [], [], [CLIENT], AS_OF);
  assert.deepEqual(
    proposal.allocations.map((a: { saleId: unknown; amount: number }) => [String(a.saleId), a.amount]),
    [
      ["1", 1_100_000],
      ["2", 500_000],
    ],
  );
  assert.equal(proposal.unallocatedAmount, 400_000);
});

check("bank match suggestions never add VAT on top of an explicit (already gross) receivable", () => {
  const rows = buildReceivableRowsFromSales(
    applyUnifiedArBalancesToSales([sale(1, 1_000_000, "TAXABLE_10")], balances({ sales: [sale(1, 1_000_000, "TAXABLE_10")] })) as never,
    [CLIENT],
  );
  assert.equal(rows[0].salesAmount, 1_100_000);
  const tx = { id: "t1", deposit: 1_210_000, transactionAt: "2026-09-10", description: CLIENT.name, counterpartyName: CLIENT.name };
  const candidates = buildBankDepositMatchCandidates(tx as never, rows, { clients: [CLIENT] as never, minScore: 0 });
  assert.equal(candidates.length, 0, "1,210,000 is not 1,100,000 + 10% VAT");
  const exact = buildBankDepositMatchCandidates({ ...tx, deposit: 1_100_000 } as never, rows, { clients: [CLIENT] as never, minScore: 0 });
  assert.equal(exact[0]?.vatAmount, 0);
});

check("payment channel is not an input to the tax-change rule", () => {
  assert.deepEqual(
    Object.keys({ previous: 0, next: 0, isAdmin: 0, hasEffectiveAllocation: 0, inSentStatement: 0 }).sort(),
    ["hasEffectiveAllocation", "inSentStatement", "isAdmin", "next", "previous"],
  );
  assert.equal(TAX_UX_TEXT.channelIsolation, "결제수단은 과세유형을 변경하지 않습니다.");
  assert.equal(TAX_UX_TEXT.evidenceReview, "증빙 발급 확인 필요");
  assert.equal(TAX_UX_TEXT.exemptionReason, "면세 근거를 확인하고 기록해 주세요.");
});

/* ---------------------------------------------------- tax change guard */

check("tax change: non-admin cannot set EXEMPT; reason required; admin+reason OK", () => {
  const prev = sale(1, 1_000_000, "TAXABLE_10");
  const noAdmin = checkTaxTreatmentChange({
    previous: prev,
    next: { ...prev, taxTreatment: "EXEMPT", taxReason: "x" },
    isAdmin: false,
    hasEffectiveAllocation: false,
    inSentStatement: false,
  });
  assert.equal("code" in noAdmin && noAdmin.code, "TAX_TREATMENT_ADMIN_ONLY");
  const noReason = checkTaxTreatmentChange({
    previous: prev,
    next: { ...prev, taxTreatment: "EXEMPT" },
    isAdmin: true,
    hasEffectiveAllocation: false,
    inSentStatement: false,
  });
  assert.equal("code" in noReason && noReason.code, "TAX_REASON_REQUIRED");
  const ok = checkTaxTreatmentChange({
    previous: prev,
    next: { ...prev, taxTreatment: "EXEMPT", taxReason: "면세 근거" },
    isAdmin: true,
    hasEffectiveAllocation: false,
    inSentStatement: false,
  });
  assert.equal(ok.ok, true);
});

check("tax change locked after allocation or sent statement", () => {
  const locked = checkTaxTreatmentChange({
    previous: sale(1, 1_000_000, "TAXABLE_10"),
    next: sale(1, 1_000_000, "EXEMPT", { taxReason: "r" }),
    isAdmin: true,
    hasEffectiveAllocation: true,
    inSentStatement: false,
  });
  assert.equal("code" in locked && locked.code, "TAX_TREATMENT_LOCKED");
  const lockedIds = collectTaxLockedSaleIds({
    receipts: [receipt("r1", 100)],
    receiptAllocations: [
      alloc("a1", "r1", 1, 100),
      alloc("a2", "r1", 2, 100, { reversedEffectiveDate: "2026-09-11" }),
    ],
    paymentVouchers: [{ salesId: 3 }],
    sentStatementArchives: [{ statementSalesIds: [4] }],
  });
  assert.deepEqual([...lockedIds].sort(), ["1", "3", "4"]);
});

check("server guard: new sale stamped TAXABLE_10; legacy rows untouched (same array)", () => {
  const legacy = [sale(1, 1_000_000), sale(2, 2_000_000)];
  const same = applySaleTaxGuard({ previousSales: legacy, incomingSales: legacy, isAdmin: false, actor: "u" });
  assert.equal(same.sales, legacy, "no legacy rewrite");
  const added = applySaleTaxGuard({
    previousSales: legacy,
    incomingSales: [...legacy, sale(3, 1_000_000)],
    isAdmin: false,
    actor: "u",
  });
  const stamped = added.sales.find((s: { id: number }) => s.id === 3);
  assert.equal(stamped.taxTreatment, "TAXABLE_10");
  assert.equal(stamped.vatAmount, 100_000);
  assert.equal(stamped.grossReceivableAmount, 1_100_000);
  assert.equal(stamped.taxEvidenceStatus, "REVIEW_REQUIRED");
  assert.equal(added.sales[0], legacy[0]);
  assert.equal(added.sales[1], legacy[1]);
});

check("server guard: omitted field carries the stored treatment (no silent revert to legacy)", () => {
  const prev = [sale(1, 1_000_000, "TAXABLE_10", { taxEvidenceStatus: "ISSUED" })];
  const { taxTreatment: _t, ...withoutTax } = prev[0] as Record<string, unknown>;
  const guarded = applySaleTaxGuard({ previousSales: prev, incomingSales: [withoutTax], isAdmin: false, actor: "u" });
  assert.equal(guarded.sales[0].taxTreatment, "TAXABLE_10");
  assert.equal(guarded.sales[0].taxEvidenceStatus, "ISSUED");
});

check("server guard: locked change rejected (422) and admin change recorded with history", () => {
  const prev = [sale(1, 1_000_000, "TAXABLE_10")];
  assert.throws(
    () =>
      applySaleTaxGuard({
        previousSales: prev,
        incomingSales: [{ ...prev[0], taxTreatment: "EXEMPT", taxReason: "r" }],
        isAdmin: true,
        actor: "admin",
        lockedSaleIds: new Set(["1"]),
      }),
    (error: { code?: string; status?: number }) => error.code === "TAX_TREATMENT_LOCKED" && error.status === 422,
  );
  const changed = applySaleTaxGuard({
    previousSales: prev,
    incomingSales: [{ ...prev[0], taxTreatment: "EXEMPT", taxReason: "면세 근거" }],
    isAdmin: true,
    actor: "admin",
    now: "2026-09-30T00:00:00.000Z",
    lockedSaleIds: () => new Set(),
  });
  const next = changed.sales[0];
  assert.equal(next.taxTreatment, "EXEMPT");
  assert.equal(next.vatAmount, 0);
  assert.equal(next.previousTaxTreatment, "TAXABLE_10");
  assert.equal(next.taxTreatmentHistory.length, 1);
  assert.equal(changed.changes.length, 1);
});

check("server guard: a channel or receipt never flips treatment (cash receipt on a taxable sale)", () => {
  const prev = [sale(1, 1_000_000, "TAXABLE_10")];
  const guarded = applySaleTaxGuard({
    previousSales: prev,
    incomingSales: [{ ...prev[0], paymentChannel: "cash" }],
    isAdmin: false,
    actor: "u",
  });
  assert.equal(guarded.sales[0].taxTreatment, "TAXABLE_10");
  assert.equal(guarded.changes.length, 0);
});

check("sale form: new = TAXABLE_10; legacy edit stays unclassified; exempt needs reason", () => {
  const fresh = emptySaleForm();
  assert.equal(fresh.taxTreatment, "TAXABLE_10");
  const form = { ...fresh, client: CLIENT.name, site: "s", workers: [{ worker: "홍길동", quantity: "1", chargeAmount: "1000000", unitCost: "1000000" }] };
  const built = buildSaleFromForm(form as never) as Record<string, unknown>;
  assert.equal(built.taxTreatment, "TAXABLE_10");
  assert.equal(built.grossReceivableAmount, 1_100_000);
  const legacyForm = saleRowToForm(sale(9, 1_000_000));
  assert.equal(legacyForm.taxTreatment, "LEGACY_UNSPECIFIED");
  const legacyBuilt = buildSaleFromForm(legacyForm) as Record<string, unknown>;
  assert.equal("taxTreatment" in legacyBuilt, false);
  assert.ok(validateSaleFormTax({ ...form, taxTreatment: "EXEMPT" } as never, null, { isAdmin: true }));
  assert.equal(validateSaleFormTax({ ...form, taxTreatment: "EXEMPT", taxReason: "근거" } as never, null, { isAdmin: true }), null);
});

/* ----------------------------------------------- statements + receipts */

check("overlapping statement versions count each saleId once", () => {
  const { saleIds, duplicates } = dedupeStatementSaleIdsAcrossVersions([
    { id: "v1", statementSalesIds: ["1", "2"] },
    { id: "v2", statementSalesIds: ["2", "3"] },
  ]);
  assert.deepEqual(saleIds.sort(), ["1", "2", "3"]);
  assert.equal(duplicates.length, 1);
});

check("statement status uses gross: taxable statement paid only when gross is covered", () => {
  const sales = [sale(1, 1_000_000, "TAXABLE_10"), sale(2, 500_000, "EXEMPT", { taxReason: "r" })];
  const archive = { id: "pdf-1", subjectName: CLIENT.name, statementSalesIds: ["1", "2"], statementTotalAmount: 1_600_000 };
  const partial = buildStatementPaymentStatus(
    archive as never,
    {
      clients: [CLIENT],
      sales,
      receipts: [receipt("r1", 1_500_000, "bank", { sentStatementId: "pdf-1" })],
      receiptAllocations: [alloc("a1", "r1", 1, 1_000_000), alloc("a2", "r1", 2, 500_000)],
    },
    { asOfDate: AS_OF },
  );
  assert.equal(partial.billedAmount, 1_600_000);
  assert.equal(partial.status, "partial");
  assert.equal(partial.outstandingAmount, 100_000);
  const paid = buildStatementPaymentStatus(
    archive as never,
    {
      clients: [CLIENT],
      sales,
      receipts: [receipt("r1", 1_600_000, "bank", { sentStatementId: "pdf-1" })],
      receiptAllocations: [alloc("a1", "r1", 1, 1_100_000), alloc("a2", "r1", 2, 500_000)],
    },
    { asOfDate: AS_OF },
  );
  assert.equal(paid.status, "paid");
});

check("statement regeneration snapshot records gross/supply/VAT per sale", () => {
  const snapshot = buildStatementSalesSnapshot(["1", "1", "2"], [sale(1, 1_000_000, "TAXABLE_10"), sale(2, 700_000)]);
  assert.deepEqual(snapshot, [
    { saleId: "1", billedAmount: 1_100_000, supplyAmount: 1_000_000, vatAmount: 100_000, taxTreatment: "TAXABLE_10" },
    { saleId: "2", billedAmount: 700_000, supplyAmount: 700_000, vatAmount: 0, taxTreatment: "LEGACY_UNSPECIFIED" },
  ]);
});

check("receipt detail rows: supply/VAT/gross, prior, this allocation, remaining", () => {
  const sales = [sale(1, 1_000_000, "TAXABLE_10"), sale(2, 500_000, "EXEMPT", { taxReason: "r" })];
  const data = {
    sales,
    receipts: [receipt("r0", 600_000), receipt("r1", 1_000_000)],
    receiptAllocations: [alloc("a0", "r0", 1, 600_000), alloc("a1", "r1", 1, 500_000), alloc("a2", "r1", 2, 300_000)],
  };
  const applied = applyUnifiedArBalancesToSales(sales, balances(data));
  const rows = buildReceiptAllocationDetailRows(
    data.receiptAllocations.filter((a) => a.receiptId === "r1"),
    applied as never,
  );
  assert.deepEqual(
    rows.map((r) => [r.saleId, r.taxTreatment, r.supplyAmount, r.vatAmount, r.grossReceivableAmount, r.priorAppliedAmount, r.thisAllocationAmount, r.remainingAmount]),
    [
      ["1", "TAXABLE_10", 1_000_000, 100_000, 1_100_000, 600_000, 500_000, 0],
      ["2", "EXEMPT", 500_000, 0, 500_000, 0, 300_000, 200_000],
    ],
  );
  assert.equal(rows[0].thisAllocationVat + Math.round((600_000 * 100_000) / 1_100_000), 100_000, "last allocation absorbs VAT remainder");
});

check("reversal: reversed allocation returns the sale to outstanding; reallocation applies once", () => {
  const sales = [sale(1, 1_000_000, "TAXABLE_10")];
  const reversed = row(
    balances({
      sales,
      receipts: [receipt("r1", 1_100_000)],
      receiptAllocations: [alloc("a1", "r1", 1, 1_100_000, { reversedEffectiveDate: "2026-09-20" })],
    }),
    1,
  );
  assert.equal(reversed.outstandingAmount, 1_100_000);
  const reallocated = row(
    balances({
      sales,
      receipts: [receipt("r1", 1_100_000)],
      receiptAllocations: [
        alloc("a1", "r1", 1, 1_100_000, { reversedEffectiveDate: "2026-09-20" }),
        alloc("a2", "r1", 1, 1_100_000, { effectiveFrom: "2026-09-20" }),
      ],
    }),
    1,
  );
  assert.equal(reallocated.outstandingAmount, 0);
  assert.equal(reallocated.receiptAllocatedAmount, 1_100_000);
});

check("AR adjustment is not cash: report keeps it separate from actual receipts", () => {
  const sales = applyUnifiedArBalancesToSales([sale(1, 1_000_000, "TAXABLE_10")], balances({ sales: [sale(1, 1_000_000, "TAXABLE_10")] }));
  const summary = buildCollectionLedgerSummary({
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    sales: sales as never,
    receipts: [],
    receiptAllocations: [],
    paymentVouchers: [],
    arAdjustments: [{ clientName: CLIENT.name, effectiveDate: "2026-09-15", signedAmount: -100_000 }],
    clients: [CLIENT],
  } as never);
  assert.equal(summary.actualReceipts.total, 0);
  assert.equal(summary.adjustments.net, -100_000);
  assert.equal(summary.periodSales.billed, 1_100_000);
  assert.equal(summary.periodSales.supply, 1_000_000);
  assert.equal(summary.periodSales.vat, 100_000);
  assert.equal(summary.periodSales.byTaxTreatment.TAXABLE_10.billed, 1_100_000);
  assert.equal(summary.closingOutstanding, 1_000_000);
});

check("calendar tone: legacy fully-paid stays GREEN; taxable supply-only payment is AMBER", () => {
  const legacySales = [sale(1, 1_000_000)];
  const legacy = applyUnifiedArBalancesToSales(
    legacySales,
    balances({ sales: legacySales, receipts: [receipt("r1", 1_000_000)], receiptAllocations: [alloc("a1", "r1", 1, 1_000_000)] }),
  )[0];
  assert.equal(resolveCanonicalSaleCollection(legacy as never).tone, "GREEN");
  const taxableSales = [sale(2, 1_000_000, "TAXABLE_10")];
  const taxable = applyUnifiedArBalancesToSales(
    taxableSales,
    balances({ sales: taxableSales, receipts: [receipt("r2", 1_000_000)], receiptAllocations: [alloc("a2", "r2", 2, 1_000_000)] }),
  )[0];
  assert.equal(resolveCanonicalSaleCollection(taxable as never).tone, "AMBER");
  assert.equal((taxable as { amount: number }).amount, 1_000_000, "overlay keeps amount = supply");
  assert.equal(getUnpaid(taxable as never), 100_000);
  assert.equal(getSaleUnpaid(taxable as never), 100_000);
});

check("report parity: period billed equals Σ canonical arBilledAmount; buckets sum to totals", () => {
  const raw = [sale(1, 1_000_000, "TAXABLE_10"), sale(2, 500_000, "EXEMPT", { taxReason: "r" }), sale(3, 700_000)];
  const applied = applyUnifiedArBalancesToSales(raw, balances({ sales: raw }));
  const summary = buildCollectionLedgerSummary({
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    sales: applied as never,
    receipts: [],
    receiptAllocations: [],
    paymentVouchers: [],
    arAdjustments: [],
    clients: [CLIENT],
  } as never);
  const sumBilled = applied.reduce((acc, s) => acc + Number((s as { arBilledAmount: number }).arBilledAmount), 0);
  assert.equal(summary.periodSales.billed, sumBilled);
  const buckets = Object.values(summary.periodSales.byTaxTreatment);
  assert.equal(buckets.reduce((acc, b) => acc + b.billed, 0), sumBilled);
  assert.equal(summary.periodSales.byTaxTreatment.LEGACY_UNSPECIFIED.billed, 700_000);
});

check("client rename does not change tax treatment or gross", () => {
  const s = sale(1, 1_000_000, "TAXABLE_10");
  const renamed = { ...s, client: "새이름" };
  const guarded = applySaleTaxGuard({ previousSales: [s], incomingSales: [renamed], isAdmin: false, actor: "u" });
  assert.equal(guarded.sales[0].taxTreatment, "TAXABLE_10");
  assert.equal(computeSaleTaxAmounts(guarded.sales[0]).grossReceivableAmount, 1_100_000);
});

/* ------------------------------------------------------ Indiper fixture */

check("Indiper fixture: legacy 15 sales supply 7,603,000 vs statement 8,363,300 → SALES_GROSS_EXCLUDES_VAT", () => {
  const supplies = [
    480_000, 520_000, 450_000, 610_000, 495_000, 505_000, 530_000, 470_000, 515_000, 500_000, 488_000, 512_000,
    498_000, 502_000, 528_000,
  ];
  const totalSupply = supplies.reduce((a, b) => a + b, 0);
  assert.equal(totalSupply, 7_603_000);
  const saleIds = [4315, 4316, 4320, 4330, 4332, 4335, 4351, 4367, 4371, 4382, 4396, 4398, 4408, 4418, 4424];
  const legacySales = saleIds.map((id, i) => ({ ...sale(id, supplies[i]), client: CLIENT.name }));
  const rcp = receipt("rcp-indiper", 8_363_300, "bank", { sentStatementId: "pdf-indiper" });
  const legacyAllocs = saleIds.map((id, i) => alloc(`a${id}`, rcp.id, id, supplies[i]));
  const before = balances({ sales: legacySales, receipts: [rcp], receiptAllocations: legacyAllocs });
  const outstandingBefore = before.sales.reduce((acc, r) => acc + r.outstandingAmount, 0);
  const prepaidBefore = buildPrepaidByClientName(
    { clients: [CLIENT], receipts: [rcp], receiptAllocations: legacyAllocs },
    { asOfDate: AS_OF },
  )[CLIENT.name];
  assert.equal(outstandingBefore, 0);
  assert.equal(prepaidBefore, 760_300);
  const statementTotals = buildStatementTaxTotals(
    legacySales.map((s) => ({ supplyAmount: s.amount, taxTreatment: null })),
    { legacyClientVat: "Y" },
  );
  assert.equal(statementTotals.grossTotal, 8_363_300);
  assert.equal(statementTotals.vatAmount, 760_300);
  const taxedSales = legacySales.map((s) => ({ ...s, taxTreatment: "TAXABLE_10" }));
  const afterReclass = balances({ sales: taxedSales, receipts: [rcp], receiptAllocations: legacyAllocs });
  const grossAfter = afterReclass.sales.reduce((acc, r) => acc + r.billedAmount, 0);
  const outstandingAfter = afterReclass.sales.reduce((acc, r) => acc + r.outstandingAmount, 0);
  const vatSum = taxedSales.reduce((acc, s) => acc + computeSaleTaxAmounts(s).vatAmount, 0);
  assert.equal(vatSum, 760_300, "per-sale VAT rounding matches the statement VAT");
  assert.equal(grossAfter, 8_363_300);
  assert.equal(outstandingAfter, 760_300, "dry-run: the unallocated 760,300 would exactly cover the VAT");
  return { rootCause: "SALES_GROSS_EXCLUDES_VAT", effect: "UNALLOCATED_PREPAID", prepaidBefore, outstandingAfter };
});

check("correction flow: admin + reason reclassifies locked legacy sales, replay is a no-op", () => {
  const sales = [sale(1, 1_000_000), sale(2, 455_000), sale(3, 300_000, "TAXABLE_10")];
  const base = {
    sales,
    saleIds: [1, 2],
    taxTreatment: "TAXABLE_10",
    reason: "CEO 승인: 부가세 포함 청구",
    isAdmin: true,
    actor: "repair:ceo",
    operationId: "op-1",
    now: "2026-10-01T06:00:00.000Z",
  };
  const rejects = (overrides: Record<string, unknown>, code: string, status: number) =>
    assert.throws(
      () => planSaleTaxCorrection({ ...base, ...overrides }),
      (error: { code?: string; status?: number }) => error.code === code && error.status === status,
    );
  rejects({ isAdmin: false }, "TAX_TREATMENT_ADMIN_ONLY", 403);
  rejects({ reason: "  " }, "TAX_TREATMENT_REASON_REQUIRED", 400);
  rejects({ taxTreatment: "LEGACY_UNSPECIFIED" }, "TAX_TREATMENT_INVALID", 400);
  rejects({ taxTreatment: "CASH" }, "TAX_TREATMENT_INVALID", 400);
  rejects({ operationId: "" }, "TAX_TREATMENT_INVALID", 400);
  rejects({ saleIds: [1, 99] }, "TAX_TREATMENT_INVALID", 400);

  const plan = planSaleTaxCorrection(base);
  assert.deepEqual(plan.changes.map((c: { saleId: string }) => c.saleId), ["1", "2"]);
  const [s1, s2, s3] = plan.sales;
  assert.equal(s1.taxTreatment, "TAXABLE_10");
  assert.equal(s1.vatAmount, 100_000);
  assert.equal(s1.grossReceivableAmount, 1_100_000);
  assert.equal(s2.grossReceivableAmount, 500_500);
  assert.equal(s1.amount, 1_000_000, "supply amount is unchanged");
  assert.equal(s1.paid, sales[0].paid, "paid untouched");
  assert.equal(s1.previousTaxTreatment, "LEGACY_UNSPECIFIED");
  assert.equal(s1.updatedAt, base.now, "peers merge by updatedAt");
  assert.deepEqual(s1.taxTreatmentHistory.at(-1), {
    at: base.now,
    by: "repair:ceo",
    from: "LEGACY_UNSPECIFIED",
    to: "TAXABLE_10",
    reason: base.reason,
    correction: true,
    operationId: "op-1",
  });
  assert.equal(s3, sales[2], "unselected sale is the same object");

  const replay = planSaleTaxCorrection({ ...base, sales: plan.sales });
  assert.equal(replay.changes.length, 0);
  assert.deepEqual(replay.alreadyApplied, ["1", "2"]);
  assert.equal(replay.sales, plan.sales);

  const guarded = applySaleTaxGuard({
    previousSales: plan.sales,
    incomingSales: sales,
    isAdmin: false,
    actor: "stale-client",
    lockedSaleIds: new Set(["1", "2"]),
  });
  assert.equal(guarded.sales[0].taxTreatment, "TAXABLE_10", "stale save without the field keeps the correction");
  assert.equal(guarded.changes.length, 0);
  return { changed: plan.changes.length, vat: s1.vatAmount + s2.vatAmount };
});

const failed = checks.filter((c) => !c.ok);
console.log(
  JSON.stringify(
    {
      test: "taxable-ar-integrity",
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      requiredNotRunCount: 0,
      checks,
    },
    null,
    2,
  ),
);
if (failed.length) process.exit(1);
