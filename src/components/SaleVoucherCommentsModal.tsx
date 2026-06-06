import React, { memo, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaleVoucherCommentsPanel } from "@/components/SaleVoucherCommentsPanel";
import { listSaleComments, type SaleComment } from "@/utils/saleComments";
import { getSaleVoucherLabel } from "@/utils/saleVoucherNo";

type SaleLike = {
  id?: string | number;
  client?: string;
  site?: string;
  date?: string;
  voucherNo?: string | number;
};

export const SaleVoucherCommentsModal = memo(function SaleVoucherCommentsModal({
  sale,
  saleComments = [],
  currentUser,
  onAddSaleComment,
  onClose,
}: {
  sale: SaleLike;
  saleComments?: SaleComment[];
  currentUser?: { name?: string; email?: string } | null;
  onAddSaleComment?: (body: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const commentsForSale = useMemo(
    () => listSaleComments(saleComments, sale.id),
    [saleComments, sale.id],
  );
  const voucherLabel = getSaleVoucherLabel(sale);
  const subtitle = [sale.date, sale.client, sale.site].filter(Boolean).join(" \u00B7 ");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const modal = (
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal erp-ledger-modal--sale-comments"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-voucher-comments-title"
      >
        <div className="erp-sale-comments-modal-head">
          <div className="min-w-0">
            <h2 id="sale-voucher-comments-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
              <MessageSquare size={18} className="shrink-0 text-slate-500" />
              <span>{"\uC804\uD45C \uCF54\uBA58\uD2B8"}</span>
            </h2>
            <p className="mt-1 truncate text-sm text-slate-600">{subtitle || voucherLabel}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">{voucherLabel}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg text-xs" onClick={onClose}>
            <X size={14} />
            {"\uB2EB\uAE30"}
          </Button>
        </div>
        {onAddSaleComment ? (
          <SaleVoucherCommentsPanel
            saleId={sale.id}
            comments={commentsForSale}
            onAddComment={onAddSaleComment}
            currentUser={currentUser}
            className="mt-3 border-0 shadow-none"
          />
        ) : null}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
});
