import { parseMoney } from "@/utils/receivables";
import { todayISO } from "@/utils/receivables";
import { defaultSalesRegistrationDate } from "@/utils/koreanBusinessDays";
import {
  getSaleTotalBill,
  getSaleWorkerLines,
  resolveWorkerLineChargeAmount,
  resolveWorkerLineUnitCost,
} from "@/utils/saleBilling";
import {
  applyWorkerLineFieldUpdate,
  buildWorkerFeeMap,
  enrichWorkerLineWithMetrics,
  hasExplicitWorkerField,
  isLineBillStaleUnitCostFallback,
  resolveWorkerFeeRate,
  stripWorkerLineComputedMetrics,
} from "@/utils/workerLineMetrics";
import {
  findWorkerMasterByListName,
  isWorkerActive,
  resolveWorkerListName,
} from "@/utils/workerPayments";
import { stripCalwalkProvenance, type CalwalkLineProvenance } from "@/utils/calwalkLineProvenance";
import {
  checkTaxTreatmentChange,
  computeSaleTaxAmounts,
  DEFAULT_NEW_SALE_TAX_TREATMENT,
  isTaxTreatment,
  resolveSaleTaxTreatment,
  TAX_EVIDENCE_STATUSES,
  TAX_TREATMENTS_REQUIRING_REASON,
  type TaxEvidenceStatus,
  type TaxTreatment,
} from "@/utils/saleTaxTreatment";

function isTaxEvidenceStatus(value: unknown): value is TaxEvidenceStatus {
  return typeof value === "string" && (TAX_EVIDENCE_STATUSES as readonly string[]).includes(value);
}

let workerLineKeyCounter = 0;

export type SaleWorkerLine = {
  _lineKey?: string;
  no: number;
  worker: string;
  quantity: string;
  unitCost: string;
  chargeAmount: string;
  meal: string;
  lodging: string;
  expense: string;
  overtimeHours: string;
  overtimeCost: string;
  memo: string;
  feeRate?: string | number;
  createdBy?: string;
  createdByEmail?: string;
  createdAt?: string;
} & Partial<CalwalkLineProvenance>;

export type SaleFormData = {
  date: string;
  client: string;
  site: string;
  contactId?: string;
  contactName?: string;
  contactSelected?: boolean;
  paid: string;
  memo: string;
  officeMemo: string;
  workers: SaleWorkerLine[];
  createdBy?: string;
  createdByEmail?: string;
  createdAt?: string;
  /** Sale tax treatment; LEGACY_UNSPECIFIED only for rows stored before the field existed. */
  taxTreatment?: TaxTreatment;
  taxReason?: string;
  taxEvidenceStatus?: TaxEvidenceStatus;
};

export const emptySaleForm = (): SaleFormData => ({
  date: todayISO(),
  client: "",
  site: "",
  paid: "",
  memo: "",
  officeMemo: "",
  workers: Array.from({ length: 5 }, (_, index) => createWorkerLine(index)),
  taxTreatment: DEFAULT_NEW_SALE_TAX_TREATMENT,
  taxReason: "",
});

export const compactSaleForm = (): SaleFormData => ({
  ...emptySaleForm(),
  date: defaultSalesRegistrationDate(),
  workers: Array.from({ length: 8 }, (_, index) => createWorkerLine(index)),
});

export function createWorkerLine(index: number): SaleWorkerLine {
  return {
    _lineKey: `wl-${++workerLineKeyCounter}`,
    no: index + 1,
    worker: "",
    quantity: "",
    unitCost: "",
    chargeAmount: "",
    meal: "",
    lodging: "",
    expense: "",
    overtimeHours: "",
    overtimeCost: "",
    memo: "",
  };
}

/** 시공자 미입력 행 — 공통비고·야근 등 데이터를 넣지 않도록 필드 초기화 */
export function resetUnfilledWorkerLine(line: SaleWorkerLine): SaleWorkerLine {
  return {
    ...createWorkerLine((line.no || 1) - 1),
    _lineKey: line._lineKey,
    no: line.no,
  };
}

function resolveWorkerLineOvertimeRate(
  workers: Array<{ name?: string; overtimeCost?: number }>,
  clients: Array<{ name?: string; overtimeCost?: number }>,
  clientName: string,
  workerName: string,
) {
  const selectedWorker = findActiveWorkerByName(workers, workerName);
  const selectedClient = clients.find((client) => client.name === clientName);
  return selectedClient?.overtimeCost ?? selectedWorker?.overtimeCost ?? 30000;
}

