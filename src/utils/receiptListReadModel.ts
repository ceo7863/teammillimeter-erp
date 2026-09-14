/**
 * Receipt-centric list read model for 입금전표 history.
 * One row per posted Receipt — never hide fully allocated / cash / unallocatedAmount===0.
 * Includes unallocated receipts (allocationCount 0).
 */

import { receiptAllocationStatus } from "@/utils/allocationTargetPolicy";
import type { ReceiptAllocationRecord, ReceiptRecord } from "@/utils/receiptLedger";

export type ReceiptListDateBasis = "receiptDate" | "saleDate" | "createdAt";

export type ReceiptListRow = {
  receiptId: string;
  receiptNo: string;
  clientId: string;
  clientName: string;
  receiptDate: string;
  createdAt?: string;
  createdBy?: string;
  channel: string;
  source: string;
  /** Raw ledger status (posted/reversed) plus display helpers. */
  status: string;
  /** 미충당|부분충당|전액충당|선수금|확인 필요|취소 */
  displayStatus: string;
  grossAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  allocationCount: number;
  bankTransactionId?: string | null;
  identityOk: boolean;
  saleIds: Array<string | number>;
  minSaleDate?: string | null;
  maxSaleDate?: string | null;
  /** @deprecated alias of minSaleDate — kept for existing filters/UI */
  saleDateMin?: string;
  /** @deprecated alias of maxSaleDate */
  saleDateMax?: string;
  searchText?: string;
};

