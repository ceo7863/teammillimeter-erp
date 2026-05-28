import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet, Pencil, Plus, Receipt, Search, Trash2, X } from "lucide-react";
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
  buildTaxInvoiceClientSummaries,
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
  type TaxInvoiceClientSummary,
  type TaxInvoiceDocumentType,
  type TaxInvoiceFlowType,
  type TaxInvoiceStatus,
} from "@/utils/taxInvoices";
import {
  mergeHometaxTaxInvoices,
  parseHometaxTaxInvoiceFile,
  type HometaxImportPreview,
} from "@/utils/hometaxTaxInvoiceImport";
import { useAudit } from "@/context/AuditContext";
import { TAX_INVOICE_AUDIT_FIELDS, snapshotTaxInvoiceForAudit } from "@/utils/auditLog";

type PeriodKey = "thisMonth" | "lastMonth" | "q1" | "q2" | "q3" | "q4" | "all" | "custom";
type QuarterKey = "q1" | "q2" | "q3" | "q4";
type FlowFilterKey = "all" | TaxInvoiceFlowType;
type ViewMode = "list" | "byClientSales" | "byClientPurchase";
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

const VIEW_MODE_OPTIONS: Array<{ key: ViewMode; label: string }> = [
  { key: "list", label: "\uC804\uCCB4 \uBAA9\uB85D" },
  { key: "byClientSales", label: "\uB9E4\uCD9C \uC5C5\uCCB4\uBCC4" },
  { key: "byClientPurchase", label: "\uB9E4\uC785 \uC5C5\uCCB4\uBCC4" },
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
  hometaxImport: "\uD648\uD0DD\uC2A4 \uC5D1\uC140",
  hometaxImportTitle: "\uD648\uD0DD\uC2A4 \uACC4\uC0B0\uC11C \uAC00\uC838\uC624\uAE30",
  hometaxImportDesc: "\uD648\uD0DD\uC2A4 \uC804\uC790(\uC138\uAE08)\uACC4\uC0B0\uC11C \uBAA9\uB85D \uC5D1\uC140\uC744 \uC120\uD0DD\uD558\uC138\uC694. \uC2B9\uC778\uBC88\uD638\uAC00 \uAC19\uC740 \uAC74\uC740 \uAC74\uB108\uB701\uB2C8\uB2E4.",
  hometaxImportConfirm: "\uAC00\uC838\uC624\uAE30",
  hometaxImportAdded: "\uAC74 \uCD94\uAC00",
  hometaxImportSkipped: "\uAC74 \uC911\uBCF5 \uC81C\uC678",
  hometaxImportDone: "\uACC4\uC0B0\uC11C \uAC00\uC838\uC624\uAE30\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  hometaxImportFailed: "\uC5D1\uC140\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  previewRows: "\uC778\uC2DD \uAC74\uC218",
  previewTotal: "\uD30C\uC77C \uD569\uACC4",
  infoPeriod: "\uC815\uBCF4 \uAE30\uAC04",
  latestIssueDate: "\uCD5C\uC2E0 \uC791\uC131\uC77C",
  dataAsOf: "\uB370\uC774\uD130 \uAE30\uC900",
  clientSummary: "\uC5C5\uCCB4\uBCC4 \uC9D1\uACC4",
  viewModeLabel: "\uBCF4\uAE30",
  clientSummaryHint: "\uAC70\uB798\uCC98\uBCC4 \uACC4\uC0B0\uC11C \uAC74\uC218\uC640 \uAE08\uC561 \uD569\uACC4\uC785\uB2C8\uB2E4. \uD589\uC744 \uD074\uB9AD\uD558\uAC74 \uC138\uBD80 \uACC4\uC0B0\uC11C \uBAA9\uB85D\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  salesClients: "\uB9E4\uCD9C \uC5C5\uCCB4",
  purchaseClients: "\uB9E4\uC785 \uC5C5\uCCB4",
  clientCount: "\uACE8",
  invoiceCount: "\uACC4\uC0B0\uC11C \uAC74\uC218",
  expandDetail: "\uC138\uBD80 \uBAA9\uB85D",
};

function ClientFlowSectionHeader({
  title,
  count,
  total,
  tone,
}: {
  title: string;
  count: number;
  total: number;
  tone: TaxInvoiceFlowType;
}) {
  const toneClass =
    tone === "sales"
      ? "border-emerald-100 bg-emerald-50 text-emerald-800"
      : "border-amber-100 bg-amber-50 text-amber-800";
  return (
    <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="font-bold">{title}</div>
      <div className="text-sm font-semibold">
        {count}
        {L.clientCount} · {L.grandTotal} {formatKRW(total)}
      </div>
    </div>
  );
}

