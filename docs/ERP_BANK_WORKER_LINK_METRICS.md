# Bank ↔ worker link metrics

Read-only identity metrics for legacy bank-to-worker monthly payment links and related AP cutover readiness.

## Historical ~58

Production historically reported **~58** bank rows linked to worker monthly payment vouchers.

That count is **`legacyBankWorkerLinkRowCount`**: number of `bankTransactions` rows where `linkedWorkerMonthlyPaymentVoucherId` is set.

It is **not** a count of fake fields such as `workerLink`, `linkedWorkerId`, or `workerPaymentLink`.

## PR #23 probe bug

`scripts/probe-finance-identity.mjs` previously filtered bank rows with:

```js
tx?.workerLink || tx?.linkedWorkerId || tx?.workerPaymentLink
```

Those properties are not the production link authority, so the probe under-counted (often **0**) while live data still held ~58 `linkedWorkerMonthlyPaymentVoucherId` links.

The probe now imports `measureFinanceIdentityMetrics` from `server/financeIdentityMetrics.mjs` and emits the eight bank metrics below. For continuity it also aliases:

- `bankWorkerLinkCount` → `legacyBankWorkerLinkRowCount`

## Eight bank metrics

| Metric | Meaning |
| --- | --- |
| `legacyBankWorkerLinkRowCount` | Bank rows with `linkedWorkerMonthlyPaymentVoucherId` (historical ~58) |
| `legacyBankWorkerLinkedTransactionUniqueCount` | Unique bank transaction ids among those linked rows |
| `legacyPayoutReferencingBankUniqueCount` | Unique `bankTransactionId` values from `workerMonthlyActualVouchers.entries` where `kind === "bank"` |
| `duplicateLegacyBankWorkerLinkCount` | Linked bank rows that also have a non-reversed disbursement with the same `bankTransactionId` |
| `orphanLegacyBankWorkerLinkCount` | Linked voucher id missing from `workerMonthlyActualVouchers` |
| `invalidDirectionWorkerLinkCount` | Linked rows with `deposit > 0` and `withdrawal` not `> 0` (wrong direction for worker payout) |
| `canonicalDisbursementBankLinkCount` | Active (non-reversed) disbursements that carry `bankTransactionId` |
| `cashTransferBankLinkCount` | Bank rows classified as `BANK_TO_CASH_TRANSFER` by `classifyBankToCashTransfer` |

## Identity fields (same probe)

Also emitted: `paymentVoucherCount`, `receiptCount`, `receiptAllocationCount`, `monthlyActualCount`, `payoutHistoryCount`, `openingBalanceCount`, `disbursementCount`, `disbursementAllocationCount`, `saleCount`, `clientCount`, `statementLogCount`, `cutoverActivated`, `disbursementWriteEnabled`, `legacyDatasetHash` (via `computeLegacyApDatasetHash`).

## Local probe

```bash
# PowerShell
$env:DATABASE_PATH="./data/erp.sqlite"; node --import tsx scripts/probe-finance-identity.mjs
```

Requires a readable SQLite DB at `DATABASE_PATH`. The script is read-only and does not mutate customer finance ledgers.
