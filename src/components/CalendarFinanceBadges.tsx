/**
 * Compact collection / payout status badges for calendar day cells.
 */
import {
  calendarToneToCollectionStatus,
  collectionStatusClass,
  collectionStatusLabel,
  deriveCollectionStatus,
  payoutStatusClass,
  payoutStatusLabel,
  type CalendarCollectionTone,
  type CollectionFinanceStatus,
  type PayoutFinanceStatus,
} from "@/utils/calendarFinanceStatus";

/** Separate from the sale tone: the client holds Receipt cash not yet allocated to a sale. */
export const UNAPPLIED_CREDIT_BADGE_LABEL = "미배정 입금 있음";

export function UnappliedCreditBadge() {
  return (
    <span
      className="erp-calendar-unapplied-credit inline-flex items-center rounded border border-violet-300 bg-violet-50 px-1 py-px text-[10px] font-semibold leading-tight text-violet-800"
      title="거래처에 아직 매출에 배정되지 않은 입금전표가 있습니다."
    >
      {UNAPPLIED_CREDIT_BADGE_LABEL}
    </span>
  );
}

export function calendarDayToneToCollectionStatus(
  tone: string | null | undefined,
): CollectionFinanceStatus | null {
  if (tone === "paid") return "paid";
  if (tone === "unpaid") return "unpaid";
  if (tone === "mixed") return "partial";
  return null;
}

/** Day-level collection status from calendar cell stats. */
export function resolveDayCollectionStatus(stats: {
  count?: number;
  entries?: Array<{ hasUnpaid?: boolean; isPartialPaid?: boolean; paid?: number; unpaid?: number; tone?: string }>;
} | null | undefined): CollectionFinanceStatus | null {
  if (!stats?.count) return null;
  const entries = (stats.entries || []).filter((entry) => entry.tone !== "NEUTRAL");
  if (!entries.length) return null;
  const unpaidOnlyCount = entries.filter((entry) => entry.hasUnpaid).length;
  const partialCount = entries.filter((entry) => entry.isPartialPaid).length;
  if (unpaidOnlyCount === 0 && partialCount === 0) return "paid";
  if (unpaidOnlyCount === entries.length) return "unpaid";
  return "partial";
}

export function resolveEntryCollectionStatus(entry: {
  paid?: number;
  unpaid?: number;
  tone?: CalendarCollectionTone;
}): CollectionFinanceStatus {
  if (entry.tone) return calendarToneToCollectionStatus(entry.tone);
  const applied = Math.max(0, Math.round(Number(entry.paid) || 0));
  const unpaid = Math.max(0, Math.round(Number(entry.unpaid) || 0));
  return deriveCollectionStatus(applied + unpaid, applied);
}

export function collectionAriaLabel(status: CollectionFinanceStatus | null | undefined): string {
  return status ? collectionStatusLabel(status) : "";
}

export function CalendarFinanceBadges({
  collection,
  collectionStatus,
  payout,
}: {
  collection?: CollectionFinanceStatus | null;
  /** Alias used by CalendarPage day cells */
  collectionStatus?: CollectionFinanceStatus | null;
  payout?: PayoutFinanceStatus | null;
}) {
  const resolvedCollection = collection ?? collectionStatus ?? null;
  if (!resolvedCollection && !payout) return null;
  return (
    <span className="erp-calendar-finance-badges inline-flex flex-wrap items-center gap-0.5">
      {resolvedCollection ? (
        <span
          className={`inline-flex items-center rounded border px-1 py-px text-[10px] font-semibold leading-tight ${collectionStatusClass(resolvedCollection)}`}
        >
          {collectionStatusLabel(resolvedCollection)}
        </span>
      ) : null}
      {payout ? (
        <span
          className={`inline-flex items-center rounded border px-1 py-px text-[10px] font-semibold leading-tight ${payoutStatusClass(payout)}`}
        >
          {payoutStatusLabel(payout)}
        </span>
      ) : null}
    </span>
  );
}

export default CalendarFinanceBadges;
