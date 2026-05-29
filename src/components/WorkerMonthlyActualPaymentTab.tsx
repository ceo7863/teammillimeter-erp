import React, { useMemo, useState } from "react";
import { ChevronRight, FileText, Landmark, Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import {
  flattenSalesToWorkerPaymentRows,
  formatKRW,
  normalizeWorkerCategory,
  WORKER_CATEGORY_OUTSOURCE,
  WORKER_CATEGORY_TEAM,
  todayISO,
  type WorkerCategory,
  type WorkerMasterLike,
} from "@/utils/workerPayments";
import {
  calculateWorkerPaymentVat,
  formatMonthLabel,
  type WorkerMonthlyPaymentRecord,
} from "@/utils/workerMonthlyPayments";
import {
  WORKER_PAYOUT_METHOD_LABELS,
  type WorkerPayoutMethod,
  type WorkerPayoutVoucher,
} from "@/utils/workerPayoutLedger";
import { parseMoney, formatMoneyInput, sanitizeMoneyInput } from "@/utils/receivables";
import {
  addEntryToWorkerMonthlyVoucher,
  allocateWorkerPaymentFifo,
  buildUnlinkedWorkerBankWithdrawals,
  buildWorkerMonthlyObligations,
  buildWorkerMonthlyWorkerSummaries,
  computeVoucherStatus,
  createWorkerPayoutVoucherFromManualEntry,
  detectWorkerPaymentBreakdown,
  inferPayWithVatFromAmount,
  linkBankEntryToWorkerMonthlyVoucher,
  refreshVoucherPaidAmount,
  resolveWorkerFromBankTx,
  sumVoucherPaidAmount,
  syncWorkerPaymentRecordsFromVouchers,
  upsertWorkerMonthlyActualVoucher,
  upsertWorkerPayWithVatLearnRule,
  WORKER_MONTHLY_VOUCHER_STATUS_LABELS,
  type WorkerMonthlyActualVoucher,
  type WorkerMonthlyObligation,
  type WorkerMonthlyPaymentEntry,
  type WorkerPayWithVatLearnRule,
  type WorkerMonthlyWorkerSummary,
} from "@/utils/workerMonthlyActualPayments";

type WorkerMonthlyActualPaymentTabProps = {
  workers?: WorkerMasterLike[];
  sales?: Parameters<typeof flattenSalesToWorkerPaymentRows>[0];
  workerPaymentRecords?: WorkerMonthlyPaymentRecord[];
  setWorkerPaymentRecords?: React.Dispatch<React.SetStateAction<WorkerMonthlyPaymentRecord[]>>;
  workerMonthlyActualVouchers?: WorkerMonthlyActualVoucher[];
  setWorkerMonthlyActualVouchers?: React.Dispatch<React.SetStateAction<WorkerMonthlyActualVoucher[]>>;
  workerPayWithVatLearnRules?: WorkerPayWithVatLearnRule[];
  setWorkerPayWithVatLearnRules?: React.Dispatch<React.SetStateAction<WorkerPayWithVatLearnRule[]>>;
  workerPayoutVouchers?: WorkerPayoutVoucher[];
  setWorkerPayoutVouchers?: React.Dispatch<React.SetStateAction<WorkerPayoutVoucher[]>>;
  bankTransactions?: BankTransaction[];
  setBankTransactions?: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  bankTransactionFolders?: BankTransactionFolder[];
  selectedMonthKey?: string;
  setSelectedMonthKey?: (value: string | ((prev: string) => string)) => void;
  currentUser?: { name?: string; email?: string };
};

const METHOD_OPTIONS: Array<{ key: WorkerPayoutMethod; label: string }> = [
  { key: "cash", label: WORKER_PAYOUT_METHOD_LABELS.cash },
  { key: "corporate", label: WORKER_PAYOUT_METHOD_LABELS.corporate },
  { key: "personal", label: WORKER_PAYOUT_METHOD_LABELS.personal },
];

const STATUS_CLASS: Record<string, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  partial: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  overpaid: "bg-sky-100 text-sky-900",
};

