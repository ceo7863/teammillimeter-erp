import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BankTransaction } from "@/utils/bankTransactions";
import { formatTaxInvoiceEvidenceLabel, searchTaxInvoicesForBankTx } from "@/utils/bankTaxInvoiceLink";
import { formatKRW } from "@/utils/companyLedger";
import type { TaxInvoice } from "@/utils/taxInvoices";
import { getTaxInvoiceKindLabel } from "@/utils/taxInvoices";

const L = {
  title: "\uC99D\uBE59 \uCC3E\uAE30",
  desc: "\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uBAA9\uB85D\uC5D0\uC11C \uAC70\uB798\uC640 \uB9E4\uCE6D\uB418\uB294 \uC99D\uBE59\uC744 \uC5F0\uACB0\uD569\uB2C8\uB2E4.",
  search: "\uAC70\uB798\uCC98, \uAE08\uC561, \uC77C\uC790 \uAC80\uC0C9",
  empty: "\uB9E4\uCE6D\uB418\uB294 \uC138\uAE08\uACC4\uC0B0\uC11C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  unlink: "\uC5F0\uACB0 \uD574\uC81C",
  cancel: "\uCDE8\uC18C",
  txAmount: "\uAC70\uB798 \uAE08\uC561",
};

type TaxInvoiceLinkModalProps = {
  tx: BankTransaction;
  taxInvoices: TaxInvoice[];
  linkedInvoiceId?: string;
  onClose: () => void;
  onLink: (invoiceId: string | undefined) => void;
};

export function TaxInvoiceLinkModal({
  tx,
  taxInvoices,
  linkedInvoiceId,
  onClose,
  onLink,
}: TaxInvoiceLinkModalProps) {
  const [search, setSearch] = useState("");
  const amount = Math.max(Number(tx.deposit || 0), Number(tx.withdrawal || 0));

  const candidates = useMemo(
    () => searchTaxInvoicesForBankTx(tx, taxInvoices, search).slice(0, 40),
    [tx, taxInvoices, search],
  );

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal max-w-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="erp-text-section font-bold">{L.title}</h2>
            <p className="mt-1 erp-text-caption text-slate-500">{L.desc}</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {L.txAmount}: {formatKRW(amount)}
            </p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={L.search}
          className="erp-input mb-4 w-full rounded-xl border border-slate-200 px-3 py-2"
        />

        <div className="max-h-[24rem] space-y-2 overflow-y-auto">
          {!candidates.length ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.empty}</p>
          ) : (
            candidates.map(({ invoice }) => (
              <button
                key={invoice.id}
                type="button"
                className={`flex w-full flex-col rounded-xl border px-3 py-2 text-left transition hover:bg-slate-50 ${
                  linkedInvoiceId === invoice.id ? "border-blue-400 bg-blue-50" : "border-slate-200"
                }`}
                onClick={() => onLink(invoice.id)}
              >
                <span className="text-sm font-bold text-slate-900">{formatTaxInvoiceEvidenceLabel(invoice)}</span>
                <span className="mt-0.5 text-xs text-slate-500">
                  {getTaxInvoiceKindLabel(invoice)} / {invoice.issueDate} / {formatKRW(invoice.totalAmount)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {linkedInvoiceId ? (
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onLink(undefined)}>
              {L.unlink}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            {L.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}
