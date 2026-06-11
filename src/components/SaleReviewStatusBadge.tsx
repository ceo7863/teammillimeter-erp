import {
  resolveSaleReviewStatus,
  SALE_REVIEW_STATUS_LABELS,
  type SaleComment,
  type SaleReviewStatus,
} from "@/utils/saleComments";

const STATUS_CLASS: Record<SaleReviewStatus, string> = {
  pending: "is-pending",
  confirmed: "is-confirmed",
  needs_review: "is-needs-review",
  on_hold: "is-on-hold",
};

export function SaleReviewStatusBadge({
  sale,
  saleComments = [],
  title,
  onClick,
}: {
  sale?: { id?: string | number; reviewStatus?: SaleReviewStatus | string } | null;
  saleComments?: SaleComment[];
  title?: string;
  onClick?: (saleId: string | number) => void;
}) {
  if (!sale || sale.id == null || sale.id === "") return null;
  const status = resolveSaleReviewStatus(sale, saleComments);
  if (!status) return null;

  const label = SALE_REVIEW_STATUS_LABELS[status];
  const className = `erp-sale-review-badge ${STATUS_CLASS[status]}${onClick ? " is-clickable" : ""}`;
  const tooltip = title || `${label}\u00B7 \uD074\uB9AD\uD558\uBA74 \uCF54\uBA58\uD2B8 \uBCF4\uAE30`;

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        title={tooltip}
        aria-label={tooltip}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick(sale.id as string | number);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={className} title={tooltip}>
      {label}
    </span>
  );
}
