/**
 * Canonical collection policies: sent-statement sale unions, FIFO scope,
 * prepaid auto-apply planning, cash→bank transfer classification.
 */
import { listPdfArchiveMetas } from "./pdfArchive.mjs";

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function saleIdKey(id) {
  return String(id ?? "").trim();
}

/**
 * Unique saleIds that appear on at least one sent client statement archive.
 * Overlapping periods contribute each saleId once.
 */
export function collectSentStatementSaleIds(archives = [], options = {}) {
  const clientName = String(options.clientName || "").trim();
  const clientId = String(options.clientId || "").trim();
  const ids = new Set();
  const docs = [];
  for (const row of archives || []) {
    if (!row) continue;
    const category = String(row.category || row.statementView || "").toLowerCase();
    const isClientDoc =
      category.includes("client") ||
      category === "statement" ||
      row.statementView === "client" ||
      row.statementView === "clientStatement";
    if (!isClientDoc && row.category && !String(row.category).includes("거래")) {
      // Still accept rows that carry statementSalesIds (client statements always should).
      if (!Array.isArray(row.statementSalesIds) || !row.statementSalesIds.length) continue;
    }
    if (clientName && String(row.subjectName || "").trim() && String(row.subjectName).trim() !== clientName) {
      continue;
    }
    if (clientId && row.clientId != null && String(row.clientId) !== clientId) continue;
    const sent = row.sentViaLink === true || row.sentViaLink === 1 || Boolean(row.shareLinkUrl);
    if (options.requireSent && !sent) continue;
    const salesIds = Array.isArray(row.statementSalesIds) ? row.statementSalesIds : [];
    if (!salesIds.length) continue;
    const before = ids.size;
    for (const raw of salesIds) {
      const id = saleIdKey(raw);
      if (id) ids.add(id);
    }
    if (ids.size > before || salesIds.length) {
      docs.push({
        archiveId: row.id,
        subjectName: row.subjectName,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        sent,
        saleCount: salesIds.length,
      });
    }
  }
  return {
    saleIds: [...ids],
    saleIdSet: ids,
    documents: docs,
  };
}

export function loadSentStatementSaleIdsForClient(client, options = {}) {
  let archives = [];
  if (typeof options.archives !== "undefined") {
    archives = options.archives;
  } else {
    try {
      archives = listPdfArchiveMetas();
    } catch {
      archives = [];
    }
  }
  return collectSentStatementSaleIds(archives, {
    clientName: client?.name,
    clientId: client?.id,
    requireSent: options.requireSent !== false,
  });
}

/**
 * FIFO proposals limited to an allowlist of saleIds (sent-statement union).
 * If allowlist is empty and requireAllowlist=true, all cash stays prepaid.
 */
export function proposeFifoAllocationsScoped(proposeFifoAllocations, args) {
  const {
    sales,
    client,
    grossAmount,
    allocations,
    receipts,
    clients,
    asOfDate,
    saleIdAllowlist,
    requireAllowlist = true,
  } = args;
  const allow = saleIdAllowlist instanceof Set ? saleIdAllowlist : new Set((saleIdAllowlist || []).map(saleIdKey));
  const scopedSales =
    requireAllowlist && allow.size === 0
      ? []
      : (sales || []).filter((sale) => {
          const id = saleIdKey(sale?.id);
          if (!id) return false;
          if (requireAllowlist && allow.size > 0 && !allow.has(id)) return false;
          return true;
        });
  return proposeFifoAllocations(scopedSales, client, grossAmount, allocations, receipts, clients, asOfDate);
}

/**
 * Plan applying unallocated prepaid receipts onto target unpaid saleIds (FIFO per receipt).
 * Returns allocation patches: [{ receiptId, allocations: [{saleId,amount}] }]
 * Does not mutate state.
 */