const emptyManualForm = {
  date: todayISO(),
  amount: "",
  method: "cash" as WorkerPayoutMethod,
  memo: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="erp-payment-hub-filter">
      <span className="erp-text-caption font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function makeManualEntry(form: typeof emptyManualForm): WorkerMonthlyPaymentEntry | null {
  const amount = parseMoney(form.amount);
  const date = form.date.trim();
  if (amount <= 0 || !date) return null;
  return {
    kind: "manual",
    id: `wm-entry-manual-${Date.now()}`,
    method: form.method,
    amount,
    date,
    memo: form.memo.trim() || undefined,
  };
}

function formatAmountWithVatBreakdown(amount: number, expectedNetPay: number) {
  const breakdown = detectWorkerPaymentBreakdown(amount, expectedNetPay);
  if (!breakdown.includesVat) return formatKRW(amount);
  return (
    <>
      {formatKRW(amount)}
      <span className="erp-text-caption block text-slate-500">
        {"(\uC2E4\uC9C0\uAE09 "}
        {formatKRW(breakdown.netAmount)}
        {" + \uBD80\uAC00\uC138 "}
        {formatKRW(breakdown.vatAmount)}
        {")"}
      </span>
    </>
  );
}

function formatExpectedAmount(obligation: WorkerMonthlyObligation) {
  if (!obligation.payWithVat) return formatKRW(obligation.expectedFinalAmount);
  const { vatAmount, finalPayAmount } = calculateWorkerPaymentVat(obligation.expectedAmount, true);
  return (
    <>
      {formatKRW(finalPayAmount)}
      <span className="erp-text-caption block text-slate-500">
        {"\uC2E4\uC9C0\uAE09 "}
        {formatKRW(obligation.expectedAmount)}
        {" + \uBD80\uAC00\uC138 "}
        {formatKRW(vatAmount)}
      </span>
    </>
  );
}

const CATEGORY_FILTER_OPTIONS: Array<{ value: "all" | "team" | "outsource"; label: string }> = [
  { value: "all", label: "\uC804\uCCB4" },
  { value: "team", label: "\uD300\uC6D0" },
  { value: "outsource", label: "\uC678\uC8FC" },
];

function WorkerCategoryBadge({ category }: { category: WorkerCategory }) {
  const normalized = normalizeWorkerCategory(category);
  return (
    <span
      className={`erp-worker-category-select is-readonly is-${normalized === WORKER_CATEGORY_OUTSOURCE ? "outsource" : "team"}`}
    >
      {normalized}
    </span>
  );
}

function renderWorkerFolderList(
  summaries: WorkerMonthlyWorkerSummary[],
  activeWorker: string | undefined,
  onSelect: (worker: string) => void,
) {
  const groups: React.ReactNode[] = [];
  let currentCategory: WorkerCategory | null = null;
  let currentItems: WorkerMonthlyWorkerSummary[] = [];

  const flushGroup = () => {
    if (!currentItems.length || !currentCategory) return;
    groups.push(
      <div key={`group-${currentCategory}-${currentItems[0]?.worker}`} className="erp-worker-monthly-folder-group">
        <div className="erp-worker-monthly-folder-group-head">
          <WorkerCategoryBadge category={currentCategory} />
          <span className="erp-worker-monthly-folder-group-count">
            {currentItems.length}
            {"\uBA85"}
          </span>
        </div>
        {currentItems.map((folder) =>
          renderWorkerFolderButton(folder, activeWorker === folder.worker, () => onSelect(folder.worker)),
        )}
      </div>,
    );
    currentItems = [];
  };

  for (const folder of summaries) {
    if (folder.category !== currentCategory) {
      flushGroup();
      currentCategory = folder.category;
    }
    currentItems.push(folder);
  }
  flushGroup();

  return groups;
}