function sumClientSectionTotal(groups: TaxInvoiceClientSummary[]) {
  return groups.reduce((sum, group) => sum + group.total, 0);
}

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
  const { recordAudit, recordSummaryAudit } = useAudit();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("thisMonth");
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => monthRangeISO(0));
  const [quarterYear, setQuarterYear] = useState(() => new Date().getFullYear());
  const [flowFilter, setFlowFilter] = useState<FlowFilterKey>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedClientKeys, setExpandedClientKeys] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<InvoiceModalState | null>(null);
  const [formError, setFormError] = useState("");
  const [importPreview, setImportPreview] = useState<HometaxImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const hometaxInputRef = useRef<HTMLInputElement>(null);

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

  const clientSummaries = useMemo(() => buildTaxInvoiceClientSummaries(filteredRows), [filteredRows]);

  const salesClientSummaries = useMemo(
    () => clientSummaries.filter((group) => group.flowType === "sales"),
    [clientSummaries]
  );
  const purchaseClientSummaries = useMemo(
    () => clientSummaries.filter((group) => group.flowType === "purchase"),
    [clientSummaries]
  );

  const clientSections = useMemo(() => {
    if (viewMode === "byClientSales") {
      return [{ key: "sales" as const, title: L.salesClients, groups: salesClientSummaries }];
    }
    if (viewMode === "byClientPurchase") {
      return [{ key: "purchase" as const, title: L.purchaseClients, groups: purchaseClientSummaries }];
    }
    return [];
  }, [viewMode, salesClientSummaries, purchaseClientSummaries]);

  const isClientView = viewMode === "byClientSales" || viewMode === "byClientPurchase";

  const toggleClientExpanded = (key: string) => {
    setExpandedClientKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const renderInvoiceActions = (row: TaxInvoice) => (
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
  );

  const renderInvoiceRow = (row: TaxInvoice) => (
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
        <div className="flex gap-1">{renderInvoiceActions(row)}</div>
      </td>
    </tr>
  );

  const renderInvoiceMobileCard = (row: TaxInvoice) => (
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
      actions={renderInvoiceActions(row)}
    />
  );

  const renderClientGroupMobile = (group: TaxInvoiceClientSummary) => {
    const expanded = expandedClientKeys.includes(group.key);
    return (
      <div key={group.key} className="space-y-2">
        <MobileRecordCard
          title={group.client}
          subtitle={group.businessNo || L.businessNo}
          badge={getTaxInvoiceFlowLabel(group.flowType)}
          onClick={() => toggleClientExpanded(group.key)}
          fields={[
            { label: L.flowType, value: getTaxInvoiceFlowLabel(group.flowType) },
            { label: L.invoiceCount, value: `${group.count}${L.count}` },
            { label: L.supplyAmount, value: formatKRW(group.supply) },
            { label: L.vatAmount, value: formatKRW(group.vat) },
            { label: L.totalAmount, value: formatKRW(group.total), tone: "success" },
          ]}
        />
        {expanded ? (
          <div className={`space-y-2 border-l-2 pl-3 ${group.flowType === "sales" ? "border-emerald-200" : "border-amber-200"}`}>
            {group.rows.map((row) => renderInvoiceMobileCard(row))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderClientGroupDesktop = (group: TaxInvoiceClientSummary) => {
    const expanded = expandedClientKeys.includes(group.key);
    return (
      <React.Fragment key={group.key}>
        <tr className="border-t cursor-pointer hover:bg-slate-50" onClick={() => toggleClientExpanded(group.key)}>
          <td className="text-slate-400">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
          <td>
            <span
              className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                group.flowType === "sales" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {getTaxInvoiceFlowLabel(group.flowType)}
            </span>
            <span className="font-semibold text-slate-900">{group.client}</span>
          </td>
          <td>{group.businessNo || "-"}</td>
          <td className="text-right">{group.count}</td>
          <td className="text-right">{formatKRW(group.supply)}</td>
          <td className="text-right">{formatKRW(group.vat)}</td>
          <td className="text-right font-semibold">{formatKRW(group.total)}</td>
        </tr>
        {expanded ? (
          <tr>
            <td colSpan={7} className={`p-0 ${group.flowType === "sales" ? "bg-emerald-50/40" : "bg-amber-50/40"}`}>
              <table className="erp-table min-w-full">
                <thead>
                  <tr className="bg-white text-slate-500">
                    <th>{L.issueDate}</th>
                    <th>{L.documentType}</th>
                    <th className="text-right">{L.supplyAmount}</th>
                    <th className="text-right">{L.vatAmount}</th>
                    <th className="text-right">{L.totalAmount}</th>
                    <th>{L.invoiceNo}</th>
                    <th>{L.status}</th>
                    <th>{L.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id} className={`border-t ${row.status === "cancelled" ? "text-slate-500" : ""}`}>
                      <td className="whitespace-nowrap">{formatTaxInvoiceDate(row.issueDate)}</td>
                      <td>{getTaxInvoiceDocumentTypeLabel(row.documentType)}</td>
                      <td className="text-right">{formatKRW(row.supplyAmount)}</td>
                      <td className="text-right">{formatKRW(row.vatAmount)}</td>
                      <td className="text-right font-semibold">{formatKRW(row.totalAmount)}</td>
                      <td className="text-xs">{row.invoiceNo || "-"}</td>
                      <td>{getTaxInvoiceStatusLabel(row.status)}</td>
                      <td>
                        <div className="flex gap-1">{renderInvoiceActions(row)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        ) : null}
      </React.Fragment>
    );
  };

  const exportTitle =
    viewMode === "byClientSales"
      ? "\uACC4\uC0B0\uC11C_\uB9E4\uCD9C\uC5C5\uCCB4"
      : viewMode === "byClientPurchase"
        ? "\uACC4\uC0B0\uC11C_\uB9E4\uC785\uC5C5\uCCB4"
        : L.pageTitle;

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

  const authorName = currentUser?.name || currentUser?.loginId || "\uC0AC\uC6A9\uC790";
  const authorLoginId = currentUser?.loginId || "";

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

    if (modal.mode === "edit" && modal.id) {
      const existing = taxInvoices.find((row) => row.id === modal.id);
      const updated = {
        ...(existing || {}),
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
      };
      recordAudit({
        entityType: "taxInvoice",
        entityId: modal.id,
        entityLabel: `${updated.client} \u00B7 ${updated.issueDate}`,
        screen: L.pageTitle,
        action: "update",
        before: existing ? snapshotTaxInvoiceForAudit(existing) : undefined,
        after: snapshotTaxInvoiceForAudit(updated),
        fields: TAX_INVOICE_AUDIT_FIELDS,
        user: currentUser,
      });
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
      recordAudit({
        entityType: "taxInvoice",
        entityId: next.id,
        entityLabel: `${next.client} \u00B7 ${next.issueDate}`,
        screen: L.pageTitle,
        action: "create",
        after: snapshotTaxInvoiceForAudit(next),
        fields: TAX_INVOICE_AUDIT_FIELDS,
        user: currentUser,
      });
      setTaxInvoices((prev) => [next, ...prev]);
    }

    setModal(null);
    setFormError("");
  };

  const deleteInvoice = (row: TaxInvoice) => {
    if (!window.confirm(L.deleteConfirm)) return;
    recordAudit({
      entityType: "taxInvoice",
      entityId: row.id,
      entityLabel: `${row.client} \u00B7 ${row.issueDate}`,
      screen: L.pageTitle,
      action: "delete",
      before: snapshotTaxInvoiceForAudit(row),
      fields: TAX_INVOICE_AUDIT_FIELDS,
      user: currentUser,
    });
    setTaxInvoices((prev) => prev.filter((item) => item.id !== row.id));
  };

  const handleHometaxFile = async (file: File) => {
    setImportLoading(true);
    setImportError("");
    try {
      const preview = await parseHometaxTaxInvoiceFile(file);
      setImportPreview(preview);
    } catch (error) {
      setImportPreview(null);
      setImportError(error instanceof Error ? error.message : L.hometaxImportFailed);
    } finally {
      setImportLoading(false);
    }
  };

  const confirmHometaxImport = () => {
    if (!importPreview) return;
    const result = mergeHometaxTaxInvoices(taxInvoices, importPreview, {
      name: authorName,
      loginId: authorLoginId,
    });
    setTaxInvoices(result.next);
    setImportPreview(null);
    recordSummaryAudit({
      entityType: "taxInvoice",
      entityId: "hometax-import",
      entityLabel: "\uD648\uD0D1\uC2A4 \uACC4\uC0B0\uC11C \uAC00\uC838\uC624\uAE30",
      screen: L.pageTitle,
      action: "import",
      fieldLabel: "\uAC00\uC838\uC624\uAE30",
      after: `${result.added}\uAC74 \uCD94\uAC00${result.skipped ? ` \u00B7 ${result.skipped}\uAC74 \uC81C\uC678` : ""}`,
      user: currentUser,
    });
    const periodLabel =
      importPreview.earliestIssueDate && importPreview.latestIssueDate
        ? importPreview.earliestIssueDate === importPreview.latestIssueDate
          ? ` \u00B7 ${L.infoPeriod} ${formatTaxInvoiceDate(importPreview.latestIssueDate)}`
          : ` \u00B7 ${L.infoPeriod} ${formatTaxInvoiceDate(importPreview.earliestIssueDate)} ~ ${formatTaxInvoiceDate(importPreview.latestIssueDate)}`
        : "";
    setImportMessage(
      `${L.hometaxImportDone} (${result.added}${L.hometaxImportAdded}${result.skipped ? `, ${result.skipped}${L.hometaxImportSkipped}` : ""})${periodLabel}`
    );
  };

  return (
    <div className="erp-page erp-tax-invoice-page">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="erp-text-page-title">{L.pageTitle}</h1>
          <p className="mt-1 erp-text-body text-slate-500">{L.pageDesc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            disabled={importLoading}
            onClick={() => hometaxInputRef.current?.click()}
          >
            <FileSpreadsheet size={16} className="mr-2" />
            {L.hometaxImport}
          </Button>
          <Button type="button" className="rounded-2xl" onClick={openCreateModal}>
            <Plus size={16} className="mr-2" />
            {L.add}
          </Button>
        </div>
        <input
          ref={hometaxInputRef}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleHometaxFile(file);
            event.target.value = "";
          }}
        />
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

      {importMessage ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 erp-text-body font-semibold text-emerald-700">
          {importMessage}
        </div>
      ) : null}
      {importError ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 erp-text-body font-semibold text-red-600">
          {importError}
        </div>
      ) : null}

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
                onClick={() => {
                  setFlowFilter(option.key);
                  if (option.key === "sales" && isClientView) setViewMode("byClientSales");
                  if (option.key === "purchase" && isClientView) setViewMode("byClientPurchase");
                  if (option.key === "all" && isClientView) setViewMode("list");
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="erp-text-caption font-semibold text-slate-500">{L.viewModeLabel}</div>
            {VIEW_MODE_OPTIONS.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant={viewMode === option.key ? "default" : "outline"}
                className={`rounded-2xl ${
                  option.key === "byClientSales" && viewMode === option.key ? "bg-emerald-600 hover:bg-emerald-700" : ""
                } ${option.key === "byClientPurchase" && viewMode === option.key ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                onClick={() => {
                  setViewMode(option.key);
                  if (option.key === "list") {
                    setExpandedClientKeys([]);
                  } else if (option.key === "byClientSales") {
                    setFlowFilter("sales");
                    setExpandedClientKeys([]);
                  } else if (option.key === "byClientPurchase") {
                    setFlowFilter("purchase");
                    setExpandedClientKeys([]);
                  }
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {isClientView ? (
            <p className="mb-3 erp-text-caption text-slate-500">{L.clientSummaryHint}</p>
          ) : null}
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
          <TableExportSection fileName={exportTitle} title={exportTitle} disabled={filteredRows.length === 0}>
            <MobileRecordList>
              {isClientView ? (
                clientSections.some((section) => section.groups.length) ? (
                  clientSections.map((section) => (
                    <div key={section.key} className="mb-6 last:mb-0">
                      <ClientFlowSectionHeader
                        title={section.title}
                        count={section.groups.length}
                        total={sumClientSectionTotal(section.groups)}
                        tone={section.key}
                      />
                      {section.groups.length ? (
                        <div className="space-y-3">{section.groups.map((group) => renderClientGroupMobile(group))}</div>
                      ) : (
                        <MobileRecordCard empty emptyLabel={L.empty} />
                      )}
                    </div>
                  ))
                ) : (
                  <MobileRecordCard empty emptyLabel={L.empty} />
                )
              ) : filteredRows.length ? (
                filteredRows.map((row) => renderInvoiceMobileCard(row))
              ) : (
                <MobileRecordCard empty emptyLabel={L.empty} />
              )}
            </MobileRecordList>
            <DesktopTableWrap>
              {isClientView ? (
                <table className="erp-table min-w-full">
                  <thead>
                    <tr>
                      <th className="w-10" />
                      <th>{L.client}</th>
                      <th>{L.businessNo}</th>
                      <th className="text-right">{L.invoiceCount}</th>
                      <th className="text-right">{L.supplyAmount}</th>
                      <th className="text-right">{L.vatAmount}</th>
                      <th className="text-right">{L.totalAmount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientSections.map((section) => (
                      <React.Fragment key={section.key}>
                        <tr className={section.key === "sales" ? "bg-emerald-50" : "bg-amber-50"}>
                          <td colSpan={7} className="px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={`font-bold ${section.key === "sales" ? "text-emerald-800" : "text-amber-800"}`}>
                                {section.title}
                              </span>
                              <span className="text-sm font-semibold text-slate-600">
                                {section.groups.length}
                                {L.clientCount} · {L.grandTotal} {formatKRW(sumClientSectionTotal(section.groups))}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {section.groups.length ? (
                          section.groups.map((group) => renderClientGroupDesktop(group))
                        ) : (
                          <tr>
                            <td colSpan={7} className="p-4 text-center text-slate-500">
                              {L.empty}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {!clientSections.some((section) => section.groups.length) ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-500">
                          {L.empty}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              ) : (
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
                    {filteredRows.map((row) => renderInvoiceRow(row))}
                    {!filteredRows.length ? (
                      <tr>
                        <td colSpan={12} className="p-6 text-center text-slate-500">
                          {L.empty}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              )}
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

      {importPreview ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setImportPreview(null)}>
          <div className="erp-ledger-modal max-w-3xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="erp-text-section font-bold">{L.hometaxImportTitle}</h2>
                <p className="mt-1 erp-text-caption text-slate-500">{L.hometaxImportDesc}</p>
              </div>
              <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={() => setImportPreview(null)}>
                <X size={18} />
              </button>
            </div>

            {importPreview.latestIssueDate ? (
              <div className="mb-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600">{L.infoPeriod}</div>
                <div className="mt-1 text-lg font-black text-slate-900">
                  {importPreview.earliestIssueDate &&
                  importPreview.earliestIssueDate !== importPreview.latestIssueDate
                    ? `${formatTaxInvoiceDate(importPreview.earliestIssueDate)} ~ ${formatTaxInvoiceDate(importPreview.latestIssueDate)}`
                    : formatTaxInvoiceDate(importPreview.latestIssueDate)}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {L.latestIssueDate}: {formatTaxInvoiceDate(importPreview.latestIssueDate)}
                  {" \u00B7 "}
                  {importPreview.rows.length}
                  {L.count}
                </div>
              </div>
            ) : null}

            {importPreview.title ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                {importPreview.title}
              </div>
            ) : null}

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="erp-text-caption text-slate-500">{L.flowType}</div>
                <div className="mt-1 font-bold text-slate-900">{getTaxInvoiceFlowLabel(importPreview.flowType)}</div>
                <div className="mt-2 erp-text-caption text-slate-500">{importPreview.sourceFile}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="erp-text-caption text-slate-500">{L.previewRows}</div>
                <div className="mt-1 font-bold text-slate-900">
                  {importPreview.rows.length}
                  {L.count}
                </div>
                <div className="mt-2 erp-text-caption text-slate-500">
                  {importPreview.rows.filter((row) => taxInvoices.some((existing) => String(existing.invoiceNo || "").trim() === row.invoiceNo)).length}
                  {L.hometaxImportSkipped}
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="erp-text-caption font-semibold text-emerald-700">{L.previewTotal}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-slate-500">{L.supplyTotal}</div>
                  <div className="font-bold text-slate-900">{formatKRW(importPreview.parsedTotals.supply)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{L.vatTotal}</div>
                  <div className="font-bold text-amber-700">{formatKRW(importPreview.parsedTotals.vat)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{L.grandTotal}</div>
                  <div className="font-bold text-emerald-700">{formatKRW(importPreview.parsedTotals.total)}</div>
                </div>
              </div>
            </div>

            <div className="mb-4 max-h-64 overflow-auto rounded-2xl border">
              <table className="erp-table w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-2 text-left">{L.issueDate}</th>
                    <th className="p-2 text-left">{L.client}</th>
                    <th className="p-2 text-right">{L.totalAmount}</th>
                    <th className="p-2 text-left">{L.invoiceNo}</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 8).map((row) => (
                    <tr key={row.invoiceNo} className="border-t">
                      <td className="p-2 whitespace-nowrap">{formatTaxInvoiceDate(row.issueDate)}</td>
                      <td className="p-2">{row.client}</td>
                      <td className="p-2 text-right font-semibold">{formatKRW(row.totalAmount)}</td>
                      <td className="p-2 text-xs text-slate-500">{row.invoiceNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importPreview.errors.length ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {importPreview.errors.slice(0, 3).join(" ")}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setImportPreview(null)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={confirmHometaxImport}>
                {L.hometaxImportConfirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
