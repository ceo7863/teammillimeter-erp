/**
 * Calendar finance status badges — collection and payout are independent.
 */
import { computeSaleGrossReceivable } from "./saleTaxTreatment";

export type CollectionFinanceStatus = "paid" | "partial" | "unpaid" | "prepaid" | "void";
export type PayoutFinanceStatus = "settled" | "partial" | "unpaid" | "advance" | "review";

export function collectionStatusLabel(status: CollectionFinanceStatus) {
  switch (status) {
    case "paid":
      return "완납";
    case "partial":
      return "부분입금";
    case "unpaid":
      return "미입금";
    case "prepaid":
      return "미배정 선수금";
    case "void":
      return "취소/비청구";
    default:
      return status;
  }
}

export function payoutStatusLabel(status: PayoutFinanceStatus) {
  switch (status) {
    case "settled":
      return "지급완료";
    case "partial":
      return "부분지급";
    case "unpaid":
      return "미지급";
    case "advance":
      return "선지급";
    case "review":
      return "검토 필요";
    default:
      return status;
  }
}

export function collectionStatusClass(status: CollectionFinanceStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "partial":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "unpaid":
      return "bg-rose-100 text-rose-800 border-rose-300";
    case "prepaid":
      return "bg-violet-100 text-violet-800 border-violet-300";
    default:
      return "bg-slate-100 text-slate-600 border-slate-300";
  }
}

export function payoutStatusClass(status: PayoutFinanceStatus) {
  switch (status) {
    case "settled":
      return "bg-sky-100 text-sky-800 border-sky-300";
    case "partial":
      return "bg-orange-100 text-orange-900 border-orange-300";
    case "unpaid":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "advance":
      return "bg-indigo-100 text-indigo-800 border-indigo-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

export function deriveCollectionStatus(billed: number, applied: number, prepaid = 0, cancelled = false): CollectionFinanceStatus {
  if (cancelled) return "void";
  const bill = Math.max(0, Math.round(Number(billed) || 0));
  const paid = Math.max(0, Math.round(Number(applied) || 0));
  if (bill <= 0 && prepaid > 0) return "prepaid";
  if (bill <= 0) return "void";
  if (paid <= 0) return prepaid > 0 ? "prepaid" : "unpaid";
  if (paid >= bill) return "paid";
  return "partial";
}

export type CalendarCollectionTone = "GREEN" | "AMBER" | "RED" | "NEUTRAL";

export type CanonicalSaleCollection = {
  billed: number;
  applied: number;
  outstanding: number;
  tone: CalendarCollectionTone;
};

type CanonicalSaleLike = {
  amount?: number;
  taxTreatment?: string | null;
  salesAmount?: number;
  arBilledAmount?: number;
  appliedAmount?: number;
  outstandingAmount?: number;
  paid?: number;
  cancelled?: boolean;
  arPaymentStatus?: string;
};

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * The one calendar collection formula, fed only by the Unified AR overlay
 * (`appliedAmount` / `outstandingAmount` from Receipt allocations + frozen legacy ledger).
 * Bank links, statement payment caches and front-end FIFO never change the tone.
 * GREEN: billed>0 and outstanding=0 · AMBER: applied>0 and outstanding>0 ·
 * RED: applied=0 and outstanding>0 · NEUTRAL: billed=0 or cancelled.
 */
export function resolveCanonicalSaleCollection(sale: CanonicalSaleLike): CanonicalSaleCollection {
  const billed = Math.max(
    0,
    finiteOrNull(sale.arBilledAmount) ??
      (finiteOrNull(sale.amount) != null ? computeSaleGrossReceivable(sale) : null) ??
      finiteOrNull(sale.salesAmount) ??
      0,
  );
  const cancelled = sale.cancelled === true || sale.arPaymentStatus === "cancelled";
  // Rows outside the unified overlay (offline demo data) fall back to the capped paid field.
  const applied = Math.max(0, finiteOrNull(sale.appliedAmount) ?? finiteOrNull(sale.paid) ?? 0);
  const outstanding = Math.max(0, finiteOrNull(sale.outstandingAmount) ?? billed - applied);
  let tone: CalendarCollectionTone;
  if (cancelled || billed <= 0) tone = "NEUTRAL";
  else if (outstanding <= 0) tone = "GREEN";
  else if (applied > 0) tone = "AMBER";
  else tone = "RED";
  return { billed, applied: Math.min(applied, billed), outstanding, tone };
}

export function calendarToneToCollectionStatus(tone: CalendarCollectionTone): CollectionFinanceStatus {
  switch (tone) {
    case "GREEN":
      return "paid";
    case "AMBER":
      return "partial";
    case "RED":
      return "unpaid";
    default:
      return "void";
  }
}

export function derivePayoutStatus(due: number, paid: number, advance = 0, review = false): PayoutFinanceStatus {
  if (review) return "review";
  const d = Math.max(0, Math.round(Number(due) || 0));
  const p = Math.max(0, Math.round(Number(paid) || 0));
  if (d <= 0 && advance > 0) return "advance";
  if (d <= 0) return "settled";
  if (p <= 0) return advance > 0 ? "advance" : "unpaid";
  if (p >= d) return "settled";
  return "partial";
}
