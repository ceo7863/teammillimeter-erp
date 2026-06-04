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

export function mergeBankTransactionRowForSave(prev, incoming) {
  if (!prev) return incoming;

  const paymentMatch = mergePaymentMatchFields(prev, incoming);
  const preferIncoming = shouldPreferIncomingClassification(prev, incoming);
  const memo = mergeMemoForSave(prev, incoming);

  if (preferIncoming) {
    return {
      ...incoming,
      ...paymentMatch,
      folderId: incoming.folderId ?? prev.folderId,
      memo,
      linkedSubject: incoming.linkedSubject ?? prev.linkedSubject,
      classifiedAt: incoming.classifiedAt ?? prev.classifiedAt,
    };
  }

  return {
    ...incoming,
    ...paymentMatch,
    folderId: prev.folderId ?? incoming.folderId,
    memo,
    linkedSubject: prev.linkedSubject ?? incoming.linkedSubject,
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
  return merged;
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
  const incomingIds = new Set(
    (incoming || [])
      .filter((worker) => normalizeWorkerRecordId(worker?.id))
      .map((worker) => normalizeWorkerRecordId(worker.id)),
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
    const merged = {
      ...prev,
      ...worker,
      grade: coalesce(worker.grade, prev.grade) || undefined,
      hireDate: coalesce(worker.hireDate, prev.hireDate) || undefined,
      eGradeEndedAt: coalesce(worker.eGradeEndedAt, prev.eGradeEndedAt) || undefined,
      category: coalesce(worker.category, prev.category) || undefined,
      depositNameAliases: coalesce(worker.depositNameAliases, prev.depositNameAliases) || undefined,
      portalLoginId: coalesce(worker.portalLoginId, prev.portalLoginId) || undefined,
      portalPasswordHash: worker.portalPasswordHash || prev.portalPasswordHash || undefined,
    };
    if (customChargeCost != null) {
      merged.customChargeCost = customChargeCost;
    } else {
      delete merged.customChargeCost;
    }
    return merged;
  });

  for (const worker of existing || []) {
    const workerId = normalizeWorkerRecordId(worker?.id);
    if (workerId && !incomingIds.has(workerId)) {
      merged.push(worker);
    }
  }

  return merged.map(({ monthlyPaymentMemo: _legacy, portalPassword: _pw, ...worker }) => worker);
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

export { mergeWorkerMonthlyPaymentMemosForSave };
