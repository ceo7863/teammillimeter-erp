import React, { useMemo, useState } from "react";
import { MessageSquare, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableExportSection } from "@/components/TableExportSection";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import { SaleReviewStatusBadge } from "@/components/SaleReviewStatusBadge";
import {
  formatSaleCommentTime,
  resolveSaleReviewStatus,
  SALE_COMMENT_KIND_LABELS,
  SALE_REVIEW_STATUS_LABELS,
  type SaleComment,
  type SaleReviewStatus,
} from "@/utils/saleComments";
import { getSaleVoucherLabel } from "@/utils/saleVoucherNo";

type SaleLike = {
  id?: string | number;
  client?: string;
  site?: string;
  date?: string;
  voucherNo?: string | number;
  reviewStatus?: SaleReviewStatus | string;
};

type EnrichedSaleComment = SaleComment & {
  client: string;
  site: string;
  voucherDate: string;
  voucherLabel: string;
  saleReviewStatus: SaleReviewStatus | null;
};

type ReviewFilter = SaleReviewStatus | "unconfirmed" | "all";

const L = {
  pageTitle: "전표 코멘트",
  pageDesc: "매출 전표에 남긴 코멘트를 모아 보고, 행을 클릭하면 해당 전표를 엽니다.",
  comments: "코멘트",
  vouchers: "전표",
  visible: "표시",
  search: "검색",
  searchPlaceholder: "작성자, 거래처, 현장, 코멘트, 전표번호",
  exportFileName: "전표코멘트",
  author: "작성자",
  createdAt: "작성일시",
  body: "코멘트",
  kind: "유형",
  reviewStatus: "확인상태",
  voucherDate: "전표일자",
  client: "거래처",
  site: "현장",
  voucherNo: "전표번호",
  empty: "등록된 코멘트가 없습니다.",
  noResults: "검색 결과가 없습니다.",
  filterAll: "전체",
  filterUnconfirmed: "미확인",
};

const FILTER_OPTIONS: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: L.filterAll },
  { value: "unconfirmed", label: L.filterUnconfirmed },
  { value: "pending", label: SALE_REVIEW_STATUS_LABELS.pending },
  { value: "needs_review", label: SALE_REVIEW_STATUS_LABELS.needs_review },
  { value: "on_hold", label: SALE_REVIEW_STATUS_LABELS.on_hold },
  { value: "confirmed", label: SALE_REVIEW_STATUS_LABELS.confirmed },
];

function enrichSaleComments(comments: SaleComment[], sales: SaleLike[]): EnrichedSaleComment[] {
  const byId = new Map<string, SaleLike>();
  sales.forEach((sale) => {
    if (sale.id != null) byId.set(String(sale.id), sale);
  });

  return comments.map((comment) => {
    const sale = byId.get(String(comment.saleId));
    return {
      ...comment,
      client: String(sale?.client || "").trim() || "-",
      site: String(sale?.site || "").trim() || "-",
      voucherDate: String(sale?.date || "").trim() || "-",
      voucherLabel: sale ? getSaleVoucherLabel(sale) : `#${comment.saleId}`,
      saleReviewStatus: sale ? resolveSaleReviewStatus(sale, comments) : null,
    };
  });
}

function matchesSearch(row: EnrichedSaleComment, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const statusLabel = row.saleReviewStatus ? SALE_REVIEW_STATUS_LABELS[row.saleReviewStatus] : "";
  const kindLabel = row.kind ? SALE_COMMENT_KIND_LABELS[row.kind] : "";
  return [
    row.body,
    row.authorName,
    row.client,
    row.site,
    row.voucherDate,
    row.voucherLabel,
    statusLabel,
    kindLabel,
  ].some((value) => String(value || "").toLowerCase().includes(needle));
}

function matchesReviewFilter(row: EnrichedSaleComment, filter: ReviewFilter) {
  if (filter === "all") return true;
  const status = row.saleReviewStatus;
  if (!status) return false;
  if (filter === "unconfirmed") return status === "pending" || status === "needs_review";
  return status === filter;
}

