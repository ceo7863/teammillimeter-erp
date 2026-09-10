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

## Tests

- `npx tsx scripts/test-receipt-ledger-asof.mjs`
- `npx tsx scripts/test-receipt-ledger-hardening.mjs`
- `npx tsx scripts/test-receipt-ledger-foundation.mjs`
- `npx tsx scripts/test-bank-receipt-phase2.mjs`

No automatic backfill (production Receipt count expected 0).
