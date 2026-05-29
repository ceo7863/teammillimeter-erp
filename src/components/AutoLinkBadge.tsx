import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  buildAutoLinkedSaleIdSet,
  buildManualLinkedSaleIdSet,
  isSaleAutoLinkedPaid,
  isSaleManualLinkedPaid,
  type PaymentVoucherAutoLinkSource,
} from "@/utils/bankReceivableMatch";
import type { BankTransaction } from "@/utils/bankTransactions";

type SalePaymentLinkContextValue = {
  autoLinkedSaleIds: Set<string>;
  manualLinkedSaleIds: Set<string>;
};

const SalePaymentLinkContext = createContext<SalePaymentLinkContextValue>({
  autoLinkedSaleIds: new Set(),
  manualLinkedSaleIds: new Set(),
});

export function SalePaymentLinkProvider({
  paymentVouchers = [],
  bankTransactions = [],
  children,
}: {
  paymentVouchers?: PaymentVoucherAutoLinkSource[];
  bankTransactions?: Array<Pick<BankTransaction, "id" | "matchAutoLinked" | "linkedPaymentVoucherId">>;
  children: ReactNode;
}) {
  const autoLinkedSaleIds = useMemo(
    () => buildAutoLinkedSaleIdSet(paymentVouchers, bankTransactions),
    [paymentVouchers, bankTransactions]
  );
  const manualLinkedSaleIds = useMemo(
    () => buildManualLinkedSaleIdSet(paymentVouchers, bankTransactions),
    [paymentVouchers, bankTransactions]
  );

  return (
    <SalePaymentLinkContext.Provider value={{ autoLinkedSaleIds, manualLinkedSaleIds }}>
      {children}
    </SalePaymentLinkContext.Provider>
  );
}

export function useSalePaymentLinkSets() {
  return useContext(SalePaymentLinkContext);
}

export function AutoLinkBadge({ title = "\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC785\uAE08" }: { title?: string }) {
  return (
    <span className="erp-bank-auto-link-badge" title={title}>
      {"\uC790\uB3D9\uC785\uAE08"}
    </span>
  );
}

export function ManualLinkBadge({ title = "\uAC74\uBCC4 \uC785\uAE08\uCC98\uB9AC\uB85C \uC785\uAE08\uB41C \uC804\uD45C" }: { title?: string }) {
  return (
    <span className="erp-bank-manual-link-badge" title={title}>
      {"\uAC74\uBCC4\uC785\uAE08"}
    </span>
  );
}

export function PartialPaymentBadge({ title = "\uBD80\uBD84 \uC785\uAE08 \uC804\uD45C" }: { title?: string }) {
  return (
    <span className="erp-bank-partial-link-badge" title={title}>
      {"\uBD80\uBD84\uC785\uAE08"}
    </span>
  );
}

export function SalePaymentLinkBadge({
  saleId,
  autoLinkedSaleIds,
  manualLinkedSaleIds,
}: {
  saleId?: number | string | null;
  autoLinkedSaleIds?: Set<string>;
  manualLinkedSaleIds?: Set<string>;
}) {
  const context = useContext(SalePaymentLinkContext);
  const autoIds = autoLinkedSaleIds ?? context.autoLinkedSaleIds;
  const manualIds = manualLinkedSaleIds ?? context.manualLinkedSaleIds;

  if (isSaleAutoLinkedPaid(saleId, autoIds)) {
    return <AutoLinkBadge title="\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC785\uAE08\uB41C \uC804\uD45C" />;
  }
  if (isSaleManualLinkedPaid(saleId, manualIds)) {
    return <ManualLinkBadge title="\uAC74\uBCC4 \uC785\uAE08\uCC98\uB9AC\uB85C \uC785\uAE08\uB41C \uC804\uD45C" />;
  }
  return null;
}
