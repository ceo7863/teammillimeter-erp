/**
 * Canonical client collection journal (수금원장).
 *
 * Cash is never double-counted:
 * - Receipts contribute one row each at grossAmount ("실제 입금"), never allocation lines.
 * - Reallocations do not create journal cash rows; they only move sale-level coverage.
 *
 * Running balance policy (aligned with unified AR / receiptArSubledger):
 * - Sales increase invoice AR (청구 미수).
 * - Receipts decrease net exposure by gross: allocated reduces invoice AR; unapplied
 *   becomes prepaid. Prepaid does NOT reduce invoice AR — it is shown separately.
 *   netExposure ≈ max(invoiceOutstanding, 0) - unappliedPrepaid (adjustments included).
 * - Adjustments affect AR, not cash.
 * - STATEMENT_SENT markers are informational (amount 0) and do not move balances.
 */

import {
  isAllocationEffectiveAsOf,
  listReceiptAllocations,
  listReceipts,
  receiptMoney,
  saleBelongsToClient,
  shiftSeoulDate,
  summarizeReceiptAsOf,
  todaySeoul,
} from "./receipts.mjs";

const CHANNEL_TO_TYPE = Object.freeze({
  bank: "RECEIPT_BANK",
  cash: "RECEIPT_CASH",
  personal_account: "RECEIPT_PERSONAL",
  other: "RECEIPT_OTHER",
});

const TYPE_SORT_PRIORITY = Object.freeze({
  OPENING: 0,
  SALE: 10,
  AR_DEBIT_ADJUSTMENT: 20,
  AR_CREDIT_ADJUSTMENT: 30,
  RECEIPT_BANK: 40,
  RECEIPT_CASH: 41,
  RECEIPT_PERSONAL: 42,
  RECEIPT_OTHER: 43,
  RECEIPT_REVERSAL: 50,
  ADJUSTMENT_REVERSAL: 60,
  STATEMENT_SENT: 90,
});

const FILTER_ALIASES = Object.freeze({
  all: null,
  receipts: "receipts",
  adjustments: "adjustments",
  sales: "sales",
});

function money(value) {
  return receiptMoney(value);
}

function ymd(value) {
  return String(value || "").trim().slice(0, 10);
}

function monthKeyOf(dateYmd) {
  const d = ymd(dateYmd);
  return d && d.length >= 7 ? d.slice(0, 7) : "";
}

function resolveClient(clients, clientId) {
  const id = String(clientId || "").trim();
  const client = (clients || []).find((row) => String(row.id) === id);
  if (!client) {
    const err = new Error("거래처를 찾을 수 없습니다.");
    err.status = 404;
    err.code = "CLIENT_NOT_FOUND";
    throw err;
  }
  return client;
}

function receiptTypeFor(receipt) {
  if (receipt?.reversalOfReceiptId) return "RECEIPT_REVERSAL";
  return CHANNEL_TO_TYPE[String(receipt?.channel || "").trim()] || "RECEIPT_OTHER";
}

function adjustmentTypeFor(row) {
  if (row?.reversalOfAdjustmentId) return "ADJUSTMENT_REVERSAL";
  const t = String(row?.adjustmentType || "").toUpperCase();
  if (t === "OPENING_AR_BALANCE") return "OPENING";
  if (t === "DEBIT_AR_ADJUSTMENT") return "AR_DEBIT_ADJUSTMENT";
  if (t === "CREDIT_AR_ADJUSTMENT" || t === "HISTORICAL_COLLECTION_RECONCILIATION") {
    return "AR_CREDIT_ADJUSTMENT";
  }
  const signed = money(row?.signedAmount);
  return signed >= 0 ? "AR_DEBIT_ADJUSTMENT" : "AR_CREDIT_ADJUSTMENT";
}

function matchesFilter(entryType, filter) {
  const resolved = FILTER_ALIASES[String(filter || "all").toLowerCase()] ?? null;
  if (!resolved) return true;
  if (resolved === "sales") return entryType === "SALE" || entryType === "OPENING";
  if (resolved === "receipts") {
    return (
      entryType === "RECEIPT_BANK" ||
      entryType === "RECEIPT_CASH" ||
      entryType === "RECEIPT_PERSONAL" ||
      entryType === "RECEIPT_OTHER" ||
      entryType === "RECEIPT_REVERSAL"
    );
  }
  if (resolved === "adjustments") {
    return (
      entryType === "AR_CREDIT_ADJUSTMENT" ||
      entryType === "AR_DEBIT_ADJUSTMENT" ||
      entryType === "ADJUSTMENT_REVERSAL" ||
      entryType === "OPENING"
    );
  }
  return true;
}