export function calculateWorkerLineOvertimeTotal(
  line: SaleWorkerLine,
  workers: Array<{ name?: string; overtimeCost?: number }>,
  clients: Array<{ name?: string; overtimeCost?: number }>,
  clientName: string,
) {
  const hours = parseMoney(line.overtimeHours);
  if (hours <= 0) return 0;

  const workerName = String(line.worker || "").trim();
  const storedRate = parseMoney(line.overtimeCost);
  const rate = storedRate > 0
    ? storedRate
    : workerName
      ? resolveWorkerLineOvertimeRate(workers, clients, clientName, workerName)
      : 30000;
  return hours * rate;
}

/** 시공자·야근시간이 있으면 야근단가를 내부에 채워 저장·합계 계산이 되도록 함 */
export function syncWorkerLineOvertimeRate(
  line: SaleWorkerLine,
  workers: Array<{ name?: string; overtimeCost?: number }>,
  clients: Array<{ name?: string; overtimeCost?: number }>,
  clientName: string,
): SaleWorkerLine {
  const workerName = String(line.worker || "").trim();
  const hours = parseMoney(line.overtimeHours);
  if (!workerName || hours <= 0) {
    return { ...line, overtimeCost: "" };
  }

  const rate = resolveWorkerLineOvertimeRate(workers, clients, clientName, workerName);
  return { ...line, overtimeCost: String(rate) };
}

export function saleRowToForm(row: Record<string, unknown>, minWorkerRows = 8): SaleFormData {
  const rawWorkers = row.workers;
  let workerLines: SaleWorkerLine[];

  if (Array.isArray(rawWorkers) && rawWorkers.length > 0) {
    workerLines = rawWorkers.map((line, index) => {
      const source = line && typeof line === "object" ? (line as SaleWorkerLine) : {};
      if (!String(source.worker || "").trim()) {
        return { ...createWorkerLine(index), _lineKey: source._lineKey, no: source.no ?? index + 1 };
      }
      const merged = { ...createWorkerLine(index), ...source };
      if (
        Object.prototype.hasOwnProperty.call(merged, "chargeAmount") &&
        !hasExplicitWorkerField(merged.chargeAmount) &&
        isLineBillStaleUnitCostFallback(merged)
      ) {
        return stripWorkerLineComputedMetrics(merged);
      }
      return merged;
    });
  } else {
    const legacyLines = getSaleWorkerLines(row);
    workerLines = legacyLines.length
      ? legacyLines.map((line, index) => ({
          ...createWorkerLine(index),
          ...line,
          quantity: line.quantity || "1",
          chargeAmount: line.chargeAmount || String(row.amount || ""),
          unitCost: line.unitCost || String(row.amount || ""),
        }))
      : [
          {
            ...createWorkerLine(0),
            worker: String(row.worker || ""),
            quantity: "1",
            chargeAmount: String(row.amount || ""),
            unitCost: String(row.amount || ""),
          },
        ];
  }

  while (workerLines.length < minWorkerRows) {
    workerLines.push(createWorkerLine(workerLines.length));
  }

  return {
    date: String(row.date || todayISO()),
    client: String(row.client || ""),
    site: String(row.site || ""),
    contactId: String((row as { contactId?: string }).contactId || "").trim(),
    contactName: String((row as { contactName?: string }).contactName || "").trim(),
    contactSelected: Boolean(String((row as { contactId?: string }).contactId || "").trim()),
    paid: (row as { manualPaidCleared?: boolean }).manualPaidCleared ? "" : String(row.basePaid ?? 0),
    memo: String(row.memo || ""),
    officeMemo: String(row.officeMemo || ""),
    workers: workerLines,
    taxTreatment: resolveSaleTaxTreatment(row as { taxTreatment?: string | null }),
    taxReason: String((row as { taxReason?: string }).taxReason || ""),
    ...(isTaxEvidenceStatus((row as { taxEvidenceStatus?: unknown }).taxEvidenceStatus)
      ? { taxEvidenceStatus: (row as { taxEvidenceStatus: TaxEvidenceStatus }).taxEvidenceStatus }
      : {}),
  };
}

function findActiveWorkerByName(
  workers: Array<{ name?: string }>,
  name: string,
) {
  const master = findWorkerMasterByListName(workers, name);
  return master && isWorkerActive(master) ? master : undefined;
}

