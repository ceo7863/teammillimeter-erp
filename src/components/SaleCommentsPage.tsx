import React, { useMemo, useState } from "react";
import { MessageSquare, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TableExportSection } from "@/components/TableExportSection";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import { formatSaleCommentTime, type SaleComment } from "@/utils/saleComments";
import { getSaleVoucherLabel } from "@/utils/saleVoucherNo";

type SaleLike = {
  id?: string | number;
  client?: string;
  site?: string;
  date?: string;
  voucherNo?: string | number;
};

type EnrichedSaleComment = SaleComment & {
  client: string;
  site: string;
  voucherDate: string;
  voucherLabel: string;
};

const L = {
  pageTitle: "\uC804\uD45C \uCF54\uBA58\uD2B8",
  pageDesc: "\uB9E4\uCD9C \uC804\uD45C\uC5D0 \uB0A8\uAE34 \uCF54\uBA58\uD2B8\uB97C \uBAA8\uC544 \uBCF4\uACE0, \uD589\uC744 \uD074\uB9AD\uD558\uBA74 \uD574\uB2F9 \uC804\uD45C\uB97C \uC5F4\uC2B5\uB2C8\uB2E4.",
  comments: "\uCF54\uBA58\uD2B8",
  vouchers: "\uC804\uD45C",
  visible: "\uD45C\uC2DC",
  search: "\uAC80\uC0C9",
  searchPlaceholder: "\uC791\uC131\uC790, \uAC70\uB798\uCC98, \uD604\uC7A5, \uCF54\uBA58\uD2B8, \uC804\uD45C\uBC88\uD638",
  exportFileName: "\uC804\uD45C\uCF54\uBA58\uD2B8",
  author: "\uC791\uC131\uC790",
  createdAt: "\uC791\uC131\uC77C\uC2DC",
  body: "\uCF54\uBA58\uD2B8",
  voucherDate: "\uC804\uD45C\uC77C\uC790",
  client: "\uAC70\uB798\uCC98",
  site: "\uD604\uC7A5",
  voucherNo: "\uC804\uD45C\uBC88\uD638",
  empty: "\uB4F1\uB85D\uB41C \uCF54\uBA58\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  noResults: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

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
    };
  });
}

function matchesSearch(row: EnrichedSaleComment, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    row.body,
    row.authorName,
    row.client,
    row.site,
    row.voucherDate,
    row.voucherLabel,
  ].some((value) => String(value || "").toLowerCase().includes(needle));
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

  const rows = useMemo(() => {
    const enriched = enrichSaleComments(saleComments, sales);
    return enriched
      .filter((row) => matchesSearch(row, search))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [saleComments, sales, search]);

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
                    subtitle={`${row.voucherDate} \u00B7 ${row.site} \u00B7 ${row.voucherLabel}`}
                    onClick={onOpenVoucher ? () => openRow(row) : undefined}
                    fields={[
                      { label: L.author, value: row.authorName },
                      { label: L.createdAt, value: formatSaleCommentTime(row.createdAt), tone: "muted" },
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
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className={onOpenVoucher ? "cursor-pointer hover:bg-slate-50" : ""}
                        onClick={onOpenVoucher ? () => openRow(row) : undefined}
                      >
                        <td className="whitespace-nowrap">{formatSaleCommentTime(row.createdAt)}</td>
                        <td>{row.authorName}</td>
                        <td className="max-w-[24rem]">
                          <span className="erp-sale-comments-body">{row.body}</span>
                        </td>
                        <td className="whitespace-nowrap">{row.voucherDate}</td>
                        <td className="font-semibold">{row.client}</td>
                        <td>{row.site}</td>
                        <td className="whitespace-nowrap">{row.voucherLabel}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="erp-sales-sheet-empty">
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