function inRange(dateYmd, start, end) {
  const d = ymd(dateYmd);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function compareEntries(a, b) {
  const dateCmp = String(a.effectiveDate).localeCompare(String(b.effectiveDate));
  if (dateCmp) return dateCmp;
  const atA = String(a.recordedAt || "");
  const atB = String(b.recordedAt || "");
  const atCmp = atA.localeCompare(atB);
  if (atCmp) return atCmp;
  const priA = TYPE_SORT_PRIORITY[a.type] ?? 80;
  const priB = TYPE_SORT_PRIORITY[b.type] ?? 80;
  if (priA !== priB) return priA - priB;
  return String(a.voucherNo || a.id || "").localeCompare(String(b.voucherNo || b.id || ""));
}

function emptyColumns() {
  return {
    salesIncrease: 0,
    actualReceipt: 0,
    adjDebit: 0,
    adjCredit: 0,
    reversal: 0,
  };
}

function buildSaleEntries(sales) {
  const rows = [];
  for (const sale of sales || []) {
    if (sale?.status === "cancelled" || sale?.cancelled === true) continue;
    const date = ymd(sale.date);
    if (!date) continue;
    const billed = money(sale.amount);
    if (billed === 0 && !sale.amount) continue;
    rows.push({
      id: `sale:${sale.id}`,
      type: "SALE",
      effectiveDate: date,
      recordedAt: String(sale.createdAt || sale.postedAt || `${date}T00:00:00.000Z`),
      voucherNo: String(sale.voucherNo || sale.id || ""),
      description: String(sale.site || sale.memo || "매출"),
      author: String(sale.createdBy || sale.postedBy || ""),
      channel: "",
      status: sale.cancelled ? "cancelled" : "posted",
      ref: { kind: "sale", saleId: sale.id },
      ...emptyColumns(),
      salesIncrease: billed,
      _deltaInvoice: billed,
      _deltaPrepaid: 0,
      _deltaCashGross: 0,
    });
  }
  return rows;
}

function buildReceiptEntries(receipts) {
  const rows = [];
  for (const receipt of receipts || []) {
    const date = ymd(receipt.receiptDate);
    if (!date) continue;
    const type = receiptTypeFor(receipt);
    const gross = money(receipt.grossAmount);
    const isReversal = Boolean(receipt.reversalOfReceiptId);
    // Reversal docs store negative gross; actualReceipt shows signed cash movement.
    const actualReceipt = isReversal ? gross : Math.abs(gross);
    const cols = emptyColumns();
    if (isReversal) {
      cols.reversal = Math.abs(gross);
      cols.actualReceipt = actualReceipt; // typically negative
    } else {
      cols.actualReceipt = actualReceipt;
    }
    rows.push({
      id: `receipt:${receipt.id}`,
      type,
      effectiveDate: date,
      recordedAt: String(receipt.createdAt || receipt.postedAt || `${date}T00:00:00.000Z`),
      voucherNo: String(receipt.receiptNo || receipt.id || ""),
      description: String(receipt.memo || (isReversal ? "입금취소" : "실제 입금")),
      author: String(receipt.createdBy || receipt.postedBy || ""),
      channel: String(receipt.channel || ""),
      status: String(receipt.status || "posted"),
      ref: { kind: "receipt", receiptId: receipt.id, reversalOfReceiptId: receipt.reversalOfReceiptId || null },
      ...cols,
      // Net exposure moves by full gross (invoice −alloc / prepaid +unalloc).
      // Invoice / prepaid split is applied later with as-of allocation snapshot at receipt date.
      _deltaCashGross: isReversal ? gross : Math.abs(gross),
      _receiptId: receipt.id,
      _isReversalReceipt: isReversal,
    });
  }
  return rows;
}

function buildAdjustmentEntries(adjustments) {
  const rows = [];
  for (const row of adjustments || []) {
    if (!row) continue;
    // Skip the original row after it was reversed — the reversal document carries the offset.
    if (row.status === "reversed" && !row.reversalOfAdjustmentId) continue;
    const date = ymd(row.effectiveDate);
    if (!date) continue;
    const type = adjustmentTypeFor(row);
    const signed = money(row.signedAmount != null ? row.signedAmount : row.amount);
    const abs = Math.abs(signed);
    const cols = emptyColumns();
    if (type === "ADJUSTMENT_REVERSAL") {
      cols.reversal = abs;
      if (signed >= 0) cols.adjDebit = abs;
      else cols.adjCredit = abs;
    } else if (type === "OPENING") {
      if (signed >= 0) cols.adjDebit = abs;
      else cols.adjCredit = abs;
    } else if (signed >= 0) {
      cols.adjDebit = abs;
    } else {
      cols.adjCredit = abs;
    }
    rows.push({
      id: `adj:${row.id}`,
      type,
      effectiveDate: date,
      recordedAt: String(row.createdAt || row.postedAt || `${date}T00:00:00.000Z`),
      voucherNo: String(row.adjustmentNo || row.id || ""),
      description: String(row.memo || row.adjustmentType || "미수조정"),
      author: String(row.createdBy || row.postedBy || ""),
      channel: "",
      status: String(row.status || "posted"),
      ref: {
        kind: "adjustment",
        adjustmentId: row.id,
        adjustmentType: row.adjustmentType,
        reversalOfAdjustmentId: row.reversalOfAdjustmentId || null,
      },
      ...cols,
      _deltaInvoice: signed,
      _deltaPrepaid: 0,
      _deltaCashGross: 0,
    });
  }
  return rows;
}

function buildStatementSentEntries(archives, client, clients) {
  const rows = [];
  const clientId = String(client.id);
  const clientName = String(client.name || "").trim();
  for (const archive of archives || []) {
    if (!archive) continue;
    const sent = Boolean(archive.sentViaLink) || Boolean(archive.sentAt) || Boolean(archive.shareLinkUrl);
    if (!sent) continue;
    const subject = String(archive.subjectName || archive.clientName || "").trim();
    const archiveClientId = archive.clientId != null ? String(archive.clientId) : "";
    const matchesClient =
      (archiveClientId && archiveClientId === clientId) ||
      (subject && subject === clientName) ||
      (Array.isArray(archive.statementSalesIds) &&
        archive.statementSalesIds.length > 0 &&
        // soft match: leave to caller if saleIds belong to client — checked below via sales if present
        subject.includes(clientName));
    if (!matchesClient && archiveClientId !== clientId) {
      if (!(subject && clientName && subject === clientName)) continue;
    }
    const date = ymd(archive.periodEnd || archive.createdAt || archive.sentAt);
    if (!date) continue;
    rows.push({
      id: `statement:${archive.id}`,
      type: "STATEMENT_SENT",
      effectiveDate: date,
      recordedAt: String(archive.createdAt || archive.sentAt || `${date}T00:00:00.000Z`),
      voucherNo: String(archive.fileName || archive.id || ""),
      description: `내역서 발송${subject ? ` · ${subject}` : ""}`,
      author: String(archive.createdBy || ""),
      channel: "",
      status: "informational",
      ref: { kind: "statement", archiveId: archive.id },
      ...emptyColumns(),
      _deltaInvoice: 0,
      _deltaPrepaid: 0,
      _deltaCashGross: 0,
      _informational: true,
    });
  }
  void clients;
  return rows;
}

/**
 * Snapshot invoice outstanding + prepaid as of a date for one client.
 * Invoice AR = billed − effective allocations (prepaid excluded).
 * Adjustments are tracked separately and added by the journal runner.
 */
function snapshotInvoiceAndPrepaid(sales, receipts, allocations, clientId, asOf) {
  const receiptById = new Map((receipts || []).map((row) => [String(row.id), row]));
  let billed = 0;
  for (const sale of sales || []) {
    if (sale?.status === "cancelled" || sale?.cancelled === true) continue;
    const d = ymd(sale.date);
    if (!d || d > asOf) continue;
    billed += money(sale.amount);
  }
  let allocated = 0;
  for (const allocation of allocations || []) {
    if (!isAllocationEffectiveAsOf(allocation, receiptById, asOf)) continue;
    const receipt = receiptById.get(String(allocation.receiptId));
    if (!receipt || String(receipt.clientId) !== String(clientId)) continue;
    allocated += money(allocation.amount);
  }
  let prepaid = 0;
  let grossToEnd = 0;
  for (const receipt of receipts || []) {
    if (String(receipt.clientId) !== String(clientId)) continue;
    if (receipt.reversalOfReceiptId) continue;
    const summary = summarizeReceiptAsOf(receipt, allocations, asOf);
    prepaid += summary.unallocatedAmount;
    const rd = ymd(receipt.receiptDate);
    if (rd && rd <= asOf) {
      const reversedAt = receipt.reversedEffectiveDate ? ymd(receipt.reversedEffectiveDate) : null;
      if (!reversedAt || asOf < reversedAt) {
        grossToEnd += money(receipt.grossAmount);
      }
    }
  }
  const invoiceOutstanding = billed - allocated;
  return {
    billed,
    allocated,
    invoiceOutstanding,
    unappliedPrepaid: prepaid,
    cumulativeReceiptsGross: grossToEnd,
  };
}

function applyReceiptSplit(entry, receipts, allocations, asOf) {
  if (!entry._receiptId) {
    return { deltaInvoice: entry._deltaInvoice || 0, deltaPrepaid: entry._deltaPrepaid || 0 };
  }
  const receipt = (receipts || []).find((row) => String(row.id) === String(entry._receiptId));
  if (!receipt) {
    return { deltaInvoice: -(entry._deltaCashGross || 0), deltaPrepaid: 0 };
  }
  if (entry._isReversalReceipt) {
    // Reversal undoes the original receipt's effect on net; approximate with gross.
    const gross = money(receipt.grossAmount); // usually negative
    return { deltaInvoice: -gross, deltaPrepaid: 0 };
  }
  const summary = summarizeReceiptAsOf(receipt, allocations, asOf || entry.effectiveDate);
  return {
    deltaInvoice: -money(summary.allocatedAmount),
    deltaPrepaid: money(summary.unallocatedAmount),
  };
}

/**
 * @param {object} data ERP state slice
 * @param {string|number} clientId
 * @param {{ start?: string, end?: string, filter?: string, archives?: any[] }} [options]
 */
export function buildClientCollectionJournal(data = {}, clientId, options = {}) {
  const clients = data.clients || [];
  const client = resolveClient(clients, clientId);
  const start = options.start ? ymd(options.start) : "";
  const end = options.end ? ymd(options.end) : todaySeoul();
  const filter = String(options.filter || "all").toLowerCase();
  const archives = Array.isArray(options.archives)
    ? options.archives
    : Array.isArray(data.pdfArchives)
      ? data.pdfArchives
      : [];

  const receipts = listReceipts(data).filter((row) => String(row.clientId) === String(client.id));
  const allocations = listReceiptAllocations(data);
  const sales = (data.sales || []).filter((sale) => saleBelongsToClient(sale, client, clients));
  const adjustments = (data.arAdjustments || []).filter(
    (row) => String(row.clientId) === String(client.id),
  );

  const openingAsOf = start ? shiftSeoulDate(start, -1) : null;
  let openingInvoice = 0;
  let openingPrepaid = 0;
  let openingAdjNet = 0;
  if (openingAsOf) {
    const snap = snapshotInvoiceAndPrepaid(sales, receipts, allocations, client.id, openingAsOf);
    openingInvoice = snap.invoiceOutstanding;
    openingPrepaid = snap.unappliedPrepaid;
    for (const row of adjustments) {
      if (row.status === "reversed" && !row.reversalOfAdjustmentId) continue;
      const d = ymd(row.effectiveDate);
      if (!d || d > openingAsOf) continue;
      // OPENING_AR_BALANCE and other adjs through openingAsOf
      openingAdjNet += money(row.signedAmount != null ? row.signedAmount : row.amount);
    }
  }

  const openingNet = openingInvoice + openingAdjNet - openingPrepaid;

  /** @type {any[]} */
  let entries = [
    ...buildSaleEntries(sales),
    ...buildReceiptEntries(receipts),
    ...buildAdjustmentEntries(adjustments),
    ...buildStatementSentEntries(archives, client, clients),
  ];

  if (openingAsOf && (openingInvoice !== 0 || openingPrepaid !== 0 || openingAdjNet !== 0 || start)) {
    entries.push({
      id: `opening:${client.id}:${openingAsOf}`,
      type: "OPENING",
      effectiveDate: openingAsOf,
      recordedAt: `${openingAsOf}T00:00:00.000Z`,
      voucherNo: "OPENING",
      description: `기초 미수 (${openingAsOf})`,
      author: "system",
      channel: "",
      status: "opening",
      ref: { kind: "opening", asOf: openingAsOf },
      ...emptyColumns(),
      adjDebit: openingAdjNet > 0 ? openingAdjNet : 0,
      adjCredit: openingAdjNet < 0 ? Math.abs(openingAdjNet) : 0,
      salesIncrease: Math.max(openingInvoice, 0),
      _deltaInvoice: 0,
      _deltaPrepaid: 0,
      _deltaCashGross: 0,
      _isSyntheticOpening: true,
      _seedInvoice: openingInvoice,
      _seedPrepaid: openingPrepaid,
      _seedAdjNet: openingAdjNet,
    });
  }

  entries.sort(compareEntries);

  let invoiceOutstanding = 0;
  let unappliedPrepaid = 0;
  let adjNet = 0;
  let cumulativeReceiptsGross = 0;
  let allocatedFromReceipts = 0;
  let debitAdjustments = 0;
  let creditAdjustments = 0;

  const enriched = [];
  for (const raw of entries) {
    if (raw._isSyntheticOpening) {
      invoiceOutstanding = money(raw._seedInvoice);
      unappliedPrepaid = money(raw._seedPrepaid);
      adjNet = money(raw._seedAdjNet);
      const netExposure = invoiceOutstanding + adjNet - unappliedPrepaid;
      enriched.push({
        ...publicEntry(raw),
        invoiceOutstanding,
        unappliedPrepaid,
        runningBalance: netExposure,
        netExposure,
      });
      continue;
    }

    // Skip events before opening seed when a period start is set (already in opening).
    if (openingAsOf && ymd(raw.effectiveDate) <= openingAsOf && raw.type !== "OPENING") {
      continue;
    }

    let deltaInvoice = money(raw._deltaInvoice);
    let deltaPrepaid = money(raw._deltaPrepaid);

    if (raw._receiptId) {
      const split = applyReceiptSplit(raw, receipts, allocations, raw.effectiveDate);
      deltaInvoice = split.deltaInvoice;
      deltaPrepaid = split.deltaPrepaid;
      const cash = money(raw._deltaCashGross);
      cumulativeReceiptsGross += Math.abs(cash);
      if (!raw._isReversalReceipt) {
        allocatedFromReceipts += Math.abs(deltaInvoice);
      }
    } else if (raw.type === "SALE") {
      deltaInvoice = money(raw.salesIncrease);
    } else if (
      raw.type === "AR_DEBIT_ADJUSTMENT" ||
      raw.type === "AR_CREDIT_ADJUSTMENT" ||
      raw.type === "ADJUSTMENT_REVERSAL" ||
      raw.type === "OPENING"
    ) {
      const signed = money(raw.adjDebit) - money(raw.adjCredit);
      if (raw.type === "OPENING" && !raw._isSyntheticOpening) {
        // Persisted OPENING_AR_BALANCE rows count as adjustments.
        adjNet += signed;
        if (signed >= 0) debitAdjustments += signed;
        else creditAdjustments += Math.abs(signed);
      } else if (raw.type !== "OPENING") {
        adjNet += signed;
        if (signed >= 0) debitAdjustments += signed;
        else creditAdjustments += Math.abs(signed);
      }
      deltaInvoice = 0;
      deltaPrepaid = 0;
    }

    invoiceOutstanding += deltaInvoice;
    unappliedPrepaid += deltaPrepaid;
    const netExposure = invoiceOutstanding + adjNet - unappliedPrepaid;

    enriched.push({
      ...publicEntry(raw),
      invoiceOutstanding,
      unappliedPrepaid,
      runningBalance: netExposure,
      netExposure,
    });
  }

  // End-of-period authoritative snapshot (allocations as-of end).
  const endSnap = snapshotInvoiceAndPrepaid(sales, receipts, allocations, client.id, end);
  let endAdjNet = 0;
  let endDebit = 0;
  let endCredit = 0;
  for (const row of adjustments) {
    if (row.status === "reversed" && !row.reversalOfAdjustmentId) continue;
    const d = ymd(row.effectiveDate);
    if (!d || d > end) continue;
    if (start && d < start && row.adjustmentType !== "OPENING_AR_BALANCE") {
      // still include in cumulative end figures
    }
    const signed = money(row.signedAmount != null ? row.signedAmount : row.amount);
    endAdjNet += signed;
    if (signed >= 0) endDebit += signed;
    else endCredit += Math.abs(signed);
  }

  const billedOutstanding = endSnap.invoiceOutstanding;
  const summaryPrepaid = endSnap.unappliedPrepaid;
  const netExposure = billedOutstanding + endAdjNet - summaryPrepaid;

  const visible = enriched.filter((row) => {
    if (row.type === "OPENING" && row.ref?.kind === "opening") {
      // Synthetic opening is only for "all" / sales / adjustments views, never receipts-only.
      if (!matchesFilter(row.type, filter)) return false;
      return Boolean(start);
    }
    if (!inRange(row.effectiveDate, start || null, end)) return false;
    return matchesFilter(row.type, filter);
  });

  const monthlySummaries = buildMonthlySummaries({
    entries: enriched,
    start,
    end,
    sales,
    receipts,
    allocations,
    adjustments,
    clientId: client.id,
  });

  const lastReceipt = [...receipts]
    .filter((r) => !r.reversalOfReceiptId && ymd(r.receiptDate) && (!end || ymd(r.receiptDate) <= end))
    .sort((a, b) => ymd(a.receiptDate).localeCompare(ymd(b.receiptDate)))
    .at(-1);
  const lastAdj = [...adjustments]
    .filter((r) => ymd(r.effectiveDate) && (!end || ymd(r.effectiveDate) <= end))
    .sort((a, b) => ymd(a.effectiveDate).localeCompare(ymd(b.effectiveDate)))
    .at(-1);
  const unappliedReceiptCount = receipts.filter((r) => {
    if (r.reversalOfReceiptId) return false;
    const s = summarizeReceiptAsOf(r, allocations, end);
    return s.unallocatedAmount > 0;
  }).length;

  return {
    clientId: String(client.id),
    clientName: String(client.name || ""),
    startDate: start || null,
    endDate: end,
    filter,
    entries: visible,
    summary: {
      billedOutstanding,
      cumulativeReceiptsGross: endSnap.cumulativeReceiptsGross,
      allocatedFromReceipts: endSnap.allocated,
      unappliedPrepaid: summaryPrepaid,
      debitAdjustments: endDebit,
      creditAdjustments: endCredit,
      netExposure,
      invoiceOutstanding: billedOutstanding,
      openingNet: start ? openingNet : null,
      openingInvoiceOutstanding: start ? openingInvoice : null,
      openingPrepaid: start ? openingPrepaid : null,
    },
    monthlySummaries,
    balanceContrast: {
      erpNetExposure: netExposure,
      invoiceAr: billedOutstanding,
      prepaid: summaryPrepaid,
      adjustmentNet: endAdjNet,
      debitAdjustments: endDebit,
      creditAdjustments: endCredit,
      lastReceiptDate: lastReceipt ? ymd(lastReceipt.receiptDate) : null,
      lastAdjustmentDate: lastAdj ? ymd(lastAdj.effectiveDate) : null,
      unappliedReceiptCount,
      needsReviewCount: 0,
    },
    policyNotes: {
      cash:
        "실제 입금 = Receipt.grossAmount only; allocation/reallocation never create cash journal rows",
      prepaid:
        "unallocated prepaid does not reduce invoice AR; netExposure = invoiceOutstanding + adjNet - prepaid",
      adjustments: "arAdjustments change AR only; never counted as cash receipts",
      runningBalance: "runningBalance column is netExposure after each chronological event",
    },
  };
}

function publicEntry(raw) {
  return {
    id: raw.id,
    type: raw.type,
    effectiveDate: raw.effectiveDate,
    recordedAt: raw.recordedAt,
    voucherNo: raw.voucherNo,
    description: raw.description,
    salesIncrease: money(raw.salesIncrease),
    actualReceipt: money(raw.actualReceipt),
    adjDebit: money(raw.adjDebit),
    adjCredit: money(raw.adjCredit),
    reversal: money(raw.reversal),
    author: raw.author,
    channel: raw.channel,
    status: raw.status,
    ref: raw.ref,
  };
}

function buildMonthlySummaries({
  entries,
  start,
  end,
  sales,
  receipts,
  allocations,
  adjustments,
  clientId,
}) {
  const months = new Set();
  for (const e of entries) {
    const mk = monthKeyOf(e.effectiveDate);
    if (mk) months.add(mk);
  }
  // Ensure months covering start..end exist even if empty.
  if (start && end) {
    let cursor = `${start.slice(0, 7)}-01`;
    const endMonth = end.slice(0, 7);
    while (monthKeyOf(cursor) <= endMonth) {
      months.add(monthKeyOf(cursor));
      const [y, m] = monthKeyOf(cursor).split("-").map(Number);
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      cursor = next;
      if (months.size > 240) break;
    }
  }

  const sortedMonths = [...months].sort();
  const out = [];
  for (const monthKey of sortedMonths) {
    if (start && monthKey < start.slice(0, 7)) continue;
    if (end && monthKey > end.slice(0, 7)) continue;
    const monthStart = `${monthKey}-01`;
    const [y, m] = monthKey.split("-").map(Number);
    const monthEnd =
      m === 12 ? `${y}-12-31` : ymd(shiftSeoulDate(`${y}-${String(m + 1).padStart(2, "0")}-01`, -1));
    const openingAsOf = shiftSeoulDate(monthStart, -1);
    const openSnap = snapshotInvoiceAndPrepaid(sales, receipts, allocations, clientId, openingAsOf);
    let openAdj = 0;
    for (const row of adjustments || []) {
      if (row.status === "reversed" && !row.reversalOfAdjustmentId) continue;
      const d = ymd(row.effectiveDate);
      if (!d || d > openingAsOf) continue;
      openAdj += money(row.signedAmount != null ? row.signedAmount : row.amount);
    }
    const openingNet = openSnap.invoiceOutstanding + openAdj - openSnap.unappliedPrepaid;

    let salesAmt = 0;
    let receiptsGross = 0;
    let debitAdj = 0;
    let creditAdj = 0;
    for (const e of entries) {
      if (monthKeyOf(e.effectiveDate) !== monthKey) continue;
      if (e.type === "OPENING" && e.ref?.kind === "opening") continue;
      salesAmt += money(e.salesIncrease);
      receiptsGross += Math.abs(money(e.actualReceipt));
      debitAdj += money(e.adjDebit);
      creditAdj += money(e.adjCredit);
    }
    // Prefer absolute receipt gross from receipts list for the month (avoids double-count with reversals sign).
    receiptsGross = 0;
    for (const r of receipts || []) {
      if (String(r.clientId) !== String(clientId)) continue;
      const d = ymd(r.receiptDate);
      if (!d || monthKeyOf(d) !== monthKey) continue;
      const g = money(r.grossAmount);
      receiptsGross += r.reversalOfReceiptId ? g : Math.abs(g);
    }

    const closeSnap = snapshotInvoiceAndPrepaid(sales, receipts, allocations, clientId, monthEnd);
    let closeAdj = 0;
    for (const row of adjustments || []) {
      if (row.status === "reversed" && !row.reversalOfAdjustmentId) continue;
      const d = ymd(row.effectiveDate);
      if (!d || d > monthEnd) continue;
      closeAdj += money(row.signedAmount != null ? row.signedAmount : row.amount);
    }
    const closingInvoiceOutstanding = closeSnap.invoiceOutstanding;
    const closingPrepaid = closeSnap.unappliedPrepaid;
    const closingNet = closingInvoiceOutstanding + closeAdj - closingPrepaid;

    out.push({
      monthKey,
      openingNet,
      sales: salesAmt,
      receiptsGross,
      debitAdj,
      creditAdj,
      closingInvoiceOutstanding,
      closingPrepaid,
      closingNet,
    });
  }
  return out;
}

export { CHANNEL_TO_TYPE, TYPE_SORT_PRIORITY };
