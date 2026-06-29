import {
  mergeBankTransactionsForSave,
  mergeClientsForSave,
  mergeOfficeStaffForSave,
  mergePaymentVouchersForSave,
  mergeWorkerMonthlyActualVouchersForSave,
  mergeWorkersForSave,
} from "./erpSaveMerge.mjs";

/** Domain name ? payload field keys stored in erp_domain_state. */
export const ERP_DOMAIN_FIELDS = {
  sales: ["sales", "paymentVouchers", "paymentInputLogs", "saleComments"],
  clients: ["clients"],
  workers: [
    "workers",
    "workerMonthlyPaymentMemos",
    "workerPaymentRecords",
    "workerPayoutVouchers",
    "workerMonthlyActualVouchers",
    "workerPayWithVatLearnRules",
    "workerPortalStatementAcks",
  ],
  bankTransactions: ["bankTransactions", "bankTransactionFolders", "bankSyncMeta", "bankLedgerRules"],
  taxInvoices: ["taxInvoices"],
  companyProfile: ["companyProfile"],
  officeStaff: ["officeStaff", "officePayrollSettings", "officePayrollProfiles", "officePayrollSheets"],
  settings: [
    "auditLogs",
    "loginLogs",
    "companyExpenses",
    "attendanceRecords",
    "fixedExpenses",
    "fixedExpensePayments",
    "expenseCategories",
    "fixedExpenseCategories",
    "accountCodes",
    "ledgerCategories",
    "companyNotices",
    "workPosts",
    "workTasks",
    "statementGenerationLogs",
    "statementFolders",
    "notificationSettings",
    "saleAiRules",
    "workerAiRules",
    "clientSiteRequests",
    "clientContracts",
    "scSchedules",
    "scScheduleSyncMeta",
    "probationEvalTemplates",
    "probationEvalRequests",
    "probationEvalNotifyMeta",
  ],
};

export const ERP_DOMAIN_NAMES = Object.keys(ERP_DOMAIN_FIELDS);

const DOMAIN_ROUTE_ALIASES = {
  "bank-transactions": "bankTransactions",
};

export function resolveErpDomainName(raw) {
  const key = String(raw || "").trim();
  if (!key) return null;
  if (ERP_DOMAIN_FIELDS[key]) return key;
  return DOMAIN_ROUTE_ALIASES[key] || null;
}

export function pickDomainPayload(fullPayload, domain) {
  const fields = ERP_DOMAIN_FIELDS[domain];
  if (!fields) return null;
  const chunk = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(fullPayload, field)) {
      chunk[field] = fullPayload[field];
    }
  }
  return chunk;
}

export function applyDomainPayload(fullPayload, domain, domainPayload) {
  const fields = ERP_DOMAIN_FIELDS[domain];
  if (!fields || !domainPayload || typeof domainPayload !== "object") return fullPayload;
  const next = { ...fullPayload };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(domainPayload, field)) {
      next[field] = domainPayload[field];
    }
  }
  return next;
}

