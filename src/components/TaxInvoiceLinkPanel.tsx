import React, { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BankTransaction } from "@/utils/bankTransactions";
import { getBankTxClassifiedAmount } from "@/utils/bankTaxInvoiceLink";
import { formatKRW } from "@/utils/companyLedger";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  buildDefaultTaxInvoiceLinkDateRange,
  buildTaxInvoiceLinkCatalog,
  filterTaxInvoiceLinkCatalog,
  formatTaxInvoiceBusinessNo,
  resolveDefaultTaxInvoiceFlowFilter,
  type TaxInvoiceLinkCatalogRow,
  type TaxInvoiceLinkedPaymentIndex,
} from "@/utils/taxInvoiceLinkPanel";
import type { TaxInvoice, TaxInvoiceFlowType } from "@/utils/taxInvoices";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 200;

const L = {
  title: "\uC138\uAE08\uACC4\uC0B0\uC11C \uC99D\uBE59 \uC5F0\uACB0",
  sales: "\uB9E4\uCD9C",
  purchase: "\uB9E4\uC785",
  search: "\uAE08\uC561, \uD488\uBAA9, \uAC70\uB798\uCC98, \uC0AC\uC5C5\uC790\uBC88\uD638 \uAC80\uC0C9",
  issueDate: "\uBC1C\uAE09\uC77C\uC790",
  supplier: "\uACF5\uAE09\uD558\uB294\uC790",
  recipient: "\uACF5\uAE09\uBC1B\uB294\uC790",
  item: "\uB300\uD45C\uD488\uBAA9",
  supply: "\uACF5\uAE09\uAC00\uC561",
  vat: "\uC138\uC561",
  total: "\uD569\uACC4\uAE08\uC561",
  unsettled: "\uBBF8\uC815\uC0B0 \uAE08\uC561",
  add: "\uCD94\uAC00",
  linked: "\uC5F0\uACB0\uB428",
  noUnsettled: "\uBBF8\uC815\uC0B0 \uAE08\uC561\uC774 \uC5C6\uC5B4\uC694",
  empty: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uC138\uAE08\uACC4\uC0B0\uC11C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  txAmount: "\uAC70\uB798 \uAE08\uC561",
  unlink: "\uC5F0\uACB0 \uD574\uC81C",
  issueHint: "\uC774 \uAC70\uB798\uB0B4\uC5ED\uC5D0 \uB300\uD574 \uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uAE09",
  count: (n: number) => `\uC138\uAE08\uACC4\uC0B0\uC11C ${n.toLocaleString("ko-KR")}\uAC74`,
  page: (page: number, total: number) => `${page} / ${total}`,
};

export type TaxInvoiceLinkPanelProps = {
  tx: BankTransaction;
  taxInvoices: TaxInvoice[];
  linkedPaymentIndex: TaxInvoiceLinkedPaymentIndex;
  excludedIds: Set<string>;
  companyProfile?: CompanyProfile;
  linkedInvoiceId?: string;
  onClose: () => void;
  onLink: (invoiceId: string | undefined) => void;
  onNavigateToTaxInvoice?: () => void;
};

function formatTxAt(value: string) {
  const raw = String(value || "");
  if (!raw) return "-";
  const date = raw.slice(0, 10);
  const time = raw.slice(11, 16);
  return time ? `${date.slice(2).replace(/-/g, "-")} ${time}` : date.slice(2).replace(/-/g, "-");
}

function TaxInvoiceLinkSearchField({ onDebouncedChange }: { onDebouncedChange: (value: string) => void }) {
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
    return () => {
      window.clearTimeout(timer);
      input.removeEventListener("input", handleInput);
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="search"
      defaultValue=""
      autoComplete="off"
      spellCheck={false}
      placeholder={L.search}
      className="erp-input w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
    />
  );
}

type TaxInvoiceLinkResultsProps = {
  tx: BankTransaction;
  rows: TaxInvoiceLinkCatalogRow[];
  linkedInvoiceId?: string;
  ourCompanyName: string;
  ourBusinessNo: string;
  onLink: (invoiceId: string | undefined) => void;
};

