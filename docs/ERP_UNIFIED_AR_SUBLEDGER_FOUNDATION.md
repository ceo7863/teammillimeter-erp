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

## Phase 4 Migration Readiness

Task ID: `ERP_UNIFIED_AR_SUBLEDGER_PHASE4_MIGRATION_READINESS_AUDIT_FINAL`

Phase 4 is **diagnosis only**. Nothing in it migrates data: `apply` is hard-coded `false`,
every section asserts `mutations: 0`, and the only place a plan is executed is an in-memory
clone or a temp copy of a SQLite file.

### Reporting invariants

- Customer names never leave `server/legacyReceiptMigrationAudit.mjs`. Every row carries
  `clientId` plus a salted one-way `clientRef` hash (`maskClientName`); the test suite asserts
  no seeded client name appears in a serialized report.
- `sale.paid` / `basePaid` is a **stored balance, not observed cash**. It can only ever become
  an `OPENING_BALANCE_CANDIDATE`; no plan converts it into a Receipt.
- Statement-scoped legacy cash is never auto-allocated. FIFO stays a ranked candidate list with
  explicit operator options.

### Audit surface (`server/legacyReceiptMigrationAudit.mjs`)

| Function | Returns |
|---|---|
| `auditOrganicReceipts(data, { asOfDate, archives })` | per Receipt: source / channel / gross / allocated / unallocated, cash identity, sale existence, client match, bank tx existence + `deposit == gross`, legacy vouchers and duplicate Receipts on the same bank tx. `gate: "BLOCKED"` when cash identity is broken |
| `classifySaleDiffsDetailed(data, parityReport, …)` | every parity difference refined into one of the ten Phase 4 causes, with evidence, plus `priorClassBreakdown` showing how the coarse Phase 3 buckets (`asof_projection`, …) split |
| `investigateUnattributedFifo(data, …)` | statement-scoped legacy cash: ranked sale candidates and manual choices. `autoAllocate: false`, `decision: "MANUAL_REVIEW"` |
| `classifyLegacyVouchers(data, …)` | every voucher (and every stored `sale.paid`) bucketed, with count / amount / sale / client / bank / statement / batch counts per bucket |
| `buildDeterministicMigrationPlan(data, { buckets })` | `apply: false` plan of Receipts + allocations with `planHash` |
| `simulateMigrationOnClone(dataOrSqlitePath, …)` | applies the plan to a clone and reports ledger deltas; the original is hash-checked before and after |
| `buildMigrationReadinessReport(data, …)` | all of the above plus the GO/NO-GO checklist |

### Sale difference classes

`EXPECTED_ASOF_DIFFERENCE`, `LEGACY_DATE_MISSING`, `LEGACY_UNATTRIBUTED`,
`LEGACY_FIFO_INFERENCE`, `VAT_FACE_DIFFERENCE`, `DUPLICATE_LEGACY_PAYMENT`,
`BANK_REFERENCE_CONFLICT`, `STATEMENT_REFERENCE_ONLY`, `READ_MODEL_BUG`, `LEGACY_DATA_DEFECT`.

Classification is evidence-first and first-match-wins, in the order bank conflict → duplicate →
data defect → missing date → VAT face → unattributed → FIFO inference → statement-only → as-of.
A difference that no artefact in the snapshot explains is reported as `READ_MODEL_BUG` rather
than being absorbed into a generic bucket — reporting is always preferred over a silent fix.

### Migration buckets

| Bucket | Meaning |
|---|---|
| `AUTO_SAFE_BANK` | the deposit decides the cash: one Receipt per bank transaction, `grossAmount = tx.deposit` |
| `AUTO_SAFE_MANUAL` | one voucher with a resolvable client, an existing sale, a date and no VAT ambiguity |
| `AUTO_SAFE_BATCH` | several vouchers that share a `paymentInputLogs` save batch — merged only on that evidence, never on resemblance |
| `OPENING_BALANCE_CANDIDATE` | stored `sale.paid` with no voucher, or an undated voucher with no bank/statement trail |
| `MANUAL_REVIEW` | ambiguous client, statement-scoped FIFO, missing date, future date, VAT-embedded amount, stored-paid overlap |
| `BLOCKED_CONFLICT` | missing sale, sale/client mismatch, duplicate voucher, allocation over sale or over deposit, a bank tx that already has a Receipt |

### Plan determinism

Receipt ids (`mig-rcpt-<24 hex>`), operation ids (`legacy-migration:<32 hex>`), receipt-number
candidates (`MIG-YYYYMMDD-NNNN`) and row ordering all derive from content hashes, never from a
clock or a counter, so one snapshot always yields one `planHash`. Each planned row carries
`payloadHash`, `provenanceHash`, `sourceVoucherIds` and `sourcePaymentInputLogIds`.

Allocation rules: an excess over the deposit or over a sale's capacity blocks the group
(nothing is trimmed to fit); a shortfall against the deposit survives as prepaid.

### Diagnostics

```
DATABASE_PATH=… npx tsx scripts/phase4-migration-readiness-audit.mjs [--json] [--as-of=YYYY-MM-DD] [--limit=N]
DATABASE_PATH=… npx tsx scripts/legacy-receipt-migration-plan.mjs [--json]
npx tsx scripts/test-phase4-migration-readiness.mjs
```

`GET /api/ar/migration-readiness-dry-run` (admin) wraps the same report and refuses to answer
unless `mutations === 0` and `apply === false`.

`scripts/legacy-receipt-migration-plan.mjs` is Phase 5 scaffolding. Passing `--apply` exits with
`Phase 4 forbids apply; use future Phase 5 with explicit approval`. A future apply additionally
requires `--approval-token`, `--expect-snapshot`, `--expect-plan-hash` and `--expect-counts`;
the script header documents the canary, backup and rollback procedure (rollback is a reversal
Receipt, never a delete — `deleteReceiptForbidden()` stays in force).

### GO / NO-GO checklist

| # | Check | Blocking level |
|---|---|---|
| 1 | Organic Receipt audit passes (cash identity, sale/client match, bank deposit match, no shared bank tx) | NO-GO |
| 2 | No `READ_MODEL_BUG` among the classified differences | HOLD |
| 3 | Every unattributed / FIFO case has an operator decision | HOLD |
| 4 | `BLOCKED_CONFLICT` bucket is empty | NO-GO |
| 5 | `MANUAL_REVIEW` bucket is cleared | HOLD |
| 6 | The same snapshot reproduces the same `planHash` | NO-GO |
| 7 | No planned Receipt is `BLOCKED` | NO-GO |
| 8 | Clone simulation: cash identity holds, no new bank conflict, `appliedDelta == 0` | NO-GO |
| 9 | The audit itself reports `mutations = 0` and `apply = false` | NO-GO |
| 10 | Read-only production dry-run has been run and reviewed by the data owner | NO-GO |

Any NO-GO blocks the migration outright; any HOLD means a human decision is still outstanding.
Check 10 must be satisfied against production data by an operator — the audit is safe to run
there, but it must be run.

## Tests

- `npx tsx scripts/test-receipt-ledger-asof.mjs`
- `npx tsx scripts/test-receipt-ledger-hardening.mjs`
- `npx tsx scripts/test-receipt-ledger-foundation.mjs`
- `npx tsx scripts/test-bank-receipt-phase2.mjs`
- `npx tsx scripts/test-unified-ar-phase3.mjs`
- `npx tsx scripts/test-phase4-migration-readiness.mjs`

No automatic backfill (production Receipt count expected 0).
