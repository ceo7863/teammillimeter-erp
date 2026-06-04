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
  { key: "memo", label: "공통비고" },
  { key: "officeMemo", label: "사무실메모" },
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
  { key: "depositNameAliases", label: "예금주 별칭" },
  { key: "memo", label: "비고" },
];

export const WORKER_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "name", label: "시공자명" },
  { key: "grade", label: "시공등급" },
  { key: "category", label: "구분" },
  { key: "hireDate", label: "입사일" },
  { key: "eGradeEndedAt", label: "E등급 종료일" },
  { key: "isActive", label: "상태", format: (v) => (v === false ? "비활성" : "활성") },
  { key: "bank", label: "은행명" },
  { key: "account", label: "계좌번호" },
  { key: "depositNameAliases", label: "예금주 별칭" },
  { key: "phone", label: "연락처" },
  { key: "businessNo", label: "사업자등록번호" },
  { key: "address", label: "주소" },
  { key: "vehicleNo", label: "차량번호" },
  { key: "constructionCost", label: "시공비", format: (v) => formatAuditMoney(v) },
  { key: "customChargeCost", label: "개별청구단가", format: (v) => formatAuditMoney(v) },
  { key: "overtimeCost", label: "야근비", format: (v) => formatAuditMoney(v) },
  { key: "feeRate", label: "수수료율", format: (v) => `${Math.round(Number(v || 0) * 100)}%` },
  { key: "memo", label: "비고" },
  { key: "portalLoginId", label: "포털 로그인 ID" },
];

export const COMPANY_EXPENSE_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "date", label: "일자" },
  { key: "category", label: "분류" },
  { key: "accountContent", label: "계정내용" },
  { key: "description", label: "통장기록" },
  { key: "amount", label: "금액", format: (v) => formatAuditMoney(v) },
  { key: "flow", label: "구분", format: (v) => (v === "income" ? "입금" : "지출") },
  { key: "memo", label: "비고" },
];

export const FIXED_EXPENSE_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "name", label: "항목명" },
  { key: "category", label: "분류" },
  { key: "amount", label: "금액", format: (v) => formatAuditMoney(v) },
  { key: "cycle", label: "주기" },
  { key: "isActive", label: "상태", format: (v) => (v === false ? "비활성" : "활성") },
];

export const PAYMENT_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "date", label: "입금일" },
  { key: "amount", label: "입금액", format: (v) => formatAuditMoney(v) },
  { key: "vatType", label: "부가세", format: (v) => (v === "excluded" ? "별도" : "포함") },
  { key: "vatAmount", label: "부가세액", format: (v) => formatAuditMoney(v) },
  { key: "finalAmount", label: "최종입금액", format: (v) => formatAuditMoney(v) },
  { key: "depositChannel", label: "입금구분", format: (v) => (v === "cash" ? "현금" : v === "personal" ? "개인통장" : "-") },
  { key: "memo", label: "비고" },
];

export const BANK_TRANSACTION_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "transactionAt", label: "\uC77C\uC790" },
  { key: "description", label: "\uC801\uC694" },
  { key: "deposit", label: "\uC785\uAE08", format: (v) => formatAuditMoney(v) },
  { key: "withdrawal", label: "\uCD9C\uAE08", format: (v) => formatAuditMoney(v) },
  { key: "folderLabel", label: "\uD3F4\uB354" },
  { key: "linkedSubject", label: "\uC5F0\uACB0\uBA85" },
  { key: "linkedPaymentVoucherId", label: "\uC785\uAE08\uC804\uD45C" },
  { key: "linkedCompanyExpenseId", label: "\uD68C\uC0AC\uC7A5\uBD80" },
  { key: "linkedFixedExpensePaymentId", label: "\uACE0\uC815\uBE44\uB0A9\uBD80" },
  { key: "memo", label: "\uBA54\uBAA8" },
];

export const BANK_FOLDER_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "folderName", label: "\uD3F4\uB354 \uC774\uB984" },
  { key: "folderType", label: "\uAD6C\uBD84" },
];

export const TAX_INVOICE_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "issueDate", label: "\uC791\uC131\uC77C" },
  { key: "client", label: "\uAC70\uB798\uCC98" },
  { key: "flowType", label: "\uAD6C\uBD84", format: (v) => (v === "purchase" ? "\uB9E4\uC785" : "\uB9E4\uCD9C") },
  { key: "documentType", label: "\uBB38\uC11C", format: (v) => (v === "bill" ? "\uACC4\uC0B0\uC11C" : "\uC138\uAE08\uACC4\uC0B0\uC11C") },
  { key: "supplyAmount", label: "\uACF5\uAE09\uAC00\uC561", format: (v) => formatAuditMoney(v) },
  { key: "totalAmount", label: "\uD569\uACC4", format: (v) => formatAuditMoney(v) },
  { key: "status", label: "\uC0C1\uD0DC", format: (v) => (v === "cancelled" ? "\uCDE8\uC18C" : "\uBC1C\uD589") },
  { key: "memo", label: "\uBE44\uACE0" },
];