export function enrichWorkerLineOnWorkerSelect(
  line: SaleWorkerLine,
  workers: Array<{ name?: string; feeRate?: number; overtimeCost?: number; constructionCost?: number }>,
  clients: Array<{ name?: string; overtimeCost?: number; constructionCost?: number }>,
  clientName: string,
  rawWorkerName: string,
) {
  const workerName = resolveWorkerListName(workers, rawWorkerName) || rawWorkerName;
  if (!String(workerName || "").trim()) {
    return resetUnfilledWorkerLine(line);
  }

  const previousWorker = String(line.worker || "").trim();
  const baseLine =
    line.sourceType && previousWorker && previousWorker !== String(workerName).trim()
      ? stripCalwalkProvenance(line)
      : line;
  let nextLine = applyWorkerLineFieldUpdate(baseLine, "worker", workerName);
  const selectedWorker = findActiveWorkerByName(workers, workerName);
  const selectedClient = clients.find((client) => client.name === clientName);
  nextLine.quantity = nextLine.quantity || "1";
  const unitCost = resolveWorkerLineUnitCost(selectedWorker);
  if (unitCost) nextLine.unitCost = unitCost;
  const chargeAmount = resolveWorkerLineChargeAmount(selectedWorker, selectedClient);
  if (chargeAmount) nextLine.chargeAmount = chargeAmount;
  nextLine.feeRate = selectedWorker?.feeRate ?? nextLine.feeRate ?? "";
  nextLine = syncWorkerLineOvertimeRate(nextLine, workers, clients, clientName);
  return stripWorkerLineComputedMetrics(nextLine);
}

export function applySaleWorkerLineUpdate(
  line: SaleWorkerLine,
  key: string,
  value: unknown,
  workers: Array<{ name?: string; feeRate?: number; overtimeCost?: number; constructionCost?: number }>,
  clients: Array<{ name?: string; overtimeCost?: number; constructionCost?: number }>,
  clientName: string,
) {
  if (key === "worker") {
    return enrichWorkerLineOnWorkerSelect(line, workers, clients, clientName, String(value ?? ""));
  }

  let nextLine = applyWorkerLineFieldUpdate(line, key, value) as SaleWorkerLine;
  if (key === "overtimeHours" || key === "overtimeCost") {
    nextLine = syncWorkerLineOvertimeRate(nextLine, workers, clients, clientName);
  }
  return nextLine;
}

export function reEnrichWorkerLinesForClient(
  lines: SaleWorkerLine[],
  workers: Array<{ name?: string; feeRate?: number; overtimeCost?: number; constructionCost?: number; customChargeCost?: number }>,
  clients: Array<{ name?: string; overtimeCost?: number; constructionCost?: number }>,
  clientName: string,
) {
  const trimmedClient = String(clientName || "").trim();
  return lines.map((line) => {
    const workerName = String(line.worker || "").trim();
    if (!workerName) return line;
    return enrichWorkerLineOnWorkerSelect(line, workers, clients, trimmedClient, workerName);
  });
}

function getInactiveWorkerNamesInForm(form: SaleFormData, workers: Array<{ name?: string }>) {
  const inactiveNames = new Set(
    workers
      .filter((worker) => !isWorkerActive(worker))
      .map((worker) => String(worker.name || "").trim())
      .filter(Boolean),
  );
  return [
    ...new Set(
      (form.workers || [])
        .map((line) => String(line.worker || "").trim())
        .filter((name) => name && inactiveNames.has(name)),
    ),
  ];
}

function findRegisteredClientByName(clients: Array<{ name?: string }>, name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return undefined;
  return clients.find((client) => client.name === trimmed);
}

function getInactiveClientNamesInForm(form: SaleFormData, clients: Array<{ name?: string; isActive?: boolean }>) {
  const inactiveNames = new Set(
    clients
      .filter((client) => client.isActive === false)
      .map((client) => String(client.name || "").trim())
      .filter(Boolean),
  );
  const clientName = String(form.client || "").trim();
  return clientName && inactiveNames.has(clientName) ? [clientName] : [];
}

function getUnknownWorkerNamesInForm(form: SaleFormData, workers: Array<{ name?: string }>) {
  const knownNames = new Set(
    workers
      .map((worker) => String(worker.name || "").trim())
      .filter(Boolean),
  );
  return [
    ...new Set(
      (form.workers || [])
        .map((line) => String(line.worker || "").trim())
        .filter((name) => name && !knownNames.has(name)),
    ),
  ];
}

