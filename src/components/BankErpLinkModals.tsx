import React from "react";
import { createPortal } from "react-dom";
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
  const sentCandidates = buildSentStatementMatchCandidates(tx, sentArchives, {
    minScore: 0,
    limit: 30,
    clients,
    paymentVouchers,
    bankTransactions,
  });
  const receivableCandidates = buildBankDepositManualLinkCandidates(tx, receivableRows, {
    minScore: 0,
    limit: 30,
    clients,
  });

  return createPortal(
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--bank-erp-top"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal max-w-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-erp-deposit-link-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="bank-erp-deposit-link-title" className="erp-text-section font-bold">
              {labels.title}
            </h2>
            <p className="mt-1 text-sm text-emerald-700">
              {formatKRW(Math.round(Number(tx.deposit) || 0))}
              {` ${MIDDOT} `}
              {formatBankTransactionDateTime(tx.transactionAt)}
            </p>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="max-h-96 space-y-2 overflow-auto">
          {!sentCandidates.length && !receivableCandidates.length ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {labels.empty}
            </p>
          ) : (
            <>
              {sentCandidates.length > 0 ? (
                <div className="pb-1 text-xs font-semibold text-slate-500">{labels.selectSentStatement}</div>
              ) : null}
              {sentCandidates.map((candidate) => (
                <button
                  key={candidate.pdfArchiveId}
                  type="button"
                  className="w-full rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50"
                  onClick={() => onConfirmSentStatement(candidate)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{candidate.client}</span>
                    <span className="flex items-center gap-1">
                      {candidate.paymentStatus === "partial" ? <PartialPaymentBadge /> : null}
                      <span className="text-xs font-bold text-violet-700">
                        {labels.matchScore} {candidate.score}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {labels.statementTotal} {formatKRW(candidate.statementTotalAmount)}
                    {` ${MIDDOT} `}
                    {labels.sentAt} {String(candidate.sentAt || "").slice(0, 10)}
                  </div>
                  {candidate.paymentStatus === "partial" ? (
                    <div className="mt-1 text-xs font-semibold text-amber-700">
                      {labels.partialStatementMatchHint(candidate.paymentAmount, candidate.statementRemainingAmount)}
                    </div>
                  ) : null}
                </button>
              ))}
              {sentCandidates.length > 0 && receivableCandidates.length > 0 ? (
                <div className="py-2 text-center text-xs font-semibold text-slate-400">{labels.selectReceivable}</div>
              ) : null}
              {receivableCandidates.length > 0 && sentCandidates.length === 0 ? (
                <div className="pb-1 text-xs font-semibold text-slate-500">{labels.selectReceivable}</div>
              ) : null}
              {receivableCandidates.map((candidate) => (
                <button
                  key={String(candidate.salesId)}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50"
                  onClick={() => onConfirmReceivable(candidate)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{candidate.client}</span>
                    <span className="text-xs font-bold text-blue-700">
                      {labels.matchScore} {candidate.score}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {candidate.site || "-"}
                    {` ${MIDDOT} `}
                    {labels.unpaidAmount} {formatKRW(candidate.unpaid)}
                    {` ${MIDDOT} `}
                    {candidate.voucherNo || candidate.salesId}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
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

  return createPortal(
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--bank-erp-top"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal max-w-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-erp-worker-link-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="bank-erp-worker-link-title" className="erp-text-section font-bold">
              {labels.title}
            </h2>
            <p className="mt-1 text-sm text-orange-800">
              {workerName}
              {` ${MIDDOT} `}
              {formatKRW(Math.round(Number(tx.withdrawal) || 0))}
              {` ${MIDDOT} `}
              {formatBankTransactionDateTime(tx.transactionAt)}
            </p>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="max-h-96 space-y-2 overflow-auto">
          {linkedId ? (
            <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              {linkedVoucher
                ? `${formatMonthLabel(linkedVoucher.monthKey)} ${linkedVoucher.worker} \uC2E4\uC9C0\uAE09\uC5D0 \uC5F0\uACB0\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`
                : WORKER_LINKED_MSG}
            </p>
          ) : !candidates.length ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {WORKER_EMPTY_MSG}
            </p>
          ) : (
            <>
              <div className="pb-1 text-xs font-semibold text-slate-500">{labels.selectWorkerObligation}</div>
              {candidates.map((candidate) => (
                <button
                  key={`${candidate.obligation.worker}-${candidate.obligation.monthKey}`}
                  type="button"
                  className="w-full rounded-xl border border-orange-200 bg-orange-50/40 px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50"
                  onClick={() => onConfirmWorkerLink(candidate)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {formatMonthLabel(candidate.obligation.monthKey)} {MIDDOT} {candidate.obligation.worker}
                    </span>
                    <span className="text-xs font-bold text-orange-700">
                      {labels.matchScore} {candidate.score}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {"\uBBF8\uC9C0\uAE09 "}
                    {formatKRW(candidate.obligation.balance)}
                    {` ${MIDDOT} `}
                    {"\uC608\uC815 "}
                    {formatKRW(candidate.obligation.expectedFinalAmount)}
                  </div>
                  {candidate.reasons.length ? (
                    <div className="mt-1 text-xs text-slate-500">{candidate.reasons.join(` ${MIDDOT} `)}</div>
                  ) : null}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function resolveBankErpDepositAmount(tx: Pick<BankTransaction, "deposit" | "withdrawal">) {
  return Math.round(Number(tx.deposit) || 0);
}

export function resolveBankErpWithdrawalAmount(tx: Pick<BankTransaction, "deposit" | "withdrawal">) {
  return Math.round(Number(tx.withdrawal) || 0);
}
