import React, { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { BankTransaction } from "@/utils/bankTransactions";
import { formatKRW } from "@/utils/companyLedger";
import { formatBankTransactionDateTime } from "@/utils/bankTransactions";
import {
  buildBankDepositManualLinkCandidates,
  buildDepositLinkAllocations,
  collectLinkedSalesIdsForBankTx,
  resolveBankDepositLinkRemaining,
  sumLinkedDepositAmountForBankTx,
  type BankDepositMatchCandidate,
} from "@/utils/bankReceivableMatch";
import type { SentStatementMatchCandidate } from "@/utils/bankSentStatementMatch";
import {
  buildWorkerBankLinkCandidateForObligation,
  buildWorkerBankLinkMonthOptions,
  resolveWorkerBankPaymentAmount,
  type WorkerBankMatchCandidate,
} from "@/utils/bankWorkerMonthlyMatch";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { PdfArchiveMeta } from "@/utils/pdfArchive";
import { getStatus, type ReceivableRow } from "@/utils/receivables";
import {
  computeVoucherStatus,
  resolveBankWorkerLinkRemaining,
  resolveWorkerLinkSelectionAmount,
  summarizeWorkerMonthlyObligationAmounts,
  WORKER_MONTHLY_VOUCHER_STATUS_LABELS,
  type WorkerMonthlyActualVoucher,
  type WorkerMonthlyObligation,
} from "@/utils/workerMonthlyActualPayments";
import { formatMonthLabel } from "@/utils/workerMonthlyPayments";

const MIDDOT = "\u00B7";
const L = {
  linkVoucher: "\uC804\uD45C \uC5F0\uACB0",
  matchScore: "\uC810\uC218",
  linkedSection: "\uC5F0\uACB0\uB41C \uC804\uD45C",
  candidateSection: "\uC5F0\uACB0 \uAC00\uB2A5\uD55C \uC804\uD45C",
  voucherCol: "\uC804\uD45C",
  linkedStatus: "\uC804\uD45C \uC5F0\uACB0\uB428",
  client: "\uAC70\uB798\uCC98",
  worker: "\uC2DC\uACF5\uC790",
  detail: "\uB0B4\uC6A9",
  amount: "\uAE08\uC561",
  paidTotal: "\uC2E4\uC9C0\uAE09",
  expectedTotal: "\uC608\uC815",
  sentVoucher: "\uBCF4\uB0B8\uB0B4\uC5ED\uC11C \uC804\uD45C",
  salesVoucher: (no: string | number) => `\uB9E4\uCD9C\uC804\uD45C ${no}`,
  paymentVoucher: (id: string | number) => `\uC785\uAE08\uC804\uD45C #${id}`,
  workerVoucher: (monthKey: string) => `${formatMonthLabel(monthKey)} \uC2E4\uC9C0\uAE09 \uC804\uD45C`,
  receivableDate: "\uBBF8\uC218\uC77C\uC790",
  voucherNo: "\uC804\uD45C\uBC88\uD638",
  salesAmount: "\uCD1D\uB9E4\uCD9C",
  paidAmount: "\uC785\uAE08\uC561",
  unpaidAmount: "\uBBF8\uC218\uAE08",
  status: "\uC0C1\uD0DC",
  month: "\uC6D4",
  netPay: "\uC2E4\uC9C0\uAE09",
  vat: "\uBD80\uAC00\uC138",
  total: "\uCD1D \uD569\uACC4",
  paid: "\uC9C0\uAE09\uC561",
  unpaid: "\uBBF8\uC9C0\uAE09",
  unlink: "\uC5F0\uACB0 \uD574\uC81C",
  select: "\uC120\uD0DD",
  selectedAmount: "\uC785\uAE08 \uBC30\uC815",
  unpaidAfterAmount: "\uBC30\uC815 \uD6C4 \uBBF8\uC218",
  connectSelected: (count: number) => `\uC120\uD0DD ${count}\uAC74 \uC804\uD45C \uC5F0\uACB0`,
  totalAmount: "\uD1B5\uC7A5 \uAE08\uC561",
  linkedAmount: "\uC5F0\uACB0\uAE08",
  remainingAmount: "\uC794\uC5EC",
  allocatableAmount: "\uBC30\uC815 \uAC00\uB2A5",
};

const RECEIVABLE_STATUS_CLASS: Record<string, string> = {
  "\uC644\uB8CC": "bg-emerald-50 text-emerald-700",
  "\uC77C\uBD80\uC218\uAE08": "bg-amber-50 text-amber-700",
  "\uBBF8\uC218": "bg-red-50 text-red-700",
};

const WORKER_STATUS_CLASS: Record<string, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  partial: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  overpaid: "bg-sky-100 text-sky-900",
};

