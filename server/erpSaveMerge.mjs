import { dedupeBankTransactionsByFingerprint } from "./ibkBankImport.mjs";
import { preserveMissingWorkersInList } from "../src/utils/workerPayments.ts";

function parseClassifiedAtMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergePaymentMatchFields(prev, incoming) {
  const linkedPaymentVoucherId = incoming.linkedPaymentVoucherId ?? prev.linkedPaymentVoucherId;
  const linkedPdfArchiveId = incoming.linkedPdfArchiveId ?? prev.linkedPdfArchiveId;
  const linkedSalesId = incoming.linkedSalesId ?? prev.linkedSalesId;
  const linkedWorkerMonthlyPaymentVoucherId =
    incoming.linkedWorkerMonthlyPaymentVoucherId ?? prev.linkedWorkerMonthlyPaymentVoucherId;
  const matchConfirmedAt = incoming.matchConfirmedAt || prev.matchConfirmedAt;
  const matchConfirmedBy = incoming.matchConfirmedBy || prev.matchConfirmedBy;
  let matchAutoLinked = incoming.matchAutoLinked;
  if (matchAutoLinked !== true && prev.matchAutoLinked === true) {
    matchAutoLinked = true;
  }

  return {
    linkedPaymentVoucherId,
    linkedPdfArchiveId,
    linkedSalesId,
    linkedWorkerMonthlyPaymentVoucherId,
    matchConfirmedAt,
    matchConfirmedBy,
    matchAutoLinked,
  };
}

function shouldPreferIncomingClassification(prev, incoming) {
  const prevMs = parseClassifiedAtMs(prev.classifiedAt);
  const incomingMs = parseClassifiedAtMs(incoming.classifiedAt);
  if (incomingMs > prevMs) return true;
  if (incomingMs < prevMs) return false;

  const prevSubject = String(prev.linkedSubject || "").trim();
  const incomingSubject = String(incoming.linkedSubject || "").trim();
  if (incomingSubject && incomingSubject !== prevSubject) return true;
  return false;
}

function mergeMemoForSave(prev, incoming) {
  if (incoming && Object.prototype.hasOwnProperty.call(incoming, "memo")) {
    const text = String(incoming.memo ?? "").trim();
    return text || undefined;
  }
  const prevText = String(prev?.memo ?? "").trim();
  const incomingText = String(incoming?.memo ?? "").trim();
  return prevText || incomingText || undefined;
}

function parseLedgerConfirmedAtMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const LEDGER_COALESCE_NON_EMPTY_KEYS = new Set([
  "ledgerAccountCode",
  "ledgerMemo",
  "ledgerCategoryId",
  "ledgerFixedExpenseId",
  "ledgerStatus",
]);

