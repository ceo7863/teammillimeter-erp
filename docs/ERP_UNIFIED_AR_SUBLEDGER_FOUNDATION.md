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

## Tests

- `npx tsx scripts/test-receipt-ledger-asof.mjs`
- `npx tsx scripts/test-receipt-ledger-hardening.mjs`
- `npx tsx scripts/test-receipt-ledger-foundation.mjs`

No automatic backfill (production Receipt count expected 0).