export function validateSaleFormMasterRefs(
  form: SaleFormData,
  clients: Array<{ name?: string }>,
  workers: Array<{ name?: string }>,
) {
  const clientName = String(form.client || "").trim();
  if (clientName && !findRegisteredClientByName(clients, clientName)) {
    return "등록된 거래처가 아닙니다.";
  }

  const inactiveClients = getInactiveClientNamesInForm(form, clients);
  if (inactiveClients.length > 0) {
    return `비활성 거래처는 선택할 수 없습니다: ${inactiveClients.join(", ")}`;
  }

  const inactiveWorkers = getInactiveWorkerNamesInForm(form, workers);
  if (inactiveWorkers.length > 0) {
    return `비활성 시공자는 선택할 수 없습니다: ${inactiveWorkers.join(", ")}`;
  }

  const unknownWorkers = getUnknownWorkerNamesInForm(form, workers);
  if (unknownWorkers.length > 0) {
    return `등록되지 않은 시공자입니다: ${unknownWorkers.join(", ")}`;
  }

  const hasRegisteredActiveWorker = (form.workers || []).some((line) =>
    findActiveWorkerByName(workers, line.worker),
  );
  if (!hasRegisteredActiveWorker) {
    return "활성 시공자를 1명 이상 선택해 주세요.";
  }

  return "";
}

export function isSaleFormMasterRefsValid(
  form: SaleFormData,
  clients: Array<{ name?: string }>,
  workers: Array<{ name?: string }>,
) {
  return validateSaleFormMasterRefs(form, clients, workers) === "";
}

/** Sales vouchers may be saved at zero; only negative or non-numeric totals are invalid. */
export function isSaleAmountSaveable(amount: unknown) {
  if (amount == null) return false;
  if (typeof amount === "string" && amount.trim() === "") return false;
  const value = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(value) && value >= 0;
}

export function buildSaleFromForm(
  form: SaleFormData,
  currentUser: { name?: string; email?: string } | null = null,
  workers: Array<{ name?: string; feeRate?: number; overtimeCost?: number }> = [],
  clients: Array<{ name?: string; overtimeCost?: number }> = [],
) {
  const feeMap = buildWorkerFeeMap(workers);
  const clientName = String(form.client || "").trim();
  const workerLines = (form.workers || [])
    .filter((line) => line.worker)
    .map((line) =>
      enrichWorkerLineWithMetrics(
        stripWorkerLineComputedMetrics(syncWorkerLineOvertimeRate(line, workers, clients, clientName)),
        resolveWorkerFeeRate(line, feeMap),
      ),
    );
  const amount = getSaleTotalBill({ workers: workerLines, amount: 0 });
  const workerNames = workerLines.map((line) => line.worker).filter(Boolean);
  const workerLabel = workerNames.join(", ");
  const now = new Date().toISOString();

  return {
    date: form.date,
    client: form.client,
    site: form.site,
    ...(form.contactSelected && String(form.contactId || "").trim()
      ? {
          contactId: String(form.contactId || "").trim(),
          contactName: String(form.contactName || "").trim(),
        }
      : {}),
    worker: workerLabel,
    workers: workerLines,
    amount,
    paid: Math.min(parseMoney(form.paid), amount),
    basePaid: Math.min(parseMoney(form.paid), amount),
    memo: String(form.memo ?? "").trim(),
    officeMemo: String(form.officeMemo ?? "").trim(),
    ...buildSaleTaxFieldsFromForm(form, amount),
    createdBy: currentUser?.name || form.createdBy || "-",
    createdByEmail: currentUser?.email || form.createdByEmail || "",
    createdAt: form.createdAt || now,
    updatedAt: now,
  };
}

/** Same rule the server enforces; returns a user message or null. */
export function validateSaleFormTax(
  form: SaleFormData,
  previousSale: { taxTreatment?: string | null } | null,
  options: { isAdmin?: boolean; locked?: boolean } = {},
) {
  if (!form.taxTreatment || (!previousSale && form.taxTreatment === "LEGACY_UNSPECIFIED")) return null;
  if (previousSale && form.taxTreatment === "LEGACY_UNSPECIFIED") return null;
  const check = checkTaxTreatmentChange({
    previous: previousSale,
    next: { taxTreatment: form.taxTreatment, taxReason: form.taxReason },
    isAdmin: Boolean(options.isAdmin),
    hasEffectiveAllocation: Boolean(options.locked),
    inSentStatement: false,
  });
  return "message" in check ? check.message : null;
}

