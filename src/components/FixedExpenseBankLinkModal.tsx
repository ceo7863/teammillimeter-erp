import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBankTransactionDateTime, type BankTransaction } from "@/utils/bankTransactions";
import { formatKRW, type FixedExpensePayment } from "@/utils/companyLedger";
import { buildFixedExpenseBankLinkRows } from "@/utils/fixedExpenseBankLinks";

const L = {
  title: "\uD1B5\uC7A5 \uC5F0\uB3D9 \uD655\uC778",
  desc: "\uC774 \uACE0\uC815\uBE44 \uD56D\uBAA9\uACFC \uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uAC70\uB798 \uB0B4\uC5ED\uC785\uB2C8\uB2E4.",
  txAt: "\uAC70\uB798\uC77C\uC2DC",
  withdrawal: "\uCD9C\uAE08",
  deposit: "\uC785\uAE08",
  description: "\uAC70\uB798\uB0B4\uC6A9",
  counterparty: "\uC0C1\uB300\uC608\uAE08\uC8FC",
  linkKind: "\uC5F0\uACB0",
  linkFixed: "\uACE0\uC815\uBE44 \uC9C1\uC811",
  linkPayment: "\uB0A9\uBD80 \uC5F0\uACB0",
  paymentInfo: "\uB0A9\uBD80\uC815\uBCF4",
  empty: "\uC5F0\uACB0\uB41C \uD1B5\uC7A5 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  close: "\uB2EB\uAE30",
  countSuffix: "\uAC74",
};

type FixedExpenseBankLinkModalProps = {
  fixedExpenseId: string;
  title: string;
  paymentId?: string;
  fixedExpensePayments: FixedExpensePayment[];
  bankTransactions: BankTransaction[];
  onClose: () => void;
};

export function FixedExpenseBankLinkModal({
  fixedExpenseId,
  title,
  paymentId,
  fixedExpensePayments,
  bankTransactions,
  onClose,
}: FixedExpenseBankLinkModalProps) {
  const rows = useMemo(
    () => buildFixedExpenseBankLinkRows(fixedExpenseId, fixedExpensePayments, bankTransactions, { paymentId }),
    [bankTransactions, fixedExpenseId, fixedExpensePayments, paymentId],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal erp-ledger-modal--bank-links"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={L.title}
      >
        <div className="erp-bank-links-modal-head">
          <div className="min-w-0">
            <h2 className="erp-text-section font-bold">{L.title}</h2>
            <p className="mt-1 erp-text-caption text-slate-500">{L.desc}</p>
            <p className="mt-2 truncate text-sm font-bold text-slate-900">{title}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {rows.length}
              {L.countSuffix}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            aria-label={L.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="erp-bank-links-table-wrap">
          <table className="erp-bank-links-table">
            <colgroup>
              <col className="erp-bank-links-table__col-tx" />
              <col className="erp-bank-links-table__col-amount" />
              <col className="erp-bank-links-table__col-amount" />
              <col className="erp-bank-links-table__col-desc" />
              <col className="erp-bank-links-table__col-party" />
              <col className="erp-bank-links-table__col-status" />
              <col className="erp-bank-links-table__col-date" />
            </colgroup>
            <thead>
              <tr>
                <th>{L.txAt}</th>
                <th className="text-right">{L.withdrawal}</th>
                <th className="text-right">{L.deposit}</th>
                <th>{L.description}</th>
                <th>{L.counterparty}</th>
                <th>{L.linkKind}</th>
                <th>{L.paymentInfo}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.bankTransactionId}>
                    <td className="text-slate-600">
                      {row.transactionAt ? formatBankTransactionDateTime(row.transactionAt) : "-"}
                    </td>
                    <td className="text-right font-semibold text-red-600">
                      {row.withdrawal ? formatKRW(row.withdrawal) : "-"}
                    </td>
                    <td className="text-right font-semibold text-blue-600">
                      {row.deposit ? formatKRW(row.deposit) : "-"}
                    </td>
                    <td className="font-medium text-slate-900" title={row.description || undefined}>
                      {row.description || "-"}
                    </td>
                    <td className="text-slate-700" title={row.counterpartyName || undefined}>
                      {row.counterpartyName || "-"}
                    </td>
                    <td>
                      <span
                        className={
                          row.linkKind === "fixed" ? "font-semibold text-emerald-700" : "font-semibold text-sky-700"
                        }
                      >
                        {row.linkKind === "fixed" ? L.linkFixed : L.linkPayment}
                      </span>
                    </td>
                    <td className="text-sm text-slate-600">
                      {row.paymentDate
                        ? `${row.paymentDate}${row.paymentAmount ? ` \u00B7 ${formatKRW(row.paymentAmount)}` : ""}`
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="erp-bank-links-table__empty">
                    {L.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="erp-bank-links-modal-foot">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
            {L.close}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
