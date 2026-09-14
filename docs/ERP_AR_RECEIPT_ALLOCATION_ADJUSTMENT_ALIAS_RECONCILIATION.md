# ERP AR Receipt / Allocation / Adjustment / Alias Reconciliation

Task: `ERP_AR_RECEIPT_ALLOCATION_ADJUSTMENT_ALIAS_RECONCILIATION_FINAL`

## Product rules (CTO)

1. Client confirmation is enough to create a Receipt; it is **not** enough to choose allocation targets.
2. Default register target = `UNAPPLIED` unless STATEMENT / PERIOD / SELECTED_SALES / explicit GLOBAL_FIFO.
3. GLOBAL_FIFO is never the silent default.
4. Real cash Receipts and ARAdjustments are separate domains.
5. Do not backfill fake cash receipts for historical AR gaps.
6. Every post-cutover bank deposit must have a classification status (coverage identity).

## Receipt-centric list

- Hub tab **입금전표** lists one row per Receipt (`src/utils/receiptListReadModel.ts`).
- Default date basis: `receiptDate` (current month).
- Optional: saleDate / createdAt.
- Fully allocated and cash receipts remain visible.
- Detail: `ReceiptDetailDrawer`.

## Allocation target planner

- `server/allocationTarget.mjs` + `registerCanonicalReceipt` (`server/receipts.mjs`).
- Modes: UNAPPLIED | STATEMENT | PERIOD | SELECTED_SALES | GLOBAL_FIFO.
- Spill protection: money remaining after scoped FIFO stays unallocated.

## ARAdjustment

- `server/arAdjustments.mjs` — append-only; not cashflow; not sales amount edits.
- APIs under `/api/ar-adjustments*`.
- UI: `ArAdjustmentModal`.

## Depositor aliases

- Canonical registry `depositorAliases` (`server/depositorAliases.mjs`).
- Explicit opt-in only; exact normalize; conflict → no auto Receipt.
- UI: `DepositorAliasManager`.

## Bank classification coverage

- `server/bankDepositClassification.mjs` + `GET /api/bank-deposits/classification-coverage`.
- Hub strip: `BankDepositCoveragePanel`.

## B&B preview (read-only)

```bash
DATABASE_PATH=./data/erp.sqlite node --import tsx scripts/bnb-august-reallocation-preview.mjs
```

Never applies reallocation. Production apply requires separate CEO approval.

## Tests

- `node scripts/test-ar-receipt-alloc-recon.mjs`
- `node --import tsx scripts/test-ar-receipt-alloc-recon-browser.mjs`
