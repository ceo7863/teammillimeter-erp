/**
 * Read-only dry-run: map legacy paymentVouchers / paymentInputLogs / bank links
 * into expected Receipt + ReceiptAllocation shapes. Never applies writes.
 */

import { getErpState } from "../server/db.mjs";

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function legacyKey(voucher) {
  if (voucher?.id != null && voucher.id !== "") return `pv:${voucher.id}`;
  const parts = [
    voucher?.date || "",
    voucher?.client || "",
    voucher?.salesId ?? "",
    voucher?.bankTransactionId ?? "",
    money(voucher?.finalAmount ?? voucher?.amount),
  ];
  return `pvhash:${parts.join("|")}`;
}

function classifyManualReview(voucher, ctx) {
  const reasons = [];
  if (!voucher?.salesId && !voucher?.statementSalesIds?.length) reasons.push("missing_sale_link");
  if (voucher?.salesId && !ctx.salesById.has(String(voucher.salesId))) reasons.push("orphan_sale");
  if (voucher?.client && ctx.clientNameCounts.get(String(voucher.client).trim()) > 1) {
    reasons.push("ambiguous_client_name");
  }
  if (voucher?.client && !ctx.clientsByName.has(String(voucher.client).trim())) {
    reasons.push("unknown_client");
  }
  const amount = money(voucher?.finalAmount ?? voucher?.amount);
  const supply = money(voucher?.amount);
  if (voucher?.vatAmount && money(voucher.vatAmount) > 0 && amount !== supply) {
    reasons.push("vat_embedded_final_amount");
  }
  if (amount <= 0) reasons.push("non_positive_amount");
  return reasons;
}