function renderWorkerFolderButton(
  folder: {
    worker: string;
    category: WorkerCategory;
    isActive: boolean;
    unpaidMonthCount: number;
    balanceTotal: number;
    paidTotal: number;
    expectedTotal: number;
  },
  active: boolean,
  onSelect: () => void,
) {
  return (
    <button
      key={folder.worker}
      type="button"
      className={`erp-worker-payout-folder-btn ${active ? "is-active" : ""}${folder.isActive ? "" : " is-inactive"}`}
      onClick={onSelect}
    >
      <span className="erp-worker-payout-folder-name">
        <WorkerCategoryBadge category={folder.category} />
        <span className={folder.isActive ? "" : "text-slate-400"}>{folder.worker}</span>
      </span>
      <span className="erp-worker-payout-folder-meta">
        {folder.unpaidMonthCount > 0 ? `\uBBF8\uC9C0\uAE09 ${folder.unpaidMonthCount}\uAC1C\uC6D4 \u00B7 ` : ""}
        {formatKRW(folder.balanceTotal)}
        {" \u00B7 "}
        {formatKRW(folder.paidTotal)}
        {"/"}
        {formatKRW(folder.expectedTotal)}
      </span>
      <ChevronRight size={14} className="shrink-0 text-slate-400" />
    </button>
  );
}

function findBankVatMatchHint(tx: BankTransaction, workerObligations: WorkerMonthlyObligation[]) {
  const amount = Math.round(Number(tx.withdrawal) || 0);
  for (const obligation of workerObligations.filter((row) => row.balance > 0)) {
    const withVatAmount = calculateWorkerPaymentVat(obligation.expectedAmount, true).finalPayAmount;
    if (amount === withVatAmount) {
      return formatMonthLabel(obligation.monthKey);
    }
    if (amount === obligation.balance && obligation.payWithVat) {
      return formatMonthLabel(obligation.monthKey);
    }
  }
  return null;
}