type ErpLinkedPaymentVoucher = {
  id?: number | string;
  salesId?: number | string;
  bankTransactionId?: string | number;
  client?: string;
  site?: string;
  date?: string;
  amount?: number;
  finalAmount?: number;
  memo?: string;
  linkedPdfArchiveId?: string;
  isPartialPayment?: boolean;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
};

type LinkedDepositVoucherRow = {
  id: string;
  voucherLabel: string;
  client: string;
  detail: string;
  amount: number;
  date: string;
  unlinkable: boolean;
};

type LinkedWorkerVoucherRow = {
  id: string;
  voucherId: string;
  entryId: string;
  voucherLabel: string;
  worker: string;
  entryAmount: number;
  paidAmount: number;
  expectedFinalAmount: number;
};

function resolveSalesVoucherNo(
  salesId: number | string | undefined,
  receivableRows: ReceivableRow[],
) {
  if (salesId == null || salesId === "") return "";
  const row = receivableRows.find((item) => String(item.id) === String(salesId));
  return String(row?.voucherNo || salesId);
}

function buildPaymentVoucherLabel(
  voucher: ErpLinkedPaymentVoucher,
  receivableRows: ReceivableRow[],
) {
  if (voucher.linkedPdfArchiveId) return L.sentVoucher;
  const voucherNo = resolveSalesVoucherNo(voucher.salesId, receivableRows);
  if (voucherNo) return L.salesVoucher(voucherNo);
  if (voucher.id != null && voucher.id !== "") return L.paymentVoucher(voucher.id);
  return "\uC785\uAE08 \uC804\uD45C";
}

function listLinkedDepositVouchers(
  tx: BankTransaction,
  paymentVouchers: ErpLinkedPaymentVoucher[],
  sentArchives: PdfArchiveMeta[],
  receivableRows: ReceivableRow[],
): LinkedDepositVoucherRow[] {
  const rows: LinkedDepositVoucherRow[] = [];
  const seen = new Set<string>();

  for (const voucher of paymentVouchers) {
    const voucherId = String(voucher.id ?? "").trim();
    if (!voucherId) continue;
    const linkedToTx =
      String(voucher.bankTransactionId || "") === String(tx.id) ||
      voucherId === String(tx.linkedPaymentVoucherId || "");
    if (!linkedToTx || seen.has(voucherId)) continue;
    seen.add(voucherId);

    const isSent = Boolean(voucher.linkedPdfArchiveId || tx.linkedPdfArchiveId);
    const period =
      voucher.statementPeriodStart && voucher.statementPeriodEnd
        ? `${String(voucher.statementPeriodStart).slice(0, 10)} ~ ${String(voucher.statementPeriodEnd).slice(0, 10)}`
        : "";
    rows.push({
      id: voucherId,
      voucherLabel: buildPaymentVoucherLabel(voucher, receivableRows),
      client: String(voucher.client || "-").trim() || "-",
      detail: isSent
        ? [period, voucher.isPartialPayment ? "\uBD80\uBD84 \uC785\uAE08" : ""].filter(Boolean).join(` ${MIDDOT} `)
        : [String(voucher.site || "").trim(), String(voucher.memo || "").trim()].filter(Boolean).join(` ${MIDDOT} `) ||
          "-",
      amount: Math.round(Number(voucher.finalAmount ?? voucher.amount ?? 0)),
      date: String(voucher.date || tx.transactionAt || "").slice(0, 10),
      unlinkable: true,
    });
  }

  if (tx.linkedPdfArchiveId && !rows.some((row) => row.voucherLabel === L.sentVoucher)) {
    const archive = sentArchives.find((row) => row.id === tx.linkedPdfArchiveId);
    if (archive) {
      rows.unshift({
        id: `archive:${archive.id}`,
        voucherLabel: L.sentVoucher,
        client: String(archive.subjectName || "-").trim() || "-",
        detail:
          archive.periodStart && archive.periodEnd
            ? `${String(archive.periodStart).slice(0, 10)} ~ ${String(archive.periodEnd).slice(0, 10)}`
            : String(archive.createdAt || "").slice(0, 10),
        amount: Math.round(Number(archive.statementTotalAmount || tx.deposit || 0)),
        date: String(archive.createdAt || tx.transactionAt || "").slice(0, 10),
        unlinkable: false,
      });
    }
  }

  return rows;
}

