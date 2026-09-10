# ERP Unified AR Subledger — Foundation (Phase 1)

Task ID: `ERP_UNIFIED_AR_SUBLEDGER_FOUNDATION_FINAL`

## Legacy write paths (pre-Phase-1)

| Path | Trigger | Mutates | Server save | Await before success UI |
|------|---------|---------|-------------|-------------------------|
| Calendar `confirmClientFilterPaymentProcess` | 거래처 캘린더 입금 | `paymentVouchers`, `paymentInputLogs` | Debounced autosave (~10s) | No (Phase 1: fixed → Receipt API await) |
| PaymentReceivables `savePayments` | 현금/개인계좌 입금 | `paymentVouchers`, `paymentInputLogs` | Debounced autosave | No (Phase 1: fixed → Receipt API await) |
| Bank `confirmDepositMatch*` | 통장 수동연결 | vouchers + bank links | Debounced | No (Phase 2) |
| Bank sent-statement match | 보낸내역서 연결 | vouchers + bank + PDF meta | Debounced | No (Phase 3) |
| Server `applySentStatementAutoLinksToErpData` | 자동입금 | vouchers + logs + bank | `saveErpState` | N/A (Phase 2) |

### Screen formulas (legacy inconsistency)

| Screen | Billed | Paid | Unpaid |
|--------|--------|------|--------|
| 입금/미수금 | `sale.amount` | `applyPaymentVouchers` → display `paid` | `amount - paid` |
| 캘린더 | `getSaleTotalBill` / unpaid | may mask via bank link | `getUnpaid` unless linked |
| 대시보드 | worker bill | `voucher.amount` (supply) | — |
| 보낸내역서 FIFO | statement amount | `finalAmount ?? amount` | remaining after FIFO |

Risks: `sales.paid`/`basePaid` vs vouchers; supply vs `finalAmount`; stale `paymentVouchers` array replace drops unreferenced rows; calendar success before server flush.

## Phase 1 architecture

- **Receipt** + **ReceiptAllocation** live in dedicated `receipts` domain (SQLite `erp_domain_state`), not inside `sales.paymentVouchers`.
- Writes go only through `/api/receipts*` services with `operationId` idempotency and atomic domain save.
- Client autosave **does not** patch the `receipts` domain (excluded from `ERP_SAVE_DOMAIN_NAMES`), so stale array saves cannot delete receipts.
- Compat projection maps posted receipts → voucher-shaped rows for existing screens (`effectivePaymentVouchers` / client `projectReceiptsToLegacyPaymentVouchers`). Projected rows are never written back to `paymentVouchers`.
- `sales.paid` is **not** mutated by new receipts; unpaid is derived via `applyPaymentVouchers` on effective vouchers.
- Payment-time VAT invention is disabled for calendar + receivables Phase 1 paths. `sale.amount` is treated as billed amount without transform.

## APIs

- `POST /api/receipts` — create+post (idempotent)
- `GET /api/receipts`, `GET /api/receipts/:id`
- `POST /api/receipts/:id/allocations`
- `POST /api/receipts/:id/reverse`
- `DELETE /api/receipts/:id` — always 405
- `POST /api/receipts/fifo-preview`
- `GET /api/ar-subledger/:clientId`
- `GET /api/receipts-migration/dry-run` (admin, apply=false)

## Phase 1 converted paths

1. Calendar deposit / cancel → Receipt create / reverse (await server)
2. Receivables cash / personal_account → Receipt create (await server)

## Remaining (Phase 2+)

- Bank manual + auto deposit
- Sent-statement linking
- Full report cutover
- Legacy write removal + approved migration apply
