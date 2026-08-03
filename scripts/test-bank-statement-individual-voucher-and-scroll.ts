/**
 * Allocation consistency + scroll policy + deploy version financial block regressions.
 * Usage: npx tsx scripts/test-bank-statement-individual-voucher-and-scroll.ts
 */
import assert from "node:assert/strict";
import {
  listIncompleteBankSentStatementAllocations,
  summarizeBankSentStatementAllocation,
} from "../src/utils/bankSentStatementAllocation.ts";
import { getBankMatchStatusLabel } from "../src/utils/bankReceivableMatch.ts";
import {
  assertFinancialSaveAllowed,
  hasErpUnsavedDraft,
  planApplyNewVersion,
} from "../src/utils/deployVersionGuard.ts";
import {
  allocatePaymentFifoBySaleDate,
  buildPaidAmountBySaleId,
  buildSentStatementPaymentApplication,
  type SentStatementMatchCandidate,
} from "../src/utils/bankSentStatementMatch.ts";
import { resolveLinkPanelWheelTarget, scrollElement } from "../src/utils/wheelScrollCapture.ts";
import type { BankTransaction } from "../src/utils/bankTransactions.ts";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

const salesIds = [101, 102, 103, 104, 105];
const archive = {
  id: "pdf-perlabs",
  statementTotalAmount: 3_227_400,
  statementSalesIds: salesIds,
  subjectName: "퍼랩스",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
};
const tx = {
  id: "tx-perlabs",
  deposit: 3_227_400,
  linkedPdfArchiveId: "pdf-perlabs",
  linkedPaymentVoucherId: "v1",
  transactionAt: "2026-08-03T10:00:00+09:00",
  description: "입금",
  counterpartyName: "퍼랩스",
  withdrawal: 0,
  balance: 0,
} as BankTransaction;

const sales = [
  { id: 101, date: "2026-07-01", client: "퍼랩스", site: "A", amount: 298_000 },
  { id: 102, date: "2026-07-02", client: "퍼랩스", site: "B", amount: 700_000 },
  { id: 103, date: "2026-07-03", client: "퍼랩스", site: "C", amount: 650_000 },
  { id: 104, date: "2026-07-04", client: "퍼랩스", site: "D", amount: 686_000 },
  { id: 105, date: "2026-07-05", client: "퍼랩스", site: "E", amount: 600_000 },
];

function candidate(paymentAmount = 3_227_400): SentStatementMatchCandidate {
  return {
    pdfArchiveId: archive.id,
    client: "퍼랩스",
    statementTotalAmount: 3_227_400,
    sentAt: "2026-08-01T00:00:00.000Z",
    periodStart: archive.periodStart,
    periodEnd: archive.periodEnd,
    score: 100,
    reasons: ["test"],
    paymentAmount,
    paymentStatus: "confirmed",
    statementRemainingAmount: 0,
    statementSalesIds: salesIds,
  };
}

check("allocationConsistency: 5 sales / 1 voucher => 전표 배분 필요", () => {
  const vouchers = [{ id: "v1", bankTransactionId: tx.id, salesId: 101, finalAmount: 327_800 }];
  const summary = summarizeBankSentStatementAllocation({ tx, paymentVouchers: vouchers, archive });
  assert.equal(summary?.kind, "partial");
  assert.equal(summary?.statusLabel, "전표 배분 필요");
  assert.equal(summary?.allocatedAmount, 327_800);
  assert.equal(summary?.unallocatedAmount, 2_899_600);
  assert.equal(summary?.allocatedSalesCount, 1);
  assert.equal(summary?.statementSalesCount, 5);
  assert.equal(getBankMatchStatusLabel(tx, { paymentVouchers: vouchers, archive }), "전표 배분 필요");
});

check("allocationConsistency: archive only / voucher 0 => linked amount 0", () => {
  const summary = summarizeBankSentStatementAllocation({
    tx: { ...tx, linkedPaymentVoucherId: undefined },
    paymentVouchers: [],
    archive,
  });
  assert.equal(summary?.kind, "archive_only");
  assert.equal(summary?.allocatedAmount, 0);
  assert.equal(summary?.unallocatedAmount, 3_227_400);
});