function listLinkedWorkerVouchers(
  tx: BankTransaction,
  vouchers: WorkerMonthlyActualVoucher[],
): LinkedWorkerVoucherRow[] {
  const rows: LinkedWorkerVoucherRow[] = [];
  const seen = new Set<string>();

  for (const voucher of vouchers) {
    for (const entry of voucher.entries) {
      if (entry.kind !== "bank" || entry.bankTransactionId !== tx.id) continue;
      const key = `${voucher.id}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: key,
        voucherId: voucher.id,
        entryId: entry.id,
        voucherLabel: L.workerVoucher(voucher.monthKey),
        worker: voucher.worker,
        entryAmount: Math.round(Number(entry.amount || 0)),
        paidAmount: Math.round(Number(voucher.paidAmount || 0)),
        expectedFinalAmount: Math.round(Number(voucher.expectedFinalAmount || 0)),
      });
    }
  }

  const linkedId = String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim();
  if (!rows.length && linkedId) {
    const voucher = vouchers.find((row) => row.id === linkedId);
    if (voucher) {
      rows.push({
        id: voucher.id,
        voucherId: voucher.id,
        entryId: "",
        voucherLabel: L.workerVoucher(voucher.monthKey),
        worker: voucher.worker,
        entryAmount: Math.round(Number(tx.withdrawal || 0)),
        paidAmount: Math.round(Number(voucher.paidAmount || 0)),
        expectedFinalAmount: Math.round(Number(voucher.expectedFinalAmount || 0)),
      });
    }
  }

  return rows;
}

function AmountSummaryBar({
  total,
  linked,
  selected,
  remainingBeforeSelect,
  remainingAfterSelect,
  tone,
}: {
  total: number;
  linked: number;
  selected: number;
  remainingBeforeSelect: number;
  remainingAfterSelect: number;
  tone: "deposit" | "worker";
}) {
  const toneClass = tone === "deposit" ? "text-emerald-700" : "text-orange-800";
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:grid-cols-5">
      <div>
        <div className="text-xs text-slate-500">{L.totalAmount}</div>
        <div className={`font-bold tabular-nums ${toneClass}`}>{formatKRW(total)}</div>
      </div>
      <div>
        <div className="text-xs text-slate-500">{L.linkedAmount}</div>
        <div className="font-semibold tabular-nums text-slate-900">{formatKRW(linked)}</div>
      </div>
      <div>
        <div className="text-xs text-slate-500">{L.allocatableAmount}</div>
        <div className="font-semibold tabular-nums text-blue-700">{formatKRW(remainingBeforeSelect)}</div>
      </div>
      <div>
        <div className="text-xs text-slate-500">{L.select}</div>
        <div className="font-semibold tabular-nums text-violet-700">{formatKRW(selected)}</div>
      </div>
      <div>
        <div className="text-xs text-slate-500">{L.remainingAmount}</div>
        <div className={`font-bold tabular-nums ${remainingAfterSelect > 0 ? toneClass : "text-slate-500"}`}>
          {formatKRW(remainingAfterSelect)}
        </div>
      </div>
    </div>
  );
}

function LinkedDepositVouchersSection({
  rows,
  onUnlink,
}: {
  rows: LinkedDepositVoucherRow[];
  onUnlink?: (paymentVoucherId: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h3 className="erp-bank-link-panel__section-title">{L.linkedSection}</h3>
      <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-emerald-200 bg-emerald-50/20">
        <table className="erp-table erp-tax-invoice-link-panel__table w-full">
          <thead>
            <tr>
              <th>{L.voucherCol}</th>
              <th>{L.client}</th>
              <th>{L.detail}</th>
              <th className="text-right">{L.amount}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="erp-tax-invoice-link-panel__row is-linked bg-emerald-50/70">
                <td className="font-semibold text-emerald-800">{row.voucherLabel}</td>
                <td className="font-semibold text-slate-900">{row.client}</td>
                <td className="text-slate-600">
                  {row.detail}
                  {row.date ? (
                    <div className="mt-0.5 text-xs text-slate-500">{row.date}</div>
                  ) : null}
                </td>
                <td className="text-right font-semibold tabular-nums text-emerald-700">{formatKRW(row.amount)}</td>
                <td className="text-right">
                  {row.unlinkable && onUnlink ? (
                    <button
                      type="button"
                      className="inline-flex rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      onClick={() => onUnlink(row.id)}
                    >
                      {L.unlink}
                    </button>
                  ) : (
                    <span className="inline-flex rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
                      {L.linkedStatus}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LinkedWorkerVouchersSection({
  rows,
  onUnlink,
}: {
  rows: LinkedWorkerVoucherRow[];
  onUnlink?: (voucherId: string, entryId: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h3 className="erp-bank-link-panel__section-title">{L.linkedSection}</h3>
      <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-orange-200 bg-orange-50/20">
        <table className="erp-table erp-tax-invoice-link-panel__table w-full">
          <thead>
            <tr>
              <th>{L.voucherCol}</th>
              <th>{L.worker}</th>
              <th>{L.amount}</th>
              <th className="text-right">{L.paidTotal}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="erp-tax-invoice-link-panel__row is-linked bg-orange-50/70">
                <td className="font-semibold text-orange-900">{row.voucherLabel}</td>
                <td className="font-semibold text-slate-900">{row.worker}</td>
                <td className="font-semibold tabular-nums text-rose-700">{formatKRW(row.entryAmount)}</td>
                <td className="text-right text-slate-600">
                  <div className="font-semibold tabular-nums text-slate-900">{formatKRW(row.paidAmount)}</div>
                  <div className="text-xs text-slate-500">
                    {L.expectedTotal} {formatKRW(row.expectedFinalAmount)}
                  </div>
                </td>
                <td className="text-right">
                  {row.entryId && onUnlink ? (
                    <button
                      type="button"
                      className="inline-flex rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      onClick={() => onUnlink(row.voucherId, row.entryId)}
                    >
                      {L.unlink}
                    </button>
                  ) : (
                    <span className="inline-flex rounded-lg border border-orange-200 bg-white px-2 py-1 text-xs font-semibold text-orange-800">
                      {L.linkedStatus}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type BankErpDepositLinkModalProps = {
  tx: BankTransaction;
  labels: {
    title: string;
    empty: string;
    selectSentStatement: string;
    selectReceivable: string;
    matchScore: string;
    statementTotal: string;
    sentAt: string;
    unpaidAmount: string;
    partialStatementMatchHint: (paymentAmount: number, remainingAmount: number) => string;
  };
  sentArchives: PdfArchiveMeta[];
  receivableRows: ReceivableRow[];
  clients: Array<{ name?: string; depositNameAliases?: string }>;
  paymentVouchers: ErpLinkedPaymentVoucher[];
  bankTransactions: BankTransaction[];
  onClose: () => void;
  onConfirmSentStatement: (candidate: SentStatementMatchCandidate) => void;
  onConfirmReceivableBatch: (
    items: Array<{ candidate: BankDepositMatchCandidate; finalAmount: number; unpaidAfter: number }>,
  ) => void;
  onUnlinkDepositVoucher: (paymentVoucherId: string) => void;
};

function ErpLinkPanelShell({
  title,
  subtitle,
  subtitleClassName,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: React.ReactNode;
  subtitleClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="erp-tax-invoice-link-panel" role="dialog" aria-modal="true" aria-label={title}>
      <div className="erp-tax-invoice-link-panel__head">
        <div>
          <h2 className="erp-text-section font-bold text-slate-900">{title}</h2>
          <p className={`mt-1 text-sm ${subtitleClassName || "text-slate-600"}`}>{subtitle}</p>
        </div>
        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="erp-tax-invoice-link-panel__body erp-bank-erp-link-panel__body">
        <div className="erp-tax-invoice-link-panel__main">{children}</div>
      </div>
      {footer ? <div className="erp-bank-erp-link-panel__footer">{footer}</div> : null}
    </div>
  );
}

export function BankErpDepositLinkModal({
  tx,
  labels,
  sentArchives,
  receivableRows,
  clients,
  paymentVouchers,
  onClose,
  onConfirmReceivableBatch,
  onUnlinkDepositVoucher,
}: BankErpDepositLinkModalProps) {
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<string[]>([]);

  const totalDeposit = Math.round(Number(tx.deposit) || 0);
  const linkedAmount = useMemo(
    () => sumLinkedDepositAmountForBankTx(tx.id, paymentVouchers),
    [tx.id, paymentVouchers],
  );
  const linkedRows = useMemo(
    () => listLinkedDepositVouchers(tx, paymentVouchers, sentArchives, receivableRows),
    [tx, paymentVouchers, sentArchives, receivableRows],
  );
  const remainingBeforeSelect = useMemo(
    () => resolveBankDepositLinkRemaining(tx, paymentVouchers),
    [tx, paymentVouchers],
  );
  const linkedSalesIds = useMemo(
    () => collectLinkedSalesIdsForBankTx(tx.id, paymentVouchers),
    [tx.id, paymentVouchers],
  );
  const receivableCandidates = useMemo(
    () =>
      remainingBeforeSelect <= 0
        ? []
        : buildBankDepositManualLinkCandidates(tx, receivableRows, {
            minScore: 0,
            limit: 100,
            clients,
            depositAmount: remainingBeforeSelect,
            linkedSalesIds,
          }),
    [tx, receivableRows, clients, remainingBeforeSelect, linkedSalesIds],
  );

  const candidateBySalesId = useMemo(
    () => new Map(receivableCandidates.map((row) => [String(row.salesId), row])),
    [receivableCandidates],
  );

  const selectedAllocations = useMemo(() => {
    const items = selectedSalesOrder
      .map((salesId) => candidateBySalesId.get(salesId))
      .filter((row): row is BankDepositMatchCandidate => Boolean(row))
      .map((row) => ({ salesId: row.salesId, unpaid: row.unpaid }));

    const allocationRows = buildDepositLinkAllocations(remainingBeforeSelect, items);
    return allocationRows
      .map((row) => {
        const candidate = candidateBySalesId.get(String(row.salesId));
        if (!candidate) return null;
        return { candidate, finalAmount: row.finalAmount, unpaidAfter: row.unpaidAfter };
      })
      .filter((row): row is { candidate: BankDepositMatchCandidate; finalAmount: number; unpaidAfter: number } =>
        Boolean(row),
      );
  }, [candidateBySalesId, remainingBeforeSelect, selectedSalesOrder]);

  const selectedSalesIds = useMemo(() => new Set(selectedSalesOrder), [selectedSalesOrder]);

  const selectedTotal = selectedAllocations.reduce((sum, row) => sum + row.finalAmount, 0);
  const remainingAfterSelect = Math.max(0, remainingBeforeSelect - selectedTotal);
  const totalCount = receivableCandidates.length;

  const toggleCandidate = useCallback(
    (salesId: string | number) => {
      const key = String(salesId);
      setSelectedSalesOrder((prev) => {
        if (prev.includes(key)) return prev.filter((id) => id !== key);

        const candidate = candidateBySalesId.get(key);
        if (!candidate) return prev;

        const trialItems = [
          ...prev
            .map((id) => candidateBySalesId.get(id))
            .filter((row): row is BankDepositMatchCandidate => Boolean(row))
            .map((row) => ({ salesId: row.salesId, unpaid: row.unpaid })),
          { salesId: candidate.salesId, unpaid: candidate.unpaid },
        ];
        const trial = buildDepositLinkAllocations(remainingBeforeSelect, trialItems);
        const added = trial.find((row) => String(row.salesId) === key);
        if (!added || added.finalAmount <= 0) return prev;
        return [...prev, key];
      });
    },
    [candidateBySalesId, remainingBeforeSelect],
  );

  const canSelectCandidate = useCallback(
    (candidate: BankDepositMatchCandidate) => {
      const key = String(candidate.salesId);
      if (selectedSalesIds.has(key)) return true;
      if (remainingAfterSelect <= 0) return false;

      const trialItems = [
        ...selectedSalesOrder
          .map((id) => candidateBySalesId.get(id))
          .filter((row): row is BankDepositMatchCandidate => Boolean(row))
          .map((row) => ({ salesId: row.salesId, unpaid: row.unpaid })),
        { salesId: candidate.salesId, unpaid: candidate.unpaid },
      ];
      const trial = buildDepositLinkAllocations(remainingBeforeSelect, trialItems);
      const added = trial.find((row) => String(row.salesId) === key);
      return Boolean(added && added.finalAmount > 0);
    },
    [
      candidateBySalesId,
      remainingAfterSelect,
      remainingBeforeSelect,
      selectedSalesIds,
      selectedSalesOrder,
    ],
  );

  const applySelection = () => {
    if (!selectedAllocations.length) return;
    onConfirmReceivableBatch(selectedAllocations);
    setSelectedSalesOrder([]);
  };

  return (
    <ErpLinkPanelShell
      title={labels.title}
      subtitle={
        <>
          {formatBankTransactionDateTime(tx.transactionAt)}
          {linkedRows.length ? (
            <span className="ml-2 font-semibold text-emerald-700">{`\uC5F0\uACB0 ${linkedRows.length}\uAC74`}</span>
          ) : null}
        </>
      }
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span>{`\uC5F0\uACB0 ${linkedRows.length.toLocaleString("ko-KR")}\uAC74 \u00B7 \uD6C4\uBCF4 ${totalCount.toLocaleString("ko-KR")}\uAC74`}</span>
          <button
            type="button"
            className="erp-bank-evidence-find erp-bank-evidence-find--plain inline-flex h-8 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            disabled={!selectedAllocations.length}
            onClick={applySelection}
          >
            {L.connectSelected(selectedAllocations.length)}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <AmountSummaryBar
          total={totalDeposit}
          linked={linkedAmount}
          selected={selectedTotal}
          remainingBeforeSelect={remainingBeforeSelect}
          remainingAfterSelect={remainingAfterSelect}
          tone="deposit"
        />

        <LinkedDepositVouchersSection rows={linkedRows} onUnlink={onUnlinkDepositVoucher} />

        {!totalCount && !linkedRows.length ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            {labels.empty}
          </p>
        ) : null}

        {totalCount ? (
          <section>
            <h3 className="erp-bank-link-panel__section-title">{L.candidateSection}</h3>
            <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-slate-200">
              <table className="erp-table erp-tax-invoice-link-panel__table w-full">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>{L.receivableDate}</th>
                    <th>{L.voucherNo}</th>
                    <th>{L.client}</th>
                    <th>{"\uD604\uC7A5"}</th>
                    <th className="text-right">{L.salesAmount}</th>
                    <th className="text-right">{L.paidAmount}</th>
                    <th className="text-right">{L.unpaidAmount}</th>
                    <th className="text-right">{L.selectedAmount}</th>
                    <th className="text-right">{L.unpaidAfterAmount}</th>
                    <th>{L.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {receivableCandidates.map((candidate) => {
                    const status = getStatus(candidate);
                    const key = String(candidate.salesId);
                    const isSelected = selectedSalesIds.has(key);
                    const allocation = isSelected
                      ? selectedAllocations.find((row) => String(row.candidate.salesId) === key)
                      : null;
                    const selectable = canSelectCandidate(candidate);
                    const rowStatus =
                      allocation && allocation.unpaidAfter > 0
                        ? "\uC77C\uBD80\uC218\uAE08"
                        : allocation
                          ? "\uC644\uB8CC"
                          : status;

                    return (
                      <tr
                        key={key}
                        className={`erp-tax-invoice-link-panel__row cursor-pointer ${isSelected ? "bg-blue-50/80" : ""}`}
                        onClick={() => {
                          if (!isSelected && !selectable) return;
                          toggleCandidate(candidate.salesId);
                        }}
                      >
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelected && !selectable}
                            onChange={() => toggleCandidate(candidate.salesId)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td className="text-slate-600">{candidate.saleDate || "-"}</td>
                        <td className="font-semibold text-blue-800">
                          {candidate.voucherNo || candidate.salesId}
                        </td>
                        <td className="font-semibold text-slate-900">{candidate.client}</td>
                        <td className="text-slate-600">{candidate.site || "-"}</td>
                        <td className="text-right tabular-nums text-slate-900">
                          {formatKRW(candidate.salesAmount)}
                        </td>
                        <td className="text-right tabular-nums text-emerald-700">
                          {formatKRW(candidate.paidAmount)}
                        </td>
                        <td className="text-right font-bold tabular-nums text-red-600">
                          {formatKRW(candidate.unpaid)}
                        </td>
                        <td className="text-right font-semibold tabular-nums text-blue-700">
                          {allocation ? formatKRW(allocation.finalAmount) : "-"}
                        </td>
                        <td className="text-right font-bold tabular-nums text-red-600">
                          {allocation ? formatKRW(allocation.unpaidAfter) : "-"}
                        </td>
                        <td>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${RECEIVABLE_STATUS_CLASS[rowStatus] || "bg-slate-100 text-slate-700"}`}
                          >
                            {rowStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </ErpLinkPanelShell>
  );
}

export type BankErpWorkerLinkModalProps = {
  tx: BankTransaction;
  workerName: string;
  labels: {
    title: string;
    selectWorkerObligation: string;
    matchScore: string;
  };
  workerMonthlyActualVouchers: WorkerMonthlyActualVoucher[];
  workerMonthlyObligations: WorkerMonthlyObligation[];
  bankTransactionFolders: BankTransactionFolder[];
  workers: Array<{ name?: string; depositNameAliases?: string }>;
  onClose: () => void;
  onConfirmWorkerLinkBatch: (
    items: Array<{ candidate: WorkerBankMatchCandidate; entryAmount: number }>,
  ) => void;
  onUnlinkWorkerEntry: (voucherId: string, entryId: string) => void;
};

const WORKER_EMPTY_MSG =
  "\uC5F0\uACB0 \uAC00\uB2A5\uD55C \uC6D4\uBCC4 \uC2E4\uC9C0\uAE09 \uD6C4\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC2DC\uACF5\uC790 \uC9C0\uAE09 \uD654\uBA74\uC5D0\uC11C \uD574\uB2F9 \uC6D4 \uC2E4\uC9C0\uAE09\uC744 \uBA3C\uC800 \uD655\uC778\uD574 \uC8FC\uC138\uC694.";

export function BankErpWorkerLinkModal({
  tx,
  workerName,
  labels,
  workerMonthlyActualVouchers,
  workerMonthlyObligations,
  workers,
  onClose,
  onConfirmWorkerLinkBatch,
  onUnlinkWorkerEntry,
}: BankErpWorkerLinkModalProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const totalWithdrawal = resolveWorkerBankPaymentAmount(tx);
  const linkedAmount = useMemo(
    () =>
      workerMonthlyActualVouchers.reduce((sum, voucher) => {
        for (const entry of voucher.entries) {
          if (entry.kind === "bank" && entry.bankTransactionId === tx.id) {
            sum += Math.round(Number(entry.amount) || 0);
          }
        }
        return sum;
      }, 0),
    [tx.id, workerMonthlyActualVouchers],
  );
  const linkedRows = useMemo(
    () => listLinkedWorkerVouchers(tx, workerMonthlyActualVouchers),
    [tx, workerMonthlyActualVouchers],
  );
  const remainingBeforeSelect = useMemo(
    () => resolveBankWorkerLinkRemaining(tx, workerMonthlyActualVouchers),
    [tx, workerMonthlyActualVouchers],
  );
  const monthOptions = useMemo(() => {
    if (remainingBeforeSelect <= 0) return [];
    const linkedMonthKeys = new Set<string>();
    for (const voucher of workerMonthlyActualVouchers) {
      if (
        voucher.entries.some(
          (entry) => entry.kind === "bank" && entry.bankTransactionId === tx.id,
        )
      ) {
        linkedMonthKeys.add(voucher.monthKey);
      }
    }
    return buildWorkerBankLinkMonthOptions(tx, workerMonthlyObligations, workers, {
      worker: workerName,
      remainingAmount: remainingBeforeSelect,
    }).filter(({ obligation }) => !linkedMonthKeys.has(obligation.monthKey));
  }, [
    tx,
    workerMonthlyObligations,
    workers,
    workerName,
    remainingBeforeSelect,
    workerMonthlyActualVouchers,
  ]);

  const selectedAllocations = useMemo(() => {
    const rows: Array<{ candidate: WorkerBankMatchCandidate; entryAmount: number }> = [];
    let pool = remainingBeforeSelect;
    for (const { obligation, candidate } of monthOptions) {
      if (!selectedKeys.has(obligation.key) || pool <= 0) continue;
      const entryAmount = resolveWorkerLinkSelectionAmount(pool, obligation);
      if (entryAmount <= 0) continue;
      rows.push({
        candidate: candidate || buildWorkerBankLinkCandidateForObligation(tx, obligation, workers),
        entryAmount,
      });
      pool -= entryAmount;
    }
    return rows;
  }, [monthOptions, remainingBeforeSelect, selectedKeys, tx, workers]);

  const selectedTotal = selectedAllocations.reduce((sum, row) => sum + row.entryAmount, 0);
  const remainingAfterSelect = Math.max(0, remainingBeforeSelect - selectedTotal);

  const toggleObligation = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const applySelection = () => {
    if (!selectedAllocations.length) return;
    onConfirmWorkerLinkBatch(selectedAllocations);
    setSelectedKeys(new Set());
  };

  return (
    <ErpLinkPanelShell
      title={labels.title}
      subtitle={
        <>
          <span className="font-semibold text-orange-900">{workerName}</span>
          {" \u00B7 "}
          {formatBankTransactionDateTime(tx.transactionAt)}
          {linkedRows.length ? (
            <span className="ml-2 font-semibold text-orange-700">{`\uC5F0\uACB0 ${linkedRows.length}\uAC74`}</span>
          ) : null}
        </>
      }
      subtitleClassName="text-orange-800"
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span>{`\uC5F0\uACB0 ${linkedRows.length.toLocaleString("ko-KR")}\uAC74 \u00B7 \uD6C4\uBCF4 ${monthOptions.length.toLocaleString("ko-KR")}\uAC74`}</span>
          <button
            type="button"
            className="erp-bank-evidence-find erp-bank-evidence-find--worker inline-flex h-8 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            disabled={!selectedAllocations.length}
            onClick={applySelection}
          >
            {L.connectSelected(selectedAllocations.length)}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <AmountSummaryBar
          total={totalWithdrawal}
          linked={linkedAmount}
          selected={selectedTotal}
          remainingBeforeSelect={remainingBeforeSelect}
          remainingAfterSelect={remainingAfterSelect}
          tone="worker"
        />

        <LinkedWorkerVouchersSection rows={linkedRows} onUnlink={onUnlinkWorkerEntry} />

        {!monthOptions.length && !linkedRows.length ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            {WORKER_EMPTY_MSG}
          </p>
        ) : null}

        {monthOptions.length ? (
          <section>
            <h3 className="erp-bank-link-panel__section-title">{L.candidateSection}</h3>
            <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-orange-200 bg-orange-50/20">
              <table className="erp-table erp-tax-invoice-link-panel__table w-full">
                <thead>
                  <tr>
                    <th className="w-10" />
                    <th>{L.month}</th>
                    <th className="text-right">{L.netPay}</th>
                    <th className="text-right">{L.vat}</th>
                    <th className="text-right">{L.total}</th>
                    <th className="text-right">{L.paid}</th>
                    <th className="text-right">{L.unpaid}</th>
                    <th className="text-right">{L.selectedAmount}</th>
                    <th className="text-center">{L.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthOptions.map(({ obligation, candidate }) => {
                    const voucher = obligation.voucher;
                    const status = computeVoucherStatus(
                      voucher
                        ? {
                            ...voucher,
                            expectedAmount: obligation.expectedAmount,
                            expectedFinalAmount: obligation.expectedFinalAmount,
                            payWithVat: obligation.payWithVat,
                          }
                        : {
                            paidAmount: obligation.paid,
                            expectedAmount: obligation.expectedAmount,
                            expectedFinalAmount: obligation.expectedFinalAmount,
                            payWithVat: obligation.payWithVat,
                            entries: [],
                            allocations: [],
                            monthKey: obligation.monthKey,
                          },
                    );
                    const amounts = summarizeWorkerMonthlyObligationAmounts(obligation, obligation.voucher);
                    const isSelected = selectedKeys.has(obligation.key);
                    const allocation = isSelected
                      ? selectedAllocations.find(
                          (row) => row.candidate.obligation.key === obligation.key,
                        )
                      : null;
                    const selectable =
                      remainingAfterSelect > 0 || isSelected
                        ? resolveWorkerLinkSelectionAmount(
                            isSelected
                              ? remainingBeforeSelect -
                                  selectedTotal +
                                  (allocation?.entryAmount || 0)
                              : remainingAfterSelect,
                            obligation,
                          ) > 0
                        : false;

                    return (
                      <tr
                        key={obligation.key}
                        className={`erp-tax-invoice-link-panel__row cursor-pointer ${isSelected ? "bg-orange-100/80" : candidate ? "bg-amber-50/80" : ""}`}
                        onClick={() => {
                          if (!isSelected && !selectable) return;
                          toggleObligation(obligation.key);
                        }}
                      >
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelected && !selectable}
                            onChange={() => toggleObligation(obligation.key)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td className="font-semibold text-orange-900">
                          <div>{formatMonthLabel(obligation.monthKey, obligation.periodLabel)}</div>
                          {obligation.isProbation ? (
                            <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                              {"\uC218\uC2B5"}
                            </span>
                          ) : null}
                          {candidate?.reasons.length ? (
                            <div className="mt-0.5 text-xs font-normal text-slate-500">
                              {candidate.reasons.join(` ${MIDDOT} `)}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-right tabular-nums">{formatKRW(amounts.netPay)}</td>
                        <td className="text-right tabular-nums text-slate-600">
                          {amounts.vatAmount > 0 ? formatKRW(amounts.vatAmount) : "-"}
                        </td>
                        <td className="text-right font-bold tabular-nums">{formatKRW(amounts.totalAmount)}</td>
                        <td className="text-right font-bold tabular-nums text-emerald-700">
                          {formatKRW(obligation.paid)}
                        </td>
                        <td className="text-right tabular-nums text-red-600">{formatKRW(obligation.balance)}</td>
                        <td className="text-right font-semibold tabular-nums text-orange-800">
                          {allocation ? formatKRW(allocation.entryAmount) : "-"}
                        </td>
                        <td className="text-center">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${WORKER_STATUS_CLASS[status] || "bg-slate-100 text-slate-700"}`}
                          >
                            {WORKER_MONTHLY_VOUCHER_STATUS_LABELS[status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </ErpLinkPanelShell>
  );
}

export function resolveBankErpDepositAmount(tx: Pick<BankTransaction, "deposit" | "withdrawal">) {
  return Math.round(Number(tx.deposit) || 0);
}

export function resolveBankErpWithdrawalAmount(tx: Pick<BankTransaction, "deposit" | "withdrawal">) {
  return Math.round(Number(tx.withdrawal) || 0);
}