export const ATTENDANCE_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "date", label: "\uC77C\uC790" },
  { key: "userName", label: "\uC0AC\uC6A9\uC790" },
  { key: "checkInAt", label: "\uCD9C\uADFC", format: (v) => formatAuditDateTime(String(v || "")) },
  { key: "checkOutAt", label: "\uD1F4\uADFC", format: (v) => formatAuditDateTime(String(v || "")) },
];

export const WORK_POST_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "title", label: "\uC81C\uBAA9" },
  { key: "isPinned", label: "\uC0C1\uB2E8\uACE0\uC815", format: (v) => (v ? "Y" : "N") },
  { key: "bodyPreview", label: "\uB0B4\uC6A9" },
];

export const COMPANY_NOTICE_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "board", label: "\uAC8C\uC2DC\uD310" },
  { key: "title", label: "\uC81C\uBAA9" },
  { key: "isPinned", label: "\uC0C1\uB2E8\uACE0\uC815", format: (v) => (v ? "Y" : "N") },
  { key: "bodyPreview", label: "\uB0B4\uC6A9" },
];

export const COMPANY_PROFILE_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "name", label: "\uD68C\uC0AC\uBA85" },
  { key: "businessNo", label: "\uC0AC\uC5C5\uC790\uBC88\uD638" },
  { key: "phone", label: "\uC804\uD654\uBC88\uD638" },
  { key: "address", label: "\uC8FC\uC18C" },
  { key: "bankAccountVatIncluded", label: "\uACC4\uC88C(\uD3EC\uD568)" },
  { key: "bankAccountVatExcluded", label: "\uACC4\uC88C(\uBBF8\uD3EC\uD568)" },
];

export const USER_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "loginId", label: "\uB85C\uADF8\uC778ID" },
  { key: "name", label: "\uC774\uB984" },
  { key: "email", label: "\uC774\uBA54\uC77C" },
  { key: "phone", label: "\uC5F0\uB77D\uCC98" },
  { key: "role", label: "\uC5ED\uD560", format: (v) => (v === "admin" ? "\uAD00\uB9AC\uC790" : "\uC9C1\uC6D0") },
  { key: "isActive", label: "\uC0C1\uD0DC", format: (v) => (v === false ? "\uBE44\uD65C\uC131" : "\uD65C\uC131") },
];

export const FIXED_EXPENSE_PAYMENT_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "date", label: "\uC77C\uC790" },
  { key: "category", label: "\uCE74\uD14C\uACE0\uB9AC" },
  { key: "accountContent", label: "\uACC4\uC815\uB0B4\uC6A9" },
  { key: "amount", label: "\uAE08\uC561", format: (v) => formatAuditMoney(v) },
  { key: "memo", label: "\uBE44\uACE0" },
  { key: "bankTransactionId", label: "\uD1B5\uC7A5\uC5F0\uACB0" },
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
    timeZone: "Asia/Seoul",
  });
}

/** Filter keys aligned with formatAuditDateTime (KST calendar day). */
export function auditLocalDayKey(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
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
    officeMemo: row.officeMemo || "",
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
    depositNameAliases: client.depositNameAliases || "",
    memo: client.memo || "",
  };
}

