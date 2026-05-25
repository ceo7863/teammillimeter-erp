export type AuditAction = "create" | "update" | "delete" | "import";

export type AuditLogEntry = {
  id: number;
  entityType: string;
  entityId: string | number;
  entityLabel: string;
  field: string;
  fieldLabel: string;
  before: string;
  after: string;
  action: AuditAction;
  screen: string;
  userName: string;
  userEmail: string;
  at: string;
};

export type AuditFieldDef = {
  key: string;
  label: string;
  format?: (value: unknown) => string;
};

export type AuditUser = {
  name?: string;
  email?: string;
} | null;

export const MAX_AUDIT_LOGS = 5000;

export const SALE_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "date", label: "일자" },
  { key: "client", label: "거래처" },
  { key: "site", label: "현장" },
  { key: "paid", label: "입금액", format: (v) => formatAuditMoney(v) },
  { key: "memo", label: "비고" },
  { key: "amount", label: "총시공비", format: (v) => formatAuditMoney(v) },
  { key: "workersSummary", label: "시공자 내역" },
];

export const CLIENT_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "name", label: "거래처명" },
  { key: "businessNo", label: "사업자번호" },
  { key: "manager", label: "담당자" },
  { key: "phone", label: "연락처" },
  { key: "constructionCost", label: "시공비", format: (v) => formatAuditMoney(v) },
  { key: "customChargeCost", label: "개별청구단가", format: (v) => formatAuditMoney(v) },
  { key: "overtimeCost", label: "야근비", format: (v) => formatAuditMoney(v) },
  { key: "vat", label: "부가세" },
  { key: "mealIncluded", label: "식대" },
  { key: "memo", label: "비고" },
];

export const WORKER_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "name", label: "시공자명" },
  { key: "category", label: "구분" },
  { key: "isActive", label: "상태", format: (v) => (v === false ? "비활성" : "활성") },
  { key: "bank", label: "은행명" },
  { key: "account", label: "계좌번호" },
  { key: "phone", label: "연락처" },
  { key: "businessNo", label: "사업자등록번호" },
  { key: "address", label: "주소" },
  { key: "vehicleNo", label: "차량번호" },
  { key: "constructionCost", label: "시공비", format: (v) => formatAuditMoney(v) },
  { key: "customChargeCost", label: "개별청구단가", format: (v) => formatAuditMoney(v) },
  { key: "overtimeCost", label: "야근비", format: (v) => formatAuditMoney(v) },
  { key: "feeRate", label: "수수료율", format: (v) => `${Math.round(Number(v || 0) * 100)}%` },
  { key: "memo", label: "비고" },
];

export const PAYMENT_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "date", label: "입금일" },
  { key: "amount", label: "입금액", format: (v) => formatAuditMoney(v) },
  { key: "vatType", label: "부가세", format: (v) => (v === "excluded" ? "별도" : "포함") },
  { key: "vatAmount", label: "부가세액", format: (v) => formatAuditMoney(v) },
  { key: "finalAmount", label: "최종입금액", format: (v) => formatAuditMoney(v) },
  { key: "memo", label: "비고" },
];

export function formatAuditMoney(value: unknown) {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(amount);
}

export function formatAuditValue(value: unknown, formatter?: (value: unknown) => string) {
  if (formatter) return formatter(value);
  if (value == null || value === "") return "-";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Y" : "N";
  return String(value);
}