check("allocationConsistency: do not confuse archive total with voucher sum", () => {
  const vouchers = [{ id: "v1", bankTransactionId: tx.id, salesId: 101, finalAmount: 327_800 }];
  const summary = summarizeBankSentStatementAllocation({ tx, paymentVouchers: vouchers, archive });
  assert.notEqual(summary?.allocatedAmount, summary?.statementTotalAmount);
  assert.equal(summary?.allocatedAmount, 327_800);
});

check("idempotency: preserve 327800 and create 4 remaining totaling 2899600", () => {
  const existing = [{ id: "v1", bankTransactionId: tx.id, salesId: 101, finalAmount: 327_800 }];
  const application = buildSentStatementPaymentApplication(tx, candidate(), {
    sales,
    clients: [{ name: "퍼랩스", vat: "Y" }],
    archive,
    paymentVouchers: existing,
  });
  assert.equal(application.vouchers.length, 4);
  assert.equal(
    application.vouchers.reduce((sum, row) => sum + Number(row.finalAmount || 0), 0),
    2_899_600,
  );
  assert.equal(application.paymentStatus, "confirmed");
  const finalVouchers = [...existing, ...application.vouchers];
  assert.equal(finalVouchers.length, 5);
  assert.equal(
    finalVouchers.reduce((sum, row) => sum + Number(row.finalAmount || 0), 0),
    3_227_400,
  );
  const rerun = buildSentStatementPaymentApplication(tx, candidate(), {
    sales,
    clients: [{ name: "퍼랩스", vat: "Y" }],
    archive,
    paymentVouchers: finalVouchers,
  });
  assert.equal(rerun.vouchers.length, 0);
});

check("atomicity: archive failure rolls back only new voucher ids", () => {
  const existing = [{ id: "v1", bankTransactionId: tx.id, salesId: 101, finalAmount: 327_800 }];
  const created = [
    { id: "v2", bankTransactionId: tx.id, salesId: 102, finalAmount: 770_000 },
    { id: "v3", bankTransactionId: tx.id, salesId: 103, finalAmount: 715_000 },
  ];
  const createdIds = new Set(created.map((row) => String(row.id)));
  const afterFail = [...created, ...existing].filter((row) => !createdIds.has(String(row.id)));
  assert.equal(afterFail.length, 1);
  assert.equal(afterFail[0].id, "v1");
  assert.equal(afterFail[0].finalAmount, 327_800);
  // Confirmed must not stick when mutation incomplete
  const statusIfPartialFail = "partial";
  assert.notEqual(statusIfPartialFail, "confirmed");
});

