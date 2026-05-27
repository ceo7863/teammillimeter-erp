import { isSaleAutoLinkedPaid, isSaleManualLinkedPaid } from "@/utils/bankReceivableMatch";

export function AutoLinkBadge({ title = "\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC785\uAE08 \uC5F0\uACB0" }: { title?: string }) {
  return (
    <span className="erp-bank-auto-link-badge" title={title}>
      {"\uC790\uB3D9\uC5F0\uACB0"}
    </span>
  );
}

export function ManualLinkBadge({ title = "\uAC74\uBCC4 \uC785\uAE08\uCC98\uB9AC\uB85C \uC5F0\uACB0\uB41C \uC804\uD45C" }: { title?: string }) {
  return (
    <span className="erp-bank-manual-link-badge" title={title}>
      {"\uAC74\uBCC4\uC785\uAE08"}
    </span>
  );
}

export function SalePaymentLinkBadge({
  saleId,
  autoLinkedSaleIds = new Set<string>(),
  manualLinkedSaleIds = new Set<string>(),
}: {
  saleId?: number | string | null;
  autoLinkedSaleIds?: Set<string>;
  manualLinkedSaleIds?: Set<string>;
}) {
  if (isSaleAutoLinkedPaid(saleId, autoLinkedSaleIds)) {
    return <AutoLinkBadge title="\uACE0\uC2E0\uB8B0 \uC790\uB3D9 \uC785\uAE08\uC73C\uB85C \uC5F0\uACB0\uB41C \uC804\uD45C" />;
  }
  if (isSaleManualLinkedPaid(saleId, manualLinkedSaleIds)) {
    return <ManualLinkBadge title="\uAC74\uBCC4 \uC785\uAE08\uCC98\uB9AC\uB85C \uC5F0\uACB0\uB41C \uC804\uD45C" />;
  }
  return null;
}
