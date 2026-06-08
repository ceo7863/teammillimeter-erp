export type TaxInvoiceDocumentType = "tax" | "bill";

export type TaxInvoiceFlowType = "sales" | "purchase";

export type TaxInvoiceStatus = "issued" | "cancelled";

export type TaxInvoice = {
  id: string;
  issueDate: string;
  client: string;
  businessNo: string;
  flowType: TaxInvoiceFlowType;
  documentType: TaxInvoiceDocumentType;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  invoiceNo?: string;
  memo?: string;
  status: TaxInvoiceStatus;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;
  createdByLoginId?: string;
  updatedBy?: string;
};

export const TAX_INVOICE_FLOW_OPTIONS: Array<{ value: TaxInvoiceFlowType; label: string }> = [
  { value: "sales", label: "\uB9E4\uCD9C" },
  { value: "purchase", label: "\uB9E4\uC785" },
];

export const TAX_INVOICE_DOCUMENT_OPTIONS: Array<{ value: TaxInvoiceDocumentType; label: string }> = [
  { value: "tax", label: "\uC138\uAE08\uACC4\uC0B0\uC11C" },
  { value: "bill", label: "\uACC4\uC0B0\uC11C" },
];

export const TAX_INVOICE_STATUS_OPTIONS: Array<{ value: TaxInvoiceStatus; label: string }> = [
  { value: "issued", label: "\uBC1C\uD589" },
  { value: "cancelled", label: "\uCDE8\uC18C" },
];

