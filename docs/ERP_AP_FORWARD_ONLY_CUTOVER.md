# AP Forward-Only Cutover & Canonical Payout UX

Task: `ERP_AP_FORWARD_ONLY_CUTOVER_AND_CANONICAL_PAYOUT_UX_FINAL`  
Base main: `c66807ab1820e9cf4b0743fd0570da23cfbc24c0` (PR #20)

## CTO policy (binding)

- Historical EXPENSE_SOURCE_MISMATCH / UNATTRIBUTED_PAYMENT are **not** cutover blockers and must not be repaired.
- Do **not** migrate legacy payouts, payablesDerived, or opening balances from history.
- Legacy AP datasets stay **READ_ONLY_FOREVER** after activation.
- Until CEO approval: `apLedgerCutoverAt` unset, opening-balance apply blocked, `disbursementWriteEnabled` OFF.
- Final operational label for this release: **READY_FOR_AP_CUTOVER_APPROVAL** (never CUTOVER_COMPLETE).

## Cutover boundary

| Field | Meaning |
|---|---|
| `apLedgerCutoverWorkDate` | Asia/Seoul `YYYY-MM-DD`. Inclusive: workDate >= cutover day enters new Payable. |
| `apLedgerCutoverAt` | Instant metadata (ISO). Not used alone for eligibility. |
| `apLedgerActivatedAt` / `By` | Activation stamp |
| `apLedgerPolicy` | `FORWARD_ONLY_LEGACY_READ_ONLY` |
| `openingBalancePolicy` | `ZERO_START` \| `APPROVED_WORKER_OPENING_BALANCES` |
| `disbursementWriteEnabled` | Separate write gate after activation |

Eligibility uses **workDate** (Seoul calendar), never createdAt alone. Late-entered historical workDates stay out. Editing a pre-cutover workItem never pulls it into the new ledger.

Midnight Asia/Seoul: cutover day 00:00:00 included via date string compare (`work >= cut`).

Without activation: new AP write disabled; legacy writers remain; new unpaid UI stays empty/preview (no historical leak).

## Opening balances

- `ZERO_START`: new ledger starts at 0; legacy unpaid stays in legacy UI only.
- `APPROVED_WORKER_OPENING_BALANCES`: CEO-supplied worker rows only (`workerId`, snapshot name, amount, effectiveDate, memo, approvedBy, operationId). No auto-calc from 3,707 work items.
- Preview API allowed; **apply API returns 403** in this release (`AP_OPENING_BALANCE_APPLY_BLOCKED`).
- Activation API returns 403 (`AP_CUTOVER_ACTIVATION_BLOCKED`).

## Legacy freeze

Frozen after activation (and hash-checked forever):

- `workerMonthlyActualVouchers`, `workerPayoutVouchers`, bank worker links, legacy paid status, meal/expense, deductions, cash/bank payout logs, related vouchers.

Generic `saveErpState` freezes those arrays when `isLegacyApWriterFrozen`. Canonical hash + row counts via `computeLegacyApDatasetHash` / `countLegacyApRows`.

UI notice:

> 이전 지급 기록 — 기존 방식으로 보존되며 신규 원장으로 재계산하지 않습니다.

## Writer cutover simulation (activation OFF this release)

| Writer | Location | Pre-cutover | Post-activation (planned) |
|---|---|---|---|
| WorkerMonthlyActualPaymentTab | `src/components/WorkerMonthlyActualPaymentTab.tsx` | Active legacy write | Block new writes; read-only |
| WorkerPayoutHistoryTab | `src/components/WorkerPayoutHistoryTab.tsx` | Active | Read-only |
| Bank worker link | `BankErpWorkerLinkModal` + BankTransactionsPage | Active; also opens DisbursementRegisterModal preview | New workDate → Disbursement only |
| App persist/repair | `App.tsx` / `server/db.mjs` | May persist legacy arrays | Server freezes arrays |
| DisbursementRegisterModal | payments, calendar, worker detail, bank | Preview; submit disabled | Canonical write when flag ON |
| Compatibility routes | calendar / worker payment shortcuts | Open same modal | Same modal; no dual-write |

Simulation expectation: `newLegacyWriterCountSimulation = 0` after activation for post-cutover workDates.

## APIs

- `GET /api/ap/cutover/status`
- `POST /api/ap/cutover/preview` (admin)
- `POST /api/ap/opening-balances/preview` (admin)
- `POST /api/ap/cutover/activate` → **403**
- `POST /api/ap/opening-balances/apply` → **403**
- `POST /api/disbursements/register` / `/:id/reverse` (gated)
- `GET /api/ap/payables?scope=new|all_derived`

## Tests

- `node --import tsx scripts/test-ap-forward-cutover.mjs`
- `node --import tsx scripts/test-ap-forward-cutover-browser.mjs`
- `node --import tsx scripts/test-canonical-collection-payout.mjs`
- `node --import tsx scripts/test-canonical-finance-phase2.mjs`
- `node --import tsx scripts/test-canonical-finance-browser.mjs`
- Read-only: `node --import tsx scripts/ap-legacy-freeze-dry-run.mjs`
- Read-only AR sample: `node --import tsx scripts/ar-organic-sample-dry-run.mjs`

## Deploy gates

- Production: disbursement write OFF, cutover meta mutation 0, opening apply 0, Disbursement create 0.
- Observe 30 minutes via `scripts/observe-prod-health.ps1`.
