import React, { useMemo, useState } from "react";
import { Pencil, Plus, Receipt, Search, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { TableExportSection } from "@/components/TableExportSection";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import { formatKRW, monthRangeISO, quarterRangeISO, todayISO } from "@/utils/companyLedger";
import type { ErpUser } from "@/utils/erpApi";
import {
  calculateTaxInvoiceAmounts,
  calculateTaxInvoiceAmountsFromTotal,
  buildTaxInvoiceStats,
  filterTaxInvoices,
  filterTaxInvoicesByFlow,
  filterTaxInvoicesByPeriod,
  formatTaxInvoiceDate,
  getTaxInvoiceDocumentTypeLabel,
  getTaxInvoiceFlowLabel,
  getTaxInvoiceKindLabel,
  getTaxInvoiceStatusLabel,
  listTaxInvoiceYears,
  makeTaxInvoiceId,
  normalizeTaxInvoiceDocumentType,
  normalizeTaxInvoiceFlowType,
  normalizeTaxInvoiceStatus,
  parseTaxInvoiceAmount,
  resolveTaxInvoiceModalAmounts,
  sortTaxInvoices,
  TAX_INVOICE_DOCUMENT_OPTIONS,
  TAX_INVOICE_FLOW_OPTIONS,
  TAX_INVOICE_STATUS_OPTIONS,
  validateTaxInvoiceInput,
  type TaxInvoice,
  type TaxInvoiceDocumentType,
  type TaxInvoiceFlowType,
  type TaxInvoiceStatus,
} from "@/utils/taxInvoices";

type PeriodKey = "thisMonth" | "lastMonth" | "q1" | "q2" | "q3" | "q4" | "all" | "custom";
type QuarterKey = "q1" | "q2" | "q3" | "q4";
type FlowFilterKey = "all" | TaxInvoiceFlowType;
type DateFilter = { startDate: string; endDate: string };

type InvoiceModalState = {
  mode: "create" | "edit";
  id?: string;
  issueDate: string;
  client: string;
  businessNo: string;
  flowType: TaxInvoiceFlowType;
  documentType: TaxInvoiceDocumentType;
  supplyAmount: string;
  totalAmount: string;
  amountInputSource: "supply" | "total";
  invoiceNo: string;
  memo: string;
  status: TaxInvoiceStatus;
};

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: "thisMonth", label: "\uC774\uBC88 \uB2EC" },
  { key: "lastMonth", label: "\uC9C0\uB09C \uB2EC" },
  { key: "all", label: "\uC804\uCCB4" },
];

const QUARTER_OPTIONS: Array<{ key: QuarterKey; label: string; quarter: 1 | 2 | 3 | 4 }> = [
  { key: "q1", label: "1\uBD84\uAE30", quarter: 1 },
  { key: "q2", label: "2\uBD84\uAE30", quarter: 2 },
  { key: "q3", label: "3\uBD84\uAE30", quarter: 3 },
  { key: "q4", label: "4\uBD84\uAE30", quarter: 4 },
];

const FLOW_FILTER_OPTIONS: Array<{ key: FlowFilterKey; label: string }> = [
  { key: "all", label: "\uC804\uCCB4" },
  { key: "sales", label: "\uB9E4\uCD9C" },
  { key: "purchase", label: "\uB9E4\uC785" },
];

