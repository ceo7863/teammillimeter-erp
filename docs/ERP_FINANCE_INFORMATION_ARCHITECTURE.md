# ERP Finance Information Architecture & Single-Entry UX

Task: `ERP_FINANCE_INFORMATION_ARCHITECTURE_AND_SINGLE_ENTRY_UX_FINAL`

Source of truth: `src/utils/financeInformationArchitecture.ts`  
Compatibility: `migrateStoredActiveTab` (`src/App.tsx`), `canonicalizeFinanceShellPage` (`src/utils/sidebarOrder.ts`)

## Final 4 finance menus

| Order | Page key | Sidebar label |
| --- | --- | --- |
| A | `sales` | 매출·내역서 |
| B | `receivables` | 입금·미수 |
| C | `workerPayments` | 시공자 지급 |
| D | `accounting` | 통장 |

Legacy finance keys remain valid for redirects / `allowedPages` but are **hidden from the sidebar** (`FINANCE_SIDEBAR_HIDDEN_PAGE_KEYS`):  
`salesInput`, `salesVoucherSearch`, `saleComments`, `statements`, `pdfArchive`, `paymentInput`, `bankTransactions`, `companyLedger`, `taxInvoices`.

## Route inventory (`FINANCE_ROUTE_INVENTORY`)

| legacyKey | label | decision | targetPage | targetTab |
| --- | --- | --- | --- | --- |
| `salesInput` | 매출등록 | redirect | `sales` | `register` |
| `sales` | 매출관리 | hub | `sales` | `vouchers` |
| `salesVoucherSearch` | 매출전표검색 | redirect | `sales` | `search` |
| `saleComments` | 전표 코멘트 | redirect | `sales` | `comments` |
| `statements` | 내역서 | redirect | `sales` | `statements` |
| `pdfArchive` | PDF 보관함 | redirect | `sales` | `statements` |
| `receivables` | 입금/미수금 | hub | `receivables` | ? |
| `paymentInput` | 입금입력(legacy) | redirect | `receivables` | ? |
| `workerPayments` | 시공자 지급 | hub | `workerPayments` | ? |
| `accounting` | 회곀·통장 | hub | `accounting` | `bank` |
| `bankTransactions` | 통장거래 | redirect | `accounting` | `bank` |
| `companyLedger` | 가계부 | redirect | `accounting` | `ledger` |
| `taxInvoices` | 세금계산서 | redirect | `accounting` | `tax` |
| `reports` | 보고서 | keep-separate | `reports` | ? |
| `analysis` | 분석 | keep-separate | `analysis` | ? |
| `apCutover` | AP 컧오버 | admin | `apCutover` | ? |
| `calendar` | 캘린더(단축경로) | keep-separate | `calendar` | ? |

`listCompatibilityRedirects()` returns every inventory row with `decision === "redirect"`.

## Reports vs analysis (`REPORTS_ANALYSIS_DECISION`)

**KEEP SEPARATE** ? `merge: false`.

Reports stay statutory / fixed operational reports; analysis stays the management trend / account-analysis hub. Do not merge menus.

## Historical exceptions (excluded from badge)

`HISTORICAL_EXCEPTION_EXCLUDED`:

- expense mismatch: **492**
- unattributed payment: **156**

`countActionableExceptionBadge` / `isHistoricalExcludedExceptionKind` must never count:

- `legacy_expense_mismatch`
- `legacy_unattributed_payment`
- `historical_expense_mismatch_492`
- `historical_unattributed_payout_156`

These dry-run findings are documentation / audit history only ? **not** inbox badge noise.

## AP stays OFF

Until explicit cutover approval:

- `cutoverActivated=false` (no `apLedgerActivatedAt` / ledger not activated)
- `disbursementWriteEnabled=false` (client `isDisbursementWriteEnabled()` default OFF; server meta flag false)

Worker payments hub shows `AP_INACTIVE_HUB_NOTICE` / `AP_LEDGER_INACTIVE_NOTICE`. Disbursement register UI may open for preview but must not write.

## Unified modals / hubs

| Surface | Component | Role |
| --- | --- | --- |
| 매출·내역서 | `SalesStatementsHubPage` | Single sales + statements hub (`data-sales-statements-hub`) |
| 입금·미수 | `ReceiptRegisterModal` | Official collection / receipt register |
| 시공자 지급 | `DisbursementRegisterModal` | Official payout register (write gated OFF) |

`App.tsx` mounts `SalesStatementsHubPage` for the `sales` shell page. Receivables / calendar / worker-payment / bank flows share the register modals above rather than parallel legacy forms.

## Compatibility redirects

1. **`migrateStoredActiveTab(stored)`** (`App.tsx`) ? on session restore, chains accounting / statement / sales / basic-info / user-admin migrators; persists canonical page key and hub tabs (including sales tab for legacy sales/statement keys).
2. **`canonicalizeFinanceShellPage(active)`** (`sidebarOrder.ts`) ? maps sidebar-hidden finance routes to hub keys before visibility bounce checks:
   - `paymentInput` ? `receivables`
   - sales legacy + `statements` / `pdfArchive` ? `sales`
   - `bankTransactions` / `companyLedger` / `taxInvoices` ? `accounting`
3. **`migrateSalesStatementsPageKey`** ? sales hub tab mapping (`salesInput`?`register`, `statements`/`pdfArchive`?`statements`, etc.).

### Known restore caveat

`paymentInput` is not an `ErpPageKey`. `migrateActivePageKey` therefore returns `dashboard` on cold session restore before the runtime `useEffect` that calls `migrateActivePage("paymentInput")`. Live navigation still canonicalizes via `canonicalizeFinanceShellPage` / the `active === "paymentInput"` effect. Prefer setting `receivables` or clicking **입금·미수** for restore-based tests.

## Compatibility caveat: `paymentInput` reload race

`canonicalizeFinanceShellPage("paymentInput")` and `migrateActivePage("paymentInput")` both target `receivables`. On cold restore from `sessionStorage`, `canUserAccessPage(active)` may still see the raw legacy key (not an `ErpPageKey`) in the same effect flush and bounce to the default page. Browser smoke therefore verifies receivables via hub key / sidebar, and records the legacy reload probe in results meta. Unit gates cover canonicalize mapping.

## Tests

- `node --import tsx scripts/test-finance-ia.mjs`
- `node --import tsx scripts/test-finance-ia-browser.mjs` (Playwright Chromium; writes `artifacts/finance-ia-browser-results.json`)
