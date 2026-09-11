/**
 * Calendar finance status badges — collection and payout are independent.
 */
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
