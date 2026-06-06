import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatKRW } from "@/utils/companyLedger";
import {
  formatBankTransactionDateTime,
  parseBankAmount,
  type BankTransaction,
} from "@/utils/bankTransactions";

const LABELS = {
  title: (name: string) => `\uAC70\uB798\uC790 "${name}" \uC804\uCCB4 \uB0B4\uC5ED`,
  transactionCount: (count: number) => `\uCD1D ${count.toLocaleString()}\uAC74`,
  depositTotal: "\uC785\uAE08 \uD569\uACC4",
  withdrawalTotal: "\uCD9C\uAE08 \uD569\uACC4",
  date: "\uAC70\uB798\uC77C\uC2DC",
  account: "\uACC4\uC88C",
  description: "\uAC70\uB798\uB0B4\uC6A9",
  amount: "\uAE08\uC561",
  memo: "\uBA54\uBAA4",
  close: "\uB2EB\uAE30",
  deposit: "\uC785\uAE08",
  withdrawal: "\uCD9C\uAE08",
  memoEmpty: "-",
};

function formatAccountLabel(row: BankTransaction) {
  return `${row.bankName || "IBK"} ${String(row.accountNumber || "").slice(-4) || ""}`.trim();
}

function formatAmountCell(row: BankTransaction) {
  const deposit = parseBankAmount(row.deposit);
  const withdrawal = parseBankAmount(row.withdrawal);
  if (deposit > 0) {
    return <span className="font-semibold text-emerald-700">{formatKRW(deposit)}</span>;
  }
  if (withdrawal > 0) {
    return <span className="font-semibold text-red-600">{formatKRW(withdrawal)}</span>;
  }
  return <span className="text-slate-400">-</span>;
}

export type BankCounterpartyTransactionsDrawerProps = {
  counterpartyLabel: string;
  rows: BankTransaction[];
  onClose: () => void;
};

export const BankCounterpartyTransactionsDrawer = React.memo(function BankCounterpartyTransactionsDrawer({
  counterpartyLabel,
  rows,
  onClose,
}: BankCounterpartyTransactionsDrawerProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const totals = useMemo(() => {
    let depositTotal = 0;
    let withdrawalTotal = 0;
    for (const row of rows) {
      depositTotal += parseBankAmount(row.deposit);
      withdrawalTotal += parseBankAmount(row.withdrawal);
    }
    return { depositTotal, withdrawalTotal };
  }, [rows]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="erp-bank-counterparty-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <section
        className="erp-bank-counterparty-drawer"
        aria-label={LABELS.title(counterpartyLabel)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="erp-bank-counterparty-drawer-head">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {LABELS.title(counterpartyLabel)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-700">
              <span>{LABELS.transactionCount(rows.length)}</span>
              <span className="text-emerald-700">
                {LABELS.depositTotal} {formatKRW(totals.depositTotal)}
              </span>
              <span className="text-red-600">
                {LABELS.withdrawalTotal} {formatKRW(totals.withdrawalTotal)}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            aria-label={LABELS.close}
            onClick={() => onCloseRef.current()}
          >
            <X size={18} />
          </button>
        </header>

        <div className="erp-bank-counterparty-drawer-body">
          <table className="erp-bank-counterparty-drawer-table">
            <thead>
              <tr>
                <th>{LABELS.date}</th>
                <th>{LABELS.account}</th>
                <th>{LABELS.description}</th>
                <th className="text-right">{LABELS.amount}</th>
                <th>{LABELS.memo}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{formatBankTransactionDateTime(row.transactionAt)}</td>
                  <td className="whitespace-nowrap">{formatAccountLabel(row)}</td>
                  <td className="max-w-[12rem] truncate" title={row.description || ""}>
                    {row.description || "-"}
                  </td>
                  <td className="whitespace-nowrap text-right">{formatAmountCell(row)}</td>
                  <td className="max-w-[10rem] truncate text-slate-600" title={row.memo || ""}>
                    {String(row.memo || "").trim() || LABELS.memoEmpty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>,
    document.body,
  );
});