const TaxInvoiceLinkResults = memo(function TaxInvoiceLinkResults({
  tx,
  rows,
  linkedInvoiceId,
  ourCompanyName,
  ourBusinessNo,
  onLink,
}: TaxInvoiceLinkResultsProps) {
  const [page, setPage] = useState(1);
  const txIsWithdrawal = Number(tx.withdrawal || 0) > 0;
  const txIsDeposit = Number(tx.deposit || 0) > 0;

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
              <th>{L.issueDate}</th>
              <th>{L.supplier}</th>
              <th>{L.recipient}</th>
              <th>{L.item}</th>
              <th className="text-right">{L.supply}</th>
              <th className="text-right">{L.vat}</th>
              <th className="text-right">{L.total}</th>
              <th className="text-right">{L.unsettled}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!pageRows.length ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-sm text-slate-500">
                  {L.empty}
                </td>
              </tr>
            ) : (
              pageRows.map(({ invoice, unsettledAmount }) => {
                const isLinked = linkedInvoiceId === invoice.id;
                const supplierName = invoice.flowType === "purchase" ? invoice.client : ourCompanyName;
                const supplierBiz = invoice.flowType === "purchase" ? invoice.businessNo : ourBusinessNo;
                const recipientName = invoice.flowType === "purchase" ? ourCompanyName : invoice.client;
                const recipientBiz = invoice.flowType === "purchase" ? ourBusinessNo : invoice.businessNo;
                const canLink =
                  unsettledAmount > 0 &&
                  ((invoice.flowType === "purchase" && txIsWithdrawal) ||
                    (invoice.flowType === "sales" && txIsDeposit));

                return (
                  <tr key={invoice.id} className={isLinked ? "bg-blue-50/70" : undefined}>
                    <td className="whitespace-nowrap font-medium text-slate-800">{invoice.issueDate}</td>
                    <td>
                      <div className="space-y-0.5">
                        <div className="font-mono text-[11px] text-slate-500">
                          {formatTaxInvoiceBusinessNo(supplierBiz) || "-"}
                        </div>
                        <div className="font-semibold text-slate-900">{supplierName || "-"}</div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-0.5">
                        <div className="font-mono text-[11px] text-slate-500">
                          {formatTaxInvoiceBusinessNo(recipientBiz) || "-"}
                        </div>
                        <div className="font-semibold text-slate-900">{recipientName || "-"}</div>
                      </div>
                    </td>
                    <td className="max-w-[10rem] truncate text-slate-700" title={invoice.memo || ""}>
                      {invoice.memo || "-"}
                    </td>
                    <td className="text-right font-medium">{formatKRW(invoice.supplyAmount)}</td>
                    <td className="text-right font-medium">{formatKRW(invoice.vatAmount)}</td>
                    <td className="text-right font-semibold text-slate-900">{formatKRW(invoice.totalAmount)}</td>
                    <td className="text-right font-semibold text-amber-700">{formatKRW(unsettledAmount)}</td>
                    <td className="text-right">
                      {isLinked ? (
                        <span className="text-xs font-bold text-blue-700">{L.linked}</span>
                      ) : canLink ? (
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                          onClick={() => onLink(invoice.id)}
                        >
                          {L.add}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">{L.noUnsettled}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="erp-tax-invoice-link-panel__footer">
        <span>{L.count(rows.length)}</span>
        <div className="flex items-center gap-2">
          <span>{L.page(safePage, totalPages)}</span>
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-1 text-slate-600 disabled:opacity-40"
            disabled={safePage <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-1 text-slate-600 disabled:opacity-40"
            disabled={safePage >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});

export function TaxInvoiceLinkPanel({
  tx,
  taxInvoices,
  linkedPaymentIndex,
  excludedIds,
  companyProfile,
  linkedInvoiceId,
  onClose,
  onLink,
  onNavigateToTaxInvoice,
}: TaxInvoiceLinkPanelProps) {
  const defaultRange = useMemo(() => buildDefaultTaxInvoiceLinkDateRange(tx), [tx]);
  const [flowFilter, setFlowFilter] = useState<TaxInvoiceFlowType>(() => resolveDefaultTaxInvoiceFlowFilter(tx));
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleDebouncedSearch = useCallback((value: string) => {
    startTransition(() => setDebouncedSearch(value));
  }, []);

  const txAmount = getBankTxClassifiedAmount(tx);
  const ourCompanyName = String(companyProfile?.name || "\uC8FC\uC2DD\uD68C\uC0AC \uD300\uBC00\uB9AC\uBBF8\uD130").trim();
  const ourBusinessNo = String(companyProfile?.businessNo || "").trim();

  const catalog = useMemo(
    () =>
      buildTaxInvoiceLinkCatalog({
        invoices: taxInvoices,
        linkedPaymentIndex,
        excludedIds,
        flowFilter,
        startDate,
        endDate,
      }),
    [taxInvoices, linkedPaymentIndex, excludedIds, flowFilter, startDate, endDate],
  );

  const rows = useMemo(
    () => filterTaxInvoiceLinkCatalog(catalog, debouncedSearch),
    [catalog, debouncedSearch],
  );

  return (
    <div className="erp-tax-invoice-link-panel" role="dialog" aria-modal="true" aria-label={L.title}>
      <div className="erp-tax-invoice-link-panel__head">
        <div>
          <h2 className="erp-text-section font-bold text-slate-900">{L.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {formatTxAt(tx.transactionAt)} {"\u00B7"}{" "}
            {String(tx.counterpartyName || tx.description || "-").trim()} {"\u00B7"} {L.txAmount}{" "}
            <span className="font-bold text-slate-900">{formatKRW(txAmount)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {linkedInvoiceId ? (
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => onLink(undefined)}>
              {L.unlink}
            </Button>
          ) : null}
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="erp-tax-invoice-link-panel__body">
        <aside className="erp-tax-invoice-link-panel__sidebar">
          <div className="erp-tax-invoice-link-panel__flow-tabs">
            {(["sales", "purchase"] as TaxInvoiceFlowType[]).map((key) => (
              <button
                key={key}
                type="button"
                className={flowFilter === key ? "is-active" : ""}
                onClick={() => setFlowFilter(key)}
              >
                {key === "sales" ? L.sales : L.purchase}
              </button>
            ))}
          </div>

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

          <TaxInvoiceLinkSearchField onDebouncedChange={handleDebouncedSearch} />

          {onNavigateToTaxInvoice ? (
            <button type="button" className="erp-tax-invoice-link-panel__issue-btn" onClick={onNavigateToTaxInvoice}>
              {L.issueHint}
            </button>
          ) : null}
        </aside>

        <TaxInvoiceLinkResults
          tx={tx}
          rows={rows}
          linkedInvoiceId={linkedInvoiceId}
          ourCompanyName={ourCompanyName}
          ourBusinessNo={ourBusinessNo}
          onLink={onLink}
        />
      </div>
    </div>
  );
}
