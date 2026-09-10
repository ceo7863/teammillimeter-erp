# ERP Unified AR Subledger — Foundation (Phase 1) + Accounting Hardening

Task IDs:
- `ERP_UNIFIED_AR_SUBLEDGER_FOUNDATION_FINAL`
- `ERP_UNIFIED_AR_SUBLEDGER_PHASE1_ACCOUNTING_HARDENING`

## Accounting formula (after hardening)

```
openingAr = openingBilled - openingAppliedAllocations
closingAr = openingAr + periodBilled + periodDebitAdjustments
            - periodAppliedAllocations - periodCreditAdjustments
```

- `periodReceiptsGross` = cash inflow (separate display)
- `periodAppliedAllocations` = effective posted allocations only
- `unallocatedPrepaid` does **not** reduce AR
- Identity: `gross = allocated + unallocated` (posted non-reversal receipts)

## Reversal policy

Append-only single model:
1. Mark original receipt + its posted allocations as `reversed` (excluded from effective AR)
2. Append reversal receipt with negative `grossAmount` for cash-period display
3. Reversal allocation rows are audit-only (`status=reversed`) — never posted negatives

AR restores exactly once.

## Idempotency

Canonical payload hash stored on receipt. Same operationId + same payload → replay. Same operationId + different accounting fields → `409 IDEMPOTENCY_CONFLICT`. Applies to create, reverse, and reallocate.

## Generic save isolation

`saveErpState` without `{ allowReceiptMutation: true }` always preserves existing `receipts` / `receiptAllocations`. Domain merge and `mergeErpPaymentLinkState` also preserve them. Writes only via `/api/receipts*`.

## Client identity

`clientId` is authoritative. `sale.clientId` preferred. Legacy name mapping only when sale has no clientId and the name uniquely maps to one client.

## Tests

- `npx tsx scripts/test-receipt-ledger-hardening.mjs`
- `npx tsx scripts/test-receipt-ledger-foundation.mjs`