export type ReceiptListFilter = {
  startDate?: string;
  endDate?: string;
  dateBasis?: ReceiptListDateBasis;
  query?: string;
  client?: string;
  /** When set, keep matching row even if outside date range (for highlight nav). */
  highlightReceiptId?: string;
};

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function ymdFromIso(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function isOpenAllocation(row: ReceiptAllocationRecord) {
  if (!row) return false;
  if ((row as { auditOnly?: boolean }).auditOnly) return false;
  if ((row as { reversedEffectiveDate?: string }).reversedEffectiveDate) return false;
  if (row.status === "reversed") return false;
  return money(row.amount) > 0;
}

export function summarizeReceiptAmounts(
  receipt: ReceiptRecord,
  allocations: ReceiptAllocationRecord[] = [],
) {
  const grossAmount = money(receipt.grossAmount);
  const open = allocations.filter(
    (row) => String(row.receiptId) === String(receipt.id) && isOpenAllocation(row),
  );
  const allocatedAmount = open.reduce((sum, row) => sum + money(row.amount), 0);
  return {
    grossAmount,
    allocatedAmount,
    unallocatedAmount: Math.max(0, grossAmount - allocatedAmount),
    allocationCount: open.length,
  };
}

function resolveDisplayStatus(
  receipt: ReceiptRecord,
  gross: number,
  allocated: number,
  unallocated: number,
  identityOk: boolean,
) {
  if (receipt.status === "reversed" || receipt.reversedEffectiveDate) return "취소";
  if (!identityOk) return "확인 필요";
  return receiptAllocationStatus(gross, allocated, unallocated);
}

export function buildReceiptListRows(
  receipts: ReceiptRecord[] = [],
  allocations: ReceiptAllocationRecord[] = [],
  sales: Array<{ id?: string | number; date?: string }> = [],
  clients: Array<{ id?: string | number; name?: string }> = [],
): ReceiptListRow[] {
  const clientsById = new Map(clients.map((row) => [String(row.id), row]));
  const saleDateById = new Map(
    sales.filter((row) => row.id != null).map((row) => [String(row.id), String(row.date || "")]),
  );
  const openByReceipt = new Map<string, ReceiptAllocationRecord[]>();
  for (const row of allocations) {
    if (!isOpenAllocation(row)) continue;
    const key = String(row.receiptId);
    const list = openByReceipt.get(key) || [];
    list.push(row);
    openByReceipt.set(key, list);
  }

  /** reversalOfReceiptId rows are cancellation documents — omit from main list.
   *  Originals that were reversed show as 취소 via reversedEffectiveDate/status. */
  const reversedOriginalIds = new Set(
    (receipts || [])
      .filter((row) => row?.reversalOfReceiptId)
      .map((row) => String(row.reversalOfReceiptId)),
  );

  const rows: ReceiptListRow[] = [];
  for (const receipt of receipts) {
    if (!receipt || !receipt.id) continue;
    if (receipt.status === "draft") continue;
    if (receipt.reversalOfReceiptId) continue;

    const allocs = openByReceipt.get(String(receipt.id)) || [];
    const amounts = summarizeReceiptAmounts(receipt, allocs);
    const saleIds = allocs.map((row) => row.saleId).filter((id) => id != null && String(id) !== "");
    const saleDates = allocs
      .map((row) => saleDateById.get(String(row.saleId)) || "")
      .filter(Boolean)
      .sort();
    const minSaleDate = saleDates[0] || null;
    const maxSaleDate = saleDates[saleDates.length - 1] || null;
    const clientName = String(
      receipt.clientName || clientsById.get(String(receipt.clientId))?.name || "",
    ).trim();
    const createdAt = String(receipt.createdAt || "");
    const identityOk =
      amounts.grossAmount === amounts.allocatedAmount + amounts.unallocatedAmount;
    const isReversedOriginal =
      receipt.status === "reversed" ||
      Boolean(receipt.reversedEffectiveDate) ||
      reversedOriginalIds.has(String(receipt.id));
    const displayStatus = isReversedOriginal
      ? "취소"
      : resolveDisplayStatus(
          receipt,
          amounts.grossAmount,
          amounts.allocatedAmount,
          amounts.unallocatedAmount,
          identityOk,
        );
    const searchText = [
      receipt.receiptNo,
      clientName,
      receipt.clientId,
      amounts.grossAmount,
      amounts.allocatedAmount,
      amounts.unallocatedAmount,
      receipt.channel,
      receipt.receiptDate,
      createdAt,
      receipt.createdBy,
      receipt.source,
      receipt.bankTransactionId,
      receipt.status,
      displayStatus,
      ...saleIds,
    ]
      .map((part) => String(part ?? ""))
      .join(" ")
      .toLowerCase();

    rows.push({
      receiptId: String(receipt.id),
      receiptNo: String(receipt.receiptNo || receipt.id),
      clientId: String(receipt.clientId || ""),
      clientName,
      receiptDate: String(receipt.receiptDate || ""),
      createdAt,
      createdBy: String(receipt.createdBy || ""),
      channel: String(receipt.channel || ""),
      source: String(receipt.source || ""),
      status: String(receipt.status || ""),
      displayStatus,
      grossAmount: amounts.grossAmount,
      allocatedAmount: amounts.allocatedAmount,
      unallocatedAmount: amounts.unallocatedAmount,
      allocationCount: amounts.allocationCount,
      bankTransactionId:
        receipt.bankTransactionId == null || receipt.bankTransactionId === ""
          ? null
          : String(receipt.bankTransactionId),
      identityOk,
      saleIds,
      minSaleDate,
      maxSaleDate,
      saleDateMin: minSaleDate || "",
      saleDateMax: maxSaleDate || "",
      searchText,
    });
  }

  return rows.sort(
    (a, b) =>
      String(b.receiptDate).localeCompare(String(a.receiptDate)) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")) ||
      String(b.receiptNo).localeCompare(String(a.receiptNo)),
  );
}

function rowDateForBasis(row: ReceiptListRow, basis: ReceiptListDateBasis): string {
  if (basis === "createdAt") return ymdFromIso(row.createdAt);
  if (basis === "saleDate") {
    // Prefer sale dates when present; fall back to receiptDate so unallocated cash still appears.
    return row.minSaleDate || row.saleDateMin || row.receiptDate || "";
  }
  return row.receiptDate || "";
}

function rowMatchesDateRange(
  row: ReceiptListRow,
  basis: ReceiptListDateBasis,
  startDate: string,
  endDate: string,
) {
  if (!startDate && !endDate) return true;
  if (basis === "saleDate" && (row.minSaleDate || row.maxSaleDate || row.saleDateMin || row.saleDateMax)) {
    const min = row.minSaleDate || row.saleDateMin || row.maxSaleDate || row.saleDateMax || "";
    const max = row.maxSaleDate || row.saleDateMax || row.minSaleDate || row.saleDateMin || "";
    const startOk = startDate ? max >= startDate : true;
    const endOk = endDate ? min <= endDate : true;
    return startOk && endOk;
  }
  const date = rowDateForBasis(row, basis);
  if (!date) return !startDate && !endDate;
  const startOk = startDate ? date >= startDate : true;
  const endOk = endDate ? date <= endDate : true;
  return startOk && endOk;
}

export function filterReceiptListRows(
  rows: ReceiptListRow[] = [],
  filter: ReceiptListFilter = {},
): ReceiptListRow[] {
  const basis = filter.dateBasis || "receiptDate";
  const startDate = String(filter.startDate || "");
  const endDate = String(filter.endDate || "");
  const query = String(filter.query || "").trim().toLowerCase();
  const client = String(filter.client || "").trim();
  const highlightId = filter.highlightReceiptId ? String(filter.highlightReceiptId) : "";

  return rows
    .filter((row) => {
      if (highlightId && row.receiptId === highlightId) return true;
      if (client && row.clientName !== client && row.clientId !== client) return false;
      if (!rowMatchesDateRange(row, basis, startDate, endDate)) return false;
      if (query) {
        const hay = String(row.searchText || "").toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aDate = rowDateForBasis(a, basis);
      const bDate = rowDateForBasis(b, basis);
      return (
        String(bDate).localeCompare(String(aDate)) ||
        String(b.receiptDate).localeCompare(String(a.receiptDate)) ||
        String(b.receiptNo).localeCompare(String(a.receiptNo))
      );
    });
}

export const RECEIPT_LIST_DATE_BASIS_OPTIONS: Array<{
  value: ReceiptListDateBasis;
  label: string;
}> = [
  { value: "receiptDate", label: "입금일" },
  { value: "saleDate", label: "매출일" },
  { value: "createdAt", label: "등록일" },
];
