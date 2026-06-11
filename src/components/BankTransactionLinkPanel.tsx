import React, { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BankTransaction } from "@/utils/bankTransactions";
import { formatKRW } from "@/utils/companyLedger";
import {
  buildBankTransactionLinkCatalog,
  buildDefaultBankLinkDateRange,
  canLinkTaxInvoiceToTransaction,
  filterBankTransactionLinkCatalog,
  getTaxInvoiceUnsettledAmount,
  listBankTransactionsLinkedToInvoice,
  type BankTransactionLinkCatalogRow,
} from "@/utils/taxInvoiceLinkPanel";
import type { TaxInvoiceMatchContext } from "@/utils/bankTaxInvoiceLink";
import {
  formatTaxInvoiceDate,
  getTaxInvoiceFlowLabel,
  type TaxInvoice,
} from "@/utils/taxInvoices";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 200;

const L = {
  title: "\uD1B5\uC7A5 \uAC70\uB798 \uC5F0\uACB0",
  search: "\uAE08\uC561, \uAC70\uB798\uCC98, \uC801\uC694, \uBA54\uBAA8 \uAC80\uC0C9",
  txDate: "\uAC70\uB798\uC77C\uC2DC",
  counterparty: "\uAC70\uB798\uCC98",
  description: "\uC801\uC694",
  amount: "\uAC70\uB798\uAE08\uC561",
  add: "\uCD94\uAC00",
  unlinkOne: "\uD574\uC81C",
  linkedCount: (count: number) => `\uC5F0\uACB0 ${count}\uAC74`,
  unsettled: "\uBBF8\uC815\uC0B0 \uAE08\uC561",
  total: "\uD569\uACC4\uAE08\uC561",
  noUnsettled: "\uBBF8\uC815\uC0B0 \uAE08\uC561\uC774 \uC5C6\uC5B4\uC694",
  empty: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uD1B5\uC7A5 \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  loading: "\uD1B5\uC7A5 \uAC70\uB798 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
  unlink: "\uC804\uCCB4 \uD574\uC81C",
  count: (n: number) => `\uD1B5\uC7A5 ${n.toLocaleString("ko-KR")}\uAC74`,
  page: (page: number, total: number) => `${page} / ${total}`,
};

export type BankTransactionLinkPanelProps = {
  invoice: TaxInvoice;
  taxInvoices: TaxInvoice[];
  bankTransactions: BankTransaction[];
  preparing?: boolean;
  clients?: Array<{ name?: string; businessNo?: string; depositNameAliases?: string }>;
  workers?: Array<{ name?: string; businessNo?: string; depositNameAliases?: string }>;
  onClose: () => void;
  onLink: (txId: string) => void;
  onUnlink: (txId: string) => void;
  onUnlinkAll: () => void;
};

function BankTransactionLinkSearchField({
  onDebouncedChange,
  defaultQuery = "",
  inputKey,
}: {
  onDebouncedChange: (value: string) => void;
  defaultQuery?: string;
  inputKey: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onDebouncedChangeRef = useRef(onDebouncedChange);
  onDebouncedChangeRef.current = onDebouncedChange;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let timer = 0;
    const handleInput = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        onDebouncedChangeRef.current(input.value);
      }, SEARCH_DEBOUNCE_MS);
    };
    input.addEventListener("input", handleInput);
    onDebouncedChangeRef.current(defaultQuery);
    return () => {
      window.clearTimeout(timer);
      input.removeEventListener("input", handleInput);
    };
  }, [defaultQuery, inputKey]);

  return (
    <div className="erp-tax-invoice-link-panel__search">
      <Search size={16} className="erp-tax-invoice-link-panel__search-icon" aria-hidden="true" />
      <input
        key={inputKey}
        ref={inputRef}
        type="search"
        defaultValue={defaultQuery}
        autoComplete="off"
        spellCheck={false}
        placeholder={L.search}
        className="erp-tax-invoice-link-panel__search-input"
      />
    </div>
  );
}