const L = {
  pageTitle: "\uACC4\uC0B0\uC11C \uBC1C\uD589",
  pageDesc: "\uB9E4\uCD9C\uB7C9 \uBC0F \uB9E4\uC785 \uACC4\uC0B0\uC11C \uB0B4\uC5ED\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  add: "\uB4F1\uB85D",
  edit: "\uC218\uC815",
  delete: "\uC0AD\uC81C",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
  search: "\uAC70\uB798\uCC98, \uC0AC\uC5C5\uC790\uBC88\uD638, \uBB38\uC11C\uBC88\uD638, \uBA54\uBAA8 \uAC80\uC0C9",
  empty: "\uB4F1\uB85D\uB41C \uACC4\uC0B0\uC11C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  deleteConfirm: "\uC774 \uACC4\uC0B0\uC11C \uB0B4\uC5ED\uC744 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  createTitle: "\uACC4\uC0B0\uC11C \uB4F1\uB85D",
  editTitle: "\uACC4\uC0B0\uC11C \uC218\uC815",
  periodSearch: "\uAE30\uAC04 \uAC80\uC0C9",
  quarterSearch: "\uBD84\uAE30",
  searchYear: "\uC5F0\uB3C4",
  periodStart: "\uC2DC\uC791\uC77C",
  periodEnd: "\uC885\uB8CC\uC77C",
  resetFilter: "\uCD08\uAE30\uD654",
  salesInvoice: "\uB9E4\uCD9C \uACC4\uC0B0\uC11C",
  purchaseInvoice: "\uB9E4\uC785 \uACC4\uC0B0\uC11C",
  supplyTotal: "\uACF5\uAE09\uAC00\uC561 \uD569\uACC4",
  vatTotal: "\uBD80\uAC00\uC138 \uD569\uACC4",
  grandTotal: "\uCD1D \uD569\uACC4",
  issueDate: "\uBC1C\uD589\uC77C",
  flowType: "\uB9E4\uC785/\uB9E4\uCD9C",
  documentType: "\uBB38\uC11C\uC885\uB958",
  client: "\uAC70\uB798\uCC98",
  clientPlaceholder: "\uAC70\uB798\uCC98 \uC120\uD0DD \uB610\uB294 \uC785\uB825",
  businessNo: "\uC0AC\uC5C5\uC790\uBC88\uD638",
  supplyAmount: "\uACF5\uAE09\uAC00\uC561",
  totalAmountInclVat: "\uBD80\uAC00\uC138 \uD3EC\uD568 \uAE08\uC561",
  vatAmount: "\uBD80\uAC00\uC138",
  totalAmount: "\uD569\uACC4",
  amountHint: "\uACF5\uAE09\uAC00\uC561 \uB610\uB294 \uBD80\uAC00\uC138 \uD3EC\uD568 \uAE08\uC561 \uC911 \uD558\uB098\uB97C \uC785\uB825\uD558\uBA74 \uC790\uB3D9 \uACC4\uC0B0\uB429\uB2C8\uB2E4.",
  invoiceNo: "\uBB38\uC11C\uBC88\uD638",
  memo: "\uBA54\uBAA8",
  status: "\uC0C1\uD0DC",
  author: "\uB4F1\uB85D\uC790",
  actions: "\uAD00\uB9AC",
  count: "\uAC74",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function resolveActivePeriod(periodKey: PeriodKey, dateFilter: DateFilter, quarterYear: number): DateFilter {
  if (periodKey === "thisMonth") return monthRangeISO(0);
  if (periodKey === "lastMonth") return monthRangeISO(-1);
  if (periodKey === "q1") return quarterRangeISO(1, quarterYear);
  if (periodKey === "q2") return quarterRangeISO(2, quarterYear);
  if (periodKey === "q3") return quarterRangeISO(3, quarterYear);
  if (periodKey === "q4") return quarterRangeISO(4, quarterYear);
  if (periodKey === "all") return { startDate: "", endDate: "" };
  return dateFilter;
}

function matchPresetPeriodKey(range: DateFilter, candidateYears: number[]) {
  if (isSameDateRange(range, monthRangeISO(0))) return { key: "thisMonth" as PeriodKey };
  if (isSameDateRange(range, monthRangeISO(-1))) return { key: "lastMonth" as PeriodKey };
  if (!range.startDate && !range.endDate) return { key: "all" as PeriodKey };
  for (const year of candidateYears) {
    for (const option of QUARTER_OPTIONS) {
      if (isSameDateRange(range, quarterRangeISO(option.quarter, year))) {
        return { key: option.key as PeriodKey, quarterYear: year };
      }
    }
  }
  return { key: "custom" as PeriodKey };
}

function isQuarterPeriodKey(key: PeriodKey): key is QuarterKey {
  return key === "q1" || key === "q2" || key === "q3" || key === "q4";
}

function isSameDateRange(a: DateFilter, b: DateFilter) {
  return a.startDate === b.startDate && a.endDate === b.endDate;
}

export function TaxInvoicePage({
  taxInvoices,
  setTaxInvoices,
  clients,
  currentUser,
}: {
  taxInvoices: TaxInvoice[];
  setTaxInvoices: React.Dispatch<React.SetStateAction<TaxInvoice[]>>;
  clients: Array<{ name?: string; businessNo?: string }>;
  currentUser: ErpUser | null;
}) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("thisMonth");
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => monthRangeISO(0));
  const [quarterYear, setQuarterYear] = useState(() => new Date().getFullYear());
  const [flowFilter, setFlowFilter] = useState<FlowFilterKey>("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<InvoiceModalState | null>(null);
  const [formError, setFormError] = useState("");

  const clientOptions = useMemo(
    () => clients.map((client) => String(client.name || "")).filter(Boolean),
    [clients]
  );

  const yearOptions = useMemo(() => {
    const years = new Set(listTaxInvoiceYears(taxInvoices));
    years.add(quarterYear);
    if (dateFilter.startDate) years.add(Number(dateFilter.startDate.slice(0, 4)));
    if (dateFilter.endDate) years.add(Number(dateFilter.endDate.slice(0, 4)));
    return [...years].filter((year) => Number.isFinite(year) && year > 1900).sort((a, b) => b - a);
  }, [taxInvoices, quarterYear, dateFilter.startDate, dateFilter.endDate]);

  const activePeriod = useMemo(
    () => resolveActivePeriod(periodKey, dateFilter, quarterYear),
    [periodKey, dateFilter, quarterYear]
  );

  const filteredRows = useMemo(() => {
    const scoped = filterTaxInvoicesByPeriod(taxInvoices, activePeriod.startDate, activePeriod.endDate);
    const byFlow = filterTaxInvoicesByFlow(scoped, flowFilter);
    return sortTaxInvoices(filterTaxInvoices(byFlow, query));
  }, [taxInvoices, activePeriod.startDate, activePeriod.endDate, flowFilter, query]);

  const stats = useMemo(() => {
    const scoped = filterTaxInvoicesByPeriod(taxInvoices, activePeriod.startDate, activePeriod.endDate);
    return buildTaxInvoiceStats(scoped);
  }, [taxInvoices, activePeriod.startDate, activePeriod.endDate]);

  const applyPeriodKey = (key: PeriodKey) => {
    setPeriodKey(key);
    if (key === "thisMonth") setDateFilter(monthRangeISO(0));
    else if (key === "lastMonth") setDateFilter(monthRangeISO(-1));
    else if (key === "q1") setDateFilter(quarterRangeISO(1, quarterYear));
    else if (key === "q2") setDateFilter(quarterRangeISO(2, quarterYear));
    else if (key === "q3") setDateFilter(quarterRangeISO(3, quarterYear));
    else if (key === "q4") setDateFilter(quarterRangeISO(4, quarterYear));
    else if (key === "all") setDateFilter({ startDate: "", endDate: "" });
  };

  const handleQuarterYearChange = (year: number) => {
    setQuarterYear(year);
    if (isQuarterPeriodKey(periodKey)) {
      const quarter = Number(periodKey.slice(1)) as 1 | 2 | 3 | 4;
      setDateFilter(quarterRangeISO(quarter, year));
    }
  };

  const handleDateFilterChange = (patch: Partial<DateFilter>) => {
    setDateFilter((prev) => {
      const next = { ...prev, ...patch };
      const matched = matchPresetPeriodKey(next, yearOptions);
      setPeriodKey(matched.key);
      if (matched.quarterYear) setQuarterYear(matched.quarterYear);
      return next;
    });
  };

  const resetSearchFilters = () => {
    setPeriodKey("thisMonth");
    setDateFilter(monthRangeISO(0));
    setQuarterYear(new Date().getFullYear());
    setFlowFilter("all");
    setQuery("");
  };

  const previewAmounts = useMemo(() => {
    if (!modal) return { supplyAmount: 0, vatAmount: 0, totalAmount: 0 };
    return resolveTaxInvoiceModalAmounts(modal);
  }, [modal]);

  const handleSupplyAmountChange = (raw: string) => {
    const supplyAmount = raw.replace(/[^\d]/g, "");
    setModal((prev) => {
      if (!prev) return prev;
      const amounts = calculateTaxInvoiceAmounts(parseTaxInvoiceAmount(supplyAmount), prev.documentType);
      return {
        ...prev,
        supplyAmount,
        totalAmount: supplyAmount ? String(amounts.totalAmount) : "",
        amountInputSource: "supply",
      };
    });
  };

  const handleTotalAmountChange = (raw: string) => {
    const totalAmount = raw.replace(/[^\d]/g, "");
    setModal((prev) => {
      if (!prev) return prev;
      const amounts = calculateTaxInvoiceAmountsFromTotal(parseTaxInvoiceAmount(totalAmount), prev.documentType);
      return {
        ...prev,
        totalAmount,
        supplyAmount: totalAmount ? String(amounts.supplyAmount) : "",
        amountInputSource: "total",
      };
    });
  };

  const handleDocumentTypeChange = (documentType: TaxInvoiceDocumentType) => {
    setModal((prev) => {
      if (!prev) return prev;
      const amounts = resolveTaxInvoiceModalAmounts({ ...prev, documentType });
      return {
        ...prev,
        documentType,
        supplyAmount: parseTaxInvoiceAmount(prev.supplyAmount) > 0 || parseTaxInvoiceAmount(prev.totalAmount) > 0 ? String(amounts.supplyAmount) : prev.supplyAmount,
        totalAmount: parseTaxInvoiceAmount(prev.supplyAmount) > 0 || parseTaxInvoiceAmount(prev.totalAmount) > 0 ? String(amounts.totalAmount) : prev.totalAmount,
      };
    });
  };

  const openCreateModal = () => {
    setFormError("");
    setModal({
      mode: "create",
      issueDate: todayISO(),
      client: "",
      businessNo: "",
      flowType: "sales",
      documentType: "tax",
      supplyAmount: "",
      totalAmount: "",
      amountInputSource: "supply",
      invoiceNo: "",
      memo: "",
      status: "issued",
    });
  };

  const openEditModal = (row: TaxInvoice) => {
    setFormError("");
    setModal({
      mode: "edit",
      id: row.id,
      issueDate: row.issueDate,
      client: row.client,
      businessNo: row.businessNo,
      flowType: row.flowType,
      documentType: row.documentType,
      supplyAmount: String(row.supplyAmount || ""),
      totalAmount: String(row.totalAmount || ""),
      amountInputSource: "supply",
      invoiceNo: row.invoiceNo || "",
      memo: row.memo || "",
      status: row.status,
    });
  };

  const handleClientChange = (clientName: string) => {
    const matched = clients.find((client) => client.name === clientName);
    setModal((prev) =>
      prev
        ? {
            ...prev,
            client: clientName,
            businessNo: matched?.businessNo ? String(matched.businessNo) : prev.businessNo,
          }
        : prev
    );
  };

  const saveInvoice = () => {
    if (!modal) return;
    const error = validateTaxInvoiceInput({
      issueDate: modal.issueDate,
      client: modal.client,
      supplyAmount: modal.supplyAmount,
      totalAmount: modal.totalAmount,
    });
    if (error) {
      setFormError(error);
      return;
    }

    const amounts = resolveTaxInvoiceModalAmounts(modal);
    const now = new Date().toISOString();
    const authorName = currentUser?.name || currentUser?.loginId || "\uC0AC\uC6A9\uC790";
    const authorLoginId = currentUser?.loginId || "";

    if (modal.mode === "edit" && modal.id) {
      setTaxInvoices((prev) =>
        prev.map((row) =>
          row.id === modal.id
            ? {
                ...row,
                issueDate: modal.issueDate,
                client: modal.client.trim(),
                businessNo: modal.businessNo.trim(),
                flowType: modal.flowType,
                documentType: modal.documentType,
                supplyAmount: amounts.supplyAmount,
                vatAmount: amounts.vatAmount,
                totalAmount: amounts.totalAmount,
                invoiceNo: modal.invoiceNo.trim() || undefined,
                memo: modal.memo.trim() || undefined,
                status: modal.status,
                updatedAt: now,
                updatedBy: authorName,
              }
            : row
        )
      );
    } else {
      const next: TaxInvoice = {
        id: makeTaxInvoiceId(),
        issueDate: modal.issueDate,
        client: modal.client.trim(),
        businessNo: modal.businessNo.trim(),
        flowType: modal.flowType,
        documentType: modal.documentType,
        supplyAmount: amounts.supplyAmount,
        vatAmount: amounts.vatAmount,
        totalAmount: amounts.totalAmount,
        invoiceNo: modal.invoiceNo.trim() || undefined,
        memo: modal.memo.trim() || undefined,
        status: modal.status,
        createdAt: now,
        createdBy: authorName,
        createdByLoginId: authorLoginId,
      };
      setTaxInvoices((prev) => [next, ...prev]);
    }

    setModal(null);
    setFormError("");
  };

  const deleteInvoice = (row: TaxInvoice) => {
    if (!window.confirm(L.deleteConfirm)) return;
    setTaxInvoices((prev) => prev.filter((item) => item.id !== row.id));
  };

  return (
    <div className="erp-page erp-tax-invoice-page">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="erp-text-page-title">{L.pageTitle}</h1>
          <p className="mt-1 erp-text-body text-slate-500">{L.pageDesc}</p>
        </div>
        <Button type="button" className="rounded-2xl" onClick={openCreateModal}>
          <Plus size={16} className="mr-2" />
          {L.add}
        </Button>
      </div>

      <Card className="mb-4 rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="rounded-2xl bg-slate-100 p-2 text-slate-600">
            <Receipt size={18} />
          </div>
          <div>
            <div className="erp-text-section font-bold text-slate-900">{L.pageTitle}</div>
            <p className="mt-1 erp-text-caption text-slate-500">{L.pageDesc}</p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-emerald-100 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="erp-text-caption font-semibold text-emerald-700">{L.salesInvoice}</div>
              <div className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {stats.sales.count}
                {L.count}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="erp-text-caption text-slate-500">{L.supplyTotal}</div>
                <div className="mt-1 text-lg font-black text-slate-900">{formatKRW(stats.sales.supply)}</div>
              </div>
              <div>
                <div className="erp-text-caption text-slate-500">{L.vatTotal}</div>
                <div className="mt-1 text-lg font-black text-amber-700">{formatKRW(stats.sales.vat)}</div>
              </div>
              <div>
                <div className="erp-text-caption text-slate-500">{L.grandTotal}</div>
                <div className="mt-1 text-lg font-black text-emerald-700">{formatKRW(stats.sales.total)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-amber-100 shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="erp-text-caption font-semibold text-amber-700">{L.purchaseInvoice}</div>
              <div className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {stats.purchase.count}
                {L.count}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="erp-text-caption text-slate-500">{L.supplyTotal}</div>
                <div className="mt-1 text-lg font-black text-slate-900">{formatKRW(stats.purchase.supply)}</div>
              </div>
              <div>
                <div className="erp-text-caption text-slate-500">{L.vatTotal}</div>
                <div className="mt-1 text-lg font-black text-amber-700">{formatKRW(stats.purchase.vat)}</div>
              </div>
              <div>
                <div className="erp-text-caption text-slate-500">{L.grandTotal}</div>
                <div className="mt-1 text-lg font-black text-emerald-700">{formatKRW(stats.purchase.total)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4 rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <div className="mb-2 erp-text-caption font-semibold text-slate-500">{L.periodSearch}</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant={periodKey === option.key ? "default" : "outline"}
                className="rounded-2xl"
                onClick={() => applyPeriodKey(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="mb-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="erp-text-caption font-semibold text-slate-500">{L.quarterSearch}</div>
              <select
                className="erp-input rounded-2xl border bg-white px-3 py-2 erp-text-caption font-semibold text-slate-700"
                value={quarterYear}
                onChange={(event) => handleQuarterYearChange(Number(event.target.value))}
                aria-label={L.searchYear}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                    {"\uB144"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUARTER_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  variant={periodKey === option.key ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={() => applyPeriodKey(option.key)}
                >
                  {quarterYear}
                  {"\uB144 "}
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <KoreanDateInput
              className="erp-input w-full rounded-2xl border px-3 py-2.5 sm:w-auto"
              value={dateFilter.startDate}
              onChange={(value) => handleDateFilterChange({ startDate: value })}
              aria-label={L.periodStart}
            />
            <span className="erp-text-caption text-slate-400">~</span>
            <KoreanDateInput
              className="erp-input w-full rounded-2xl border px-3 py-2.5 sm:w-auto"
              value={dateFilter.endDate}
              onChange={(value) => handleDateFilterChange({ endDate: value })}
              aria-label={L.periodEnd}
            />
            <Button type="button" variant="outline" className="rounded-2xl" onClick={resetSearchFilters}>
              {L.resetFilter}
            </Button>
            <span className="erp-text-caption ml-auto font-semibold text-slate-500">
              {filteredRows.length}
              {L.count}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {FLOW_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant={flowFilter === option.key ? "default" : "outline"}
                className={`rounded-2xl ${option.key === "sales" && flowFilter === option.key ? "bg-emerald-600 hover:bg-emerald-700" : ""} ${option.key === "purchase" && flowFilter === option.key ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                onClick={() => setFlowFilter(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="erp-input w-full rounded-2xl border bg-white py-2.5 pl-9 pr-3"
              placeholder={L.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              lang="ko"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-0">
          <TableExportSection fileName={L.pageTitle} title={L.pageTitle} disabled={filteredRows.length === 0}>
            <MobileRecordList>
              {filteredRows.length ? (
                filteredRows.map((row) => (
                  <MobileRecordCard
                    key={row.id}
                    title={row.client}
                    subtitle={`${getTaxInvoiceKindLabel(row)} · ${formatTaxInvoiceDate(row.issueDate)}`}
                    badge={getTaxInvoiceStatusLabel(row.status)}
                    fields={[
                      { label: L.flowType, value: getTaxInvoiceFlowLabel(row.flowType) },
                      { label: L.documentType, value: getTaxInvoiceDocumentTypeLabel(row.documentType) },
                      { label: L.supplyAmount, value: formatKRW(row.supplyAmount) },
                      { label: L.vatAmount, value: formatKRW(row.vatAmount) },
                      { label: L.totalAmount, value: formatKRW(row.totalAmount), tone: "success" },
                      { label: L.businessNo, value: row.businessNo || "-", tone: "muted" },
                    ]}
                    actions={
                      <>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => openEditModal(row)}>
                          <Pencil size={14} className="mr-1" />
                          {L.edit}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="rounded-xl text-red-600" onClick={() => deleteInvoice(row)}>
                          <Trash2 size={14} className="mr-1" />
                          {L.delete}
                        </Button>
                      </>
                    }
                  />
                ))
              ) : (
                <MobileRecordCard empty emptyLabel={L.empty} />
              )}
            </MobileRecordList>
            <DesktopTableWrap>
              <table className="erp-table min-w-full">
                <thead>
                  <tr>
                    <th>{L.issueDate}</th>
                    <th>{L.flowType}</th>
                    <th>{L.documentType}</th>
                    <th>{L.client}</th>
                    <th>{L.businessNo}</th>
                    <th className="text-right">{L.supplyAmount}</th>
                    <th className="text-right">{L.vatAmount}</th>
                    <th className="text-right">{L.totalAmount}</th>
                    <th>{L.invoiceNo}</th>
                    <th>{L.status}</th>
                    <th>{L.author}</th>
                    <th>{L.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className={`border-t ${row.status === "cancelled" ? "bg-slate-50 text-slate-500" : ""}`}>
                      <td className="whitespace-nowrap">{formatTaxInvoiceDate(row.issueDate)}</td>
                      <td>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${row.flowType === "sales" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {getTaxInvoiceFlowLabel(row.flowType)}
                        </span>
                      </td>
                      <td>{getTaxInvoiceDocumentTypeLabel(row.documentType)}</td>
                      <td className="font-semibold text-slate-900">{row.client}</td>
                      <td>{row.businessNo || "-"}</td>
                      <td className="text-right">{formatKRW(row.supplyAmount)}</td>
                      <td className="text-right">{formatKRW(row.vatAmount)}</td>
                      <td className="text-right font-semibold">{formatKRW(row.totalAmount)}</td>
                      <td>{row.invoiceNo || "-"}</td>
                      <td>{getTaxInvoiceStatusLabel(row.status)}</td>
                      <td>{row.createdBy}</td>
                      <td>
                        <div className="flex gap-1">
                          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => openEditModal(row)}>
                            {L.edit}
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="rounded-xl text-red-600" onClick={() => deleteInvoice(row)}>
                            {L.delete}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredRows.length ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-center text-slate-500">
                        {L.empty}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </DesktopTableWrap>
          </TableExportSection>
        </CardContent>
      </Card>

      {modal ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setModal(null)}>
          <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="erp-text-section font-bold">{modal.mode === "create" ? L.createTitle : L.editTitle}</h2>
              <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={() => setModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <Field label={L.flowType}>
                <div className="grid grid-cols-2 gap-2">
                  {TAX_INVOICE_FLOW_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                        modal.flowType === option.value
                          ? option.value === "sales"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                            : "border-amber-600 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() => setModal((prev) => (prev ? { ...prev, flowType: option.value } : prev))}
                    >
                      {option.label} {"\uACC4\uC0B0\uC11C"}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={L.issueDate}>
                  <KoreanDateInput
                    className="erp-input w-full rounded-2xl border px-3 py-2.5"
                    value={modal.issueDate}
                    onChange={(value) => setModal((prev) => (prev ? { ...prev, issueDate: value } : prev))}
                  />
                </Field>
                <Field label={L.documentType}>
                  <select
                    className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                    value={modal.documentType}
                    onChange={(event) => handleDocumentTypeChange(normalizeTaxInvoiceDocumentType(event.target.value))}
                  >
                    {TAX_INVOICE_DOCUMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={L.client}>
                <AutocompleteInput
                  className="erp-input w-full rounded-2xl border px-3 py-2.5"
                  value={modal.client}
                  options={clientOptions}
                  onChange={handleClientChange}
                  placeholder={L.clientPlaceholder}
                />
              </Field>
              <Field label={L.businessNo}>
                <input
                  className="erp-input w-full rounded-2xl border px-3 py-2.5"
                  value={modal.businessNo}
                  onChange={(event) => setModal((prev) => (prev ? { ...prev, businessNo: event.target.value } : prev))}
                  lang="ko"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={L.supplyAmount}>
                  <input
                    className="erp-input w-full rounded-2xl border px-3 py-2.5"
                    value={modal.supplyAmount}
                    onChange={(event) => handleSupplyAmountChange(event.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </Field>
                <Field label={L.totalAmountInclVat}>
                  <input
                    className="erp-input w-full rounded-2xl border px-3 py-2.5"
                    value={modal.totalAmount}
                    onChange={(event) => handleTotalAmountChange(event.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </Field>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="mb-3 text-xs text-slate-500">{L.amountHint}</p>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">{L.supplyAmount}</span>
                  <span className="font-semibold">{formatKRW(previewAmounts.supplyAmount)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-slate-500">{L.vatAmount}</span>
                  <span className="font-semibold text-amber-700">{formatKRW(previewAmounts.vatAmount)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
                  <span className="text-slate-500">{L.totalAmountInclVat}</span>
                  <span className="font-bold text-emerald-700">{formatKRW(previewAmounts.totalAmount)}</span>
                </div>
              </div>
              <Field label={L.status}>
                <select
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 sm:max-w-xs"
                  value={modal.status}
                  onChange={(event) =>
                    setModal((prev) => (prev ? { ...prev, status: normalizeTaxInvoiceStatus(event.target.value) } : prev))
                  }
                >
                  {TAX_INVOICE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L.invoiceNo}>
                <input
                  className="erp-input w-full rounded-2xl border px-3 py-2.5"
                  value={modal.invoiceNo}
                  onChange={(event) => setModal((prev) => (prev ? { ...prev, invoiceNo: event.target.value } : prev))}
                  lang="ko"
                />
              </Field>
              <Field label={L.memo}>
                <textarea
                  className="erp-input min-h-[6rem] w-full rounded-2xl border px-3 py-2.5"
                  value={modal.memo}
                  onChange={(event) => setModal((prev) => (prev ? { ...prev, memo: event.target.value } : prev))}
                  lang="ko"
                />
              </Field>
              {formError ? <p className="text-sm font-semibold text-red-600">{formError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setModal(null)}>
                  {L.cancel}
                </Button>
                <Button type="button" className="rounded-2xl" onClick={saveInvoice}>
                  {L.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
