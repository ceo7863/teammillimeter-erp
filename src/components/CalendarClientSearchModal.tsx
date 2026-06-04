import React, { memo, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { formatKRW } from "@/utils/companyLedger";
import { normalizeClientCalendarName } from "@/utils/clientCalendarStats";
import {
  buildCalendarClientSearchHaystacks,
  filterCalendarClientSearchRows,
  type CalendarClientSearchRow,
} from "@/utils/calendarClientSearch";

const L = {
  title: "\uAC70\uB798\uCC98 \uAC80\uC0C9",
  descSuffix: " \uAE30\uC900 \u00B7 \uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD558\uBA74 \uD574\uB2F9 \uAC70\uB798\uCC98 \uC804\uD45C\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4.",
  closeAria: "\uAC70\uB798\uCC98 \uAC80\uC0C9 \uB2EB\uAE30",
  searchPlaceholder:
    "\uAC70\uB798\uCC98\uBA85, \uB2F4\uB2F9\uC790, \uC5F0\uB77D\uCC98, \uC608\uAE08\uC8FC \uBCC4\uCE6D \uAC80\uC0C9",
  clientColumn: "\uAC70\uB798\uCC98",
  salesColumnSuffix: " \uB9E4\uCD9C",
  truncatedHintPrefix:
    "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uB9CE\uC544 \uC0C1\uC704 ",
  truncatedHintSuffix:
    "\uAC74\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uAC80\uC0C9\uC5B4\uB97C \uB354 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  countSuffix: "\uAC74",
  unpaidPrefix: " \u00B7 \uBBF8\uC218 ",
  paidLabel: " \u00B7 \uC785\uAE08\uC644\uB8CC",
  noMonthVouchers: "\uC774\uBC88 \uB2EC \uC804\uD45C \uC5C6\uC74C",
  emptySearch: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyRows: "\uD45C\uC2DC\uD560 \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

type CalendarClientSearchModalProps = {
  open: boolean;
  monthLabel: string;
  rows: CalendarClientSearchRow[];
  clients: Array<{ name?: string; manager?: string; phone?: string; depositNameAliases?: unknown }>;
  selectedClient: string | null;
  onClose: () => void;
  onSelect: (row: CalendarClientSearchRow) => void;
};

function CalendarClientSearchModalComponent({
  open,
  monthLabel,
  rows,
  clients,
  selectedClient,
  onClose,
  onSelect,
}: CalendarClientSearchModalProps) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [sort, setSort] = useState<"name" | "sales">("name");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setAppliedQuery("");
      setSort("name");
      return;
    }
    const timer = window.setTimeout(() => setAppliedQuery(query.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const haystacks = useMemo(() => buildCalendarClientSearchHaystacks(rows, clients), [rows, clients]);

  const { visibleRows, truncated } = useMemo(() => {
    const result = filterCalendarClientSearchRows(rows, haystacks, appliedQuery, sort);
    return { visibleRows: result.rows, truncated: result.truncated };
  }, [rows, haystacks, appliedQuery, sort]);

  if (!open) return null;

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--calendar-client-search"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-client-search-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="calendar-client-search-title" className="text-base font-bold text-slate-900 md:text-lg">
              {L.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {monthLabel}
              {L.descSuffix}
            </p>
          </div>
          <button type="button" className="erp-calendar-nav-btn shrink-0" onClick={onClose} aria-label={L.closeAria}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex max-w-xl items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
          <Search size={18} className="text-slate-400" />
          <input
            lang="ko"
            className="erp-input w-full bg-transparent outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={L.searchPlaceholder}
            autoFocus
          />
        </div>

        <div className="erp-client-calendar-client-list mt-4">
          <div className="erp-client-calendar-client-list-head">
            <div className="erp-client-calendar-client-list-head-name">
              <button
                type="button"
                className={`erp-pivot-sort-btn erp-client-calendar-sort-btn ${sort === "name" ? "is-active" : ""}`}
                onClick={() => setSort("name")}
              >
                {L.clientColumn}
                {sort === "name" ? <ArrowUp size={12} aria-hidden="true" /> : null}
              </button>
            </div>
            <div className="erp-client-calendar-client-list-head-amounts">
              <button
                type="button"
                className={`erp-pivot-sort-btn erp-client-calendar-sort-btn ${sort === "sales" ? "is-active" : ""}`}
                onClick={() => setSort("sales")}
              >
                {monthLabel}
                {L.salesColumnSuffix}
                {sort === "sales" ? <ArrowDown size={12} aria-hidden="true" /> : null}
              </button>
            </div>
          </div>

          {truncated ? (
            <p className="px-1 pb-2 text-xs font-medium text-amber-700">
              {L.truncatedHintPrefix}
              {visibleRows.length}
              {L.truncatedHintSuffix}
            </p>
          ) : null}

          <div className="erp-client-calendar-client-list-body">
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <button
                  key={row.client}
                  type="button"
                  className={`erp-client-calendar-client-row${selectedClient === normalizeClientCalendarName(row.client) ? " is-selected" : ""}`}
                  onClick={() => onSelect(row)}
                >
                  <div className="erp-client-calendar-client-row-inner">
                    <span className="erp-client-calendar-client-row-name">{row.client}</span>
                    <div className="erp-client-calendar-client-row-amounts">
                      <span className="erp-client-calendar-client-row-sales">
                        {row.monthCount > 0 ? formatKRW(row.monthBill) : "-"}
                      </span>
                      <span className="erp-client-calendar-client-row-sub">
                        {row.monthCount > 0 ? (
                          <>
                            {row.monthCount}
                            {L.countSuffix}
                            {row.monthUnpaid > 0 ? (
                              <span className="is-unpaid">
                                {L.unpaidPrefix}
                                {formatKRW(row.monthUnpaid)}
                              </span>
                            ) : (
                              <span className="is-paid">{L.paidLabel}</span>
                            )}
                          </>
                        ) : (
                          <span className="is-zero">{L.noMonthVouchers}</span>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <p className="col-span-full px-1 py-6 text-center text-sm text-slate-500">
                {appliedQuery ? L.emptySearch : L.emptyRows}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const CalendarClientSearchModal = memo(CalendarClientSearchModalComponent);
