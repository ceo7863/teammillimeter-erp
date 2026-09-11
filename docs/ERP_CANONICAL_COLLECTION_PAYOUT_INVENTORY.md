# Canonical Collection & Payout — UX / Write-Path Inventory

Task: `ERP_CANONICAL_COLLECTION_PAYOUT_UX_PARTIAL_SETTLEMENT_FINAL`  
Base: `origin/main` @ `9fce5b543b3fb6c5ea9c4984dd2d81b9f75effda`

## Goal

One official write path per business action. Other buttons open the same modal/API. Ledgers are saleId (AR) and workItemId (AP). Statements/settlement sheets are documents, not ledgers.

## A. Collection (AR) — mutation matrix

| Screen / button | Component | API | Mutates | Separate write? | Duplicate of | Disposition |
|---|---|---|---|---|---|---|
| 매출등록 · 저장 | `SalesRegistrationPage` | `PATCH /api/erp/domains` sales | sales | no | calendar sale | **keep** primary |
| 캘린더 · 매출전표 등록 | `CalendarPage` | same | sales | no | 매출등록 | **shortcut** |
| CalWalk 스케줄→매출 | `CalendarScScheduleImportModal` | same | sales + scScheduleId | no | 매출등록 | **keep** import |
| 매출관리 · 수정/삭제 | `SalesManagementPage` | domain save | sales | no | 전표검색 | **keep** |
| 매출전표검색 · 수정 | `SalesVoucherSearchPage` | domain save | sales | no | 매출관리 | **merge** editor |
| 내역서 생성/PDF | `StatementsPage` | pdf-archives + statement logs | archive meta, logs | archive yes | calendar draft | **keep** doc path |
| 입금/미수금 · 선택 입금 저장 | `PaymentReceivablesPage` | `POST /api/receipts` | receipts/alloc | **yes** | calendar 입금 | **canonical UI → register API** |
| 캘린더 · 입금완료 | `CalendarPage` | `POST /api/receipts` | receipts/alloc | **yes** | receivables | **shortcut → same register** |
| 캘린더 · 입금취소 | `CalendarPage` | `POST /api/receipts/:id/reverse` | reverse | **yes** | bank unlink | **keep** |
| 통장 · ERP 입금 연결 | `BankErpDepositLinkModal` | `POST /api/bank-transactions/:id/receipt` | receipts + bank link | **yes** | auto bank | **keep** bank path |
| 통장 · 고신뢰/자동 | Bank sync / IBK | same bank receipt API | receipts | **yes** | manual bank | **keep** |
| 입금내역 · 삭제(레거시) | receivables | setPaymentVouchers | frozen | blocked | — | **deprecate** |
| Excel/백업 voucher overwrite | App import | generic save | frozen | blocked | — | **deprecate** |

### Canonical receipt paths (after this change)

1. **Non-bank cash/personal/other:** `POST /api/receipts/register` (sent-statement scoped FIFO + prepaid).
2. **Bank deposit:** `POST /api/bank-transactions/:id/receipt` (unchanged).
3. **Reverse:** receipt reverse / bank receipt reverse.
4. **Reallocate / prepaid apply:** `POST /api/receipts/:id/allocations` (+ auto on statement send).

## B. Payout (AP) — mutation matrix (before)

| Screen / button | Component | API | Mutates | Separate write? | Disposition |
|---|---|---|---|---|---|
| 시공자 지급 · 월 실지급 | `WorkerMonthlyActualPaymentTab` | ERP workers+bank | monthly vouchers, bank links | **yes** | migrate → Disbursement |
| 통장 · ERP 전표 연결(시공자) | `BankErpWorkerLinkModal` | same util | monthly vouchers | duplicate UX | **merge** |
| 지급내역 · 현금 전표 | `WorkerPayoutHistoryTab` | workerPayoutVouchers | cash slips | parallel | **deprecate writer** |
| CalWalk 식대/경비 | sale import | sales.workers meal/expense | payable components | keep as obligation source | **keep** |
| 급여 관리 | OfficePayroll | officePayroll* | HR only | **keep separate** |

### Canonical disbursement paths (after this change)

1. **`POST /api/disbursements/register`** — create Disbursement + FIFO allocations to ContractorPayable work items.
2. **`POST /api/disbursements/:id/reverse`** — append-only reverse.
3. Bank withdrawal link and cash payout UIs must call the same register API (legacy monthly voucher writers remain read-compatible; new money uses Disbursement).

## C. Duplicate write paths

**Before**

```
Cash AR:  Receivables createReceiptApi  ║  Calendar createReceiptApi  (two UIs, same API; channel policy drift)
Bank AR:  manual / statement / bulk / IBK / server auto  → bank receipt API (OK, shared)
AP:       monthlyActual  ║  bank worker link  ║  payoutHistory cash  (three writers)
```

**After (target)**

```
Cash AR:  ReceiptRegisterModal / Calendar shortcut → POST /api/receipts/register
Bank AR:  unchanged bank receipt API
AP:       DisbursementRegisterModal / Calendar shortcut / Bank link → POST /api/disbursements/register
Legacy monthly vouchers: read + gradual dual-display only (no new primary writes in new UI)
```

## D. UX IA target (compatibility redirects keep old URLs)

1. 매출관리 — list + register + CalWalk import + “내역서 만들기”
2. 청구/내역서 — sent docs, included saleIds, successor relation, payment status from allocations
3. 수금관리 — AR aging, receipts, unallocated prepaid, unmatched bank, `+ 입금 등록`
4. 지급관리 — AP aging, disbursements, unmatched withdrawals, `+ 지급 등록`
5. 캘린더 — status view + shortcuts only (separate collection vs payout badges)

## E. Cutover constraints (unchanged)

- Legacy `paymentVouchers` (1286) READ_ONLY_FOREVER
- No bulk legacy→Receipt migration / no production backfill without approval
- Receipts isolated unless `allowReceiptMutation`
- Disbursements isolated unless `allowDisbursementMutation`