export function makeTaxInvoiceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `tax-inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Deduplicate imports across Barobill vs Hometax invoiceNo formatting. */
export function normalizeTaxInvoiceNoKey(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || String(value || "").trim().toLowerCase();
}

export function normalizeTaxInvoiceDocumentType(value: unknown): TaxInvoiceDocumentType {
  return value === "bill" ? "bill" : "tax";
}

export function normalizeTaxInvoiceFlowType(value: unknown): TaxInvoiceFlowType {
  return value === "purchase" ? "purchase" : "sales";
}

export function normalizeTaxInvoiceStatus(value: unknown): TaxInvoiceStatus {
  return value === "cancelled" ? "cancelled" : "issued";
}

export function getTaxInvoiceDocumentTypeLabel(type: TaxInvoiceDocumentType) {
  return TAX_INVOICE_DOCUMENT_OPTIONS.find((item) => item.value === type)?.label || TAX_INVOICE_DOCUMENT_OPTIONS[0].label;
}

export function getTaxInvoiceFlowLabel(flowType: TaxInvoiceFlowType) {
  return TAX_INVOICE_FLOW_OPTIONS.find((item) => item.value === flowType)?.label || TAX_INVOICE_FLOW_OPTIONS[0].label;
}

export function getTaxInvoiceKindLabel(row: Pick<TaxInvoice, "flowType" | "documentType">) {
  return `${getTaxInvoiceFlowLabel(row.flowType)} ${getTaxInvoiceDocumentTypeLabel(row.documentType)}`;
}

export function getTaxInvoiceStatusLabel(status: TaxInvoiceStatus) {
  return TAX_INVOICE_STATUS_OPTIONS.find((item) => item.value === status)?.label || TAX_INVOICE_STATUS_OPTIONS[0].label;
}

export function parseTaxInvoiceAmount(value: unknown) {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

export function calculateTaxInvoiceAmounts(supplyAmount: number, documentType: TaxInvoiceDocumentType) {
  const supply = Math.max(0, Math.round(supplyAmount));
  const vatAmount = documentType === "tax" ? Math.round(supply * 0.1) : 0;
  return {
    supplyAmount: supply,
    vatAmount,
    totalAmount: supply + vatAmount,
  };
}

export function calculateTaxInvoiceAmountsFromTotal(totalAmount: number, documentType: TaxInvoiceDocumentType) {
  const total = Math.max(0, Math.round(totalAmount));
  if (documentType === "bill") {
    return {
      supplyAmount: total,
      vatAmount: 0,
      totalAmount: total,
    };
  }
  const supplyAmount = Math.round(total / 1.1);
  const vatAmount = total - supplyAmount;
  return {
    supplyAmount,
    vatAmount,
    totalAmount: total,
  };
}

export function resolveTaxInvoiceModalAmounts(input: {
  supplyAmount: string | number;
  totalAmount: string | number;
  documentType: TaxInvoiceDocumentType;
  amountInputSource?: "supply" | "total";
}) {
  const supply = parseTaxInvoiceAmount(input.supplyAmount);
  const total = parseTaxInvoiceAmount(input.totalAmount);
  if (input.amountInputSource === "total" && total > 0) {
    return calculateTaxInvoiceAmountsFromTotal(total, input.documentType);
  }
  if (supply > 0) {
    return calculateTaxInvoiceAmounts(supply, input.documentType);
  }
  if (total > 0) {
    return calculateTaxInvoiceAmountsFromTotal(total, input.documentType);
  }
  return calculateTaxInvoiceAmounts(0, input.documentType);
}

export function normalizeTaxInvoice(raw: Partial<TaxInvoice> & { id: string }): TaxInvoice {
  const documentType = normalizeTaxInvoiceDocumentType(raw.documentType);
  const amounts = calculateTaxInvoiceAmounts(parseTaxInvoiceAmount(raw.supplyAmount), documentType);
  return {
    id: raw.id,
    issueDate: String(raw.issueDate || new Date().toISOString().slice(0, 10)),
    client: String(raw.client || ""),
    businessNo: String(raw.businessNo || ""),
    flowType: normalizeTaxInvoiceFlowType(raw.flowType),
    documentType,
    supplyAmount: amounts.supplyAmount,
    vatAmount: amounts.vatAmount,
    totalAmount: parseTaxInvoiceAmount(raw.totalAmount) || amounts.totalAmount,
    invoiceNo: raw.invoiceNo ? String(raw.invoiceNo) : undefined,
    memo: raw.memo ? String(raw.memo) : undefined,
    status: normalizeTaxInvoiceStatus(raw.status),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    createdBy: String(raw.createdBy || ""),
    createdByLoginId: raw.createdByLoginId ? String(raw.createdByLoginId) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
  };
}

export function normalizeTaxInvoices(rows: unknown[]) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && "id" in row)
    .map((row) => normalizeTaxInvoice(row as Partial<TaxInvoice> & { id: string }));
}

export function sortTaxInvoices(rows: TaxInvoice[]) {
  return [...rows].sort((a, b) => {
    const dateDiff = String(b.issueDate).localeCompare(String(a.issueDate));
    if (dateDiff !== 0) return dateDiff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

export function filterTaxInvoicesByPeriod(rows: TaxInvoice[], startDate: string, endDate: string) {
  if (!startDate && !endDate) return rows;
  return rows.filter((row) => {
    const date = String(row.issueDate || "");
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  });
}

export function filterTaxInvoicesByFlow(rows: TaxInvoice[], flowType: "all" | TaxInvoiceFlowType) {
  if (flowType === "all") return rows;
  return rows.filter((row) => row.flowType === flowType);
}

export function filterTaxInvoices(rows: TaxInvoice[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.client,
      row.businessNo,
      row.invoiceNo || "",
      row.memo || "",
      row.createdBy,
      getTaxInvoiceFlowLabel(row.flowType),
      getTaxInvoiceDocumentTypeLabel(row.documentType),
      getTaxInvoiceKindLabel(row),
      getTaxInvoiceStatusLabel(row.status),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function matchesTaxInvoiceCancellationPair(
  cancelled: Pick<TaxInvoice, "flowType" | "documentType" | "client" | "businessNo" | "supplyAmount" | "vatAmount" | "totalAmount">,
  issued: Pick<TaxInvoice, "flowType" | "documentType" | "client" | "businessNo" | "supplyAmount" | "vatAmount" | "totalAmount" | "status">,
) {
  if (issued.status !== "issued") return false;
  if (cancelled.flowType !== issued.flowType) return false;
  if (cancelled.documentType !== issued.documentType) return false;
  if (buildTaxInvoiceClientGroupKey(cancelled) !== buildTaxInvoiceClientGroupKey(issued)) return false;
  if (cancelled.totalAmount !== issued.totalAmount) return false;
  if (cancelled.supplyAmount !== issued.supplyAmount) return false;
  if (cancelled.vatAmount !== issued.vatAmount) return false;
  return true;
}

/** 취소 전표와 동일 금액·거래처의 발행 전표를 짝지어 합계에서 제외할 id 집합 */
export function buildTaxInvoiceCancellationExcludedIds(rows: TaxInvoice[]) {
  const excluded = new Set<string>();
  const usedIssuedIds = new Set<string>();
  const issuedRows = rows.filter((row) => row.status === "issued");
  const cancelledRows = [...rows.filter((row) => row.status === "cancelled")].sort((a, b) => {
    const dateDiff = String(a.issueDate).localeCompare(String(b.issueDate));
    if (dateDiff !== 0) return dateDiff;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  cancelledRows.forEach((cancelled) => {
    excluded.add(cancelled.id);

    const candidates = issuedRows
      .filter((issued) => !usedIssuedIds.has(issued.id) && matchesTaxInvoiceCancellationPair(cancelled, issued))
      .sort((a, b) => {
        const aBefore = a.issueDate <= cancelled.issueDate ? 0 : 1;
        const bBefore = b.issueDate <= cancelled.issueDate ? 0 : 1;
        if (aBefore !== bBefore) return aBefore - bBefore;
        const aDistance = Math.abs(new Date(a.issueDate).getTime() - new Date(cancelled.issueDate).getTime());
        const bDistance = Math.abs(new Date(b.issueDate).getTime() - new Date(cancelled.issueDate).getTime());
        if (aDistance !== bDistance) return aDistance - bDistance;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });

    const paired = candidates[0];
    if (paired) {
      excluded.add(paired.id);
      usedIssuedIds.add(paired.id);
    }
  });

  return excluded;
}

export function isTaxInvoiceIncludedInTotals(row: TaxInvoice, rows: TaxInvoice[]) {
  if (row.status !== "cancelled" && row.status !== "issued") return true;
  return !buildTaxInvoiceCancellationExcludedIds(rows).has(row.id);
}

export function sumTaxInvoices(rows: TaxInvoice[], options?: { activeOnly?: boolean }) {
  const activeOnly = options?.activeOnly !== false;
  const excludedIds = activeOnly ? buildTaxInvoiceCancellationExcludedIds(rows) : new Set<string>();
  return rows.reduce(
    (acc, row) => {
      if (activeOnly && excludedIds.has(row.id)) return acc;
      acc.count += 1;
      acc.supply += row.supplyAmount;
      acc.vat += row.vatAmount;
      acc.total += row.totalAmount;
      return acc;
    },
    { count: 0, supply: 0, vat: 0, total: 0 }
  );
}

export function buildTaxInvoiceStats(rows: TaxInvoice[]) {
  const salesRows = filterTaxInvoicesByFlow(rows, "sales");
  const purchaseRows = filterTaxInvoicesByFlow(rows, "purchase");
  return {
    all: sumTaxInvoices(rows),
    sales: sumTaxInvoices(salesRows),
    purchase: sumTaxInvoices(purchaseRows),
  };
}

export function buildTaxInvoiceClientGroupKey(row: Pick<TaxInvoice, "client" | "businessNo" | "flowType">) {
  const businessNo = String(row.businessNo || "").trim();
  const client = String(row.client || "").trim() || "(미지정)";
  const partyKey = businessNo || client;
  return `${row.flowType}:${partyKey}`;
}

export type TaxInvoiceClientSummary = {
  key: string;
  flowType: TaxInvoiceFlowType;
  client: string;
  businessNo: string;
  count: number;
  supply: number;
  vat: number;
  total: number;
  rows: TaxInvoice[];
};

export function buildTaxInvoiceClientSummaries(rows: TaxInvoice[]): TaxInvoiceClientSummary[] {
  const map = new Map<string, TaxInvoiceClientSummary>();
  const excludedIds = buildTaxInvoiceCancellationExcludedIds(rows);

  rows.forEach((row) => {
    const key = buildTaxInvoiceClientGroupKey(row);
    if (!map.has(key)) {
      map.set(key, {
        key,
        flowType: row.flowType,
        client: String(row.client || "").trim() || "(미지정)",
        businessNo: String(row.businessNo || "").trim(),
        count: 0,
        supply: 0,
        vat: 0,
        total: 0,
        rows: [],
      });
    }

    const bucket = map.get(key)!;
    bucket.rows.push(row);
    if (!excludedIds.has(row.id)) {
      bucket.count += 1;
      bucket.supply += row.supplyAmount;
      bucket.vat += row.vatAmount;
      bucket.total += row.totalAmount;
    }
  });

  return [...map.values()]
    .map((group) => ({
      ...group,
      rows: sortTaxInvoices(group.rows),
    }))
    .sort((a, b) => b.total - a.total || a.client.localeCompare(b.client, "ko"));
}

export function formatTaxInvoicePeriodLabel(startDate: string, endDate: string) {
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  if (startDate) return `${startDate} ~`;
  if (endDate) return `~ ${endDate}`;
  return "\uC804\uCCB4 \uAE30\uAC04";
}

export function listTaxInvoiceYears(rows: TaxInvoice[]) {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const row of rows) {
    const year = Number(String(row.issueDate || "").slice(0, 4));
    if (Number.isFinite(year) && year > 1900) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export function countTaxInvoicesThisMonth(rows: TaxInvoice[]) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const excludedIds = buildTaxInvoiceCancellationExcludedIds(rows);
  return rows.filter(
    (row) => !excludedIds.has(row.id) && String(row.issueDate || "").startsWith(monthKey),
  ).length;
}

export function validateTaxInvoiceInput(input: {
  issueDate: string;
  client: string;
  supplyAmount: string | number;
  totalAmount?: string | number;
}) {
  if (!String(input.issueDate || "").trim()) return "\uBC1C\uD589\uC77C\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!String(input.client || "").trim()) return "\uAC70\uB798\uCC98\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  const supply = parseTaxInvoiceAmount(input.supplyAmount);
  const total = parseTaxInvoiceAmount(input.totalAmount);
  if (supply <= 0 && total <= 0) return "\uACF5\uAE09\uAC00\uC561 \uB610\uB294 \uBD80\uAC00\uC138 \uD3EC\uD568 \uAE08\uC561\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  return null;
}

export function formatTaxInvoiceDate(iso: string) {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

export type BarobillIssueDuplicateInput = {
  issueDate: string;
  client: string;
  businessNo: string;
  documentType: TaxInvoiceDocumentType;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
};

function matchesBarobillIssueParty(
  input: Pick<BarobillIssueDuplicateInput, "client" | "businessNo">,
  row: Pick<TaxInvoice, "client" | "businessNo" | "flowType">,
) {
  const inputDigits = String(input.businessNo || "").replace(/\D/g, "");
  const rowDigits = String(row.businessNo || "").replace(/\D/g, "");
  if (inputDigits && rowDigits && inputDigits === rowDigits) return true;

  const inputKey = buildTaxInvoiceClientGroupKey({
    client: input.client,
    businessNo: input.businessNo,
    flowType: "sales",
  });
  const rowKey = buildTaxInvoiceClientGroupKey(row);
  return inputKey === rowKey;
}

export function findDuplicateTaxInvoicesForBarobillIssue(
  rows: TaxInvoice[],
  input: BarobillIssueDuplicateInput,
  excludeId?: string,
) {
  return rows.filter((row) => {
    if (excludeId && row.id === excludeId) return false;
    if (row.flowType !== "sales") return false;
    if (row.status === "cancelled") return false;
    if (row.issueDate !== input.issueDate) return false;
    if (row.documentType !== input.documentType) return false;
    if (row.supplyAmount !== input.supplyAmount) return false;
    if (row.totalAmount !== input.totalAmount) return false;
    if (input.documentType === "tax" && row.vatAmount !== input.vatAmount) return false;
    if (!matchesBarobillIssueParty(input, row)) return false;
    return true;
  });
}

export function formatDuplicateTaxInvoiceIssueSummary(matches: TaxInvoice[]) {
  return matches.map((row) => {
    const parts = [
      `\uC77C\uC790: ${formatTaxInvoiceDate(row.issueDate)}`,
      `\uAC70\uB798\uCC98: ${row.client || "-"}`,
      `\uD569\uACC4: ${row.totalAmount.toLocaleString("ko-KR")}\uC6D0`,
    ];
    if (row.invoiceNo) {
      parts.push(`\uACC4\uC0B0\uC11C\uBC88\uD638: ${row.invoiceNo}`);
    }
    return parts.join(" \u00B7 ");
  });
}