export function formatAuditDateTime(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function summarizeWorkers(workers: unknown) {
  if (!Array.isArray(workers) || !workers.length) return "-";
  return workers
    .map((line) => {
      const row = line as { worker?: string; quantity?: string | number; chargeAmount?: string | number };
      const worker = String(row.worker || "").trim();
      if (!worker) return "";
      const qty = row.quantity || "1";
      const charge = row.chargeAmount ? formatAuditMoney(row.chargeAmount) : "";
      return charge ? `${worker}(${qty}/${charge})` : `${worker}(${qty})`;
    })
    .filter(Boolean)
    .join(", ");
}

export function snapshotSaleForAudit(row: Record<string, unknown>) {
  return {
    date: row.date || "",
    client: row.client || "",
    site: row.site || "",
    paid: String(row.basePaid ?? row.paid ?? 0),
    memo: row.memo || "",
    amount: row.amount ?? 0,
    workersSummary: summarizeWorkers(row.workers),
  };
}

export function snapshotClientForAudit(client: Record<string, unknown>) {
  return {
    name: client.name || "",
    businessNo: client.businessNo || "",
    manager: client.manager || "",
    phone: client.phone || "",
    constructionCost: client.constructionCost ?? 0,
    customChargeCost: client.customChargeCost ?? client.chargeCost ?? 0,
    overtimeCost: client.overtimeCost ?? 0,
    vat: client.vat || "",
    mealIncluded: client.mealIncluded || "",
    memo: client.memo || "",
  };
}

export function snapshotWorkerForAudit(worker: Record<string, unknown>) {
  return {
    name: worker.name || "",
    category: worker.category === "외주" ? "외주" : "팀원",
    isActive: worker.isActive !== false,
    bank: worker.bank || "",
    account: worker.account || "",
    phone: worker.phone || "",
    businessNo: worker.businessNo || "",
    address: worker.address || "",
    vehicleNo: worker.vehicleNo || "",
    constructionCost: worker.constructionCost ?? 0,
    customChargeCost: worker.customChargeCost ?? 0,
    overtimeCost: worker.overtimeCost ?? 0,
    feeRate: worker.feeRate ?? 0,
    memo: worker.memo || "",
  };
}

export function snapshotPaymentForAudit(voucher: Record<string, unknown>) {
  return {
    date: voucher.date || "",
    amount: voucher.amount ?? 0,
    vatType: voucher.vatType || "included",
    vatAmount: voucher.vatAmount ?? 0,
    finalAmount: voucher.finalAmount ?? voucher.amount ?? 0,
    memo: voucher.memo || "",
  };
}

export function diffAuditRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: AuditFieldDef[]
) {
  return fields.flatMap((field) => {
    const prev = formatAuditValue(before[field.key], field.format);
    const next = formatAuditValue(after[field.key], field.format);
    if (prev === next) return [];
    return [{ field: field.key, fieldLabel: field.label, before: prev, after: next }];
  });
}

export function buildAuditEntries(input: {
  entityType: string;
  entityId: string | number;
  entityLabel: string;
  screen: string;
  user?: AuditUser;
  action: AuditAction;
  changes: Array<{ field: string; fieldLabel: string; before: string; after: string }>;
}) {
  const at = new Date().toISOString();
  const userName = input.user?.name || "시스템";
  const userEmail = input.user?.email || "";

  return input.changes.map((change, index) => ({
    id: Date.now() + index + Math.floor(Math.random() * 1000),
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    field: change.field,
    fieldLabel: change.fieldLabel,
    before: change.before,
    after: change.after,
    action: input.action,
    screen: input.screen,
    userName,
    userEmail,
    at,
  })) satisfies AuditLogEntry[];
}

export function appendAuditLogs(existing: AuditLogEntry[], entries: AuditLogEntry[]) {
  if (!entries.length) return existing;
  return [...entries, ...existing].slice(0, MAX_AUDIT_LOGS);
}

export function getAuditHistory(
  logs: AuditLogEntry[],
  filter: { entityType: string; entityId?: string | number; field?: string }
) {
  return logs.filter((entry) => {
    if (entry.entityType !== filter.entityType) return false;
    if (filter.entityId != null && String(entry.entityId) !== String(filter.entityId)) return false;
    if (filter.field && entry.field !== filter.field) return false;
    return true;
  });
}

export function getLatestAuditEntry(
  logs: AuditLogEntry[],
  filter: { entityType: string; entityId?: string | number; field?: string }
) {
  return getAuditHistory(logs, filter)[0] || null;
}