export function diagnoseLegacyPaymentMigration(data = {}) {
  const sales = data.sales || [];
  const clients = data.clients || [];
  const vouchers = data.paymentVouchers || [];
  const logs = data.paymentInputLogs || [];
  const bankTransactions = data.bankTransactions || [];

  const salesById = new Map(sales.map((row) => [String(row.id), row]));
  const clientsByName = new Map();
  const clientNameCounts = new Map();
  for (const client of clients) {
    const name = String(client.name || "").trim();
    if (!name) continue;
    clientNameCounts.set(name, (clientNameCounts.get(name) || 0) + 1);
    if (!clientsByName.has(name)) clientsByName.set(name, client);
  }

  const ctx = { salesById, clientsByName, clientNameCounts };
  const expectedReceipts = [];
  const expectedAllocations = [];
  const duplicates = [];
  const orphans = [];
  const overAllocations = [];
  const clientMismatches = [];
  const bankDupes = [];
  const amountMismatches = [];
  const manualReview = [];
  const parity = [];

  const bankReceiptKeys = new Map();
  const seenKeys = new Map();

  for (const voucher of vouchers) {
    const key = legacyKey(voucher);
    if (seenKeys.has(key)) {
      duplicates.push({ key, voucherId: voucher.id, otherId: seenKeys.get(key) });
      continue;
    }
    seenKeys.set(key, voucher.id);

    const reviewReasons = classifyManualReview(voucher, ctx);
    const clientName = String(voucher.client || "").trim();
    const client = clientsByName.get(clientName);
    const gross = money(voucher.finalAmount ?? voucher.amount);
    const channel =
      voucher.depositChannel === "cash"
        ? "cash"
        : voucher.bankTransactionId
          ? "bank"
          : voucher.depositChannel === "personal"
            ? "personal_account"
            : "other";
    const source = voucher.bankTransactionId
      ? voucher.matchAutoLinked || voucher.autoLinked
        ? "bank_auto"
        : "bank_manual"
      : voucher.linkedPdfArchiveId
        ? "sent_statement"
        : "migration";

    if (voucher.bankTransactionId) {
      const bankId = String(voucher.bankTransactionId);
      if (bankReceiptKeys.has(bankId)) {
        bankDupes.push({
          bankTransactionId: bankId,
          voucherIds: [bankReceiptKeys.get(bankId), voucher.id],
        });
      } else {
        bankReceiptKeys.set(bankId, voucher.id);
      }
    }

    if (reviewReasons.length) {
      manualReview.push({ key, voucherId: voucher.id, reasons: reviewReasons });
    }

    if (voucher.salesId && !salesById.has(String(voucher.salesId))) {
      orphans.push({ key, voucherId: voucher.id, salesId: voucher.salesId });
    }

    if (voucher.salesId && salesById.has(String(voucher.salesId))) {
      const sale = salesById.get(String(voucher.salesId));
      if (String(sale.client || "").trim() !== clientName) {
        clientMismatches.push({
          key,
          voucherId: voucher.id,
          voucherClient: clientName,
          saleClient: sale.client,
          salesId: sale.id,
        });
      }
    }

    const receiptId = `dryrun:${key}`;
    expectedReceipts.push({
      id: receiptId,
      legacyKey: key,
      clientId: client?.id ?? null,
      clientName,
      receiptDate: voucher.date,
      grossAmount: gross,
      channel,
      source,
      status: "posted",
      bankTransactionId: voucher.bankTransactionId || null,
      sentStatementId: voucher.linkedPdfArchiveId || null,
      memo: voucher.memo || "",
      operationId: `legacy:${key}`,
    });

    if (voucher.salesId) {
      expectedAllocations.push({
        id: `dryrun-alloc:${key}`,
        receiptId,
        saleId: voucher.salesId,
        amount: gross,
        status: "posted",
        legacyKey: key,
      });
    }
  }

  // Sale-level over-allocation vs amount
  const allocBySale = new Map();
  for (const allocation of expectedAllocations) {
    const saleId = String(allocation.saleId);
    allocBySale.set(saleId, (allocBySale.get(saleId) || 0) + money(allocation.amount));
  }
  for (const [saleId, allocated] of allocBySale.entries()) {
    const sale = salesById.get(saleId);
    if (!sale) continue;
    const billed = money(sale.amount);
    if (allocated > billed) {
      overAllocations.push({ saleId, billed, allocated, excess: allocated - billed });
    }
    const storedPaid = money(sale.paid ?? sale.basePaid);
    if (storedPaid && Math.abs(storedPaid - Math.min(allocated + money(sale.basePaid), billed)) > 0) {
      amountMismatches.push({
        saleId,
        storedPaid,
        basePaid: money(sale.basePaid),
        projectedAllocated: allocated,
      });
    }
  }

  for (const sale of sales) {
    const billed = money(sale.amount);
    const allocated = allocBySale.get(String(sale.id)) || 0;
    const basePaid = money(sale.basePaid);
    const derivedPaid = Math.min(basePaid + allocated, billed);
    const storedPaid = money(sale.paid);
    if (storedPaid !== derivedPaid) {
      parity.push({
        saleId: sale.id,
        client: sale.client,
        billed,
        storedPaid,
        basePaid,
        projectedAllocated: allocated,
        derivedPaid,
        delta: derivedPaid - storedPaid,
      });
    }
  }

  const bankLinkedMissingVoucher = bankTransactions.filter((tx) => {
    const linked = tx?.linkedPaymentVoucherId;
    if (linked == null || linked === "") return false;
    return !vouchers.some((voucher) => String(voucher.id) === String(linked));
  });

  return {
    ok: true,
    apply: false,
    summary: {
      legacyVoucherCount: vouchers.length,
      legacyLogCount: logs.length,
      expectedReceiptCount: expectedReceipts.length,
      expectedAllocationCount: expectedAllocations.length,
      duplicateCount: duplicates.length,
      orphanAllocationCount: orphans.length,
      overAllocationCount: overAllocations.length,
      clientMismatchCount: clientMismatches.length,
      bankDuplicateCount: bankDupes.length,
      amountMismatchCount: amountMismatches.length,
      parityDeltaCount: parity.length,
      manualReviewCount: manualReview.length,
      bankLinkOrphanCount: bankLinkedMissingVoucher.length,
    },
    duplicates,
    orphans,
    overAllocations,
    clientMismatches,
    bankDupes,
    amountMismatches,
    manualReview,
    parityReport: parity.slice(0, 500),
    bankLinkOrphans: bankLinkedMissingVoucher.map((tx) => ({
      bankTransactionId: tx.id,
      linkedPaymentVoucherId: tx.linkedPaymentVoucherId,
    })),
    sampleExpectedReceipts: expectedReceipts.slice(0, 20),
    sampleExpectedAllocations: expectedAllocations.slice(0, 20),
  };
}

function main() {
  const state = getErpState();
  const report = diagnoseLegacyPaymentMigration(state.data || {});
  console.log(JSON.stringify(report, null, 2));
  console.log("\n[dry-run] apply=false — no customer data mutated");
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("receipt-migration-dry-run.mjs")) {
  main();
}

export default diagnoseLegacyPaymentMigration;