export function planPrepaidAutoApply({
  receipts = [],
  allocations = [],
  sales = [],
  targetSaleIds = [],
  asOfDate,
  saleAllocatedAsOf,
  summarizeReceipt,
}) {
  const targets = new Set((targetSaleIds || []).map(saleIdKey).filter(Boolean));
  if (!targets.size) return { patches: [], appliedTotal: 0 };

  const unpaidBySale = new Map();
  for (const sale of sales || []) {
    const id = saleIdKey(sale.id);
    if (!targets.has(id)) continue;
    const billed = money(sale.amount);
    const allocated = saleAllocatedAsOf ? money(saleAllocatedAsOf(allocations, receipts, id, asOfDate)) : 0;
    const unpaid = Math.max(billed - allocated, 0);
    if (unpaid > 0) unpaidBySale.set(id, unpaid);
  }
  if (!unpaidBySale.size) return { patches: [], appliedTotal: 0 };

  const orderedSales = [...unpaidBySale.keys()].sort((a, b) => {
    const sa = (sales || []).find((row) => saleIdKey(row.id) === a);
    const sb = (sales || []).find((row) => saleIdKey(row.id) === b);
    return (
      String(sa?.date || "").localeCompare(String(sb?.date || "")) || String(a).localeCompare(String(b))
    );
  });

  const patches = [];
  let appliedTotal = 0;
  const prepaidReceipts = (receipts || [])
    .filter((row) => !row.reversalOfReceiptId && row.status !== "reversed" && !row.reversedEffectiveDate)
    .map((receipt) => {
      const rows = (allocations || []).filter((a) => String(a.receiptId) === String(receipt.id));
      const summary = summarizeReceipt
        ? summarizeReceipt(receipt, rows)
        : { unallocatedAmount: Math.max(money(receipt.grossAmount) - rows.reduce((s, r) => s + money(r.amount), 0), 0) };
      return { receipt, rows, prepaid: money(summary.unallocatedAmount) };
    })
    .filter((row) => row.prepaid > 0)
    .sort(
      (a, b) =>
        String(a.receipt.receiptDate || "").localeCompare(String(b.receipt.receiptDate || "")) ||
        String(a.receipt.id).localeCompare(String(b.receipt.id)),
    );

  for (const item of prepaidReceipts) {
    let remaining = item.prepaid;
    if (remaining <= 0) continue;
    // Keep existing effective allocations and add new ones for remaining prepaid.
    const nextAlloc = item.rows
      .filter((row) => !row.reversedEffectiveDate && row.status !== "reversed" && !row.auditOnly)
      .map((row) => ({ saleId: row.saleId, amount: money(row.amount) }));
    let changed = false;
    for (const saleId of orderedSales) {
      if (remaining <= 0) break;
      const unpaid = unpaidBySale.get(saleId) || 0;
      if (unpaid <= 0) continue;
      const apply = Math.min(unpaid, remaining);
      if (apply <= 0) continue;
      nextAlloc.push({ saleId, amount: apply });
      unpaidBySale.set(saleId, unpaid - apply);
      remaining -= apply;
      appliedTotal += apply;
      changed = true;
    }
    if (changed) {
      patches.push({
        receiptId: item.receipt.id,
        clientId: item.receipt.clientId,
        allocations: nextAlloc,
        appliedFromPrepaid: item.prepaid - remaining,
      });
    }
  }

  return { patches, appliedTotal };
}

/**
 * Cash already receipted must not create another customer Receipt when the same
 * cash hits the corporate bank account.
 */
export function classifyCashBankTransfer({ bankTx, receipts = [], linkedCashReceiptId = null }) {
  const deposit = money(bankTx?.deposit ?? bankTx?.amount);
  if (deposit <= 0) {
    return { kind: "not_deposit", allowCustomerReceipt: false };
  }
  if (linkedCashReceiptId) {
    const hit = (receipts || []).find((row) => String(row.id) === String(linkedCashReceiptId));
    if (hit && ["cash", "personal_account"].includes(String(hit.channel || ""))) {
      return {
        kind: "cash_to_bank_transfer",
        allowCustomerReceipt: false,
        code: "CASH_TRANSFER_NOT_CUSTOMER_RECEIPT",
        message: "이미 현금/개인계좌로 수금된 금액의 통장 입금은 고객 Receipt가 아니라 자금이동입니다.",
        cashReceiptId: hit.id,
      };
    }
  }
  const memo = `${bankTx?.memo || ""} ${bankTx?.counterpartName || ""} ${bankTx?.description || ""}`;
  if (/현금\s*입금|시재\s*입금|금고/.test(memo) && !bankTx?.matchedClientId) {
    return {
      kind: "possible_cash_transfer",
      allowCustomerReceipt: false,
      code: "CASH_TRANSFER_REVIEW_REQUIRED",
      message: "현금시재 입금 가능성이 있어 고객 Receipt 자동생성을 차단합니다.",
    };
  }
  return { kind: "customer_deposit_candidate", allowCustomerReceipt: true };
}

export function moneyCanonical(value) {
  return money(value);
}