export function snapshotWorkerForAudit(worker: Record<string, unknown>) {
  return {
    name: worker.name || "",
    grade: worker.grade || "",
    category: worker.category === "외주" ? "외주" : "팀원",
    hireDate: worker.hireDate || "",
    eGradeEndedAt: worker.eGradeEndedAt || "",
    isActive: worker.isActive !== false,
    bank: worker.bank || "",
    account: worker.account || "",
    depositNameAliases: worker.depositNameAliases || "",
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

export function snapshotCompanyExpenseForAudit(expense: Record<string, unknown>) {
  return {
    date: expense.date || "",
    category: expense.category || "",
    accountContent: expense.accountContent || "",
    description: expense.description || "",
    amount: expense.amount ?? 0,
    memo: expense.memo || "",
  };
}

export function snapshotFixedExpenseForAudit(expense: Record<string, unknown>) {
  return {
    name: expense.name || "",
    category: expense.category || "",
    amount: expense.amount ?? 0,
    cycle: expense.cycle || "",
    isActive: expense.isActive !== false,
  };
}

export function snapshotPaymentForAudit(voucher: Record<string, unknown>) {
  return {
    date: voucher.date || "",
    amount: voucher.amount ?? 0,
    vatType: voucher.vatType || "included",
    vatAmount: voucher.vatAmount ?? 0,
    finalAmount: voucher.finalAmount ?? voucher.amount ?? 0,
    depositChannel: voucher.depositChannel || "personal",
    memo: voucher.memo || "",
  };
}

export function snapshotBankTransactionForAudit(row: Record<string, unknown>) {
  return {
    transactionAt: String(row.transactionAt || "").slice(0, 16),
    description: row.description || "",
    deposit: row.deposit ?? 0,
    withdrawal: row.withdrawal ?? 0,
    folderLabel: row.folderLabel || row.folderId || "-",
    linkedSubject: row.linkedSubject || "-",
    linkedPaymentVoucherId: row.linkedPaymentVoucherId ? String(row.linkedPaymentVoucherId) : "-",
    linkedCompanyExpenseId: row.linkedCompanyExpenseId ? String(row.linkedCompanyExpenseId) : "-",
    linkedFixedExpensePaymentId: row.linkedFixedExpensePaymentId ? String(row.linkedFixedExpensePaymentId) : "-",
    memo: row.memo || "",
  };
}

export function snapshotBankFolderForAudit(folder: Record<string, unknown>) {
  const folderType = folder.folderType;
  const typeLabel =
    folderType === "worker"
      ? "\uC2DC\uACF5\uC790"
      : folderType === "card"
        ? "\uCE74\uB4DC\uB9E4\uCD9C"
        : folderType === "custom"
          ? "\uC0AC\uC6A9\uC790 \uAD6C\uBD84"
          : "\uAC70\uB798\uCC98";
  return {
    folderName: folder.folderName || "",
    folderType: typeLabel,
  };
}

export function snapshotTaxInvoiceForAudit(invoice: Record<string, unknown>) {
  return {
    issueDate: invoice.issueDate || "",
    client: invoice.client || "",
    flowType: invoice.flowType || "sales",
    documentType: invoice.documentType || "tax",
    supplyAmount: invoice.supplyAmount ?? 0,
    totalAmount: invoice.totalAmount ?? 0,
    status: invoice.status || "issued",
    memo: invoice.memo || "",
  };
}

export function snapshotAttendanceForAudit(record: Record<string, unknown>) {
  return {
    date: record.date || "",
    userName: record.userName || "",
    checkInAt: record.checkInAt || "",
    checkOutAt: record.checkOutAt || "",
  };
}

export function snapshotWorkPostForAudit(post: Record<string, unknown>) {
  const body = String(post.body || "").trim();
  return {
    title: post.title || "",
    isPinned: Boolean(post.isPinned),
    bodyPreview: body.length > 80 ? `${body.slice(0, 80)}...` : body || "-",
  };
}

export function snapshotCompanyNoticeForAudit(notice: Record<string, unknown>) {
  const body = String(notice.body || "").trim();
  return {
    board: notice.board || "",
    title: notice.title || "",
    isPinned: Boolean(notice.isPinned),
    bodyPreview: body.length > 80 ? `${body.slice(0, 80)}...` : body || "-",
  };
}

export function snapshotCompanyProfileForAudit(profile: Record<string, unknown>) {
  return {
    name: profile.name || "",
    businessNo: profile.businessNo || "",
    phone: profile.phone || "",
    address: profile.address || "",
    bankAccountVatIncluded: profile.bankAccountVatIncluded || "",
    bankAccountVatExcluded: profile.bankAccountVatExcluded || "",
  };
}

export function snapshotUserForAudit(user: Record<string, unknown>) {
  return {
    loginId: user.loginId || "",
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role || "staff",
    isActive: user.isActive !== false,
  };
}

export function snapshotFixedExpensePaymentForAudit(payment: Record<string, unknown>) {
  return {
    date: payment.date || "",
    category: payment.category || "",
    accountContent: payment.accountContent || "",
    amount: payment.amount ?? 0,
    memo: payment.memo || "",
    bankTransactionId: payment.bankTransactionId ? String(payment.bankTransactionId) : "-",
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

export function buildSummaryAuditEntry(input: {
  entityType: string;
  entityId: string | number;
  entityLabel: string;
  screen: string;
  action: AuditAction;
  fieldLabel: string;
  before?: string;
  after: string;
  user?: AuditUser;
}) {
  return buildAuditEntries({
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    screen: input.screen,
    user: input.user,
    action: input.action,
    changes: [
      {
        field: "summary",
        fieldLabel: input.fieldLabel,
        before: input.before ?? "-",
        after: input.after,
      },
    ],
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

export function mergeAuditLogs(server: AuditLogEntry[], client: AuditLogEntry[]) {
  const byId = new Map<number, AuditLogEntry>();
  for (const entry of [...server, ...client]) {
    const id = Number(entry?.id);
    if (!id) continue;
    byId.set(id, entry);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, MAX_AUDIT_LOGS);
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