/** Legacy (unclassified) sales stay unclassified unless a treatment is chosen; channel never decides it. */
function buildSaleTaxFieldsFromForm(form: SaleFormData, amount: number) {
  const treatment = isTaxTreatment(form.taxTreatment) ? form.taxTreatment : undefined;
  if (!treatment || treatment === "LEGACY_UNSPECIFIED") return {};
  const tax = computeSaleTaxAmounts({ amount, taxTreatment: treatment });
  const reason = String(form.taxReason ?? "").trim();
  return {
    taxTreatment: treatment,
    taxRate: tax.taxRate,
    supplyAmount: tax.supplyAmount,
    vatAmount: tax.vatAmount,
    grossReceivableAmount: tax.grossReceivableAmount,
    taxEvidenceStatus: form.taxEvidenceStatus || ("REVIEW_REQUIRED" as TaxEvidenceStatus),
    ...(TAX_TREATMENTS_REQUIRING_REASON.has(treatment) && reason ? { taxReason: reason } : {}),
  };
}

const WORKER_GRID_NUMERIC_COLUMNS = new Set([
  "quantity",
  "unitCost",
  "chargeAmount",
  "meal",
  "lodging",
  "expense",
  "overtimeHours",
  "overtimeCost",
]);

const WORKER_GRID_INTEGER_COLUMNS = new Set(["quantity", "overtimeHours"]);

function sanitizeWorkerGridCommitValue(rawValue: unknown, columnKey: string) {
  const isNumeric = WORKER_GRID_NUMERIC_COLUMNS.has(columnKey);
  if (!isNumeric) return String(rawValue ?? "");
  let sanitized = String(rawValue ?? "").replace(/[^0-9.-]/g, "");
  if (columnKey === "overtimeHours") {
    const num = Number(sanitized);
    return Number.isFinite(num) ? String(Math.floor(Math.max(0, num))) : "";
  }
  if (WORKER_GRID_INTEGER_COLUMNS.has(columnKey)) {
    sanitized = sanitized.replace(/[^\d]/g, "");
  }
  return sanitized;
}

type DomQueryRoot = Pick<ParentNode, "querySelectorAll">;

function resolveSaleFormDomRoot(root?: DomQueryRoot | null): DomQueryRoot | null {
  if (root) return root;
  return typeof document === "undefined" ? null : document;
}

/**
 * Read pending worker-grid input values from the DOM (commit-on-blur fields).
 * Pass the editor root so another mounted sale form's row N can never leak into this one.
 */
export function commitWorkerGridInputsFromDom(
  workerRows: SaleWorkerLine[] = [],
  root?: DomQueryRoot | null,
): SaleWorkerLine[] {
  const scope = resolveSaleFormDomRoot(root);
  if (!scope || !workerRows.length) return workerRows;

  let changed = false;
  const next = workerRows.map((line) => ({ ...line }));
  const selector = root
    ? "[data-worker-row][data-worker-col]"
    : ".erp-sale-form-page [data-worker-row][data-worker-col]";

  scope
    .querySelectorAll(selector)
    .forEach((element) => {
      if (!(element instanceof HTMLInputElement)) return;

      const rowIndex = Number(element.dataset.workerRow);
      const columnKey = String(element.dataset.workerCol || "");
      if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= next.length || !columnKey) return;

      const sanitized = sanitizeWorkerGridCommitValue(element.value, columnKey);
      const current = (next[rowIndex] as Record<string, unknown>)[columnKey];
      if (String(sanitized) === String(current ?? "")) return;

      next[rowIndex] = applyWorkerLineFieldUpdate(next[rowIndex], columnKey, sanitized) as SaleWorkerLine;
      changed = true;
    });

  return changed ? next : workerRows;
}

export function buildCommittedSaleFormDraft(
  meta: Omit<SaleFormData, "workers">,
  workerRows: SaleWorkerLine[] = [],
  root?: DomQueryRoot | null,
): SaleFormData {
  return {
    ...meta,
    workers: commitWorkerGridInputsFromDom(workerRows, root),
  };
}

export function flushSaleFormFocusedInputs(root?: DomQueryRoot | null) {
  if (typeof document === "undefined") return Promise.resolve();
  const scope = resolveSaleFormDomRoot(root);
  scope
    ?.querySelectorAll(root ? "input, textarea" : ".erp-sale-form-page input, .erp-sale-form-page textarea")
    .forEach((element) => {
      if (element instanceof HTMLElement) element.blur();
    });
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 0);
      });
    });
  });
}