export function mergeErpDomainForSave(existingData, domain, incomingPartial) {
  const existing = existingData || {};
  const incoming = incomingPartial || {};

  switch (domain) {
    case "sales": {
      const bankTransactions = existing.bankTransactions || [];
      const mergedPaymentVouchers = Array.isArray(incoming.paymentVouchers)
        ? mergePaymentVouchersForSave(
            existing.paymentVouchers || [],
            incoming.paymentVouchers,
            bankTransactions,
          )
        : existing.paymentVouchers || [];
      return {
        ...existing,
        sales: Array.isArray(incoming.sales) ? incoming.sales : existing.sales || [],
        paymentVouchers: mergedPaymentVouchers,
        paymentInputLogs: Array.isArray(incoming.paymentInputLogs)
          ? incoming.paymentInputLogs
          : existing.paymentInputLogs || [],
        saleComments: Array.isArray(incoming.saleComments)
          ? incoming.saleComments
          : existing.saleComments || [],
      };
    }
    case "clients":
      return {
        ...existing,
        clients: mergeClientsForSave(existing.clients || [], incoming.clients || []),
      };
    case "workers":
      return {
        ...existing,
        workers: mergeWorkersForSave(existing.workers || [], incoming.workers || []),
        workerMonthlyPaymentMemos:
          incoming.workerMonthlyPaymentMemos && typeof incoming.workerMonthlyPaymentMemos === "object"
            ? { ...(existing.workerMonthlyPaymentMemos || {}), ...incoming.workerMonthlyPaymentMemos }
            : existing.workerMonthlyPaymentMemos || {},
        workerPaymentRecords: Array.isArray(incoming.workerPaymentRecords)
          ? incoming.workerPaymentRecords
          : existing.workerPaymentRecords || [],
        workerPayoutVouchers: Array.isArray(incoming.workerPayoutVouchers)
          ? incoming.workerPayoutVouchers
          : existing.workerPayoutVouchers || [],
        workerMonthlyActualVouchers: mergeWorkerMonthlyActualVouchersForSave(
          existing.workerMonthlyActualVouchers || [],
          incoming.workerMonthlyActualVouchers || [],
        ),
        workerPayWithVatLearnRules: Array.isArray(incoming.workerPayWithVatLearnRules)
          ? incoming.workerPayWithVatLearnRules
          : existing.workerPayWithVatLearnRules || [],
        workerPortalStatementAcks: Array.isArray(incoming.workerPortalStatementAcks)
          ? incoming.workerPortalStatementAcks
          : existing.workerPortalStatementAcks || [],
      };
    case "bankTransactions":
      return {
        ...existing,
        bankTransactions: mergeBankTransactionsForSave(
          existing.bankTransactions || [],
          incoming.bankTransactions || [],
        ),
        bankTransactionFolders: Array.isArray(incoming.bankTransactionFolders)
          ? incoming.bankTransactionFolders
          : existing.bankTransactionFolders || [],
        bankSyncMeta:
          incoming.bankSyncMeta && typeof incoming.bankSyncMeta === "object"
            ? incoming.bankSyncMeta
            : existing.bankSyncMeta,
        bankLedgerRules: Array.isArray(incoming.bankLedgerRules)
          ? incoming.bankLedgerRules
          : existing.bankLedgerRules || [],
      };
    case "taxInvoices":
      return {
        ...existing,
        taxInvoices: Array.isArray(incoming.taxInvoices) ? incoming.taxInvoices : existing.taxInvoices || [],
      };
    case "companyProfile":
      return {
        ...existing,
        companyProfile:
          incoming.companyProfile && typeof incoming.companyProfile === "object"
            ? incoming.companyProfile
            : existing.companyProfile || null,
      };
    case "officeStaff":
      return {
        ...existing,
        officeStaff: mergeOfficeStaffForSave(existing.officeStaff || [], incoming.officeStaff || []),
        officePayrollSettings:
          incoming.officePayrollSettings && typeof incoming.officePayrollSettings === "object"
            ? incoming.officePayrollSettings
            : existing.officePayrollSettings,
        officePayrollProfiles: Array.isArray(incoming.officePayrollProfiles)
          ? incoming.officePayrollProfiles
          : existing.officePayrollProfiles || [],
        officePayrollSheets: Array.isArray(incoming.officePayrollSheets)
          ? incoming.officePayrollSheets
          : existing.officePayrollSheets || [],
      };
    case "settings":
      return {
        ...existing,
        auditLogs: Array.isArray(incoming.auditLogs) ? incoming.auditLogs : existing.auditLogs || [],
        loginLogs: Array.isArray(incoming.loginLogs) ? incoming.loginLogs : existing.loginLogs || [],
        companyExpenses: Array.isArray(incoming.companyExpenses)
          ? incoming.companyExpenses
          : existing.companyExpenses || [],
        attendanceRecords: Array.isArray(incoming.attendanceRecords)
          ? incoming.attendanceRecords
          : existing.attendanceRecords || [],
        fixedExpenses: Array.isArray(incoming.fixedExpenses)
          ? incoming.fixedExpenses
          : existing.fixedExpenses || [],
        fixedExpensePayments: Array.isArray(incoming.fixedExpensePayments)
          ? incoming.fixedExpensePayments
          : existing.fixedExpensePayments || [],
        expenseCategories: Array.isArray(incoming.expenseCategories)
          ? incoming.expenseCategories
          : existing.expenseCategories || [],
        fixedExpenseCategories: Array.isArray(incoming.fixedExpenseCategories)
          ? incoming.fixedExpenseCategories
          : existing.fixedExpenseCategories || [],
        accountCodes: Array.isArray(incoming.accountCodes)
          ? incoming.accountCodes
          : existing.accountCodes || [],
        ledgerCategories: Array.isArray(incoming.ledgerCategories)
          ? incoming.ledgerCategories
          : existing.ledgerCategories || [],
        companyNotices: Array.isArray(incoming.companyNotices)
          ? incoming.companyNotices
          : existing.companyNotices || [],
        workPosts: Array.isArray(incoming.workPosts) ? incoming.workPosts : existing.workPosts || [],
        workTasks: Array.isArray(incoming.workTasks) ? incoming.workTasks : existing.workTasks || [],
        statementGenerationLogs: Array.isArray(incoming.statementGenerationLogs)
          ? incoming.statementGenerationLogs
          : existing.statementGenerationLogs || [],
        statementFolders: Array.isArray(incoming.statementFolders)
          ? incoming.statementFolders
          : existing.statementFolders || [],
        notificationSettings:
          incoming.notificationSettings && typeof incoming.notificationSettings === "object"
            ? incoming.notificationSettings
            : existing.notificationSettings,
        saleAiRules:
          incoming.saleAiRules && typeof incoming.saleAiRules === "object"
            ? incoming.saleAiRules
            : existing.saleAiRules,
        workerAiRules:
          incoming.workerAiRules && typeof incoming.workerAiRules === "object"
            ? incoming.workerAiRules
            : existing.workerAiRules,
        clientSiteRequests: Array.isArray(incoming.clientSiteRequests)
          ? incoming.clientSiteRequests
          : existing.clientSiteRequests || [],
        clientContracts: Array.isArray(incoming.clientContracts)
          ? incoming.clientContracts
          : existing.clientContracts || [],
        scSchedules: Array.isArray(incoming.scSchedules) ? incoming.scSchedules : existing.scSchedules || [],
        scScheduleSyncMeta:
          incoming.scScheduleSyncMeta && typeof incoming.scScheduleSyncMeta === "object"
            ? incoming.scScheduleSyncMeta
            : existing.scScheduleSyncMeta,
        probationEvalTemplates: Array.isArray(incoming.probationEvalTemplates)
          ? incoming.probationEvalTemplates
          : existing.probationEvalTemplates || [],
        probationEvalRequests: Array.isArray(incoming.probationEvalRequests)
          ? incoming.probationEvalRequests
          : existing.probationEvalRequests || [],
        probationEvalNotifyMeta:
          incoming.probationEvalNotifyMeta && typeof incoming.probationEvalNotifyMeta === "object"
            ? incoming.probationEvalNotifyMeta
            : existing.probationEvalNotifyMeta,
      };
    default:
      return existing;
  }
}

export function requestFieldToDomain(field) {
  for (const [domain, fields] of Object.entries(ERP_DOMAIN_FIELDS)) {
    if (fields.includes(field)) return domain;
  }
  return null;
}
