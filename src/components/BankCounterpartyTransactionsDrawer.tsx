import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BankTransactionListSection } from "@/components/BankTransactionListSection";
import { formatKRW } from "@/utils/companyLedger";
import { parseBankAmount, type BankTransaction } from "@/utils/bankTransactions";

const LABELS = {
  title: (name: string) => `\uAC70\uB798\uC790 "${name}" \uC804\uCCB4 \uB0B4\uC5ED`,
  transactionCount: (count: number) => `\uCD1D ${count.toLocaleString()}\uAC74`,
  depositTotal: "\uC785\uAE08 \uD569\uACC4",
  withdrawalTotal: "\uCD9C\uAE08 \uD569\uACC4",
  close: "\uB2EB\uAE30",
};

export type BankCounterpartyTransactionsDrawerProps = {
  counterpartyLabel: string;
  onClose: () => void;
} & React.ComponentProps<typeof BankTransactionListSection>;

export const BankCounterpartyTransactionsDrawer = React.memo(function BankCounterpartyTransactionsDrawer({
  counterpartyLabel,
  onClose,
  rows,
  ...listSectionProps
}: BankCounterpartyTransactionsDrawerProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const totals = useMemo(() => {
    let depositTotal = 0;
    let withdrawalTotal = 0;
    for (const row of rows as BankTransaction[]) {
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
          <div className="erp-bank-wehago-table-shell erp-bank-counterparty-drawer-table-shell">
            <BankTransactionListSection
              {...listSectionProps}
              rows={rows}
              tableId="bank-counterparty-drawer-table"
            />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
});
