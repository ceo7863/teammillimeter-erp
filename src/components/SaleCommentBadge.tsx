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
}: {
  saleId?: string | number | null;
  count?: number;
  saleCommentCounts?: Map<string, number>;
  saleCommentUnreadCounts?: Map<string, number>;
  title?: string;
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

  return (
    <span
      className={`erp-sale-comment-badge${isUnread ? " is-unread" : ""}`}
      title={title || `${isUnread ? L.unreadLabel : L.label} ${resolved}\uAC74`}
    >
      {isUnread ? L.unreadLabel : L.label} {resolved}
    </span>
  );
}
