# ERP Unified AR Subledger — Foundation + Hardening + As-Of Integrity

Task IDs:
- `ERP_UNIFIED_AR_SUBLEDGER_FOUNDATION_FINAL`
- `ERP_UNIFIED_AR_SUBLEDGER_PHASE1_ACCOUNTING_HARDENING`
- `ERP_UNIFIED_AR_SUBLEDGER_ASOF_INTEGRITY_FINAL`

## As-of policy

Receipt / allocation events are append-only. Historical ledgers use **effective dates**, not current `status` alone.

- Allocation is effective on `asOf` when `effectiveFrom <= asOf < reversedEffectiveDate` (if set).
- `status=reversed` keeps past effectiveness for `asOf` before the reverse/reallocate date.
- Reversal audit rows (`auditOnly` / reversal-document allocations) never reduce AR.
- `createdAt` = system clock; `effectiveFrom` / `reversedEffectiveDate` / receiptDate = Asia/Seoul `YYYY-MM-DD` accounting dates.

## Ledger formula (as-of)

```
openingAsOf = startDate - 1 day
openingAr   = max(billed(openingAsOf) - appliedEffective(openingAsOf), 0)
closingAr   = max(billed(endDate) - appliedEffective(endDate), 0)
periodAppliedAllocations = appliedEffective(endDate) - appliedEffective(openingAsOf)
periodReceiptsGross = cash events by receiptDate (original + reversal documents)
unallocatedPrepaid = receipt gross - appliedEffective(endDate) for non-reversed-as-of receipts
```

Later reverse/reallocate must not change a prior period snapshot.

## Effective-date policies

| Event | Effective date |
|---|---|
| Cash receipt | `receiptDate` |
| Initial allocation | `allocationEffectiveDate` (default `receiptDate`) stored as `effectiveFrom` |
| Reallocation | `effectiveDate` required (API default: today Seoul); closes open rows with `reversedEffectiveDate` |
| Reverse | `reversalEffectiveDate` / reverse `receiptDate` (default today Seoul) |

## Out-of-order policy

- Event date before original `receiptDate` → `400 EVENT_BEFORE_RECEIPT_DATE`
- Event date earlier than an existing later accounting event (receipt / allocation effective / reallocation / reverse) → `409 OUT_OF_ORDER_ACCOUNTING_EVENT`
- No automatic rewrite of history; reject insert instead

## Idempotency

Canonical payload hash includes:
- reverse: `receiptId` + `reversalEffectiveDate`
- reallocate: `receiptId` + `effectiveDate` + sorted allocations
- create: client, date, gross, channel, source, sorted allocations (+ effectiveFrom)

Same `operationId` + same hash → replay. Same `operationId` + different hash → `409 IDEMPOTENCY_CONFLICT`.

## Generic save isolation

`saveErpState` without `{ allowReceiptMutation: true }` preserves `receipts` / `receiptAllocations`.

## Projection

Current UI projection shows allocations effective as-of today only. Legacy `paymentVouchers` are never written from Receipts; merge is read-side only.

## Phase 2 Bank Receipts

Bank deposits post through the atomic bank Receipt API instead of client-side `paymentVouchers`.

### Atomic API

- `POST /bank-transactions/:id/receipt` — create Receipt + allocations + bank link fields in one transaction
- `POST /bank-transactions/:id/receipt/reverse` — reverse Receipt and clear bank link fields
- Server owns `grossAmount` (= `tx.deposit`); client never invents voucher rows for new deposits
- Idempotent via `operationId` (auto: deterministic `bank-receipt:auto:{txId}`; manual/bulk: `makeReceiptOperationId(...)`)

### Cutover

- `AUTO_DEPOSIT_RECEIPT_CUTOVER_AT` (or ensured cutover timestamp) gates server auto-link eligibility
- Pre-cutover deposits keep legacy voucher links; post-cutover new links are Receipt-only
- `linkedReceiptId` / PDF `linkedReceiptId` are the authoritative Phase 2 link fields
- `linkedPaymentVoucherId` remains for legacy unlink/read only — no new deposit writes set it

### Client cutover (BankTransactionsPage)

| Path | Behavior |
|---|---|
| IBK import auto-link | `buildHighConfidenceSentStatementAutoLinks` for amount/FIFO drafts → `createBankTransactionReceiptApi` (`bank-receipt:auto:{txId}`, `source: bank_auto`) → PDF `linkedReceiptId` |
| High-confidence bulk confirm | Same deterministic auto operation id, so re-running the bulk button cannot double-post |
| Manual sent-statement / receivable link | `createBankTransactionReceiptApi` with `bank-receipt:manual:{txId}:{uuid}` / `source: bank_manual`; the modal stays open on failure |
| Receipt unlink | `reverseBankTransactionReceiptApi` — never deletes vouchers |
| Legacy unlink | Still removes `paymentVouchers` + clears match fields, for legacy-linked rows only |

