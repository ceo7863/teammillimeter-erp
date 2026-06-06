import { getSaleCommentCount, getUnreadSaleCommentCount } from "@/utils/saleComments";

const L = {
  label: "\uCF54\uBA58\uD2B8",
  unreadLabel: "\uC0C8 \uCF54\uBA58\uD2B8",
};

export function SaleCommentBadge({
  saleId,
  count,
  saleCommentCounts,
  saleCommentUnreadCounts,
  title,
  onClick,
}: {
  saleId?: string | number | null;
  count?: number;
  saleCommentCounts?: Map<string, number>;
  saleCommentUnreadCounts?: Map<string, number>;
  title?: string;
  onClick?: (saleId: string | number) => void;
}) {
  const total =
    typeof count === "number"
      ? count
      : saleCommentCounts
        ? getSaleCommentCount(saleCommentCounts, saleId)
        : 0;
  const unread = saleCommentUnreadCounts ? getUnreadSaleCommentCount(saleCommentUnreadCounts, saleId) : 0;
  const resolved = unread > 0 ? unread : total;
  if (resolved <= 0) return null;

  const isUnread = unread > 0;
  const className = `erp-sale-comment-badge${isUnread ? " is-unread" : ""}${onClick ? " is-clickable" : ""}`;
  const label = `${isUnread ? L.unreadLabel : L.label} ${resolved}`;
  const tooltip = title || `${label}\uAC74${onClick ? " · \uD074\uB9AD\uD558\uBA74 \uCF54\uBA58\uD2B8 \uBCF4\uAE30" : ""}`;

  if (onClick && saleId != null && saleId !== "") {
    return (
      <button
        type="button"
        className={className}
        title={tooltip}
        aria-label={tooltip}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick(saleId);
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
