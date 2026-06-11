import React, { useMemo } from "react";
import { X } from "lucide-react";
import { PartialPaymentBadge } from "@/components/AutoLinkBadge";
import type { BankTransaction } from "@/utils/bankTransactions";
import { formatKRW } from "@/utils/companyLedger";
import { formatBankTransactionDateTime } from "@/utils/bankTransactions";
import {
  buildBankDepositManualLinkCandidates,
  type BankDepositMatchCandidate,
} from "@/utils/bankReceivableMatch";
import {
  buildSentStatementMatchCandidates,
  type SentStatementMatchCandidate,
} from "@/utils/bankSentStatementMatch";
import {
  buildWorkerBankManualLinkCandidates,
  type WorkerBankMatchCandidate,
} from "@/utils/bankWorkerMonthlyMatch";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import type { PdfArchiveMeta } from "@/utils/pdfArchive";
import type { ReceivableRow } from "@/utils/receivables";
import type { WorkerMonthlyActualVoucher, WorkerMonthlyObligation } from "@/utils/workerMonthlyActualPayments";
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
};

type LinkedWorkerVoucherRow = {
  id: string;
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

function LinkedDepositVouchersSection({ rows }: { rows: LinkedDepositVoucherRow[] }) {
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
                  <span className="inline-flex rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
                    {L.linkedStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LinkedWorkerVouchersSection({ rows }: { rows: LinkedWorkerVoucherRow[] }) {
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
                  <span className="inline-flex rounded-lg border border-orange-200 bg-white px-2 py-1 text-xs font-semibold text-orange-800">
                    {L.linkedStatus}
                  </span>
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
  onConfirmReceivable: (candidate: BankDepositMatchCandidate) => void;
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
  bankTransactions,
  onClose,
  onConfirmSentStatement,
  onConfirmReceivable,
}: BankErpDepositLinkModalProps) {
  const linkedRows = useMemo(
    () => listLinkedDepositVouchers(tx, paymentVouchers, sentArchives, receivableRows),
    [tx, paymentVouchers, sentArchives, receivableRows],
  );
  const sentCandidates = useMemo(
    () =>
      tx.linkedPaymentVoucherId
        ? []
        : buildSentStatementMatchCandidates(tx, sentArchives, {
            minScore: 0,
            limit: 30,
            clients,
            paymentVouchers,
            bankTransactions,
          }),
    [tx, sentArchives, clients, paymentVouchers, bankTransactions],
  );
  const receivableCandidates = useMemo(
    () =>
      tx.linkedPaymentVoucherId
        ? []
        : buildBankDepositManualLinkCandidates(tx, receivableRows, {
            minScore: 0,
            limit: 30,
            clients,
          }),
    [tx, receivableRows, clients],
  );

  const totalCount = sentCandidates.length + receivableCandidates.length;

  return (
    <ErpLinkPanelShell
      title={labels.title}
      subtitle={
        <>
          <span className="font-bold text-emerald-700">{formatKRW(Math.round(Number(tx.deposit) || 0))}</span>
          {" \u00B7 "}
          {formatBankTransactionDateTime(tx.transactionAt)}
          {linkedRows.length ? (
            <span className="ml-2 font-semibold text-emerald-700">{`\uC5F0\uACB0 ${linkedRows.length}\uAC74`}</span>
          ) : null}
        </>
      }
      onClose={onClose}
      footer={
        <span>{`\uC5F0\uACB0 ${linkedRows.length.toLocaleString("ko-KR")}\uAC74 \u00B7 \uD6C4\uBCF4 ${totalCount.toLocaleString("ko-KR")}\uAC74`}</span>
      }
    >
      <div className="space-y-3">
        <LinkedDepositVouchersSection rows={linkedRows} />

        {!totalCount && !linkedRows.length ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            {labels.empty}
          </p>
        ) : null}

        {totalCount ? (
          <section>
            <h3 className="erp-bank-link-panel__section-title">{L.candidateSection}</h3>
            <div className="space-y-3">
        {sentCandidates.length ? (
            <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-violet-200 bg-violet-50/20">
                <table className="erp-table erp-tax-invoice-link-panel__table w-full">
                  <thead>
                    <tr>
                      <th>{L.voucherCol}</th>
                      <th>{L.client}</th>
                      <th>{L.detail}</th>
                      <th className="text-right">{labels.matchScore}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sentCandidates.map((candidate) => (
                      <tr key={candidate.pdfArchiveId} className="erp-tax-invoice-link-panel__row">
                        <td className="font-semibold text-violet-800">{L.sentVoucher}</td>
                        <td className="font-semibold text-slate-900">{candidate.client}</td>
                        <td className="text-slate-600">
                          <div>
                            {labels.statementTotal} {formatKRW(candidate.statementTotalAmount)}
                            {" \u00B7 "}
                            {labels.sentAt} {String(candidate.sentAt || "").slice(0, 10)}
                          </div>
                          {candidate.paymentStatus === "partial" ? (
                            <div className="mt-0.5 text-xs font-semibold text-amber-700">
                              {labels.partialStatementMatchHint(
                                candidate.paymentAmount,
                                candidate.statementRemainingAmount,
                              )}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-700">
                            {candidate.paymentStatus === "partial" ? <PartialPaymentBadge /> : null}
                            {candidate.score}
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="erp-bank-evidence-find erp-bank-evidence-find--plain inline-flex h-7 items-center rounded-lg px-3 text-xs font-semibold"
                            onClick={() => onConfirmSentStatement(candidate)}
                          >
                            {L.linkVoucher}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          ) : null}

          {receivableCandidates.length ? (
              <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-slate-200">
                <table className="erp-table erp-tax-invoice-link-panel__table w-full">
                  <thead>
                    <tr>
                      <th>{L.voucherCol}</th>
                      <th>{L.client}</th>
                      <th>{L.detail}</th>
                      <th className="text-right">{labels.matchScore}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {receivableCandidates.map((candidate) => (
                      <tr key={String(candidate.salesId)} className="erp-tax-invoice-link-panel__row">
                        <td className="font-semibold text-blue-800">
                          {L.salesVoucher(candidate.voucherNo || candidate.salesId)}
                        </td>
                        <td className="font-semibold text-slate-900">{candidate.client}</td>
                        <td className="text-slate-600">
                          {candidate.site || "-"}
                          {" \u00B7 "}
                          {labels.unpaidAmount} {formatKRW(candidate.unpaid)}
                          {" \u00B7 "}
                          {candidate.voucherNo || candidate.salesId}
                        </td>
                        <td className="text-right text-xs font-bold text-blue-700">{candidate.score}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="erp-bank-evidence-find erp-bank-evidence-find--plain inline-flex h-7 items-center rounded-lg px-3 text-xs font-semibold"
                            onClick={() => onConfirmReceivable(candidate)}
                          >
                            {L.linkVoucher}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          ) : null}
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
  onConfirmWorkerLink: (candidate: WorkerBankMatchCandidate) => void;
};

const WORKER_LINKED_MSG = "\uC2DC\uACF5\uC790 \uC2E4\uC9C0\uAE09\uC5D0 \uC5F0\uACB0\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.";
const WORKER_EMPTY_MSG =
  "\uC5F0\uACB0 \uAC00\uB2A5\uD55C \uC6D4\uBCC4 \uC2E4\uC9C0\uAE09 \uD6C4\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC2DC\uACF5\uC790 \uC9C0\uAE09 \uD654\uBA74\uC5D0\uC11C \uD574\uB2F9 \uC6D4 \uC2E4\uC9C0\uAE09\uC744 \uBA3C\uC800 \uD655\uC778\uD574 \uC8FC\uC138\uC694.";

export function BankErpWorkerLinkModal({
  tx,
  workerName,
  labels,
  workerMonthlyActualVouchers,
  workerMonthlyObligations,
  bankTransactionFolders,
  workers,
  onClose,
  onConfirmWorkerLink,
}: BankErpWorkerLinkModalProps) {
  const linkedRows = useMemo(
    () => listLinkedWorkerVouchers(tx, workerMonthlyActualVouchers),
    [tx, workerMonthlyActualVouchers],
  );
  const linkedId = String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim();
  const candidates = linkedRows.length
    ? []
    : buildWorkerBankManualLinkCandidates(tx, workerMonthlyObligations, bankTransactionFolders, workers, {
        minScore: 0,
        limit: 30,
        worker: workerName,
      });

  return (
    <ErpLinkPanelShell
      title={labels.title}
      subtitle={
        <>
          <span className="font-semibold text-orange-900">{workerName}</span>
          {" \u00B7 "}
          <span className="font-bold text-orange-800">{formatKRW(Math.round(Number(tx.withdrawal) || 0))}</span>
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
        <span>{`\uC5F0\uACB0 ${linkedRows.length.toLocaleString("ko-KR")}\uAC74 \u00B7 \uD6C4\uBCF4 ${candidates.length.toLocaleString("ko-KR")}\uAC74`}</span>
      }
    >
      <div className="space-y-3">
        <LinkedWorkerVouchersSection rows={linkedRows} />

        {!candidates.length && !linkedRows.length ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            {WORKER_EMPTY_MSG}
          </p>
        ) : null}

        {linkedRows.length && !candidates.length && linkedId && !workerMonthlyActualVouchers.find((row) => row.id === linkedId) ? (
          <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            {WORKER_LINKED_MSG}
          </p>
        ) : null}

        {candidates.length ? (
          <section>
            <h3 className="erp-bank-link-panel__section-title">{L.candidateSection}</h3>
            <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-orange-200 bg-orange-50/20">
            <table className="erp-table erp-tax-invoice-link-panel__table w-full">
              <thead>
                <tr>
                  <th>{L.voucherCol}</th>
                  <th>{L.worker}</th>
                  <th>{L.detail}</th>
                  <th className="text-right">{labels.matchScore}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr
                    key={`${candidate.obligation.worker}-${candidate.obligation.monthKey}`}
                    className="erp-tax-invoice-link-panel__row"
                  >
                    <td className="font-semibold text-orange-900">
                      {L.workerVoucher(candidate.obligation.monthKey)}
                    </td>
                    <td className="font-semibold text-slate-900">{candidate.obligation.worker}</td>
                    <td className="text-slate-600">
                      {"\uBBF8\uC9C0\uAE09 "}
                      {formatKRW(candidate.obligation.balance)}
                      {" \u00B7 "}
                      {"\uC608\uC815 "}
                      {formatKRW(candidate.obligation.expectedFinalAmount)}
                      {candidate.reasons.length ? (
                        <div className="mt-0.5 text-xs text-slate-500">{candidate.reasons.join(` ${MIDDOT} `)}</div>
                      ) : null}
                    </td>
                    <td className="text-right text-xs font-bold text-orange-700">{candidate.score}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="erp-bank-evidence-find erp-bank-evidence-find--worker inline-flex h-7 items-center rounded-lg px-3 text-xs font-semibold"
                        onClick={() => onConfirmWorkerLink(candidate)}
                      >
                        {L.linkVoucher}
                      </button>
                    </td>
                  </tr>
                ))}
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
