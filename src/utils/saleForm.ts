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
};

export type SaleFormData = {
  date: string;
  client: string;
  site: string;
  paid: string;
  memo: string;
  officeMemo: string;
  workers: SaleWorkerLine[];
  createdBy?: string;
  createdByEmail?: string;
  createdAt?: string;
};

export const emptySaleForm = (): SaleFormData => ({
  date: todayISO(),
  client: "",
  site: "",
  paid: "",
  memo: "",
  officeMemo: "",
  workers: Array.from({ length: 5 }, (_, index) => createWorkerLine(index)),
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
    overtimeCost: "30000",
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

/** 시공자·야근시간이 있으면 야근단가를 자동 채워 야근비(시간×단가)가 계산되도록 함 */
export function syncWorkerLineOvertimeRate(
  line: SaleWorkerLine,
  workers: Array<{ name?: string; overtimeCost?: number }>,
  clients: Array<{ name?: string; overtimeCost?: number }>,
  clientName: string,
): SaleWorkerLine {
  const workerName = String(line.worker || "").trim();
  const hours = parseMoney(line.overtimeHours);
  if (!workerName || hours <= 0) return line;

  const rate = resolveWorkerLineOvertimeRate(workers, clients, clientName, workerName);
  const currentRate = parseMoney(line.overtimeCost);
  if (currentRate > 0) return line;

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
    paid: (row as { manualPaidCleared?: boolean }).manualPaidCleared ? "" : String(row.basePaid ?? 0),
    memo: String(row.memo || ""),
    officeMemo: String(row.officeMemo || ""),
    workers: workerLines,
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

  let nextLine = applyWorkerLineFieldUpdate(line, "worker", workerName);
  const selectedWorker = findActiveWorkerByName(workers, workerName);
  const selectedClient = clients.find((client) => client.name === clientName);
  nextLine.quantity = nextLine.quantity || "1";
  const unitCost = resolveWorkerLineUnitCost(selectedWorker);
  if (unitCost) nextLine.unitCost = unitCost;
  const chargeAmount = resolveWorkerLineChargeAmount(selectedWorker, selectedClient);
  if (chargeAmount) nextLine.chargeAmount = chargeAmount;
  nextLine.overtimeCost = selectedClient?.overtimeCost
    ? String(selectedClient.overtimeCost)
    : selectedWorker?.overtimeCost
      ? String(selectedWorker.overtimeCost)
      : nextLine.overtimeCost || "30000";
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

export function buildSaleFromForm(
  form: SaleFormData,
  currentUser: { name?: string; email?: string } | null = null,
  workers: Array<{ name?: string; feeRate?: number }> = [],
) {
  const feeMap = buildWorkerFeeMap(workers);
  const workerLines = (form.workers || [])
    .filter((line) => line.worker)
    .map((line) =>
      enrichWorkerLineWithMetrics(
        stripWorkerLineComputedMetrics(line),
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
    worker: workerLabel,
    workers: workerLines,
    amount,
    paid: Math.min(parseMoney(form.paid), amount),
    basePaid: Math.min(parseMoney(form.paid), amount),
    memo: String(form.memo ?? "").trim(),
    officeMemo: String(form.officeMemo ?? "").trim(),
    createdBy: currentUser?.name || form.createdBy || "-",
    createdByEmail: currentUser?.email || form.createdByEmail || "",
    createdAt: form.createdAt || now,
    updatedAt: now,
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

/** Read pending worker-grid input values from the DOM (commit-on-blur fields). */
export function commitWorkerGridInputsFromDom(workerRows: SaleWorkerLine[] = []): SaleWorkerLine[] {
  if (typeof document === "undefined" || !workerRows.length) return workerRows;

  let changed = false;
  const next = workerRows.map((line) => ({ ...line }));

  document
    .querySelectorAll(".erp-sale-form-page [data-worker-row][data-worker-col]")
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
): SaleFormData {
  return {
    ...meta,
    workers: commitWorkerGridInputsFromDom(workerRows),
  };
}

export function flushSaleFormFocusedInputs() {
  if (typeof document === "undefined") return Promise.resolve();
  document
    .querySelectorAll(".erp-sale-form-page input, .erp-sale-form-page textarea")
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
