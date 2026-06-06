import { getSaleCommentCount } from "@/utils/saleComments";

const L = {
  label: "\uCF54\uBA58\uD2B8",
};

export function SaleCommentBadge({
  saleId,
  count,
  saleCommentCounts,
  title,
}: {
  saleId?: string | number | null;
  count?: number;
  saleCommentCounts?: Map<string, number>;
  title?: string;
}) {
  const resolved =
    typeof count === "number"
      ? count
      : saleCommentCounts
        ? getSaleCommentCount(saleCommentCounts, saleId)
        : 0;
  if (resolved <= 0) return null;

  return (
    <span className="erp-sale-comment-badge" title={title || `${L.label} ${resolved}\uAC74`}>
      {L.label} {resolved}
    </span>
  );
}