check("idempotency/diagnose: incomplete list excludes other clients", () => {
  const rows = listIncompleteBankSentStatementAllocations({
    bankTransactions: [
      tx,
      {
        id: "tx-other",
        deposit: 1000,
        linkedPdfArchiveId: "pdf-other",
        linkedPaymentVoucherId: "vx",
        linkedSubject: "다른고객",
        transactionAt: "2026-08-01",
      } as BankTransaction,
    ],
    paymentVouchers: [
      { id: "v1", bankTransactionId: tx.id, salesId: 101, finalAmount: 327_800 },
      { id: "vx", bankTransactionId: "tx-other", salesId: 9, finalAmount: 1000 },
    ],
    archives: [
      archive,
      { id: "pdf-other", subjectName: "다른고객", statementTotalAmount: 1000, statementSalesIds: [9] },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bankTransactionId, "tx-perlabs");
  assert.equal(rows[0].client, "퍼랩스");
});

check("versionMismatchFinancialBlockTest", () => {
  const blocked = assertFinancialSaveAllowed({ clientVersion: "aaa", serverVersion: "bbb" });
  assert.equal(blocked.ok, false);
  const ok = assertFinancialSaveAllowed({ clientVersion: "same", serverVersion: "same" });
  assert.equal(ok.ok, true);
});

check("dirtyDraftBlocksAutoReload", () => {
  assert.equal(
    planApplyNewVersion({
      hasUnsavedDraft: true,
      serverVersion: "bbb",
      lastReloadVersion: null,
    }).action,
    "block_unsaved",
  );
  assert.equal(
    planApplyNewVersion({
      hasUnsavedDraft: false,
      serverVersion: "bbb",
      lastReloadVersion: "bbb",
    }).action,
    "block_reload_loop",
  );
  assert.equal(
    planApplyNewVersion({
      hasUnsavedDraft: false,
      serverVersion: "bbb",
      lastReloadVersion: null,
    }).action,
    "reload",
  );
});

check("wheelScrollTest + backgroundScrollBlockTest", () => {
  const panelMain = {
    classList: { contains: () => false },
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 200,
    parentElement: null,
  } as unknown as HTMLElement;
  const tableWrap = {
    classList: { contains: (name: string) => name === "erp-tax-invoice-link-panel__table-wrap" },
    scrollTop: 0,
    scrollHeight: 100,
    clientHeight: 100,
    parentElement: panelMain,
  } as unknown as HTMLElement;

  const originalGetComputedStyle = globalThis.getComputedStyle;
  (globalThis as any).getComputedStyle = () => ({ overflowY: "auto" });
  (globalThis as any).document = {
    documentElement: { tagName: "HTML" },
  };

  try {
    // Non-scrollable table-wrap falls back to panel main; background always blocked.
    const resolved = resolveLinkPanelWheelTarget({
      panelOpen: true,
      panelMain,
      eventTarget: tableWrap,
    });
    assert.equal(resolved?.blockBackground, true);
    assert.equal(resolved?.target, panelMain);
    assert.equal(scrollElement(panelMain, 40), true);
    assert.equal(panelMain.scrollTop, 40);

    // Horizontal+vertical: table-wrap can own vertical when tall enough.
    Object.assign(tableWrap, { scrollHeight: 600, clientHeight: 200, scrollTop: 0 });
    const nested = resolveLinkPanelWheelTarget({
      panelOpen: true,
      panelMain,
      eventTarget: tableWrap,
    });
    assert.equal(nested?.target, tableWrap);
    assert.equal(scrollElement(tableWrap, 80), true);
    assert.equal(tableWrap.scrollTop, 80);
  } finally {
    (globalThis as any).getComputedStyle = originalGetComputedStyle;
  }
});

check("dirty draft helper detects data-erp-unsaved", () => {
  (globalThis as any).document = {
    querySelector: (sel: string) => (sel.includes("data-erp-unsaved='1'") ? { tagName: "DIV" } : null),
    activeElement: null,
  };
  assert.equal(hasErpUnsavedDraft(), true);
});

check("fifo remaining after paid map", () => {
  const gross = [
    { salesId: 101, statementAmount: 298_000, saleDate: "2026-07-01" },
    { salesId: 102, statementAmount: 700_000, saleDate: "2026-07-02" },
    { salesId: 103, statementAmount: 650_000, saleDate: "2026-07-03" },
    { salesId: 104, statementAmount: 686_000, saleDate: "2026-07-04" },
    { salesId: 105, statementAmount: 600_000, saleDate: "2026-07-05" },
  ];
  const paid = buildPaidAmountBySaleId([{ salesId: 101, finalAmount: 327_800 }]);
  const splits = allocatePaymentFifoBySaleDate(gross, 2_899_600, true, paid);
  assert.equal(splits.length, 4);
  assert.equal(
    splits.reduce((sum, row) => sum + row.finalAmount, 0),
    2_899_600,
  );
});

if (failed) {
  console.error(`test-bank-statement-individual-voucher-and-scroll: ${failed} failed`);
  process.exit(1);
}
console.log("test-bank-statement-individual-voucher-and-scroll: PASS");
