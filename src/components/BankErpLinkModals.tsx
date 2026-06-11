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
  add: "\uCD94\uAC00",
  matchScore: "\uC810\uC218",
};

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
  paymentVouchers: Array<{ bankTransactionId?: string | number; isPartialPayment?: boolean }>;
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
  const sentCandidates = useMemo(
    () =>
      buildSentStatementMatchCandidates(tx, sentArchives, {
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
      buildBankDepositManualLinkCandidates(tx, receivableRows, {
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
        </>
      }
      onClose={onClose}
      footer={<span>{`\uD6C4\uBCF4 ${totalCount.toLocaleString("ko-KR")}\uAC74`}</span>}
    >
      {!totalCount ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          {labels.empty}
        </p>
      ) : (
        <div className="space-y-3">
          {sentCandidates.length ? (
            <section>
              <h3 className="erp-bank-link-panel__section-title">{labels.selectSentStatement}</h3>
              <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-violet-200 bg-violet-50/20">
                <table className="erp-table erp-tax-invoice-link-panel__table w-full">
                  <thead>
                    <tr>
                      <th>{"\uAC70\uB798\uCC98"}</th>
                      <th>{"\uC815\uBCF4"}</th>
                      <th className="text-right">{labels.matchScore}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sentCandidates.map((candidate) => (
                      <tr key={candidate.pdfArchiveId} className="erp-tax-invoice-link-panel__row">
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
                            {L.add}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {receivableCandidates.length ? (
            <section>
              <h3 className="erp-bank-link-panel__section-title">{labels.selectReceivable}</h3>
              <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-slate-200">
                <table className="erp-table erp-tax-invoice-link-panel__table w-full">
                  <thead>
                    <tr>
                      <th>{"\uAC70\uB798\uCC98"}</th>
                      <th>{"\uC815\uBCF4"}</th>
                      <th className="text-right">{labels.matchScore}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {receivableCandidates.map((candidate) => (
                      <tr key={String(candidate.salesId)} className="erp-tax-invoice-link-panel__row">
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
                            {L.add}
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
      )}
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
  const linkedId = String(tx.linkedWorkerMonthlyPaymentVoucherId || "").trim();
  const linkedVoucher = linkedId
    ? workerMonthlyActualVouchers.find((row) => row.id === linkedId)
    : undefined;
  const candidates = linkedId
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
        </>
      }
      subtitleClassName="text-orange-800"
      onClose={onClose}
      footer={
        linkedId ? (
          <span className="font-semibold text-orange-700">{"\uC5F0\uACB0\uB428"}</span>
        ) : (
          <span>{`\uD6C4\uBCF4 ${candidates.length.toLocaleString("ko-KR")}\uAC74`}</span>
        )
      }
    >
      {linkedId ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-8 text-center text-sm text-orange-900">
          {linkedVoucher
            ? `${formatMonthLabel(linkedVoucher.monthKey)} ${linkedVoucher.worker} \uC2E4\uC9C0\uAE09\uC5D0 \uC5F0\uACB0\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`
            : WORKER_LINKED_MSG}
        </p>
      ) : !candidates.length ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          {WORKER_EMPTY_MSG}
        </p>
      ) : (
        <section>
          <h3 className="erp-bank-link-panel__section-title">{labels.selectWorkerObligation}</h3>
          <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-orange-200 bg-orange-50/20">
            <table className="erp-table erp-tax-invoice-link-panel__table w-full">
              <thead>
                <tr>
                  <th>{"\uC6D4 / \uC2DC\uACF5\uC790"}</th>
                  <th>{"\uAE08\uC561"}</th>
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
                    <td className="font-semibold text-slate-900">
                      {formatMonthLabel(candidate.obligation.monthKey)} {MIDDOT} {candidate.obligation.worker}
                    </td>
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
                        {L.add}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ErpLinkPanelShell>
  );
}

export function resolveBankErpDepositAmount(tx: Pick<BankTransaction, "deposit" | "withdrawal">) {
  return Math.round(Number(tx.deposit) || 0);
}

export function resolveBankErpWithdrawalAmount(tx: Pick<BankTransaction, "deposit" | "withdrawal">) {
  return Math.round(Number(tx.withdrawal) || 0);
}