const BankTransactionLinkHeader = memo(function BankTransactionLinkHeader({
  invoice,
  linkedCount,
  unsettledAmount,
  onClose,
  onUnlinkAll,
}: {
  invoice: TaxInvoice;
  linkedCount: number;
  unsettledAmount: number;
  onClose: () => void;
  onUnlinkAll: () => void;
}) {
  return (
    <div className="erp-tax-invoice-link-panel__head">
      <div>
        <h2 className="erp-text-section font-bold text-slate-900">{L.title}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {formatTaxInvoiceDate(invoice.issueDate)} {"\u00B7"} {getTaxInvoiceFlowLabel(invoice.flowType)} {"\u00B7"}{" "}
          <span className="font-semibold text-slate-900">{invoice.client}</span>
          {" \u00B7 "}
          {L.total} <span className="font-bold text-slate-900">{formatKRW(invoice.totalAmount)}</span>
          {" \u00B7 "}
          {L.unsettled} <span className="font-bold text-amber-700">{formatKRW(unsettledAmount)}</span>
          {linkedCount ? (
            <span className="ml-2 font-semibold text-blue-700">{L.linkedCount(linkedCount)}</span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {linkedCount ? (
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onUnlinkAll}>
            {L.unlink}
          </Button>
        ) : null}
        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
});

function BankTransactionLinkResultsTable({
  invoice,
  rows,
  bankTransactions,
  taxInvoices,
  preparing,
  matchContext = {},
  onLink,
  onUnlink,
}: {
  invoice: TaxInvoice;
  rows: BankTransactionLinkCatalogRow[];
  bankTransactions: BankTransaction[];
  taxInvoices: TaxInvoice[];
  preparing?: boolean;
  matchContext?: TaxInvoiceMatchContext;
  onLink: (txId: string) => void;
  onUnlink: (txId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const unsettledAmount = useMemo(
    () => getTaxInvoiceUnsettledAmount(invoice, bankTransactions, taxInvoices),
    [invoice, bankTransactions, taxInvoices],
  );

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  );

  return (
    <div className="erp-tax-invoice-link-panel__main">
      <div className="erp-tax-invoice-link-panel__table-wrap overflow-auto rounded-xl border border-slate-200">
        <table className="erp-table erp-tax-invoice-link-panel__table w-full">
          <thead>
            <tr>
              <th>{L.txDate}</th>
              <th>{L.counterparty}</th>
              <th>{L.description}</th>
              <th className="text-right">{L.amount}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {preparing ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  {L.loading}
                </td>
              </tr>
            ) : !pageRows.length ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  {L.empty}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const canLink =
                  !row.isLinked &&
                  canLinkTaxInvoiceToTransaction(row.tx, invoice, unsettledAmount, matchContext);

                return (
                  <tr key={row.tx.id} className={row.isLinked ? "bg-blue-50/70" : undefined}>
                    <td className="whitespace-nowrap font-medium text-slate-800">{row.dateLabel}</td>
                    <td className="font-semibold text-slate-900">{row.counterpartyLabel}</td>
                    <td className="max-w-[14rem] truncate text-slate-700" title={row.descriptionLabel}>
                      {row.descriptionLabel}
                    </td>
                    <td className="text-right font-semibold text-slate-900">{row.amountLabel}</td>
                    <td className="text-right">
                      {row.isLinked ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          onClick={() => onUnlink(row.tx.id)}
                        >
                          {L.unlinkOne}
                        </button>
                      ) : canLink ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                          onClick={() => onLink(row.tx.id)}
                        >
                          {L.add}
                        </button>
                      ) : unsettledAmount <= 0 ? (
                        <span className="text-xs text-slate-400">{L.noUnsettled}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="erp-tax-invoice-link-panel__footer">
        <span>{preparing ? L.loading : L.count(rows.length)}</span>
        <div className="flex items-center gap-2">
          <span>{L.page(safePage, totalPages)}</span>
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-1 text-slate-600 disabled:opacity-40"
            disabled={safePage <= 1 || preparing}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-1 text-slate-600 disabled:opacity-40"
            disabled={safePage >= totalPages || preparing}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BankTransactionLinkFilterBody({
  invoice,
  taxInvoices,
  bankTransactions,
  preparing,
  clients = [],
  workers = [],
  onLink,
  onUnlink,
}: Pick<
  BankTransactionLinkPanelProps,
  "invoice" | "taxInvoices" | "bankTransactions" | "preparing" | "clients" | "workers" | "onLink" | "onUnlink"
>) {
  const defaultRange = useMemo(() => buildDefaultBankLinkDateRange(invoice), [invoice]);
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const defaultSearch = String(invoice.client || "").trim();
  const [debouncedSearch, setDebouncedSearch] = useState(defaultSearch);
  const matchContext = useMemo(() => ({ clients, workers }), [clients, workers]);

  const handleDebouncedSearch = useCallback((value: string) => {
    startTransition(() => setDebouncedSearch(value));
  }, []);

  const catalog = useMemo(() => {
    if (preparing) return [];
    return buildBankTransactionLinkCatalog({
      invoice,
      bankTransactions,
      startDate,
      endDate,
    });
  }, [preparing, invoice, bankTransactions, startDate, endDate]);

  const rows = useMemo(
    () =>
      preparing
        ? []
        : filterBankTransactionLinkCatalog(catalog, debouncedSearch, invoice, bankTransactions, taxInvoices, matchContext),
    [catalog, debouncedSearch, preparing, invoice, bankTransactions, taxInvoices, matchContext],
  );

  return (
    <div className="erp-tax-invoice-link-panel__body">
      <aside className="erp-tax-invoice-link-panel__sidebar">
        <label className="erp-tax-invoice-link-panel__date-field">
          <span>{"\uAE30\uAC04"}</span>
          <div className="erp-tax-invoice-link-panel__date-range">
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="erp-input rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
            <span>~</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="erp-input rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </div>
        </label>

        <BankTransactionLinkSearchField
          key={`${invoice.id}:${defaultSearch}`}
          inputKey={`${invoice.id}:${defaultSearch}`}
          defaultQuery={defaultSearch}
          onDebouncedChange={handleDebouncedSearch}
        />
      </aside>

      <BankTransactionLinkResultsTable
        invoice={invoice}
        rows={rows}
        bankTransactions={bankTransactions}
        taxInvoices={taxInvoices}
        preparing={preparing}
        matchContext={matchContext}
        onLink={onLink}
        onUnlink={onUnlink}
      />
    </div>
  );
}

export function BankTransactionLinkPanel({
  invoice,
  taxInvoices,
  bankTransactions,
  preparing,
  clients,
  workers,
  onClose,
  onLink,
  onUnlink,
  onUnlinkAll,
}: BankTransactionLinkPanelProps) {
  const linkedCount = useMemo(
    () => listBankTransactionsLinkedToInvoice(invoice.id, bankTransactions).length,
    [invoice.id, bankTransactions],
  );
  const unsettledAmount = useMemo(
    () => getTaxInvoiceUnsettledAmount(invoice, bankTransactions, taxInvoices),
    [invoice, bankTransactions, taxInvoices],
  );

  return (
    <div className="erp-tax-invoice-link-panel" role="dialog" aria-modal="true" aria-label={L.title}>
      <BankTransactionLinkHeader
        invoice={invoice}
        linkedCount={linkedCount}
        unsettledAmount={unsettledAmount}
        onClose={onClose}
        onUnlinkAll={onUnlinkAll}
      />
      <BankTransactionLinkFilterBody
        invoice={invoice}
        taxInvoices={taxInvoices}
        bankTransactions={bankTransactions}
        preparing={preparing}
        clients={clients}
        workers={workers}
        onLink={onLink}
        onUnlink={onUnlink}
      />
    </div>
  );
}
