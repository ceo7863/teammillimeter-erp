import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileText, Landmark, Link2, Plus, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import {
  flattenSalesToWorkerPaymentRows,
  filterActiveWorkers,
  findWorkerMasterByListName,
  formatKRW,
  normalizeWorkerName,
  compareWorkerFolderRows,
  normalizeWorkerCategory,
  WORKER_CATEGORY_OUTSOURCE,
  WORKER_CATEGORY_TEAM,
  todayISO,
  type WorkerCategory,
  type WorkerMasterLike,
  type WorkerMonthlyPaymentMemos,
} from "@/utils/workerPayments";
import {
  calculateWorkerPaymentVat,
  formatMonthLabel,
  type WorkerMonthlyPaymentRecord,
  upsertWorkerPaymentRecord,
} from "@/utils/workerMonthlyPayments";
import {
  WORKER_PAYOUT_METHOD_LABELS,
  type WorkerPayoutMethod,
  type WorkerPayoutVoucher,
  makeWorkerPayoutVoucherId,
} from "@/utils/workerPayoutLedger";
import { confirmDelete } from "@/utils/confirmDelete";
import { parseMoney, formatMoneyInput, sanitizeMoneyInput } from "@/utils/receivables";
import {
  linkBankEntryToWorkerMonthlyVoucher,
  linkPayoutVoucherToWorkerMonthlyVoucher,
  findWorkerMonthlyVoucherForPayoutVoucher,
  listWorkerCashPayoutVouchers,
  addEntryToWorkerMonthlyVoucher,
  cancelWorkerMonthlyActualVoucher,
  removeEntryFromWorkerMonthlyVoucher,
  matchesWorkerPayoutVoucherForManualEntry,
  buildWorkerMonthlyObligations,
  buildWorkerMonthlyWorkerSummaries,
  computeVoucherStatus,
  computeWorkerMonthlyVoucherSettlement,
  createWorkerPayoutVoucherFromManualEntry,
  breakdownWorkerPaymentEntry,
  detectWorkerPaymentBreakdown,
  inferPayWithVatFromAmount,
  isManualNetOnlyPayoutMethod,
  listWorkerBankTransactions,
  refreshVoucherPaidAmount,
  sumVoucherPaidAmount,
  syncWorkerPaymentRecordsFromVouchers,
  summarizeWorkerMonthlyObligationAmounts,
  upsertWorkerMonthlyActualVoucher,
  upsertWorkerPayWithVatLearnRule,
  WORKER_MONTHLY_VOUCHER_STATUS_LABELS,
  type WorkerMonthlyActualVoucher,
  type WorkerMonthlyObligation,
  type WorkerMonthlyPaymentEntry,
  type WorkerPayWithVatLearnRule,
  type WorkerMonthlyWorkerSummary,
} from "@/utils/workerMonthlyActualPayments";
import {
  buildWorkerBankMatchCandidates,
  resolveWorkerBankPaymentAmount,
  type WorkerBankMatchCandidate,
} from "@/utils/bankWorkerMonthlyMatch";