export function SaleCommentsPage({
  saleComments = [],
  sales = [],
  onOpenVoucher,
}: {
  saleComments?: SaleComment[];
  sales?: SaleLike[];
  onOpenVoucher?: (saleId: string | number) => void;
}) {
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

  const rows = useMemo(() => {
    const enriched = enrichSaleComments(saleComments, sales);
    return enriched
      .filter((row) => matchesSearch(row, search))
      .filter((row) => matchesReviewFilter(row, reviewFilter))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [saleComments, sales, search, reviewFilter]);

  const voucherCount = useMemo(() => new Set(saleComments.map((row) => row.saleId)).size, [saleComments]);

  const openRow = (row: EnrichedSaleComment) => {
    onOpenVoucher?.(row.saleId);
  };

  return (
    <div className="erp-page erp-sale-comments-page">
      <div className="erp-sales-sheet-head">
        <div>
          <h1 className="erp-sales-sheet-title">
            <MessageSquare size={22} />
            {L.pageTitle}
          </h1>
          <p className="erp-sales-sheet-desc">{L.pageDesc}</p>
        </div>
      </div>

      <div className="erp-sales-sheet-stats">
        <div className="erp-sales-sheet-stat">
          <span>{L.comments}</span>
          <b>{saleComments.length.toLocaleString()}</b>
        </div>
        <div className="erp-sales-sheet-stat">
          <span>{L.vouchers}</span>
          <b>{voucherCount.toLocaleString()}</b>
        </div>
        <div className="erp-sales-sheet-stat">
          <span>{L.visible}</span>
          <b>{rows.length.toLocaleString()}</b>
        </div>
      </div>

      <Card className="rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={reviewFilter === option.value ? "default" : "outline"}
                className="h-8 rounded-lg"
                onClick={() => setReviewFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <label className="erp-sale-comments-search mb-3 block">
            <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{L.search}</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                lang="ko"
                className="erp-input w-full pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={L.searchPlaceholder}
              />
            </div>
          </label>

          <TableExportSection fileName={L.exportFileName} title={L.pageTitle} disabled={rows.length === 0}>
            <MobileRecordList>
              {rows.length ? (
                rows.map((row) => (
                  <MobileRecordCard
                    key={row.id}
                    title={row.client}
                    subtitle={`${row.voucherDate} · ${row.site} · ${row.voucherLabel}`}
                    onClick={onOpenVoucher ? () => openRow(row) : undefined}
                    badges={
                      row.saleReviewStatus
                        ? [{ label: SALE_REVIEW_STATUS_LABELS[row.saleReviewStatus], tone: row.saleReviewStatus === "needs_review" ? "danger" as const : undefined }]
                        : undefined
                    }
                    fields={[
                      { label: L.author, value: row.authorName },
                      { label: L.createdAt, value: formatSaleCommentTime(row.createdAt), tone: "muted" },
                      { label: L.kind, value: row.kind ? SALE_COMMENT_KIND_LABELS[row.kind] : "-" },
                      { label: L.body, value: row.body },
                    ]}
                  />
                ))
              ) : (
                <MobileRecordCard empty emptyLabel={saleComments.length ? L.noResults : L.empty} />
              )}
            </MobileRecordList>

            <DesktopTableWrap>
              <table className="erp-table erp-table--md">
                <thead>
                  <tr>
                    <th className="text-left">{L.createdAt}</th>
                    <th className="text-left">{L.reviewStatus}</th>
                    <th className="text-left">{L.kind}</th>
                    <th className="text-left">{L.author}</th>
                    <th className="text-left">{L.body}</th>
                    <th className="text-left">{L.voucherDate}</th>
                    <th className="text-left">{L.client}</th>
                    <th className="text-left">{L.site}</th>
                    <th className="text-left">{L.voucherNo}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => {
                      const sale = sales.find((item) => String(item.id) === String(row.saleId));
                      return (
                        <tr
                          key={row.id}
                          className={onOpenVoucher ? "cursor-pointer hover:bg-slate-50" : ""}
                          onClick={onOpenVoucher ? () => openRow(row) : undefined}
                        >
                          <td className="whitespace-nowrap">{formatSaleCommentTime(row.createdAt)}</td>
                          <td>
                            <SaleReviewStatusBadge sale={sale} saleComments={saleComments} />
                          </td>
                          <td className="whitespace-nowrap">
                            {row.kind ? SALE_COMMENT_KIND_LABELS[row.kind] : "-"}
                          </td>
                          <td>{row.authorName}</td>
                          <td className="max-w-[24rem]">
                            <span className="erp-sale-comments-body">{row.body}</span>
                          </td>
                          <td className="whitespace-nowrap">{row.voucherDate}</td>
                          <td className="font-semibold">{row.client}</td>
                          <td>{row.site}</td>
                          <td className="whitespace-nowrap">{row.voucherLabel}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="erp-sales-sheet-empty">
                        {saleComments.length ? L.noResults : L.empty}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DesktopTableWrap>
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}
