# Phase 2 Canonical Finance UX — Truth & Cutover Readiness

Task: `ERP_CANONICAL_FINANCE_UX_PHASE2_TRUTH_AND_CUTOVER_READINESS_FINAL`
Base: `294a72947a7ec19ee678b8c57050f55f8af751ec` (PR #19 foundation)

## Foundation audit

- `/api/receipts/register` keeps Receipt/Allocation invariants (operationId, FIFO, prepaid).
- `/api/disbursements/register` exists but production UI write is gated by `isDisbursementWriteEnabled()` (default OFF).
- Legacy AP writers remain active (monthly actual, payout history, bank worker link) until AP cutover approval.
- `payablesDerived` counts sale worker lines via `listContractorPayablesFromSales` (`sc:` / `sale:` workItemId).
- Prior `balanceMismatchCount=0` without AP comparison was **NOT_MEASURED**; use `scripts/ap-parity-dry-run.mjs`.

## Bank auto-deposit root causes fixed

1. `linkedPdfArchiveId` no longer treated as financial already-linked authority.
2. Archive occupancy no longer blocks 2nd/3rd partial deposits while remaining > 0.
3. Persistent unresolved queue (`bankSyncMeta.unresolvedDepositQueue`) — age alone does not drop rows.
4. Client resolve (Stage A) separated from allocation (Stage B); amount mismatch still posts Receipt.
5. Failure reason codes preserved (`CLIENT_NOT_FOUND`, `CLIENT_AMBIGUOUS`, etc.).
6. `GET /api/bank-deposits/unresolved` exposes the queue.

## UX

- Official `ReceiptRegisterModal` wired from 수금관리 + 캘린더.
- Official `DisbursementRegisterModal` wired from 지급관리 (writes disabled until flag/cutover).
- Menu labels: receivables → 수금관리, workerPayments → 지급관리; keys preserved.
- Calendar collection badges via `CalendarFinanceBadges` (independent of payout).

## AP cutover model (NOT applied)

- Legacy payout records READ_ONLY_FOREVER after approval.
- Virtual opening payable / cutover meta require explicit CEO approval.
- Until EXACT_PARITY (or approved DETERMINISTIC_LEGACY_FIFO plan), keep legacy writers; keep disbursement write flag OFF.

## Tests

- `node --import tsx scripts/test-canonical-finance-phase2.mjs`
- `node --import tsx scripts/test-canonical-finance-browser.mjs` (Playwright Chromium)
- `npx tsx scripts/test-bank-sent-statement-auto-link-safety.ts`
- `node --import tsx scripts/test-canonical-collection-payout.mjs`
- Prod read-only: `node --import tsx scripts/ap-parity-dry-run.mjs`
- Prod read-only: `node --import tsx scripts/canonical-collection-payout-dry-run.mjs`
