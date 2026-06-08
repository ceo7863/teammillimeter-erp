import React from "react";
import { Button } from "@/components/ui/button";
import { formatKRW } from "@/utils/companyLedger";
import type { TaxInvoiceIssuePreviewData } from "@/utils/taxInvoices";

const L = {
  title: "\uACC4\uC0B0\uC11C \uBC1C\uD589 \uBBF8\uB9AC\uBCF4\uAE30",
  close: "\uB2EB\uAE30",
  issue: "\uC804\uC790 \uBC1C\uD589",
  issueDate: "\uC791\uC131\uC77C\uC790",
  documentType: "\uACC4\uC0B0\uC11C \uC885\uB958",
  client: "\uAC70\uB798\uCC98",
  businessNo: "\uC0AC\uC5C5\uC790\uBC88\uD638",
  itemName: "\uD488\uBAA9\uBA85",
  supplyAmount: "\uACF5\uAE09\uAC00\uC561",
  vatAmount: "\uBD80\uAC00\uC138",
  totalAmount: "\uD569\uACC4",
  memo: "\uBA54\uBAA8",
  invoiceeSection: "\uAC70\uB798\uCC98(\uACF5\uAE09\uBC1B\uB294\uC790)",
  ceoName: "\uB300\uD45C\uC790\uBA85",
  email: "\uC774\uBA54\uC77C",
  address: "\uC8FC\uC18C",
  phone: "\uC804\uD654",
  bizType: "\uC5C5\uD0DC",
  bizClass: "\uC5C5\uC885",
};

function PreviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value || "-"}</span>
    </div>
  );
}

type TaxInvoiceIssuePreviewDialogProps = {
  open: boolean;
  preview: TaxInvoiceIssuePreviewData | null;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  loading?: boolean;
};

export function TaxInvoiceIssuePreviewDialog({
  open,
  preview,
  onClose,
  onConfirm,
  confirmLabel = L.issue,
  loading = false,
}: TaxInvoiceIssuePreviewDialogProps) {
  if (!open || !preview) return null;

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal max-w-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tax-invoice-issue-preview-title"
      >
        <h2 id="tax-invoice-issue-preview-title" className="text-base font-bold text-slate-900 md:text-lg">
          {L.title}
        </h2>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
          <PreviewRow label={L.issueDate} value={preview.issueDate} />
          <PreviewRow label={L.documentType} value={preview.documentTypeLabel} />
          <PreviewRow label={L.client} value={preview.client} />
          <PreviewRow label={L.businessNo} value={preview.businessNo} />
          <PreviewRow label={L.itemName} value={preview.itemName} />
          <PreviewRow label={L.supplyAmount} value={formatKRW(preview.supplyAmount)} />
          <PreviewRow label={L.vatAmount} value={formatKRW(preview.vatAmount)} />
          <PreviewRow label={L.totalAmount} value={formatKRW(preview.totalAmount)} />
          {preview.memo ? <PreviewRow label={L.memo} value={preview.memo} /> : null}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-slate-700">{L.invoiceeSection}</p>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
            <PreviewRow label={L.ceoName} value={preview.invoiceeCeoName} />
            <PreviewRow label={L.email} value={preview.invoiceeEmail} />
            <PreviewRow label={L.phone} value={preview.invoiceePhone} />
            <PreviewRow label={L.bizType} value={preview.invoiceeBizType} />
            <PreviewRow label={L.bizClass} value={preview.invoiceeBizClass} />
            <PreviewRow label={L.address} value={preview.invoiceeAddr} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose} disabled={loading}>
            {L.close}
          </Button>
          {onConfirm ? (
            <Button type="button" className="rounded-2xl" onClick={onConfirm} disabled={loading}>
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