Deposit link occupancy is decided only by `src/utils/bankDepositLink.ts`; a deposit with an
open (non-reversed) Receipt is linked, and `linkedPaymentVoucherId` is never set for a Receipt link.
`src/utils/bankReceiptDisplay.ts` renders receipt no / client / gross / allocated / unallocated /
allocation count / auto-manual / status (전기, 일부배분, 미배분, 취소) in the deposit link modal and list badges.

Immediate bank saves after auto-link pass receipt link fields from the API `bankTransaction` payload and do **not** pass new `paymentVouchers`.

### Diagnostics / tests

- `npx tsx scripts/test-bank-receipt-phase2.mjs`
- `npx tsx scripts/bank-receipt-phase2-dry-run.mjs` (read-only)

## Phase 3 Statements & Reports

Task ID: `ERP_UNIFIED_AR_SUBLEDGER_PHASE3_STATEMENTS_REPORTS_FINAL`

Every screen now reads billed / applied / outstanding from one place, and the legacy
`paymentVouchers` array is frozen for new business.

### Unified AR read model

The accounting rules live in exactly one implementation: `src/utils/unifiedArReadModel.ts`
(pure, no imports). `server/unifiedArReadModel.mjs` imports it through `tsx`, so the API and the
browser bundle cannot drift apart.

| Function | Returns |
|---|---|
| `buildSaleArBalances(data, { asOfDate })` | per sale: `billedAmount`, `receiptAllocatedAmount`, `legacyAppliedAmount`, `totalAppliedAmount`, `outstandingAmount`, `receiptIds`, `legacyVoucherIds`, `paymentStatus`, `sourceLedger` |
| `buildClientArSummary(data, { clientId, startDate, endDate })` | `openingAr`, `periodSales`, `periodReceiptsGross`, `periodAppliedAllocations`, `periodLegacyApplied`, `periodAdjustments`, `closingAr`, `unallocatedPrepaid`, `overdueAr`, `legacyCompatibilityAmount`, `reconciliationStatus`, `identity`, `cashIdentity` |
| `buildStatementPaymentStatus(archive, data)` | `unpaid` / `partial` / `paid` / `overpaid` / `cancelled` derived from saleIds + allocations |
| `dedupeBankReferences(data)` | receipt/legacy collisions on one `bankTransactionId` |
| `buildUnifiedClientLedger(data, …)` | summary + per-sale ledger rows (server only) |
| `buildArParityReport(data, …)` | legacy view vs unified, `mutations: 0` (server only) |

Read-only routes: `GET /api/ar/sales-balances?asOf=`, `GET /api/ar/clients/:id/ledger?start=&end=`,
`GET /api/ar/statements/:archiveId/payment-status`, `GET /api/ar/bank-references` (admin),
`GET /api/ar/parity-dry-run` (admin).

### Counting rules

- Receipt allocations count only when effective as-of (`isAllocationEffectiveAsOf`); the shared
  helper is asserted to match `server/receipts.mjs` in the Phase 3 suite.
- A legacy voucher is ignored when its `bankTransactionId` already has an effective Receipt, so a
  deposit is never counted in both ledgers. The collision is still reported as
  `BANK_REFERENCE_CONFLICT` / `reconciliationStatus: "error"` and is never auto-fixed.
- Legacy vouchers hold VAT-inclusive cash while `sale.amount` is VAT-exclusive, so a voucher is
  capped at the sale's remaining VAT-exclusive capacity — the same limit the Receipt API enforces
  (`ALLOCATION_EXCEEDS_SALE`). The uncapped remainder becomes a client credit
  (`LEGACY_VOUCHER_EXCESS_TO_PREPAID`), never a phantom overpayment.
- Statement-level legacy vouchers (no `salesId`) keep the documented legacy attribution: FIFO by
  sale date inside the voucher's statement scope, reported as `LEGACY_VOUCHER_STATEMENT_SCOPED`.
- `SALE_OVERPAID` can therefore only mean receipt over-allocation, and
  `LEGACY_RECEIPT_DOUBLE_COVERAGE` flags a sale covered by both ledgers.
- `overdueAr` is a display-only aging metric: outstanding of sales dated on or before
  `endDate - UNIFIED_AR_DUE_DAYS` (30). `periodAdjustments` is not implemented and is always 0.
- The identity check runs on unclamped AR (`openingArRaw + periodSales - applied + adjustments ==
  closingArRaw`); the displayed `closingAr` is clamped at 0.