function normalizeLedgerMergeValue(value, key) {
  if (key === "ledgerClientName" && value === "") return "";
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

function readLedgerMergeValue(row, key) {
  if (!row || !Object.prototype.hasOwnProperty.call(row, key)) return undefined;
  return normalizeLedgerMergeValue(row[key], key);
}

function mergeLedgerFieldsForSave(prev, incoming) {
  const prevMs = parseLedgerConfirmedAtMs(prev?.ledgerConfirmedAt);
  const incomingMs = parseLedgerConfirmedAtMs(incoming?.ledgerConfirmedAt);
  const preferIncoming = incomingMs > prevMs;
  const primary = preferIncoming ? incoming : prev;
  const fallback = preferIncoming ? prev : incoming;
  const keys = [
    "ledgerStatus",
    "ledgerCategoryId",
    "ledgerAccountCode",
    "ledgerMemo",
    "ledgerFixedExpenseId",
    "ledgerConfirmedAt",
    "ledgerConfirmedBy",
    "ledgerClientName",
  ];

  const merged = {};
  for (const key of keys) {
    const primaryValue = readLedgerMergeValue(primary, key);
    const fallbackValue = readLedgerMergeValue(fallback, key);
    let value;
    if (LEDGER_COALESCE_NON_EMPTY_KEYS.has(key)) {
      value = primaryValue !== undefined ? primaryValue : fallbackValue;
    } else if (key === "ledgerClientName") {
      if (primary && Object.prototype.hasOwnProperty.call(primary, key)) {
        value = primaryValue;
      } else {
        value = fallbackValue;
      }
    } else {
      value = primaryValue !== undefined ? primaryValue : fallbackValue;
    }
    if (key === "ledgerClientName" && value === "") {
      merged[key] = "";
      continue;
    }
    merged[key] = value === undefined ? undefined : value;
  }
  return merged;
}

function normalizeLinkedTaxInvoiceIds(row) {
  if (!row) return [];
  if (Array.isArray(row.linkedTaxInvoiceIds)) {
    return [...new Set(row.linkedTaxInvoiceIds.map((id) => String(id || "").trim()).filter(Boolean))];
  }
  if (row.linkedTaxInvoiceId) return [String(row.linkedTaxInvoiceId)];
  return [];
}

function mergeTaxInvoiceLinkFieldsForSave(prev, incoming) {
  if (incoming?.taxInvoiceAutoLinkDisabled) {
    const incomingIds = normalizeLinkedTaxInvoiceIds(incoming);
    return {
      linkedTaxInvoiceIds: incomingIds.length ? incomingIds : undefined,
      linkedTaxInvoiceId: incomingIds[0],
      taxInvoiceAutoLinkDisabled: true,
    };
  }
  if (prev?.taxInvoiceAutoLinkDisabled) {
    const incomingIds = normalizeLinkedTaxInvoiceIds(incoming);
    const prevIds = normalizeLinkedTaxInvoiceIds(prev);
    const incomingHasExplicitIds =
      incoming &&
      (Object.prototype.hasOwnProperty.call(incoming, "linkedTaxInvoiceIds") ||
        Object.prototype.hasOwnProperty.call(incoming, "linkedTaxInvoiceId"));
    const ids = incomingHasExplicitIds ? incomingIds : prevIds;
    return {
      linkedTaxInvoiceIds: ids.length ? ids : undefined,
      linkedTaxInvoiceId: ids[0],
      taxInvoiceAutoLinkDisabled: true,
    };
  }
  const prevIds = normalizeLinkedTaxInvoiceIds(prev);
  const incomingIds = normalizeLinkedTaxInvoiceIds(incoming);
  const ids = [...new Set([...prevIds, ...incomingIds])];
  return {
    linkedTaxInvoiceIds: ids.length ? ids : undefined,
    linkedTaxInvoiceId: ids[0],
    taxInvoiceAutoLinkDisabled: incoming?.taxInvoiceAutoLinkDisabled ?? prev?.taxInvoiceAutoLinkDisabled,
  };
}

function resolveLinkedSubjectForSave(prev, incoming, ledgerFields, preferIncoming) {
  if (ledgerFields.ledgerClientName === "") return undefined;
  return preferIncoming ? incoming.linkedSubject ?? prev.linkedSubject : prev.linkedSubject ?? incoming.linkedSubject;
}

export function mergeBankTransactionRowForSave(prev, incoming) {
  if (!prev) return incoming;

  const paymentMatch = mergePaymentMatchFields(prev, incoming);
  const preferIncoming = shouldPreferIncomingClassification(prev, incoming);
  const memo = mergeMemoForSave(prev, incoming);
  const ledgerFields = mergeLedgerFieldsForSave(prev, incoming);
  const taxInvoiceFields = mergeTaxInvoiceLinkFieldsForSave(prev, incoming);
  const linkedSubject = resolveLinkedSubjectForSave(prev, incoming, ledgerFields, preferIncoming);

  if (preferIncoming) {
    return {
      ...incoming,
      ...paymentMatch,
      ...ledgerFields,
      ...taxInvoiceFields,
      folderId: incoming.folderId ?? prev.folderId,
      memo,
      linkedSubject,
      classifiedAt: incoming.classifiedAt ?? prev.classifiedAt,
    };
  }

  return {
    ...incoming,
    ...paymentMatch,
    ...ledgerFields,
    ...taxInvoiceFields,
    folderId: prev.folderId ?? incoming.folderId,
    memo,
    linkedSubject,
    classifiedAt: prev.classifiedAt ?? incoming.classifiedAt,
  };
}

export function mergeBankTransactionsForSave(existing = [], incoming = []) {
  const existingRows = existing || [];
  const incomingRows = incoming || [];
  if (!incomingRows.length && existingRows.length) return existingRows;
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const incomingIds = new Set(incomingRows.map((row) => row.id));
  const merged = incomingRows.map((row) => mergeBankTransactionRowForSave(existingById.get(row.id), row));
  for (const row of existingRows) {
    if (row?.id && !incomingIds.has(row.id)) {
      merged.push(row);
    }
  }
  return dedupeBankTransactionsByFingerprint(merged).transactions;
}

export function mergePaymentVouchersForSave(existing = [], incoming = [], bankTransactions = []) {
  const byId = new Map((incoming || []).map((row) => [String(row.id), row]));
  const referencedIds = new Set();

  for (const tx of bankTransactions || []) {
    if (tx?.linkedPaymentVoucherId != null && tx.linkedPaymentVoucherId !== "") {
      referencedIds.add(String(tx.linkedPaymentVoucherId));
    }
  }

  for (const row of existing || []) {
    const id = String(row.id);
    if (referencedIds.has(id) && !byId.has(id)) {
      byId.set(id, row);
    }
  }

  return [...byId.values()];
}

function normalizeWorkerRecordId(id) {
  if (id == null || id === "") return "";
  return String(id);
}

function countVoucherEntries(voucher) {
  return Array.isArray(voucher?.entries) ? voucher.entries.length : 0;
}

function mergeWorkerMonthlyVoucherRow(prev, incoming) {
  if (!prev) return incoming;
  if (!incoming) return prev;

  const prevEntries = Array.isArray(prev.entries) ? prev.entries : [];
  const incomingEntries = Array.isArray(incoming.entries) ? incoming.entries : [];
  const prevBankIds = new Set(
    prevEntries.filter((entry) => entry?.kind === "bank").map((entry) => String(entry.bankTransactionId || "")),
  );
  const incomingBankIds = new Set(
    incomingEntries.filter((entry) => entry?.kind === "bank").map((entry) => String(entry.bankTransactionId || "")),
  );

  let entries = incomingEntries;
  if (prevEntries.length > entries.length) {
    entries = prevEntries;
  } else if ([...prevBankIds].some((id) => id && !incomingBankIds.has(id))) {
    entries = [...entries];
    for (const entry of prevEntries) {
      if (entry?.kind === "bank" && entry.bankTransactionId && !incomingBankIds.has(entry.bankTransactionId)) {
        entries.push(entry);
      }
    }
  }

  const prevAllocations = Array.isArray(prev.allocations) ? prev.allocations : [];
  const incomingAllocations = Array.isArray(incoming.allocations) ? incoming.allocations : [];
  const allocations =
    prevAllocations.length > incomingAllocations.length ? prevAllocations : incomingAllocations;

  return {
    ...incoming,
    entries,
    allocations,
    payWithVat: incoming.payWithVat ?? prev.payWithVat,
    expectedAmount: incoming.expectedAmount || prev.expectedAmount,
    expectedFinalAmount: incoming.expectedFinalAmount || prev.expectedFinalAmount,
    paidAmount: Math.max(Number(incoming.paidAmount) || 0, Number(prev.paidAmount) || 0),
  };
}

function preserveWorkerMonthlyVouchersReferencedByBank(existing = [], merged = [], bankTransactions = []) {
  const referencedIds = new Set();
  for (const tx of bankTransactions || []) {
    const linkedId = String(tx?.linkedWorkerMonthlyPaymentVoucherId || "").trim();
    if (linkedId) referencedIds.add(linkedId);
  }
  if (!referencedIds.size) return merged;

  const byId = new Map((merged || []).filter((voucher) => voucher?.id).map((voucher) => [voucher.id, voucher]));
  for (const voucher of existing || []) {
    if (voucher?.id && referencedIds.has(voucher.id) && !byId.has(voucher.id)) {
      byId.set(voucher.id, voucher);
    }
  }
  return [...byId.values()];
}

function reconcileWorkerMonthlyBankEntries(vouchers = [], bankTransactions = []) {
  const voucherById = new Map(vouchers.filter((voucher) => voucher?.id).map((voucher) => [voucher.id, voucher]));
  let changed = false;

  for (const tx of bankTransactions || []) {
    const linkedId = String(tx?.linkedWorkerMonthlyPaymentVoucherId || "").trim();
    if (!linkedId || !tx?.id) continue;
    const voucher = voucherById.get(linkedId);
    if (!voucher) continue;

    const entries = Array.isArray(voucher.entries) ? [...voucher.entries] : [];
    const hasEntry = entries.some(
      (entry) => entry?.kind === "bank" && String(entry.bankTransactionId || "") === String(tx.id),
    );
    if (hasEntry) continue;

    const amount = Math.round(Number(tx.withdrawal) || 0) || Math.round(Number(tx.deposit) || 0);
    entries.push({
      kind: "bank",
      id: `wm-bank-${tx.id}`,
      bankTransactionId: tx.id,
      amount,
      date: String(tx.transactionAt || "").slice(0, 10),
    });
    voucherById.set(linkedId, { ...voucher, entries });
    changed = true;
  }

  return changed ? [...voucherById.values()] : vouchers;
}

export function mergeWorkerMonthlyActualVouchersForSave(existing = [], incoming = []) {
  const existingRows = existing || [];
  const incomingRows = incoming || [];
  const existingWithEntries = existingRows.filter((voucher) => countVoucherEntries(voucher) > 0);
  if (!incomingRows.length && existingWithEntries.length) return existingRows;

  const existingById = new Map(existingRows.filter((voucher) => voucher?.id).map((voucher) => [voucher.id, voucher]));
  const incomingIds = new Set(incomingRows.filter((voucher) => voucher?.id).map((voucher) => voucher.id));
  const merged = incomingRows.map((voucher) => mergeWorkerMonthlyVoucherRow(existingById.get(voucher.id), voucher));

  for (const voucher of existingRows) {
    if (voucher?.id && !incomingIds.has(voucher.id) && countVoucherEntries(voucher) > 0) {
      merged.push(voucher);
    }
  }

  return merged;
}

export function mergeWorkersForSave(existing = [], incoming = []) {
  const existingById = new Map(
    (existing || [])
      .filter((worker) => normalizeWorkerRecordId(worker?.id))
      .map((worker) => [normalizeWorkerRecordId(worker.id), worker]),
  );

  const merged = (incoming || []).map((worker) => {
    const workerId = normalizeWorkerRecordId(worker?.id);
    const prev = workerId ? existingById.get(workerId) : undefined;
    if (!prev) return worker;
    const coalesce = (nextValue, prevValue) => {
      const nextText = String(nextValue ?? "").trim();
      if (nextText) return nextText;
      return String(prevValue ?? "").trim();
    };
    const coalesceMoney = (nextValue, prevValue) => {
      const nextNum = Number(nextValue);
      const prevNum = Number(prevValue);
      if (Number.isFinite(nextNum) && nextNum > 0) return nextNum;
      if (Number.isFinite(prevNum) && prevNum > 0) return prevNum;
      return undefined;
    };
    const customChargeCost = coalesceMoney(worker.customChargeCost, prev.customChargeCost);
    const probationNetPay = coalesceMoney(worker.probationNetPay, prev.probationNetPay);
    const postProbationConstructionCost = coalesceMoney(
      worker.postProbationConstructionCost,
      prev.postProbationConstructionCost,
    );
    const postProbationCustomChargeCost = coalesceMoney(
      worker.postProbationCustomChargeCost,
      prev.postProbationCustomChargeCost,
    );
    const merged = {
      ...prev,
      ...worker,
      grade: coalesce(worker.grade, prev.grade) || undefined,
      hireDate: coalesce(worker.hireDate, prev.hireDate) || undefined,
      eGradeEndedAt: coalesce(worker.eGradeEndedAt, prev.eGradeEndedAt) || undefined,
      probationAdjustedAt: coalesce(worker.probationAdjustedAt, prev.probationAdjustedAt) || undefined,
      postProbationGrade: coalesce(worker.postProbationGrade, prev.postProbationGrade) || undefined,
      category: coalesce(worker.category, prev.category) || undefined,
      depositNameAliases: coalesce(worker.depositNameAliases, prev.depositNameAliases) || undefined,
      portalLoginId: coalesce(worker.portalLoginId, prev.portalLoginId) || undefined,
      portalPasswordHash: worker.portalPasswordHash || prev.portalPasswordHash || undefined,
      portalMustChangePassword:
        worker.portalMustChangePassword === true
          ? true
          : worker.portalMustChangePassword === false
            ? false
            : prev.portalMustChangePassword,
      phone: coalesce(worker.phone, prev.phone) || undefined,
      vehicleNo: coalesce(worker.vehicleNo, prev.vehicleNo) || undefined,
      address: coalesce(worker.address, prev.address) || undefined,
      businessNo: coalesce(worker.businessNo, prev.businessNo) || undefined,
      bank: coalesce(worker.bank, prev.bank) || undefined,
      account: coalesce(worker.account, prev.account) || undefined,
      memo: coalesce(worker.memo, prev.memo) || undefined,
    };
    const photoFileId = coalesce(worker.photoFileId, prev.photoFileId);
    if (photoFileId) {
      merged.photoFileId = photoFileId;
      const photoFileName = coalesce(worker.photoFileName, prev.photoFileName);
      if (photoFileName) merged.photoFileName = photoFileName;
      else delete merged.photoFileName;
      const photoUploadedAt = worker.photoUploadedAt || prev.photoUploadedAt;
      if (photoUploadedAt) merged.photoUploadedAt = photoUploadedAt;
      else delete merged.photoUploadedAt;
    } else {
      delete merged.photoFileId;
      delete merged.photoFileName;
      delete merged.photoUploadedAt;
    }
    if (customChargeCost != null) {
      merged.customChargeCost = customChargeCost;
    } else {
      delete merged.customChargeCost;
    }
    if (probationNetPay != null) {
      merged.probationNetPay = probationNetPay;
    } else {
      delete merged.probationNetPay;
    }
    if (postProbationConstructionCost != null) {
      merged.postProbationConstructionCost = postProbationConstructionCost;
    } else {
      delete merged.postProbationConstructionCost;
    }
    if (postProbationCustomChargeCost != null) {
      merged.postProbationCustomChargeCost = postProbationCustomChargeCost;
    } else {
      delete merged.postProbationCustomChargeCost;
    }
    if (worker.probationPayWithVat !== undefined) {
      merged.probationPayWithVat = worker.probationPayWithVat;
    } else if (prev.probationPayWithVat !== undefined) {
      merged.probationPayWithVat = prev.probationPayWithVat;
    } else {
      delete merged.probationPayWithVat;
    }
    return merged;
  });

  const withMissingRestored = preserveMissingWorkersInList(existing || [], merged);

  // portalPassword는 index.mjs에서 processWorkersPortalCredentials 후 제거
  return withMissingRestored.map(({ monthlyPaymentMemo: _legacy, ...worker }) => worker);
}

function normalizeClientRecordId(id) {
  if (id == null || id === "") return "";
  return String(id);
}

export function mergeClientsForSave(existing = [], incoming = []) {
  const existingById = new Map(
    (existing || [])
      .filter((client) => normalizeClientRecordId(client?.id))
      .map((client) => [normalizeClientRecordId(client.id), client]),
  );

  return (incoming || []).map((client) => {
    const clientId = normalizeClientRecordId(client?.id);
    const prev = clientId ? existingById.get(clientId) : undefined;
    if (!prev) return client;

    const merged = { ...client };
    const siteRequestToken =
      String(client.siteRequestToken || "").trim() || String(prev.siteRequestToken || "").trim();
    if (siteRequestToken) merged.siteRequestToken = siteRequestToken;
    else delete merged.siteRequestToken;

    if (client.siteRequestLinkCreatedAt || prev.siteRequestLinkCreatedAt) {
      merged.siteRequestLinkCreatedAt = client.siteRequestLinkCreatedAt || prev.siteRequestLinkCreatedAt;
    }
    if (typeof client.siteRequestLinkDisabled === "boolean") {
      merged.siteRequestLinkDisabled = client.siteRequestLinkDisabled;
    } else if (typeof prev.siteRequestLinkDisabled === "boolean") {
      merged.siteRequestLinkDisabled = prev.siteRequestLinkDisabled;
    }
    if (client.siteRequestLinkUpdatedAt || prev.siteRequestLinkUpdatedAt) {
      merged.siteRequestLinkUpdatedAt = client.siteRequestLinkUpdatedAt || prev.siteRequestLinkUpdatedAt;
    }
    if (client.siteRequestLinkUpdatedBy || prev.siteRequestLinkUpdatedBy) {
      merged.siteRequestLinkUpdatedBy = client.siteRequestLinkUpdatedBy || prev.siteRequestLinkUpdatedBy;
    }

    const mergeScProjectIds = () => {
      const fromClient = Array.isArray(client.scProjectIds)
        ? client.scProjectIds.map((row) => String(row || "").trim()).filter(Boolean)
        : [];
      const fromPrev = Array.isArray(prev.scProjectIds)
        ? prev.scProjectIds.map((row) => String(row || "").trim()).filter(Boolean)
        : [];
      const legacyClient = String(client.scProjectId || "").trim();
      const legacyPrev = String(prev.scProjectId || "").trim();
      const ids = [...new Set([...fromClient, ...fromPrev, legacyClient, legacyPrev].filter(Boolean))];
      if (ids.length) merged.scProjectIds = ids;
      else delete merged.scProjectIds;
      delete merged.scProjectId;
      delete merged.scProjectName;
    };
    mergeScProjectIds();

    const mergeScProjectMappings = () => {
      const byId = new Map();
      const pushRow = (row) => {
        const projectId = String(row?.scProjectId || "").trim();
        if (!projectId) return;
        const prevRow = byId.get(projectId);
        const nextRow = {
          scProjectId: projectId,
          ...(row.scProjectName || prevRow?.scProjectName ? { scProjectName: row.scProjectName || prevRow?.scProjectName } : {}),
          ...(row.manual || prevRow?.manual ? { manual: Boolean(row.manual || prevRow?.manual) } : {}),
          ...(row.updatedAt || prevRow?.updatedAt ? { updatedAt: row.updatedAt || prevRow?.updatedAt } : {}),
          ...(row.updatedBy || prevRow?.updatedBy ? { updatedBy: row.updatedBy || prevRow?.updatedBy } : {}),
        };
        byId.set(projectId, nextRow);
      };
      if (Array.isArray(prev.scProjectMappings)) prev.scProjectMappings.forEach(pushRow);
      if (Array.isArray(client.scProjectMappings)) client.scProjectMappings.forEach(pushRow);
      const legacyId = String(prev.scProjectId || client.scProjectId || "").trim();
      if (legacyId && !byId.has(legacyId)) {
        pushRow({
          scProjectId: legacyId,
          scProjectName: client.scProjectName || prev.scProjectName,
          manual: client.scProjectMappingManual ?? prev.scProjectMappingManual,
          updatedAt: client.scProjectMappingUpdatedAt || prev.scProjectMappingUpdatedAt,
          updatedBy: client.scProjectMappingUpdatedBy || prev.scProjectMappingUpdatedBy,
        });
      }
      for (const projectId of merged.scProjectIds || []) {
        if (!byId.has(projectId)) pushRow({ scProjectId: projectId });
      }
      const mergedRows = [...byId.values()];
      if (mergedRows.length) merged.scProjectMappings = mergedRows;
      else delete merged.scProjectMappings;
    };
    mergeScProjectMappings();

    if (typeof client.scProjectMappingManual === "boolean") {
      merged.scProjectMappingManual = client.scProjectMappingManual;
    } else if (typeof prev.scProjectMappingManual === "boolean") {
      merged.scProjectMappingManual = prev.scProjectMappingManual;
    } else {
      delete merged.scProjectMappingManual;
    }
    if (client.scProjectMappingUpdatedAt || prev.scProjectMappingUpdatedAt) {
      merged.scProjectMappingUpdatedAt = client.scProjectMappingUpdatedAt || prev.scProjectMappingUpdatedAt;
    } else {
      delete merged.scProjectMappingUpdatedAt;
    }
    if (client.scProjectMappingUpdatedBy || prev.scProjectMappingUpdatedBy) {
      merged.scProjectMappingUpdatedBy = client.scProjectMappingUpdatedBy || prev.scProjectMappingUpdatedBy;
    } else {
      delete merged.scProjectMappingUpdatedBy;
    }
    const excludedRaw = Array.isArray(client.scProjectMappingExcludedProjectIds)
      ? client.scProjectMappingExcludedProjectIds
      : Array.isArray(prev.scProjectMappingExcludedProjectIds)
        ? prev.scProjectMappingExcludedProjectIds
        : [];
    const excluded = [...new Set(excludedRaw.map((row) => String(row || "").trim()).filter(Boolean))];
    if (excluded.length) merged.scProjectMappingExcludedProjectIds = excluded;
    else delete merged.scProjectMappingExcludedProjectIds;

    const coalesceText = (nextValue, prevValue) => {
      const nextText = String(nextValue ?? "").trim();
      if (nextText) return nextText;
      return String(prevValue ?? "").trim();
    };

    const prevContacts = Array.isArray(prev.contacts)
      ? prev.contacts.filter((row) => row && (row.name || row.phone))
      : [];
    const incomingContacts = Array.isArray(client.contacts)
      ? client.contacts.filter((row) => row && (row.name || row.phone))
      : [];
    if (incomingContacts.length) {
      merged.contacts = incomingContacts;
    } else if (prevContacts.length) {
      merged.contacts = prevContacts;
    } else {
      delete merged.contacts;
    }

    const manager = coalesceText(client.manager, prev.manager);
    const phone = coalesceText(client.phone, prev.phone);
    if (manager) merged.manager = manager;
    else delete merged.manager;
    if (phone) merged.phone = phone;
    else delete merged.phone;

    const businessRegFileId =
      coalesceText(client.businessRegFileId, prev.businessRegFileId);
    if (businessRegFileId) {
      merged.businessRegFileId = businessRegFileId;
      const businessRegFileName = coalesceText(client.businessRegFileName, prev.businessRegFileName);
      if (businessRegFileName) merged.businessRegFileName = businessRegFileName;
      else delete merged.businessRegFileName;
      const businessRegUploadedAt = client.businessRegUploadedAt || prev.businessRegUploadedAt;
      if (businessRegUploadedAt) merged.businessRegUploadedAt = businessRegUploadedAt;
      else delete merged.businessRegUploadedAt;
    } else {
      delete merged.businessRegFileId;
      delete merged.businessRegFileName;
      delete merged.businessRegUploadedAt;
    }

    return merged;
  });
}

function mergeClientContractsForSave(existing = [], incoming = []) {
  const byId = new Map();
  for (const row of existing) {
    const id = String(row?.id ?? "").trim();
    if (id) byId.set(id, row);
  }
  for (const row of incoming) {
    const id = String(row?.id ?? "").trim();
    if (id) byId.set(id, { ...(byId.get(id) || {}), ...row });
  }
  return [...byId.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function mergeErpPaymentLinkState(existingData, incomingData) {
  const mergedBankTransactions = mergeBankTransactionsForSave(
    existingData.bankTransactions || [],
    incomingData.bankTransactions || [],
  );
  const mergedPaymentVouchers = mergePaymentVouchersForSave(
    existingData.paymentVouchers || [],
    incomingData.paymentVouchers || [],
    mergedBankTransactions,
  );
  let mergedWorkerMonthlyActualVouchers = mergeWorkerMonthlyActualVouchersForSave(
    existingData.workerMonthlyActualVouchers || [],
    incomingData.workerMonthlyActualVouchers || [],
  );
  mergedWorkerMonthlyActualVouchers = preserveWorkerMonthlyVouchersReferencedByBank(
    existingData.workerMonthlyActualVouchers || [],
    mergedWorkerMonthlyActualVouchers,
    mergedBankTransactions,
  );
  mergedWorkerMonthlyActualVouchers = reconcileWorkerMonthlyBankEntries(
    mergedWorkerMonthlyActualVouchers,
    mergedBankTransactions,
  );

  return {
    ...incomingData,
    clients: mergeClientsForSave(existingData.clients || [], incomingData.clients || []),
    clientSiteRequests: Array.isArray(existingData.clientSiteRequests) ? existingData.clientSiteRequests : [],
    clientContracts: mergeClientContractsForSave(
      Array.isArray(existingData.clientContracts) ? existingData.clientContracts : [],
      Array.isArray(incomingData.clientContracts) ? incomingData.clientContracts : [],
    ),
    workers: mergeWorkersForSave(existingData.workers || [], incomingData.workers || []),
    workerMonthlyPaymentMemos: mergeWorkerMonthlyPaymentMemosForSave(
      existingData.workerMonthlyPaymentMemos || {},
      incomingData.workerMonthlyPaymentMemos || {},
    ),
    workerMonthlyActualVouchers: mergedWorkerMonthlyActualVouchers,
    bankTransactions: mergedBankTransactions,
    paymentVouchers: mergedPaymentVouchers,
  };
}

function mergeWorkerMonthlyPaymentMemosForSave(existing = {}, incoming = {}) {
  return { ...existing, ...incoming };
}

function normalizeOfficeStaffRecordId(id) {
  if (id == null || id === "") return "";
  return String(id).trim();
}

export function mergeOfficeStaffForSave(existing = [], incoming = []) {
  const existingById = new Map(
    (existing || [])
      .filter((row) => normalizeOfficeStaffRecordId(row?.id))
      .map((row) => [normalizeOfficeStaffRecordId(row.id), row]),
  );
  return (incoming || [])
    .filter((row) => normalizeOfficeStaffRecordId(row?.id) && String(row?.name || "").trim())
    .map((row) => ({ ...existingById.get(normalizeOfficeStaffRecordId(row.id)), ...row }));
}

export { mergeWorkerMonthlyPaymentMemosForSave };
