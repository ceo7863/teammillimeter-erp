# AP Atomic Cutover & Opening Balance Approval

Task: `ERP_AP_ATOMIC_CUTOVER_OPENING_BALANCE_APPROVAL_FINAL`  
Base: `2b448eb3fafad203c558d996d81ce527d6fa4af1`

## Policy

- `apLedgerPolicy = FORWARD_ONLY_LEGACY_READ_ONLY`
- Recommended `openingBalancePolicy = APPROVED_WORKER_OPENING_BALANCES`
- `ZERO_START` only with explicit confirmation that legacy unpaid is fully settled elsewhere
- Eligibility: Asia/Seoul `workDate >= apLedgerCutoverWorkDate` (inclusive 00:00)
- Legacy and new ledgers are never silently summed

## Atomic activate

Single `saveErpState` commits:

1. Opening balances (approved rows only; zero rows not stored)
2. `apLedgerCutoverWorkDate` / `apLedgerActivatedAt/By`
3. Legacy writer freeze (`READ_ONLY_FOREVER`)
4. `disbursementWriteEnabled=true`
5. Audit event + operationId idempotency

Any failure → mutation 0.

### APIs

- `GET /api/admin/ap-cutover/status`
- `POST /api/admin/ap-cutover/preview` (signed previewToken; mutation 0)
- `POST /api/admin/ap-cutover/activate` (confirmation phrase + token + version + legacy hash/counts)
- `POST /api/admin/ap-cutover/emergency-pause` (pauses new Disbursement writes only)

Separate opening-balance apply remains blocked; openings only via atomic activate.

## Emergency pause

- Does **not** re-enable legacy writers
- Does **not** delete openings or cutover metadata
- Does **not** copy new ledger back to legacy
- Git rollback alone must not revive legacy AP writers after first new payout

## Admin UX

Page key `apCutover` (adminOnly). Wizard steps: date → openings → preview → confirm.  
Production UI refuses activate unless localStorage unlock `erp.feature.apCutoverActivateUnlock=1` (throwaway/test only). This release does **not** activate production.

## Deploy gates

Pre-deploy read-only measurement of legacy hash/counts is mandatory. Post-deploy must match. Production must remain:

- `cutoverActivated=false`
- `disbursementWriteEnabled=false`
- openingBalanceCount=0
- Disbursement/Allocation mutation 0

Final decision for this task: **READY_FOR_AP_OPENING_BALANCE_ENTRY**