type WorkerMonthlyActualPaymentTabProps = {
  workers?: WorkerMasterLike[];
  workerMonthlyPaymentMemos?: WorkerMonthlyPaymentMemos;
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
  bankTransactionFolders?: BankTransactionFolder[];
  setBankTransactions?: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  setWorkers?: React.Dispatch<React.SetStateAction<WorkerMasterLike[]>>;
  onPersistWorkersImmediate?: (nextWorkers: WorkerMasterLike[]) => boolean | void | Promise<boolean | void>;
  onPersistWorkerMonthlyMemoImmediate?: (
    workerId: number | string,
    memo: string,
  ) => boolean | Promise<boolean>;
  onPersistWorkerMonthlyLinksImmediate?: (patch: {
    workerMonthlyActualVouchers: WorkerMonthlyActualVoucher[];
    bankTransactions: BankTransaction[];
    workerPaymentRecords?: WorkerMonthlyPaymentRecord[];
  }) => void | Promise<void>;
  onPersistBankTransactionMemoUpdates?: (
    updates: Record<string, string>,
  ) => boolean | Promise<boolean>;
  onRequestImmediateSave?: (patch: {
    bankTransactions?: BankTransaction[];
    workers?: WorkerMasterLike[];
    workerMonthlyPaymentMemos?: WorkerMonthlyPaymentMemos;
  }) => void | Promise<boolean>;
  selectedMonthKey?: string;
  setSelectedMonthKey?: (value: string | ((prev: string) => string)) => void;
  focusWorker?: string;
  focusVoucherId?: string | null;
  onFocusConsumed?: () => void;
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

const emptyCashVoucherForm = {
  date: todayISO(),
  amount: "",
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

function formatEntryAmount(entry: WorkerMonthlyPaymentEntry, expectedNetPay: number) {
  const breakdown = breakdownWorkerPaymentEntry(entry, expectedNetPay);
  if (!breakdown.includesVat) return formatKRW(entry.amount);
  return (
    <>
      {formatKRW(entry.amount)}
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

type WorkerCategoryTab = "team" | "outsource";

const CATEGORY_FILTER_OPTIONS: Array<{ value: WorkerCategoryTab; label: string }> = [
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

type WorkerSummaryFolderGroup = {
  category: WorkerCategory;
  rows: WorkerMonthlyWorkerSummary[];
  masterCount: number;
};

function renderWorkerFolderList(
  groups: WorkerSummaryFolderGroup[],
  activeWorker: string | undefined,
  onSelect: (worker: string) => void,
  options?: { showEmptyGroups?: boolean; showGroupHead?: boolean },
) {
  const showEmptyGroups = options?.showEmptyGroups ?? false;
  const showGroupHead = options?.showGroupHead ?? true;

  return groups.map((group) => (
    <div key={`group-${group.category}`} className="erp-worker-monthly-folder-group">
      {showGroupHead ? (
        <div className="erp-worker-monthly-folder-group-head">
          <WorkerCategoryBadge category={group.category} />
          <span className="erp-worker-monthly-folder-group-count">
            {group.masterCount}
            {"\uBA85"}
          </span>
        </div>
      ) : null}
      {group.rows.length === 0 && showEmptyGroups ? (
        <p className="erp-statement-folder-empty px-1 py-2">
          {"\uC870\uAC74\uC5D0 \uD574\uB2F9\uD558\uB294 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
        </p>
      ) : null}
      {group.rows.map((folder) =>
        renderWorkerFolderButton(folder, activeWorker === folder.worker, () => onSelect(folder.worker)),
      )}
    </div>
  ));
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
      className={`erp-worker-payout-folder-btn ${active ? "is-active" : ""}`}
      onClick={onSelect}
    >
      <span className="erp-worker-payout-folder-name">
        <WorkerCategoryBadge category={folder.category} />
        <span>{folder.worker}</span>
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
  bankTransactionFolders = [],
  setBankTransactions,
  setWorkers,
  onPersistWorkersImmediate,
  onPersistWorkerMonthlyLinksImmediate,
  onPersistBankTransactionMemoUpdates,
  onRequestImmediateSave,
  focusWorker,
  focusVoucherId,
  onFocusConsumed,
  currentUser,
}: WorkerMonthlyActualPaymentTabProps) {
  const workersRef = useRef(workers);
  workersRef.current = workers;
  const bankTransactionsRef = useRef(bankTransactions);
  bankTransactionsRef.current = bankTransactions;
  const workerPaymentRecordsRef = useRef(workerPaymentRecords);
  workerPaymentRecordsRef.current = workerPaymentRecords;
  const [folderQuery, setFolderQuery] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<WorkerCategoryTab>("team");
  const [selectedWorker, setSelectedWorker] = useState("");
  const [activeVoucherId, setActiveVoucherId] = useState<string | null>(null);
  const [bankLinkTx, setBankLinkTx] = useState<BankTransaction | null>(null);
  const [bankLinkError, setBankLinkError] = useState("");
  const [manualForm, setManualForm] = useState(emptyManualForm);
  const [manualError, setManualError] = useState("");
  const [cashLinkVoucher, setCashLinkVoucher] = useState<WorkerPayoutVoucher | null>(null);
  const [cashVoucherModalOpen, setCashVoucherModalOpen] = useState(false);
  const [cashVoucherForm, setCashVoucherForm] = useState(emptyCashVoucherForm);
  const [cashVoucherError, setCashVoucherError] = useState("");
  const [workerDetailModalWorker, setWorkerDetailModalWorker] = useState<string | null>(null);
  const [draftBankMemos, setDraftBankMemos] = useState<Record<string, string>>({});
  const draftBankMemosRef = useRef<Record<string, string>>({});
  const bankMemoComposingRef = useRef(false);
  const [bankMemoSavingId, setBankMemoSavingId] = useState<string | null>(null);
  const [workerDetailSaving, setWorkerDetailSaving] = useState(false);

  const syncDraftBankMemo = useCallback((txId: string, value: string) => {
    draftBankMemosRef.current = { ...draftBankMemosRef.current, [txId]: value };
    setDraftBankMemos((prev) => ({ ...prev, [txId]: value }));
  }, []);

  const saveBankMemoDirect = useCallback(
    async (txId: string, memoOverride?: string) => {
      const row = bankTransactions.find((item) => item.id === txId);
      if (!row) return true;

      const memo = String(
        memoOverride ?? draftBankMemosRef.current[txId] ?? draftBankMemos[txId] ?? row.memo ?? "",
      ).trim();
      const savedMemo = String(row.memo ?? "").trim();
      if (memo === savedMemo) {
        setDraftBankMemos((prev) => {
          if (!(txId in prev)) return prev;
          const next = { ...prev };
          delete next[txId];
          draftBankMemosRef.current = next;
          return next;
        });
        return true;
      }

      if (!onPersistBankTransactionMemoUpdates) {
        window.alert("\uBE44\uACE0 \uC800\uC7A5 \uAE30\uB294 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
        return false;
      }

      setBankMemoSavingId(txId);
      try {
        const saved = await onPersistBankTransactionMemoUpdates({ [txId]: memo });
        if (saved === false) {
          window.alert("\uBE44\uACE0 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
          return false;
        }
        setDraftBankMemos((prev) => {
          const next = { ...prev };
          delete next[txId];
          draftBankMemosRef.current = next;
          return next;
        });
        return true;
      } catch (error) {
        console.error(error);
        window.alert("\uBE44\uACE0 \uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.");
        return false;
      } finally {
        setBankMemoSavingId(null);
      }
    },
    [bankTransactions, draftBankMemos, onPersistBankTransactionMemoUpdates],
  );

  const openWorkerDetailModal = useCallback((workerName: string) => {
    setSelectedWorker(workerName);
    setWorkerDetailModalWorker(workerName);
    draftBankMemosRef.current = {};
    setDraftBankMemos({});
  }, []);

  useEffect(() => {
    if (!focusWorker) return;
    openWorkerDetailModal(focusWorker);
    if (focusVoucherId) setActiveVoucherId(focusVoucherId);
    onFocusConsumed?.();
  }, [focusWorker, focusVoucherId, onFocusConsumed, openWorkerDetailModal]);

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

  const modalWorkerSummary = useMemo(() => {
    if (!workerDetailModalWorker) return null;
    return workerSummaries.find((row) => row.worker === workerDetailModalWorker) ?? null;
  }, [workerDetailModalWorker, workerSummaries]);

  const activeWorkers = useMemo(() => filterActiveWorkers(workers), [workers]);

  const teamCount = useMemo(
    () =>
      activeWorkers.filter((worker) => normalizeWorkerCategory(worker.category) === WORKER_CATEGORY_TEAM).length,
    [activeWorkers],
  );
  const outsourceCount = useMemo(
    () =>
      activeWorkers.filter((worker) => normalizeWorkerCategory(worker.category) === WORKER_CATEGORY_OUTSOURCE).length,
    [activeWorkers],
  );

  const filteredSummaries = useMemo(() => {
    const query = folderQuery.trim().toLowerCase();
    const rows = workerSummaries.filter((row) => {
      if (categoryFilter === "team" && row.category !== WORKER_CATEGORY_TEAM) return false;
      if (categoryFilter === "outsource" && row.category !== WORKER_CATEGORY_OUTSOURCE) return false;
      if (unpaidOnly && row.balanceTotal <= 0) return false;
      if (!query) return true;
      return row.worker.toLowerCase().includes(query);
    });
    return [...rows].sort((a, b) => compareWorkerFolderRows(a, b));
  }, [categoryFilter, folderQuery, unpaidOnly, workerSummaries]);

  const activeCategory = categoryFilter === "team" ? WORKER_CATEGORY_TEAM : WORKER_CATEGORY_OUTSOURCE;
  const activeCategoryCount = categoryFilter === "team" ? teamCount : outsourceCount;

  const summaryFolderGroups = useMemo((): WorkerSummaryFolderGroup[] => {
    return [
      {
        category: activeCategory,
        rows: filteredSummaries,
        masterCount: activeCategoryCount,
      },
    ];
  }, [activeCategory, activeCategoryCount, filteredSummaries]);

  const activeSummary = useMemo(() => {
    if (!filteredSummaries.length) return null;
    if (selectedWorker) {
      return filteredSummaries.find((row) => row.worker === selectedWorker) || filteredSummaries[0];
    }
    return filteredSummaries[0];
  }, [filteredSummaries, selectedWorker]);

  const summary = useMemo(() => {
    const obligations = workerSummaries
      .filter((row) =>
        categoryFilter === "team"
          ? row.category === WORKER_CATEGORY_TEAM
          : row.category === WORKER_CATEGORY_OUTSOURCE,
      )
      .flatMap((row) => row.obligations);
    const expected = obligations.reduce((sum, row) => sum + row.expectedFinalAmount, 0);
    const paid = obligations.reduce((sum, row) => sum + row.paid, 0);
    return { expected, paid, unpaid: Math.max(expected - paid, 0) };
  }, [categoryFilter, workerSummaries]);

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

  const workerBankTransactions = useMemo(() => {
    if (!activeSummary) return [];
    return listWorkerBankTransactions(
      activeSummary.worker,
      bankTransactions,
      bankTransactionFolders,
      workers,
    );
  }, [activeSummary, bankTransactionFolders, bankTransactions, workers]);

  const modalWorkerBankTransactions = useMemo(() => {
    if (!workerDetailModalWorker) return [];
    return listWorkerBankTransactions(
      workerDetailModalWorker,
      bankTransactions,
      bankTransactionFolders,
      workers,
    );
  }, [workerDetailModalWorker, bankTransactionFolders, bankTransactions, workers]);

  const workerBankTotal = useMemo(
    () =>
      workerBankTransactions.reduce(
        (sum, tx) => sum + (Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0)),
        0,
      ),
    [workerBankTransactions],
  );

  const modalWorkerBankTotal = useMemo(
    () =>
      modalWorkerBankTransactions.reduce(
        (sum, tx) => sum + (Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0)),
        0,
      ),
    [modalWorkerBankTransactions],
  );

  const workerCashVouchers = useMemo(() => {
    if (!activeSummary) return [];
    return listWorkerCashPayoutVouchers(activeSummary.worker, workerPayoutVouchers);
  }, [activeSummary, workerPayoutVouchers]);

  const modalWorkerCashVouchers = useMemo(() => {
    if (!workerDetailModalWorker) return [];
    return listWorkerCashPayoutVouchers(workerDetailModalWorker, workerPayoutVouchers);
  }, [workerDetailModalWorker, workerPayoutVouchers]);

  const workerCashTotal = useMemo(
    () => workerCashVouchers.reduce((sum, row) => sum + (Math.round(Number(row.amount) || 0)), 0),
    [workerCashVouchers],
  );

  const modalWorkerCashTotal = useMemo(
    () => modalWorkerCashVouchers.reduce((sum, row) => sum + (Math.round(Number(row.amount) || 0)), 0),
    [modalWorkerCashVouchers],
  );

  const obligationLinkMonthOptions = useMemo(() => {
    if (!activeSummary) return [] as WorkerMonthlyObligation[];
    return [...activeSummary.obligations].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [activeSummary]);

  const showProbationBillMargin = useMemo(
    () => Boolean(activeSummary?.obligations.some((row) => row.isProbation)),
    [activeSummary],
  );

  const modalShowProbationBillMargin = useMemo(
    () => Boolean(modalWorkerSummary?.obligations.some((row) => row.isProbation)),
    [modalWorkerSummary],
  );

  const obligationTotals = useMemo(() => {
    if (!activeSummary) return null;
    return activeSummary.obligations.reduce(
      (acc, row) => {
        const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
        acc.netPay += amounts.netPay;
        acc.vatAmount += amounts.vatAmount;
        acc.totalAmount += amounts.totalAmount;
        acc.paid += row.paid;
        acc.balance += row.balance;
        if (row.isProbation) {
          acc.periodBill += row.periodBill || 0;
          acc.periodMargin += row.periodMargin || 0;
        }
        return acc;
      },
      { netPay: 0, vatAmount: 0, totalAmount: 0, paid: 0, balance: 0, periodBill: 0, periodMargin: 0 },
    );
  }, [activeSummary]);

  const modalObligationTotals = useMemo(() => {
    if (!modalWorkerSummary) return null;
    return modalWorkerSummary.obligations.reduce(
      (acc, row) => {
        const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
        acc.netPay += amounts.netPay;
        acc.vatAmount += amounts.vatAmount;
        acc.totalAmount += amounts.totalAmount;
        acc.paid += row.paid;
        acc.balance += row.balance;
        if (row.isProbation) {
          acc.periodBill += row.periodBill || 0;
          acc.periodMargin += row.periodMargin || 0;
        }
        return acc;
      },
      { netPay: 0, vatAmount: 0, totalAmount: 0, paid: 0, balance: 0, periodBill: 0, periodMargin: 0 },
    );
  }, [modalWorkerSummary]);

  const isWorkerDetailDirty = useMemo(() => {
    if (!workerDetailModalWorker) return false;
    for (const tx of modalWorkerBankTransactions) {
      const draft = draftBankMemosRef.current[tx.id] ?? draftBankMemos[tx.id];
      if (draft === undefined) continue;
      const saved = String(bankTransactions.find((row) => row.id === tx.id)?.memo ?? tx.memo ?? "").trim();
      if (draft.trim() !== saved) return true;
    }
    return false;
  }, [workerDetailModalWorker, draftBankMemos, modalWorkerBankTransactions, bankTransactions]);

  const closeWorkerDetailModal = useCallback(() => {
    if (isWorkerDetailDirty) {
      if (!window.confirm("\uC785\uB825\uD55C \uB0B4\uC6A9\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC800\uC7A5 \uD558\uC9C0 \uC54A\uACE0 \uB2EB\uC744\uAE4C\uC694?")) {
        return;
      }
    }
    setWorkerDetailModalWorker(null);
  }, [isWorkerDetailDirty]);

  const saveWorkerDetailModal = useCallback(async () => {
    if (!workerDetailModalWorker) return;

    const updates: Record<string, string> = {};
    for (const tx of modalWorkerBankTransactions) {
      const draft = draftBankMemosRef.current[tx.id] ?? draftBankMemos[tx.id];
      if (draft === undefined) continue;
      const saved = String(bankTransactions.find((row) => row.id === tx.id)?.memo ?? tx.memo ?? "").trim();
      if (draft.trim() === saved) continue;
      updates[tx.id] = draft;
    }

    if (!Object.keys(updates).length) {
      setWorkerDetailModalWorker(null);
      return;
    }

    if (!onPersistBankTransactionMemoUpdates) {
      window.alert("\uBE44\uACE0 \uC800\uC7A5 \uAE30\uB294 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
      return;
    }

    setWorkerDetailSaving(true);
    try {
      const saved = await onPersistBankTransactionMemoUpdates(updates);
      if (saved === false) {
        window.alert("\uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      draftBankMemosRef.current = {};
      setDraftBankMemos({});
      setWorkerDetailModalWorker(null);
    } catch (error) {
      console.error(error);
      window.alert("\uC800\uC7A5 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.");
    } finally {
      setWorkerDetailSaving(false);
    }
  }, [
    workerDetailModalWorker,
    draftBankMemos,
    modalWorkerBankTransactions,
    bankTransactions,
    onPersistBankTransactionMemoUpdates,
  ]);

  const resolveBankTxVoucherLink = (tx: BankTransaction, workerName: string) => {
    const linkedId = String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim();
    if (linkedId) {
      const voucher = workerMonthlyActualVouchers.find((row) => row.id === linkedId);
      if (voucher) return voucher;
    }
    return (
      workerMonthlyActualVouchers.find(
        (row) =>
          row.worker === workerName &&
          row.entries.some((entry) => entry.kind === "bank" && entry.bankTransactionId === tx.id),
      ) || null
    );
  };

  const bankLinkCandidates = useMemo(() => {
    if (!bankLinkTx || !activeSummary) return [] as WorkerBankMatchCandidate[];
    return buildWorkerBankMatchCandidates(bankLinkTx, activeSummary.obligations, workers, {
      worker: activeSummary.worker,
    });
  }, [activeSummary, bankLinkTx, workers]);

  const bankLinkMonthOptions = useMemo(() => {
    if (!activeSummary) return [];
    const candidateByMonth = new Map(bankLinkCandidates.map((row) => [row.obligation.monthKey, row]));
    const scored = bankLinkCandidates.map((candidate) => ({
      obligation: candidate.obligation,
      candidate,
    }));
    const rest = activeSummary.obligations
      .filter((row) => !candidateByMonth.has(row.monthKey))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((obligation) => ({ obligation, candidate: null as WorkerBankMatchCandidate | null }));
    return [...scored, ...rest];
  }, [activeSummary, bankLinkCandidates]);

  const openBankLinkModal = (tx: BankTransaction) => {
    if (!setBankTransactions || !setWorkerMonthlyActualVouchers || !activeSummary) return;
    const linked = resolveBankTxVoucherLink(tx, activeSummary.worker);
    if (linked) {
      setBankLinkError(`${formatMonthLabel(linked.monthKey)} \uC804\uD45C\uC5D0 \uC774\uBBF8 \uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uAC70\uB798\uC785\uB2C8\uB2E4.`);
      setActiveVoucherId(linked.id);
      return;
    }
    setBankLinkError("");
    setBankLinkTx(tx);
  };

  const closeBankLinkModal = () => {
    setBankLinkTx(null);
    setBankLinkError("");
  };

  const linkBankTxToObligation = (obligation: WorkerMonthlyObligation) => {
    if (!bankLinkTx || !setWorkerMonthlyActualVouchers || !setBankTransactions || !activeSummary) return;

    let nextVouchers = workerMonthlyActualVouchers;
    let voucher =
      obligation.voucher ||
      nextVouchers.find((row) => row.worker === obligation.worker && row.monthKey === obligation.monthKey);

    if (!voucher) {
      nextVouchers = upsertWorkerMonthlyActualVoucher(nextVouchers, {
        worker: obligation.worker,
        monthKey: obligation.monthKey,
        expectedAmount: obligation.expectedAmount,
        payWithVat: obligation.payWithVat,
        expectedFinalAmount: obligation.expectedFinalAmount,
        createdBy: currentUser?.name || currentUser?.email,
      });
      voucher = nextVouchers.find(
        (row) => row.worker === obligation.worker && row.monthKey === obligation.monthKey,
      );
    }

    if (!voucher) {
      setBankLinkError("\uC804\uD45C\uB97C \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }

    const result = linkBankEntryToWorkerMonthlyVoucher(nextVouchers, bankTransactions, {
      voucherId: voucher.id,
      bankTransactionId: bankLinkTx.id,
      worker: activeSummary.worker,
      monthKey: obligation.monthKey,
      obligations: activeSummary.obligations,
      useFifo: false,
    });

    if (result.learnedPayWithVat) applyLearnedPayWithVat(activeSummary.worker);
    persistMonthlyLinkUpdates(result.vouchers, result.bankTransactions, true);
    setActiveVoucherId(voucher.id);
    closeBankLinkModal();
  };

  const resolveCashVoucherLink = (voucher: WorkerPayoutVoucher, workerName: string) =>
    findWorkerMonthlyVoucherForPayoutVoucher(workerMonthlyActualVouchers, workerName, voucher);

  const openCashLinkModal = (voucher: WorkerPayoutVoucher) => {
    if (!setWorkerMonthlyActualVouchers || !activeSummary) return;
    const linked = resolveCashVoucherLink(voucher, activeSummary.worker);
    if (linked) {
      setBankLinkError(`${formatMonthLabel(linked.monthKey)} \uC804\uD45C\uC5D0 \uC774\uBBF8 \uC5F0\uACB0\uB41C \uD604\uAE08 \uC804\uD45C\uC785\uB2C8\uB2E4.`);
      setActiveVoucherId(linked.id);
      return;
    }
    setBankLinkError("");
    setCashLinkVoucher(voucher);
  };

  const closeCashLinkModal = () => {
    setCashLinkVoucher(null);
  };

  const linkCashVoucherToObligation = (obligation: WorkerMonthlyObligation) => {
    if (!cashLinkVoucher || !setWorkerMonthlyActualVouchers || !activeSummary) return;

    let nextVouchers = workerMonthlyActualVouchers;
    let voucher =
      obligation.voucher ||
      nextVouchers.find((row) => row.worker === obligation.worker && row.monthKey === obligation.monthKey);

    if (!voucher) {
      nextVouchers = upsertWorkerMonthlyActualVoucher(nextVouchers, {
        worker: obligation.worker,
        monthKey: obligation.monthKey,
        expectedAmount: obligation.expectedAmount,
        payWithVat: obligation.payWithVat,
        expectedFinalAmount: obligation.expectedFinalAmount,
        createdBy: currentUser?.name || currentUser?.email,
      });
      voucher = nextVouchers.find(
        (row) => row.worker === obligation.worker && row.monthKey === obligation.monthKey,
      );
    }

    if (!voucher) {
      setBankLinkError("\uC804\uD45C\uB97C \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }

    const result = linkPayoutVoucherToWorkerMonthlyVoucher(nextVouchers, {
      voucherId: voucher.id,
      payoutVoucher: cashLinkVoucher,
      worker: activeSummary.worker,
      monthKey: obligation.monthKey,
      obligations: activeSummary.obligations,
      useFifo: false,
    });

    if (result.learnedPayWithVat) applyLearnedPayWithVat(activeSummary.worker);
    commitVoucherUpdates(result.vouchers, true);
    setActiveVoucherId(voucher.id);
    closeCashLinkModal();
  };

  const openCashVoucherModal = () => {
    if (!setWorkerPayoutVouchers || !activeSummary) return;
    setCashVoucherForm({ ...emptyCashVoucherForm, date: todayISO() });
    setCashVoucherError("");
    setCashVoucherModalOpen(true);
  };

  const closeCashVoucherModal = () => {
    setCashVoucherModalOpen(false);
    setCashVoucherError("");
  };

  const saveCashVoucher = () => {
    if (!setWorkerPayoutVouchers || !activeSummary) return;
    const date = cashVoucherForm.date.trim();
    const amount = parseMoney(cashVoucherForm.amount);
    if (!date) {
      setCashVoucherError("\uC9C0\uAE09\uC77C\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (amount <= 0) {
      setCashVoucherError("\uC9C0\uAE09\uC561\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    const voucher: WorkerPayoutVoucher = {
      id: makeWorkerPayoutVoucherId(),
      workerName: activeSummary.worker,
      date,
      amount,
      method: "cash",
      memo: cashVoucherForm.memo.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || currentUser?.email || undefined,
    };

    setWorkerPayoutVouchers((prev) => [voucher, ...prev]);
    closeCashVoucherModal();
    openCashLinkModal(voucher);
  };

  const removeCashVoucher = (voucher: WorkerPayoutVoucher) => {
    if (!setWorkerPayoutVouchers || !activeSummary) return;
    if (resolveCashVoucherLink(voucher, activeSummary.worker)) {
      setBankLinkError("\uC6D4 \uC2E4\uC9C0\uAE09\uC5D0 \uC5F0\uACB0\uB41C \uD604\uAE08 \uC804\uD45C\uB294 \uC0AD\uC81C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (!confirmDelete("\uC774 \uD604\uAE08 \uC804\uD45C\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?")) return;
    setWorkerPayoutVouchers((prev) => prev.filter((row) => row.id !== voucher.id));
  };

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
    const next = upsertWorkerMonthlyActualVoucher(workerMonthlyActualVouchers, {
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
    commitVoucherUpdates(next, false);
  };

  const closeVoucherModal = () => {
    setActiveVoucherId(null);
    setManualForm(emptyManualForm);
    setManualError("");
  };

  const cancelActiveVoucher = () => {
    if (!activeVoucher || !setWorkerMonthlyActualVouchers) return;
    const label = `${activeVoucher.worker} · ${formatMonthLabel(activeVoucher.monthKey, activeObligation?.periodLabel)}`;
    const message = `${label} \uC804\uD45C\uB97C \uCDE8\uC18C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?\n\uC5F0\uACB0\uB41C \uD1B5\uC7A5\u00B7\uC9C0\uAE09 \uB0B4\uC5ED\uC774 \uD574\uC81C\uB429\uB2C8\uB2E4.`;
    if (!window.confirm(message)) return;

    const result = cancelWorkerMonthlyActualVoucher(
      workerMonthlyActualVouchers,
      bankTransactions,
      activeVoucher.id,
    );
    let nextRecords = workerPaymentRecords;
    if (setWorkerPaymentRecords && result.cancelled) {
      nextRecords = upsertWorkerPaymentRecord(workerPaymentRecords, {
        worker: result.cancelled.worker,
        monthKey: result.cancelled.monthKey,
        paid: false,
      });
    }
    if (onPersistWorkerMonthlyLinksImmediate) {
      void onPersistWorkerMonthlyLinksImmediate({
        workerMonthlyActualVouchers: result.vouchers,
        bankTransactions: result.bankTransactions,
        workerPaymentRecords: nextRecords,
      });
    } else {
      setWorkerMonthlyActualVouchers(result.vouchers);
      if (setBankTransactions) setBankTransactions(result.bankTransactions);
      if (nextRecords !== workerPaymentRecords && setWorkerPaymentRecords) {
        setWorkerPaymentRecords(nextRecords);
      }
    }
    closeVoucherModal();
  };

  const commitVoucherUpdates = (vouchers: WorkerMonthlyActualVoucher[], records?: boolean) => {
    if (!setWorkerMonthlyActualVouchers) return;
    const refreshed = vouchers.map(refreshVoucherPaidAmount);
    if (onPersistWorkerMonthlyLinksImmediate) {
      const nextRecords =
        records && setWorkerPaymentRecords
          ? syncWorkerPaymentRecordsFromVouchers(
              workerPaymentRecordsRef.current,
              refreshed,
              currentUser?.name || currentUser?.email,
            )
          : undefined;
      void onPersistWorkerMonthlyLinksImmediate({
        workerMonthlyActualVouchers: refreshed,
        bankTransactions: bankTransactionsRef.current,
        workerPaymentRecords: nextRecords,
      });
      return;
    }
    setWorkerMonthlyActualVouchers(refreshed);
    if (records && setWorkerPaymentRecords) {
      setWorkerPaymentRecords((prev) =>
        syncWorkerPaymentRecordsFromVouchers(prev, refreshed, currentUser?.name || currentUser?.email),
      );
    }
  };

  const persistMonthlyLinkUpdates = (
    vouchers: WorkerMonthlyActualVoucher[],
    nextBankTransactions: BankTransaction[],
    syncRecords = true,
  ) => {
    bankTransactionsRef.current = nextBankTransactions;
    const refreshed = vouchers.map(refreshVoucherPaidAmount);
    if (onPersistWorkerMonthlyLinksImmediate) {
      const nextRecords =
        syncRecords && setWorkerPaymentRecords
          ? syncWorkerPaymentRecordsFromVouchers(
              workerPaymentRecordsRef.current,
              refreshed,
              currentUser?.name || currentUser?.email,
            )
          : undefined;
      void onPersistWorkerMonthlyLinksImmediate({
        workerMonthlyActualVouchers: refreshed,
        bankTransactions: nextBankTransactions,
        workerPaymentRecords: nextRecords,
      });
      return;
    }
    commitVoucherUpdates(vouchers, syncRecords);
    if (setBankTransactions) setBankTransactions(nextBankTransactions);
  };

  const removeVoucherEntry = (entry: WorkerMonthlyPaymentEntry) => {
    if (!activeVoucher || !setWorkerMonthlyActualVouchers) return;
    const label =
      entry.kind === "bank"
        ? `\uD1B5\uC7A5 ${formatKRW(entry.amount)} (${entry.date})`
        : `${WORKER_PAYOUT_METHOD_LABELS[entry.method]} ${formatKRW(entry.amount)} (${entry.date})`;
    if (!window.confirm(`${label} \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?`)) return;

    const result = removeEntryFromWorkerMonthlyVoucher(workerMonthlyActualVouchers, bankTransactions, {
      voucherId: activeVoucher.id,
      entryId: entry.id,
    });
    persistMonthlyLinkUpdates(result.vouchers, result.bankTransactions, true);

    if (
      setWorkerPayoutVouchers &&
      result.removed?.kind === "manual" &&
      activeVoucher &&
      !result.removed.workerPayoutVoucherId
    ) {
      setWorkerPayoutVouchers((prev) => {
        let removed = false;
        return prev.filter((row) => {
          if (removed) return true;
          if (!matchesWorkerPayoutVoucherForManualEntry(row, activeVoucher.worker, result.removed!)) {
            return true;
          }
          removed = true;
          return false;
        });
      });
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
      ((activeVoucher.entries.some((row) => row.kind === "bank") &&
        isManualNetOnlyPayoutMethod(entry.method)) ||
        (!isManualNetOnlyPayoutMethod(entry.method) &&
          inferPayWithVatFromAmount(entry.amount, expectedAmount)))
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
    next = addEntryToWorkerMonthlyVoucher(next, activeVoucher.id, entry);

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

  const activeVoucherSettlement = useMemo(() => {
    if (!activeVoucher || !activeObligation) return null;
    return computeWorkerMonthlyVoucherSettlement({
      ...activeVoucher,
      expectedAmount: activeObligation.expectedAmount,
      expectedFinalAmount: activeObligation.expectedFinalAmount,
      payWithVat: activeObligation.payWithVat,
    });
  }, [activeObligation, activeVoucher]);

  const activeExpectedNetPay = activeObligation?.expectedAmount || activeVoucher?.expectedAmount || 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="erp-text-caption font-bold text-slate-500">{"\uAD6C\uBD84"}</span>
        <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
          {CATEGORY_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`erp-text-body rounded-xl px-4 py-2 font-bold ${
                categoryFilter === option.value
                  ? option.value === "outsource"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500"
              }`}
              onClick={() => {
                setCategoryFilter(option.value);
                setSelectedWorker("");
                setWorkerDetailModalWorker(null);
              }}
            >
              {option.label}
              {option.value === "team" ? ` (${teamCount})` : ` (${outsourceCount})`}
            </button>
          ))}
        </div>
      </div>

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
            <div className="erp-statement-folder-column erp-worker-payout-folder-column">
              <div className="erp-statement-folder-column-head">
                <span className="erp-statement-folder-column-title">
                  {activeCategory}
                  {" "}
                  {activeCategoryCount}
                  {"\uBA85"}
                </span>
              </div>
              <div className="erp-statement-folder-toolbar">
                <input
                  lang="ko"
                  className="erp-statement-folder-search erp-input"
                  value={folderQuery}
                  onChange={(e) => setFolderQuery(e.target.value)}
                  placeholder={"\uC2DC\uACF5\uC790 \uAC80\uC0C9"}
                />
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
                    {unpaidOnly
                      ? "\uBBF8\uC9C0\uAE09 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
                      : "\uC870\uAC74\uC5D0 \uD574\uB2F9\uD558\uB294 \uC2DC\uACF5\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
                  </p>
                ) : (
                  <div className="erp-statement-folder-list">
                    {renderWorkerFolderList(
                      summaryFolderGroups,
                      workerDetailModalWorker ?? undefined,
                      openWorkerDetailModal,
                      { showGroupHead: false },
                    )}
                  </div>
                )}
                <p className="erp-text-caption mt-3 px-1 text-slate-500">
                  {"\uC2DC\uACF5\uC790\uB97C \uD074\uB9AD\uD558\uBA74 \uC0C1\uC138 \uCC3D\uC774 \uC5F4\uB9BD\uB2C8\uB2E4. \uD1B5\uC7A5 \uBE44\uACE0\uB294 \uAC01 \uD589 \uBE44\uACE0 \uB780\uC5D0 \uC785\uB825 \uD6C4 \uB2E4\uB978 \uCE78\uC744 \uD074\uB9AD\uD558\uBA74 \uC790\uB3D9 \uC800\uC7A5\uB429\uB2C8\uB2E4."}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {workerDetailModalWorker ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeWorkerDetailModal();
          }}
        >
          <div
            className="erp-ledger-modal erp-ledger-modal--worker-monthly"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`\uC6D4 \uC2E4\uC9C0\uAE09 \u00B7 ${workerDetailModalWorker}`}
          >
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {modalWorkerSummary ? (
                    <WorkerCategoryBadge category={modalWorkerSummary.category} />
                  ) : null}
                  <h2 className="text-lg font-black text-slate-900">{workerDetailModalWorker}</h2>
                </div>
                {modalWorkerSummary ? (
                  <p className="erp-text-caption mt-1 text-slate-500">
                    {"\uC608\uC815 "}
                    {formatKRW(modalWorkerSummary.expectedTotal)}
                    {" \u00B7 \uC9C0\uAE09 "}
                    {formatKRW(modalWorkerSummary.paidTotal)}
                    {" \u00B7 \uBBF8\uC9C0\uAE09 "}
                    {formatKRW(modalWorkerSummary.balanceTotal)}
                    {modalWorkerSummary.unpaidMonthCount > 0
                      ? ` \u00B7 \uBBF8\uC9C0\uAE09 ${modalWorkerSummary.unpaidMonthCount}\uAC1C\uC6D4`
                      : ""}
                    {" \u00B7 \uD1B5\uC7A5 "}
                    {modalWorkerBankTransactions.length}
                    {"\uAC74 "}
                    {formatKRW(modalWorkerBankTotal)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={closeWorkerDetailModal}
                aria-label={"\uB2EB\uAE30"}
              >
                <X size={18} />
              </button>
            </div>

            <div className="erp-worker-monthly-modal-body">
                    <div className="mb-5">
                      <div className="mb-2 flex items-center gap-2">
                        <Landmark size={16} className="text-amber-700" />
                        <h3 className="erp-text-body font-bold">{"\uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED"}</h3>
                          <span className="erp-text-caption text-slate-500">
                          {"\uC2DC\uACF5\uC790 \uC9C0\uCD9C \uD3F4\uB354 \u00B7 "}
                          {modalWorkerBankTransactions.length}
                          {"\uAC74"}
                        </span>
                      </div>
                      <p className="erp-text-caption mb-2 text-slate-500">
                        {"\uBE44\uACE0 \uB780\uC5D0 \uC785\uB825 \uD6C4 \uB2E4\uB978 \uCE78\uC744 \uD074\uB9AD\uD558\uBA74 \uC790\uB3D9 \uC800\uC7A5\uB429\uB2C8\uB2E4. \uD589 \uC911 \uAC70\uB798 \uC601\uC5ED \uC744\uB9AD \uC2DC \uC6D4 \uC2E4\uC9C0\uAE09 \uC5F0\uACB0 \uBAA8\uB2EC\uC774 \uC5F4\uB9BD\uB2C8\uB2E4."}
                      </p>
                      <div className="erp-table-wrap erp-table-wrap--flat">
                        <table className="erp-table erp-table--lg">
                          <thead className="bg-slate-100 text-slate-600">
                            <tr>
                              <th className="text-left">{"\uC77C\uC790"}</th>
                              <th className="text-right">{"\uCD9C\uAE08"}</th>
                              <th className="text-left">{"\uC0C1\uB300\uBC29"}</th>
                              <th className="text-left">{"\uB0B4\uC6A9"}</th>
                              <th className="text-left">{"\uBE44\uACE0"}</th>
                              <th className="text-center">{"\uC6D4 \uC2E4\uC9C0\uAE09"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modalWorkerBankTransactions.map((tx) => {
                              const amount =
                                Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
                              const description = [tx.description, tx.transactionType].filter(Boolean).join(" \u00B7 ");
                              const linkedVoucher = resolveBankTxVoucherLink(tx, workerDetailModalWorker);
                              const canLink = Boolean(setBankTransactions && setWorkerMonthlyActualVouchers && !linkedVoucher);
                              return (
                                <tr
                                  key={tx.id}
                                  className={`border-t hover:bg-slate-50 ${canLink ? "cursor-pointer" : ""}`}
                                  onClick={() => {
                                    if (canLink) openBankLinkModal(tx);
                                  }}
                                >
                                  <td className="whitespace-nowrap text-slate-600">
                                    {formatBankTransactionDateTime(tx.transactionAt)}
                                  </td>
                                  <td className="text-right font-bold text-red-600">{formatKRW(amount)}</td>
                                  <td className="text-slate-600">{tx.counterpartyName || "-"}</td>
                                  <td className="text-slate-600">{description || "-"}</td>
                                  <td className="min-w-[8rem]">
                                    {setBankTransactions ? (
                                      <input
                                        type="text"
                                        lang="ko"
                                        data-bank-memo-input={tx.id}
                                        className="erp-input erp-input-compact w-full min-w-[7rem]"
                                        value={draftBankMemos[tx.id] ?? tx.memo ?? ""}
                                        disabled={bankMemoSavingId === tx.id}
                                        onChange={(event) => {
                                          event.stopPropagation();
                                          syncDraftBankMemo(tx.id, event.target.value);
                                        }}
                                        onCompositionStart={(event) => {
                                          event.stopPropagation();
                                          bankMemoComposingRef.current = true;
                                        }}
                                        onCompositionEnd={(event) => {
                                          event.stopPropagation();
                                          bankMemoComposingRef.current = false;
                                          syncDraftBankMemo(tx.id, event.currentTarget.value);
                                        }}
                                        onBlur={(event) => {
                                          event.stopPropagation();
                                          if (bankMemoComposingRef.current) return;
                                          syncDraftBankMemo(tx.id, event.currentTarget.value);
                                          void saveBankMemoDirect(tx.id, event.currentTarget.value);
                                        }}
                                        onKeyDown={(event) => {
                                          event.stopPropagation();
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            event.currentTarget.blur();
                                          }
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                        placeholder={"\uBE44\uACE0 \uC785\uB825"}
                                      />
                                    ) : (
                                      <span className="text-slate-600">{tx.memo || "-"}</span>
                                    )}
                                  </td>
                                  <td className="text-center">
                                    {linkedVoucher ? (
                                      <button
                                        type="button"
                                        className="erp-worker-payout-kind-badge is-bank"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setActiveVoucherId(linkedVoucher.id);
                                        }}
                                      >
                                        <Link2 size={12} />
                                        {formatMonthLabel(linkedVoucher.monthKey)}
                                      </button>
                                    ) : canLink ? (
                                      <span className="erp-text-caption font-semibold text-blue-700">
                                        {"\uC5F0\uACB0"}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {modalWorkerBankTransactions.length === 0 && (
                              <tr>
                                <td colSpan={6} className="p-6 text-center text-slate-500">
                                  {"\uC774 \uC2DC\uACF5\uC790 \uD3F4\uB354\uC758 \uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mb-5">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-amber-700" />
                          <h3 className="erp-text-body font-bold">{"\uD604\uAE08 \uC804\uD45C"}</h3>
                          <span className="erp-text-caption text-slate-500">
                            {modalWorkerCashVouchers.length}
                            {"\uAC74 \u00B7 "}
                            {formatKRW(modalWorkerCashTotal)}
                          </span>
                        </div>
                        {setWorkerPayoutVouchers ? (
                          <Button type="button" size="sm" className="rounded-xl" onClick={openCashVoucherModal}>
                            <Plus size={14} className="mr-1" />
                            {"\uD604\uAE08 \uC804\uD45C \uCD94\uAC00"}
                          </Button>
                        ) : null}
                      </div>
                      <p className="erp-text-caption mb-2 text-slate-500">
                        {"\uD604\uAE08 \uC804\uD45C\uB97C \uD074\uB9AD\uD558\uBA74 \uC6D4 \uC2E4\uC9C0\uAE09 \uC804\uD45C\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}
                      </p>
                      <div className="erp-table-wrap erp-table-wrap--flat">
                        <table className="erp-table erp-table--lg">
                          <thead className="bg-slate-100 text-slate-600">
                            <tr>
                              <th className="text-left">{"\uC77C\uC790"}</th>
                              <th className="text-right">{"\uAE08\uC561"}</th>
                              <th className="text-left">{"\uBE44\uACE0"}</th>
                              <th className="text-center">{"\uC6D4 \uC2E4\uC9C0\uAE09"}</th>
                              <th className="text-center">{"\uC0AD\uC81C"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modalWorkerCashVouchers.map((voucher) => {
                              const linkedVoucher = resolveCashVoucherLink(voucher, workerDetailModalWorker);
                              const canLink = Boolean(setWorkerMonthlyActualVouchers && !linkedVoucher);
                              return (
                                <tr
                                  key={voucher.id}
                                  className={`border-t hover:bg-slate-50 ${canLink ? "cursor-pointer" : ""}`}
                                  onClick={() => {
                                    if (canLink) openCashLinkModal(voucher);
                                  }}
                                >
                                  <td className="whitespace-nowrap text-slate-600">{voucher.date}</td>
                                  <td className="text-right font-bold text-amber-800">{formatKRW(voucher.amount)}</td>
                                  <td className="text-slate-600">{voucher.memo || "-"}</td>
                                  <td className="text-center">
                                    {linkedVoucher ? (
                                      <button
                                        type="button"
                                        className="erp-worker-payout-kind-badge is-voucher"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setActiveVoucherId(linkedVoucher.id);
                                        }}
                                      >
                                        <Link2 size={12} />
                                        {formatMonthLabel(linkedVoucher.monthKey)}
                                      </button>
                                    ) : canLink ? (
                                      <span className="erp-text-caption font-semibold text-blue-700">
                                        {"\uC5F0\uACB0"}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="text-center">
                                    {setWorkerPayoutVouchers && !linkedVoucher ? (
                                      <button
                                        type="button"
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          removeCashVoucher(voucher);
                                        }}
                                        aria-label={"\uC804\uD45C \uC0AD\uC81C"}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {modalWorkerCashVouchers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-slate-500">
                                  {"\uD604\uAE08 \uC804\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h3 className="erp-text-body mb-2 font-bold">{"\uC6D4 \uC2E4\uC9C0\uAE09"}</h3>
                      <div className="erp-table-wrap erp-table-wrap--flat">
                    <table className="erp-table erp-table--lg">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="text-left">{"\uC6D4"}</th>
                          {modalShowProbationBillMargin ? (
                            <>
                              <th className="text-right">{"\uCCAD\uAD6C\uAE08\uC561"}</th>
                              <th className="text-right">{"\uB9C8\uC9C4"}</th>
                            </>
                          ) : null}
                          <th className="text-right">{"\uC2E4\uC9C0\uAE09"}</th>
                          <th className="text-right">{"\uBD80\uAC00\uC138"}</th>
                          <th className="text-right">{"\uCD1D \uD569\uACC4"}</th>
                          <th className="text-right">{"\uC9C0\uAE09\uC561"}</th>
                          <th className="text-right">{"\uBBF8\uC9C0\uAE09"}</th>
                          <th className="text-center">{"\uC0C1\uD0DC"}</th>
                          <th className="text-right">{"\uC804\uD45C"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(modalWorkerSummary?.obligations || []).map((row) => {
                          const voucher = row.voucher;
                          const status = computeVoucherStatus(
                            voucher
                              ? {
                                  ...voucher,
                                  expectedAmount: row.expectedAmount,
                                  expectedFinalAmount: row.expectedFinalAmount,
                                  payWithVat: row.payWithVat,
                                }
                              : {
                                  paidAmount: row.paid,
                                  expectedAmount: row.expectedAmount,
                                  expectedFinalAmount: row.expectedFinalAmount,
                                  payWithVat: row.payWithVat,
                                  entries: [],
                                  allocations: [],
                                  monthKey: row.monthKey,
                                },
                          );
                          const amounts = summarizeWorkerMonthlyObligationAmounts(row, row.voucher);
                          return (
                            <tr key={row.key} className="border-t hover:bg-slate-50">
                              <td className="font-semibold">
                                <div>{formatMonthLabel(row.monthKey, row.periodLabel)}</div>
                                {row.isProbation ? (
                                  <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                    수습
                                  </span>
                                ) : null}
                                {row.isHistorical ? (
                                  <span className="mt-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                    E등급 이력
                                  </span>
                                ) : null}
                              </td>
                              {modalShowProbationBillMargin ? (
                                <>
                                  <td className="text-right text-slate-700">
                                    {row.isProbation ? formatKRW(row.periodBill || 0) : "-"}
                                  </td>
                                  <td className="text-right text-slate-700">
                                    {row.isProbation ? formatKRW(row.periodMargin || 0) : "-"}
                                  </td>
                                </>
                              ) : null}
                              <td className="text-right">{formatKRW(amounts.netPay)}</td>
                              <td className="text-right text-slate-600">
                                {amounts.vatAmount > 0 ? formatKRW(amounts.vatAmount) : "-"}
                              </td>
                              <td className="text-right font-bold">{formatKRW(amounts.totalAmount)}</td>
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
                        {(modalWorkerSummary?.obligations.length || 0) === 0 && (
                          <tr>
                            <td colSpan={modalShowProbationBillMargin ? 10 : 8} className="p-8 text-center text-slate-500">
                              {"\uC774 \uC2DC\uACF5\uC790\uC758 \uC6D4 \uC2E4\uC9C0\uAE09 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {modalObligationTotals && (modalWorkerSummary?.obligations.length || 0) > 0 ? (
                        <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                          <tr>
                            <td className="text-left">{"\uD569\uACC4"}</td>
                            {modalShowProbationBillMargin ? (
                              <>
                                <td className="text-right text-slate-700">{formatKRW(modalObligationTotals.periodBill)}</td>
                                <td className="text-right text-slate-700">{formatKRW(modalObligationTotals.periodMargin)}</td>
                              </>
                            ) : null}
                            <td className="text-right">{formatKRW(modalObligationTotals.netPay)}</td>
                            <td className="text-right text-slate-600">
                              {modalObligationTotals.vatAmount > 0 ? formatKRW(modalObligationTotals.vatAmount) : "-"}
                            </td>
                            <td className="text-right">{formatKRW(modalObligationTotals.totalAmount)}</td>
                            <td className="text-right text-emerald-700">{formatKRW(modalObligationTotals.paid)}</td>
                            <td className="text-right text-red-600">{formatKRW(modalObligationTotals.balance)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                    </div>
            </div>

            <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4 pb-[env(safe-area-inset-bottom)]">
              {isWorkerDetailDirty ? (
                <span className="erp-text-caption mr-auto font-semibold text-amber-700">
                  {"\uC800\uC7A5\uD558\uC9C0 \uC54A\uC740 \uBCC0\uACBD \uC788\uC74C"}
                </span>
              ) : null}
              <Button type="button" variant="outline" className="rounded-xl" onClick={closeWorkerDetailModal}>
                {"\uB2EB\uAE30"}
              </Button>
              {onPersistBankTransactionMemoUpdates ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={workerDetailSaving || Boolean(bankMemoSavingId)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void saveWorkerDetailModal()}
                >
                  {workerDetailSaving ? "\uC800\uC7A5 \uC911..." : "\uC800\uC7A5"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
                  {formatKRW(activeVoucherSettlement?.paidTotal ?? sumVoucherPaidAmount(activeVoucher))}
                  {" \u00B7 \uBBF8\uC9C0\uAE09 "}
                  {formatKRW(activeVoucherSettlement?.balance ?? Math.max(activeVoucher.expectedFinalAmount - sumVoucherPaidAmount(activeVoucher), 0))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                  onClick={cancelActiveVoucher}
                >
                  <Trash2 size={14} className="mr-1" />
                  {"\uC804\uD45C \uCDE8\uC18C"}
                </Button>
                <button
                  type="button"
                  className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                  onClick={closeVoucherModal}
                  aria-label={"\uB2EB\uAE30"}
                >
                  <X size={18} />
                </button>
              </div>
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
                    <th className="text-center w-16">{"\uC0AD\uC81C"}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVoucher.entries.map((entry) => {
                    const deleteButton = setWorkerMonthlyActualVouchers ? (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                        aria-label={"\uD56D\uBAA9 \uC0AD\uC81C"}
                        onClick={() => removeVoucherEntry(entry)}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <span className="text-slate-300">-</span>
                    );
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
                            {formatEntryAmount(entry, activeExpectedNetPay)}
                          </td>
                          <td className="text-slate-600">{memo || "-"}</td>
                          <td className="text-center">{deleteButton}</td>
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
                          {formatEntryAmount(entry, activeExpectedNetPay)}
                        </td>
                        <td>{entry.memo || "-"}</td>
                        <td className="text-center">{deleteButton}</td>
                      </tr>
                    );
                  })}
                  {activeVoucher.entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        {"\uC9C0\uAE09 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

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
          </div>
        </div>
      ) : null}

      {bankLinkTx && activeSummary ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBankLinkModal();
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={"\uD1B5\uC7A5 \uC6D4 \uC2E4\uC9C0\uAE09 \uC5F0\uACB0"}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
                  <Landmark size={14} />
                  {"\uD1B5\uC7A5 \u2192 \uC6D4 \uC2E4\uC9C0\uAE09"}
                </div>
                <p className="erp-text-caption text-slate-500">
                  {formatBankTransactionDateTime(bankLinkTx.transactionAt)}
                  {" \u00B7 "}
                  {formatKRW(resolveWorkerBankPaymentAmount(bankLinkTx))}
                  {" \u00B7 "}
                  {activeSummary.worker}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={closeBankLinkModal}
                aria-label={"\uB2EB\uAE30"}
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-3 text-sm text-slate-600">
              {"\uC5F0\uACB0\uD560 \uC6D4\uC744 \uC120\uD0DD\uD558\uC138\uC694. \uAE08\uC561\uC774 \uC2E4\uC9C0\uAE09+\uBD80\uAC00\uC138\uC640 \uBE44\uC2B7\uD558\uBA74 \uC704\uC5D0 \uC6B0\uC120 \uD45C\uC2DC\uB429\uB2C8\uB2E4."}
            </p>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {bankLinkMonthOptions.map(({ obligation, candidate }) => (
                <div
                  key={obligation.key}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 ${
                    candidate ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-900">{formatMonthLabel(obligation.monthKey, obligation.periodLabel)}</div>
                    <div className="erp-text-caption text-slate-500">
                      {"\uC608\uC815 "}
                      {formatExpectedAmount(obligation)}
                      {" \u00B7 \uBBF8\uC9C0\uAE09 "}
                      {formatKRW(obligation.balance)}
                    </div>
                    {candidate ? (
                      <div className="erp-text-caption mt-1 font-semibold text-blue-800">
                        {candidate.reasons.join(" \u00B7 ")}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => linkBankTxToObligation(obligation)}
                  >
                    <Link2 size={14} className="mr-1" />
                    {"\uC5F0\uACB0"}
                  </Button>
                </div>
              ))}
              {!bankLinkMonthOptions.length ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  {"\uC5F0\uACB0\uD560 \uC6D4 \uC2E4\uC9C0\uAE09 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {cashLinkVoucher && activeSummary ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCashLinkModal();
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={"\uD604\uAE08 \uC804\uD45C \uC6D4 \uC2E4\uC9C0\uAE09 \uC5F0\uACB0"}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
                  <FileText size={14} />
                  {"\uD604\uAE08 \uC804\uD45C \u2192 \uC6D4 \uC2E4\uC9C0\uAE09"}
                </div>
                <p className="erp-text-caption text-slate-500">
                  {cashLinkVoucher.date}
                  {" \u00B7 "}
                  {formatKRW(cashLinkVoucher.amount)}
                  {" \u00B7 "}
                  {activeSummary.worker}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={closeCashLinkModal}
                aria-label={"\uB2EB\uAE30"}
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-3 text-sm text-slate-600">
              {"\uC5F0\uACB0\uD560 \uC6D4\uC744 \uC120\uD0DD\uD558\uC138\uC694."}
            </p>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {obligationLinkMonthOptions.map((obligation) => (
                <div
                  key={obligation.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {formatMonthLabel(obligation.monthKey, obligation.periodLabel)}
                    </div>
                    <div className="erp-text-caption text-slate-500">
                      {"\uC608\uC815 "}
                      {formatExpectedAmount(obligation)}
                      {" \u00B7 \uBBF8\uC9C0\uAE09 "}
                      {formatKRW(obligation.balance)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => linkCashVoucherToObligation(obligation)}
                  >
                    <Link2 size={14} className="mr-1" />
                    {"\uC5F0\uACB0"}
                  </Button>
                </div>
              ))}
              {!obligationLinkMonthOptions.length ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  {"\uC5F0\uACB0\uD560 \uC6D4 \uC2E4\uC9C0\uAE09 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {cashVoucherModalOpen && activeSummary ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCashVoucherModal();
          }}
        >
          <div
            className="erp-ledger-modal max-w-md"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={"\uD604\uAE08 \uC804\uD45C \uCD94\uAC00"}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 md:text-lg">{"\uD604\uAE08 \uC804\uD45C \uCD94\uAC00"}</h2>
                <p className="erp-text-caption mt-1 text-slate-500">{activeSummary.worker}</p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={closeCashVoucherModal}
                aria-label={"\uB2EB\uAE30"}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3">
              <Field label={"\uC9C0\uAE09\uC77C"}>
                <KoreanDateInput
                  value={cashVoucherForm.date}
                  onChange={(e) => setCashVoucherForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </Field>
              <Field label={"\uC9C0\uAE09\uC561"}>
                <input
                  lang="ko"
                  className="erp-input w-full rounded-xl"
                  inputMode="numeric"
                  value={formatMoneyInput(cashVoucherForm.amount)}
                  onChange={(e) =>
                    setCashVoucherForm((prev) => ({ ...prev, amount: sanitizeMoneyInput(e.target.value) }))
                  }
                  placeholder="0"
                />
              </Field>
              <Field label={"\uBE44\uACE0"}>
                <input
                  lang="ko"
                  className="erp-input w-full rounded-xl"
                  value={cashVoucherForm.memo}
                  onChange={(e) => setCashVoucherForm((prev) => ({ ...prev, memo: e.target.value }))}
                />
              </Field>
              {cashVoucherError ? <p className="text-sm font-semibold text-red-600">{cashVoucherError}</p> : null}
              <Button type="button" className="rounded-2xl" onClick={saveCashVoucher}>
                <Plus size={14} className="mr-1" />
                {"\uC804\uD45C \uC0DD\uC131 \uD6C4 \uC5F0\uACB0"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {bankLinkError ? (
        <p className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-lg">
          {bankLinkError}
          <button type="button" className="ml-3 underline" onClick={() => setBankLinkError("")}>
            {"\uB2EB\uAE30"}
          </button>
        </p>
      ) : null}
    </>
  );
}