export function WorkerMonthlyActualPaymentTab({
  workers = [],
  sales = [],
  workerPaymentRecords = [],
  setWorkerPaymentRecords,
  workerMonthlyActualVouchers = [],
  setWorkerMonthlyActualVouchers,
  workerPayWithVatLearnRules = [],
  setWorkerPayWithVatLearnRules,
  workerPayoutVouchers = [],
  setWorkerPayoutVouchers,
  bankTransactions = [],
  setBankTransactions,
  bankTransactionFolders = [],
  currentUser,
}: WorkerMonthlyActualPaymentTabProps) {
  const [folderQuery, setFolderQuery] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "team" | "outsource">("all");
  const [selectedWorker, setSelectedWorker] = useState("");
  const [activeVoucherId, setActiveVoucherId] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState(emptyManualForm);
  const [manualError, setManualError] = useState("");

  const detailRows = useMemo(() => flattenSalesToWorkerPaymentRows(sales), [sales]);

  const allObligations = useMemo(
    () =>
      buildWorkerMonthlyObligations(
        detailRows,
        workers,
        workerMonthlyActualVouchers,
        workerPaymentRecords,
        workerPayWithVatLearnRules,
      ),
    [detailRows, workerPaymentRecords, workerMonthlyActualVouchers, workerPayWithVatLearnRules, workers],
  );

  const workerSummaries = useMemo(
    () => buildWorkerMonthlyWorkerSummaries(allObligations, workers),
    [allObligations, workers],
  );

  const filteredSummaries = useMemo(() => {
    const query = folderQuery.trim().toLowerCase();
    return workerSummaries.filter((row) => {
      if (categoryFilter === "team" && row.category !== WORKER_CATEGORY_TEAM) return false;
      if (categoryFilter === "outsource" && row.category !== WORKER_CATEGORY_OUTSOURCE) return false;
      if (unpaidOnly && row.balanceTotal <= 0) return false;
      if (!query) return true;
      return row.worker.toLowerCase().includes(query);
    });
  }, [categoryFilter, folderQuery, unpaidOnly, workerSummaries]);

  const teamCount = useMemo(
    () => workerSummaries.filter((row) => row.category === WORKER_CATEGORY_TEAM).length,
    [workerSummaries],
  );
  const outsourceCount = useMemo(
    () => workerSummaries.filter((row) => row.category === WORKER_CATEGORY_OUTSOURCE).length,
    [workerSummaries],
  );

  const activeSummary = useMemo(() => {
    if (!filteredSummaries.length) return null;
    if (selectedWorker) {
      return filteredSummaries.find((row) => row.worker === selectedWorker) || filteredSummaries[0];
    }
    return filteredSummaries[0];
  }, [filteredSummaries, selectedWorker]);

  const summary = useMemo(() => {
    const expected = allObligations.reduce((sum, row) => sum + row.expectedFinalAmount, 0);
    const paid = allObligations.reduce((sum, row) => sum + row.paid, 0);
    return { expected, paid, unpaid: Math.max(expected - paid, 0) };
  }, [allObligations]);

  const activeObligation = useMemo(() => {
    if (!activeVoucherId) return null;
    const voucher = workerMonthlyActualVouchers.find((row) => row.id === activeVoucherId);
    if (!voucher) return null;
    return (
      allObligations.find((row) => row.worker === voucher.worker && row.monthKey === voucher.monthKey) || null
    );
  }, [activeVoucherId, allObligations, workerMonthlyActualVouchers]);

  const activeVoucher = useMemo(() => {
    if (!activeVoucherId) return null;
    return workerMonthlyActualVouchers.find((row) => row.id === activeVoucherId) || null;
  }, [activeVoucherId, workerMonthlyActualVouchers]);

  const workerObligations = useMemo(() => {
    if (!activeVoucher) return [];
    return allObligations.filter((row) => row.worker === activeVoucher.worker);
  }, [activeVoucher, allObligations]);

  const unlinkedBankForWorker = useMemo(() => {
    if (!activeVoucher) return [];
    return buildUnlinkedWorkerBankWithdrawals(bankTransactions, bankTransactionFolders, workers).filter((tx) => {
      const workerName = resolveWorkerFromBankTx(tx, bankTransactionFolders, workers);
      return workerName === activeVoucher.worker;
    });
  }, [activeVoucher, bankTransactionFolders, bankTransactions, workers]);

  const applyLearnedPayWithVat = (worker: string) => {
    if (!setWorkerPayWithVatLearnRules) return;
    setWorkerPayWithVatLearnRules((prev) => upsertWorkerPayWithVatLearnRule(prev, worker, true));
  };

  const openVoucher = (obligation: WorkerMonthlyObligation) => {
    if (!setWorkerMonthlyActualVouchers) return;
    const existing = obligation.voucher;
    if (existing) {
      setActiveVoucherId(existing.id);
      return;
    }
    setWorkerMonthlyActualVouchers((prev) => {
      const next = upsertWorkerMonthlyActualVoucher(prev, {
        worker: obligation.worker,
        monthKey: obligation.monthKey,
        expectedAmount: obligation.expectedAmount,
        payWithVat: obligation.payWithVat,
        expectedFinalAmount: obligation.expectedFinalAmount,
        createdBy: currentUser?.name || currentUser?.email,
      });
      const created = next.find(
        (row) => row.worker === obligation.worker && row.monthKey === obligation.monthKey,
      );
      if (created) setActiveVoucherId(created.id);
      return next;
    });
  };

  const closeVoucherModal = () => {
    setActiveVoucherId(null);
    setManualForm(emptyManualForm);
    setManualError("");
  };

  const commitVoucherUpdates = (vouchers: WorkerMonthlyActualVoucher[], records?: boolean) => {
    if (!setWorkerMonthlyActualVouchers) return;
    const refreshed = vouchers.map(refreshVoucherPaidAmount);
    setWorkerMonthlyActualVouchers(refreshed);
    if (records && setWorkerPaymentRecords) {
      setWorkerPaymentRecords((prev) =>
        syncWorkerPaymentRecordsFromVouchers(prev, refreshed, currentUser?.name || currentUser?.email),
      );
    }
  };

  const saveManualEntry = () => {
    if (!setWorkerMonthlyActualVouchers || !activeVoucher) return;
    const entry = makeManualEntry(manualForm);
    if (!entry || entry.kind !== "manual") {
      setManualError("\uC9C0\uAE09\uC77C\uACFC \uAE08\uC561\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    const expectedAmount = Math.round(activeVoucher.expectedAmount || activeObligation?.expectedAmount || 0);
    let next = workerMonthlyActualVouchers;
    let learnedPayWithVat = false;

    if (
      !activeVoucher.payWithVat &&
      expectedAmount > 0 &&
      inferPayWithVatFromAmount(entry.amount, expectedAmount)
    ) {
      learnedPayWithVat = true;
      next = upsertWorkerMonthlyActualVoucher(next, {
        worker: activeVoucher.worker,
        monthKey: activeVoucher.monthKey,
        expectedAmount,
        payWithVat: true,
      });
    }

    const refreshedVoucher = next.find((row) => row.id === activeVoucher.id) || activeVoucher;
    const fifoAllocations =
      entry.amount !== refreshedVoucher.expectedFinalAmount
        ? allocateWorkerPaymentFifo(activeVoucher.worker, entry.amount, workerObligations)
        : undefined;

    next = addEntryToWorkerMonthlyVoucher(next, activeVoucher.id, entry, fifoAllocations);

    if (fifoAllocations?.length) {
      for (const alloc of fifoAllocations) {
        if (alloc.monthKey === activeVoucher.monthKey) continue;
        const target = workerObligations.find(
          (row) => row.worker === activeVoucher.worker && row.monthKey === alloc.monthKey,
        );
        next = upsertWorkerMonthlyActualVoucher(next, {
          worker: activeVoucher.worker,
          monthKey: alloc.monthKey,
          expectedAmount: target?.expectedAmount || 0,
          payWithVat: refreshedVoucher.payWithVat || target?.payWithVat,
        });
      }
    }

    if (setWorkerPayoutVouchers) {
      const payout = createWorkerPayoutVoucherFromManualEntry(
        activeVoucher.worker,
        entry,
        currentUser?.name || currentUser?.email,
      );
      setWorkerPayoutVouchers((prev) => [payout, ...prev]);
    }

    if (learnedPayWithVat) applyLearnedPayWithVat(activeVoucher.worker);
    commitVoucherUpdates(next, true);
    setManualForm(emptyManualForm);
    setManualError("");
  };

  const linkBankTx = (tx: BankTransaction) => {
    if (!setWorkerMonthlyActualVouchers || !setBankTransactions || !activeVoucher) return;
    const { vouchers, bankTransactions: nextBank, learnedPayWithVat } = linkBankEntryToWorkerMonthlyVoucher(
      workerMonthlyActualVouchers,
      bankTransactions,
      {
        voucherId: activeVoucher.id,
        bankTransactionId: tx.id,
        worker: activeVoucher.worker,
        monthKey: activeVoucher.monthKey,
        obligations: workerObligations,
        useFifo: true,
      },
    );
    if (learnedPayWithVat) applyLearnedPayWithVat(activeVoucher.worker);
    setBankTransactions(nextBank);
    commitVoucherUpdates(vouchers, true);
  };

  const activeExpectedNetPay = activeObligation?.expectedAmount || activeVoucher?.expectedAmount || 0;

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption font-bold text-slate-500">{"\uC608\uC815 \uD569\uACC4"}</div>
            <div className="erp-text-title mt-1 font-black">{formatKRW(summary.expected)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption font-bold text-slate-500">{"\uC2E4\uC9C0\uAE09 \uD569\uACC4"}</div>
            <div className="erp-text-title mt-1 font-black text-emerald-700">{formatKRW(summary.paid)}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption font-bold text-slate-500">{"\uBBF8\uC9C0\uAE09"}</div>
            <div className="erp-text-title mt-1 font-black text-red-600">{formatKRW(summary.unpaid)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="erp-statement-folder-split">
            <div className="erp-statement-folder-column">
              <div className="erp-statement-folder-column-head">
                <span className="erp-statement-folder-column-title">{"\uC2DC\uACF5\uC790"}</span>
                <div className="erp-workers-summary">
                  <span>
                    {"\uD300\uC6D0 "}
                    <b>{teamCount}</b>
                  </span>
                  <span>
                    {"\uC678\uC8FC "}
                    <b className="text-amber-700">{outsourceCount}</b>
                  </span>
                </div>
              </div>
              <div className="erp-statement-folder-toolbar">
                <input
                  lang="ko"
                  className="erp-statement-folder-search erp-input"
                  value={folderQuery}
                  onChange={(e) => setFolderQuery(e.target.value)}
                  placeholder={"\uC2DC\uACF5\uC790 \uAC80\uC0C9"}
                />
                <label className="erp-worker-list-export-category">
                  <span className="erp-worker-list-export-category-label">{"\uAD6C\uBD84"}</span>
                  <select
                    className="erp-input erp-worker-list-export-category-select rounded-lg px-2 py-1.5 text-sm font-semibold"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as "all" | "team" | "outsource")}
                  >
                    {CATEGORY_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant={unpaidOnly ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => setUnpaidOnly((prev) => !prev)}
                >
                  {"\uBBF8\uC9C0\uAE09\uB9CC"}
                </Button>
              </div>
              <div className="erp-statement-folder-column-body">
                {!filteredSummaries.length ? (
                  <p className="erp-statement-folder-empty">
                    {"\uC870\uAC74\uC5D0 \uD574\uB2F9\uD558\uB294 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
                  </p>
                ) : (
                  <div className="erp-statement-folder-list">
                    {renderWorkerFolderList(filteredSummaries, activeSummary?.worker, setSelectedWorker)}
                  </div>
                )}
              </div>
            </div>

            <div className="erp-statement-folder-column erp-worker-payout-detail-column">
              {!activeSummary ? (
                <p className="erp-statement-folder-empty">{"\uC2DC\uACF5\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694."}</p>
              ) : (
                <>
                  <div className="erp-statement-folder-column-head">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <WorkerCategoryBadge category={activeSummary.category} />
                        <span className="erp-statement-folder-column-title">{activeSummary.worker}</span>
                      </div>
                      <p className="erp-text-caption mt-1 text-slate-500">
                        {"\uC608\uC815 "}
                        {formatKRW(activeSummary.expectedTotal)}
                        {" \u00B7 \uC9C0\uAE09 "}
                        {formatKRW(activeSummary.paidTotal)}
                        {" \u00B7 \uBBF8\uC9C0\uAE09 "}
                        {formatKRW(activeSummary.balanceTotal)}
                        {activeSummary.unpaidMonthCount > 0
                          ? ` \u00B7 \uBBF8\uC9C0\uAE09 ${activeSummary.unpaidMonthCount}\uAC1C\uC6D4`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="erp-table-wrap mt-3">
                    <table className="erp-table erp-table--lg">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="text-left">{"\uC6D4"}</th>
                          <th className="text-right">{"\uC608\uC815(\uC2E4\uC9C0\uAE09)"}</th>
                          <th className="text-right">{"\uC9C0\uAE09\uC561"}</th>
                          <th className="text-right">{"\uBBF8\uC9C0\uAE09"}</th>
                          <th className="text-center">{"\uC0C1\uD0DC"}</th>
                          <th className="text-right">{"\uC804\uD45C"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSummary.obligations.map((row) => {
                          const voucher = row.voucher;
                          const paidAmount = voucher ? sumVoucherPaidAmount(voucher) : row.paid;
                          const status = computeVoucherStatus({
                            paidAmount,
                            expectedFinalAmount: row.expectedFinalAmount,
                          });
                          return (
                            <tr key={row.key} className="border-t hover:bg-slate-50">
                              <td className="font-semibold">{formatMonthLabel(row.monthKey)}</td>
                              <td className="text-right">{formatExpectedAmount(row)}</td>
                              <td className="text-right font-bold text-emerald-700">{formatKRW(row.paid)}</td>
                              <td className="text-right text-red-600">{formatKRW(row.balance)}</td>
                              <td className="text-center">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_CLASS[status]}`}
                                >
                                  {WORKER_MONTHLY_VOUCHER_STATUS_LABELS[status]}
                                </span>
                              </td>
                              <td className="text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl"
                                  onClick={() => openVoucher(row)}
                                  disabled={!setWorkerMonthlyActualVouchers}
                                >
                                  <FileText size={14} className="mr-1" />
                                  {voucher ? "\uC804\uD45C \uC5F4\uAE30" : "\uC804\uD45C \uC0DD\uC131"}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        {activeSummary.obligations.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-500">
                              {"\uC774 \uC2DC\uACF5\uC790\uC758 \uC6D4 \uC2E4\uC9C0\uAE09 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {activeVoucher && activeObligation ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeVoucherModal();
          }}
        >
          <div
            className="erp-ledger-modal max-w-3xl"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={"\uC6D4 \uC2E4\uC9C0\uAE09 \uC804\uD45C"}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  <FileText size={14} />
                  {activeVoucher.worker}
                  {" \u00B7 "}
                  {formatMonthLabel(activeVoucher.monthKey)}
                </div>
                <p className="erp-text-caption text-slate-500">
                  {"\uC608\uC815 "}
                  {formatExpectedAmount(activeObligation)}
                  {" \u00B7 \uC9C0\uAE09 "}
                  {formatKRW(sumVoucherPaidAmount(activeVoucher))}
                  {" \u00B7 \uBBF8\uC9C0\uAE09 "}
                  {formatKRW(Math.max(activeVoucher.expectedFinalAmount - sumVoucherPaidAmount(activeVoucher), 0))}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={closeVoucherModal}
                aria-label={"\uB2EB\uAE30"}
              >
                <X size={18} />
              </button>
            </div>

            {activeVoucher.allocations.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="erp-text-caption font-bold text-amber-900">{"\uBE48\uD2B8\uBBF8\uC218 FIFO \uBC30\uBD84"}</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                  {activeVoucher.allocations.map((alloc) => (
                    <li key={`${alloc.monthKey}-${alloc.amount}`}>
                      {formatMonthLabel(alloc.monthKey)}: {formatKRW(alloc.amount)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="erp-table-wrap mb-4 max-h-56 overflow-auto">
              <table className="erp-table erp-table--lg">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left">{"\uC77C\uC790"}</th>
                    <th className="text-left">{"\uAD6C\uBD84"}</th>
                    <th className="text-right">{"\uAE08\uC561"}</th>
                    <th className="text-left">{"\uB0B4\uC6A9"}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVoucher.entries.map((entry) => {
                    if (entry.kind === "bank") {
                      const tx = bankTransactions.find((row) => row.id === entry.bankTransactionId);
                      const memo = tx
                        ? [tx.counterpartyName, tx.description, tx.memo].filter(Boolean).join(" \u00B7 ")
                        : entry.bankTransactionId;
                      return (
                        <tr key={entry.id} className="border-t">
                          <td>{entry.date}</td>
                          <td>
                            <span className="erp-worker-payout-kind-badge is-bank">
                              <Landmark size={12} />
                              {"\uD1B5\uC7A5"}
                            </span>
                          </td>
                          <td className="text-right font-bold">
                            {formatAmountWithVatBreakdown(entry.amount, activeExpectedNetPay)}
                          </td>
                          <td className="text-slate-600">{memo || "-"}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={entry.id} className="border-t bg-amber-50/40">
                        <td>{entry.date}</td>
                        <td>
                          <span className="erp-worker-payout-kind-badge is-voucher">
                            <FileText size={12} />
                            {WORKER_PAYOUT_METHOD_LABELS[entry.method]}
                          </span>
                        </td>
                        <td className="text-right font-bold text-amber-800">
                          {formatAmountWithVatBreakdown(entry.amount, activeExpectedNetPay)}
                        </td>
                        <td>{entry.memo || "-"}</td>
                      </tr>
                    );
                  })}
                  {activeVoucher.entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500">
                        {"\uC9C0\uAE09 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <h3 className="erp-text-body mb-3 font-bold">{"\uC218\uB3D9 \uC9C0\uAE09 \uCD94\uAC00"}</h3>
                <div className="grid gap-3">
                  <Field label={"\uC9C0\uAE09\uC77C"}>
                    <KoreanDateInput
                      value={manualForm.date}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))}
                    />
                  </Field>
                  <Field label={"\uC9C0\uAE09\uC561"}>
                    <input
                      lang="ko"
                      className="erp-input w-full rounded-xl"
                      inputMode="numeric"
                      value={formatMoneyInput(manualForm.amount)}
                      onChange={(e) =>
                        setManualForm((prev) => ({ ...prev, amount: sanitizeMoneyInput(e.target.value) }))
                      }
                      placeholder="0"
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    {METHOD_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`rounded-xl border px-2 py-2 text-xs font-bold ${
                          manualForm.method === option.key
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                        onClick={() => setManualForm((prev) => ({ ...prev, method: option.key }))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <Field label={"\uBE44\uACE0"}>
                    <input
                      lang="ko"
                      className="erp-input w-full rounded-xl"
                      value={manualForm.memo}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, memo: e.target.value }))}
                    />
                  </Field>
                  {manualError ? <p className="text-sm font-semibold text-red-600">{manualError}</p> : null}
                  <Button type="button" className="rounded-2xl" onClick={saveManualEntry}>
                    <Plus size={14} className="mr-1" />
                    {"\uC218\uB3D9 \uC9C0\uAE09 \uB4F1\uB85D"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <h3 className="erp-text-body mb-3 font-bold">{"\uBBF8\uC5F0\uACB0 \uD1B5\uC7A5 \uCD9C\uAE08"}</h3>
                <div className="max-h-64 space-y-2 overflow-auto">
                  {unlinkedBankForWorker.length === 0 ? (
                    <p className="erp-text-caption text-slate-500">
                      {"\uC5F0\uACB0 \uAC00\uB2A5\uD55C \uBBF8\uC5F0\uACB0 \uCD9C\uAE08\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                    </p>
                  ) : (
                    unlinkedBankForWorker.map((tx) => {
                      const memo = [tx.counterpartyName, tx.description, tx.memo].filter(Boolean).join(" \u00B7 ");
                      const vatHint = findBankVatMatchHint(tx, workerObligations);
                      return (
                        <div key={tx.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{formatBankTransactionDateTime(tx.transactionAt)}</div>
                            <div className="erp-text-caption truncate text-slate-500">{memo || "-"}</div>
                            {vatHint ? (
                              <div className="erp-text-caption mt-1 font-semibold text-amber-700">
                                {"\uC2E4\uC9C0\uAE09+\uBD80\uAC00\uC138 \uD655\uC778: "}
                                {vatHint}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-right font-bold text-red-600">
                              {activeExpectedNetPay > 0
                                ? formatAmountWithVatBreakdown(tx.withdrawal, activeExpectedNetPay)
                                : formatKRW(tx.withdrawal)}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              onClick={() => linkBankTx(tx)}
                            >
                              {"\uC5F0\uACB0"}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
