/**
 * Canonical Receipt detail drawer — one Receipt, its allocations, identity check.
 */
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { formatKRW } from "@/utils/receivables";
import type { ReceiptAllocationRecord, ReceiptRecord } from "@/utils/receiptLedger";
import { summarizeReceiptAmounts } from "@/utils/receiptListReadModel";

const CHANNEL_LABEL: Record<string, string> = {
  bank: "법인통장",
  cash: "현금",
  personal_account: "개인계좌",
  other: "기타",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "임시",
  posted: "전기",
  reversed: "취소",
};

export type ReceiptDetailDrawerProps = {
  open: boolean;
  onClose: () => void;
  receipt: ReceiptRecord | null;
  allocations?: ReceiptAllocationRecord[];
  sales?: Array<{
    id?: string | number;
    date?: string;
    voucherNo?: string;
    site?: string;
    client?: string;
  }>;
  onOpenSale?: (saleId: string | number) => void;
  onOpenClientLedger?: (clientId: string | number, clientName?: string) => void;
};

export function ReceiptDetailDrawer({
  open,
  onClose,
  receipt,
  allocations = [],
  sales = [],
  onOpenSale,
  onOpenClientLedger,
}: ReceiptDetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const saleById = useMemo(() => {
    const map = new Map<string, (typeof sales)[number]>();
    for (const sale of sales) {
      if (sale?.id != null) map.set(String(sale.id), sale);
    }
    return map;
  }, [sales]);

  const receiptAllocations = useMemo(() => {
    if (!receipt) return [];
    return allocations
      .filter((row) => String(row.receiptId) === String(receipt.id) && row.status === "posted")
      .slice()
      .sort(
        (a, b) =>
          String(saleById.get(String(a.saleId))?.date || "").localeCompare(
            String(saleById.get(String(b.saleId))?.date || ""),
          ) || String(a.saleId).localeCompare(String(b.saleId)),
      );
  }, [allocations, receipt, saleById]);

  const amounts = useMemo(
    () => (receipt ? summarizeReceiptAmounts(receipt, receiptAllocations) : null),
    [receipt, receiptAllocations],
  );

  if (!open || !receipt || !amounts) return null;

  const identityOk = amounts.grossAmount === amounts.allocatedAmount + amounts.unallocatedAmount;

  const modal = (
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
      data-receipt-detail-drawer="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal max-w-3xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-detail-drawer-title"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 id="receipt-detail-drawer-title" className="text-base font-bold text-slate-900 md:text-lg">
              입금전표 {receipt.receiptNo || receipt.id}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {receipt.clientName || receipt.clientId} · 입금일 {receipt.receiptDate || "-"}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={onClose}>
            닫기
          </Button>
        </div>
        {onOpenClientLedger && receipt.clientId != null ? (
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg text-xs"
              onClick={() => onOpenClientLedger(receipt.clientId as string | number, receipt.clientName)}
            >
              거래처 수금원장 열기
            </Button>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-4">
          <div>
            <div className="font-semibold text-slate-500">거래처</div>
            <div className="font-bold text-slate-900">{receipt.clientName || "-"}</div>
            <div className="text-slate-500">{receipt.clientId || ""}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">입금일 / 등록</div>
            <div className="font-bold text-slate-900">{receipt.receiptDate || "-"}</div>
            <div className="text-slate-500">{receipt.createdAt ? String(receipt.createdAt).slice(0, 19) : "-"}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">수단 / 상태</div>
            <div className="font-bold text-slate-900">
              {CHANNEL_LABEL[String(receipt.channel)] || receipt.channel}
            </div>
            <div className="text-slate-500">{STATUS_LABEL[String(receipt.status)] || receipt.status}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">등록자 / 출처</div>
            <div className="font-bold text-slate-900">{receipt.createdBy || "-"}</div>
            <div className="text-slate-500">{receipt.source || "-"}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">입금액</div>
            <div className="font-bold text-emerald-700">{formatKRW(amounts.grossAmount)}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">배정</div>
            <div className="font-bold text-slate-900">{formatKRW(amounts.allocatedAmount)}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">미배정</div>
            <div className="font-bold text-violet-700">{formatKRW(amounts.unallocatedAmount)}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-500">항등식</div>
            <div className={`font-bold ${identityOk ? "text-emerald-700" : "text-red-600"}`}>
              {identityOk ? "gross = alloc + unalloc" : "불일치"}
            </div>
            {receipt.bankTransactionId ? (
              <div className="truncate text-slate-500" title={String(receipt.bankTransactionId)}>
                통장 {String(receipt.bankTransactionId)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-sm font-bold text-slate-800">배정 내역</h3>
          <div className="erp-table-wrap max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="erp-table erp-table--lg">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">매출일</th>
                  <th className="text-left">전표번호</th>
                  <th className="text-left">현장</th>
                  <th className="text-left">saleId</th>
                  <th className="text-right">배정액</th>
                  <th className="text-left">상태</th>
                </tr>
              </thead>
              <tbody>
                {receiptAllocations.map((row) => {
                  const sale = saleById.get(String(row.saleId));
                  return (
                    <tr
                      key={row.id}
                      className={`border-t ${onOpenSale ? "cursor-pointer hover:bg-slate-50" : ""}`}
                      onClick={() => onOpenSale?.(row.saleId)}
                    >
                      <td>{sale?.date || "-"}</td>
                      <td className="font-medium">{sale?.voucherNo || "-"}</td>
                      <td>{row.site || sale?.site || "-"}</td>
                      <td className="text-slate-500">{String(row.saleId)}</td>
                      <td className="text-right font-semibold text-emerald-700">{formatKRW(row.amount)}</td>
                      <td>{row.status}</td>
                    </tr>
                  );
                })}
                {receiptAllocations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      배정된 매출이 없습니다. (미충당/선수금)
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default ReceiptDetailDrawer;