### Cross-screen authority

`src/App.tsx` derives `appliedSales` from `buildSaleArBalances` + `applyUnifiedArBalancesToSales`
instead of `applyPaymentVouchers`. `effectivePaymentVouchers` survives only as a display
projection for voucher-shaped link and history lists. The same `saleId` therefore shows the same
billed / applied / outstanding on the calendar, sales, receivables, statements, bank and reports.

### Statement payment status

`deriveSentStatementPaymentStatus` reads sale coverage from the unified subledger whenever receipt
state is available (voucher-only summing remains the fallback for callers without it).
`pdfArchive.paymentStatus` is a display cache only — `statementPaymentStatusToArchiveCache` maps
the derived status onto it, and `storedStatusMatchesDerived` reports drift.

A statement is `overpaid` when every statement sale is settled **and** a statement-linked Receipt
still holds unallocated cash, not when the applied sum exceeds billed (allocations can never
exceed billed).

Bulk allocation requires an explicit, fully resolvable `statementSalesIds`
(`resolveStatementBulkAllocateGate`). Missing or unknown ids set `manualReview`, clear
`bulkAllocateAllowed`, and the bank bulk-confirm button skips the row with a reason instead of
guessing a period.

### Statement regeneration policy

- Regenerating a PDF reuses the same archive id, so Receipts and Allocations stay attached by
  `saleId`; no payment is re-created and none is dropped.
- `statement_sales_snapshot` stores `[{ saleId, billedAmount }]` at creation and is preserved
  unless `statementSalesIds` itself changes, so a later sale-amount edit cannot rewrite history.
- Receipt amounts are never auto-adjusted when a sale amount changes; the difference reappears as
  AR or as prepaid.
- `dedupeStatementSaleIdsAcrossVersions` reports a `saleId` appearing on several archive versions;
  client totals still count it once because they are computed per sale, not per statement.

### Legacy write freeze

| Path | Behavior |
|---|---|
| Generic `saveErpState` / `PUT /api/erp` | New voucher ids are stripped and logged (`[legacyWriteFreeze]`); existing rows are preserved verbatim; blocked ids are returned as `blockedPaymentVoucherIds` |
| Domain saves (`saveErpDomain` / `saveErpDomains`) | Same freeze, with no escape hatch |
| `saveErpState(..., { allowPaymentVoucherMutation: true })` | Only for legacy unlink / repair scripts and test seeds |
| Empty incoming `paymentVouchers` | Existing rows are kept, so a partial payload can never wipe the ledger |

The freeze strips and warns rather than throwing, so a legacy rename or unlink travelling through a
generic save keeps working. Blocked ids ride along on a non-enumerable
`Symbol.for("erp.blockedPaymentVoucherIds")` property and never reach the persisted payload.
Repair scripts are untouched.

No client path creates a new voucher for a deposit: the calendar, receivables, statement and bank
flows all post through the Receipt API (`source` ∈ `bank_auto`, `bank_manual`, `calendar`,
`receivables`, `sent_statement`). The remaining `setPaymentVouchers` calls only rename or remove
existing rows.

### Parity dry-run

`npx tsx scripts/ar-parity-dry-run.mjs [--as-of=YYYY-MM-DD] [--json] [--limit=N]` (read-only,
asserts `mutations: 0`) compares the legacy `applyPaymentVouchers` view against the unified model
by sale / client / month / statement / bank reference, classifying each difference as
`bank_dedupe`, `legacy_unattributed_fifo`, `asof_projection`, `overpay_clamp` or `unknown`.

### Tests

- `npx tsx scripts/test-unified-ar-phase3.mjs` — required cases 1-20 and 24
- `npx tsx scripts/test-bank-receipt-reverse-real-allocation.mjs` — gate A (reverse restores AR
  exactly once from a real 400,000 allocation; a 0-amount allocation is forbidden)
- `npx tsx scripts/test-bank-link-panel-browser.mjs` — gate B (wheel capture against a DOM shim +
  hard-reload persistence re-read from a separate node process)
- `npx tsx scripts/ar-parity-dry-run.mjs` — cross-screen parity (case 23)

Cases 21/22 are covered by the gate B script rather than a live Chromium run; that fallback is
documented in the script header.

## Tests

- `npx tsx scripts/test-receipt-ledger-asof.mjs`
- `npx tsx scripts/test-receipt-ledger-hardening.mjs`
- `npx tsx scripts/test-receipt-ledger-foundation.mjs`
- `npx tsx scripts/test-bank-receipt-phase2.mjs`
- `npx tsx scripts/test-unified-ar-phase3.mjs`

No automatic backfill (production Receipt count expected 0).
