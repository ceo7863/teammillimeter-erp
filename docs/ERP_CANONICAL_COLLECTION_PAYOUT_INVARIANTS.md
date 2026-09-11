# Canonical Collection & Payout — Accounting Invariants

Task: `ERP_CANONICAL_COLLECTION_PAYOUT_UX_PARTIAL_SETTLEMENT_FINAL`

## Authority

| Concept | Authority |
|---|---|
| Customer receivable | Individual `saleId` billed amount |
| Statement / PDF | Document listing saleIds (never an independent AR object) |
| Cash in | `Receipt.grossAmount` + effective `ReceiptAllocation`s |
| Contractor payable | Stable `workItemId` (= `saleId:workerIndex` or `sc:{scScheduleId}:{workerKey}`) |
| Settlement sheet | Document listing workItemIds |
| Cash out | `Disbursement.grossAmount` + effective `DisbursementAllocation`s |

## Overlapping statements

- Union of saleIds across all **sent** statements for a client.
- Same saleId counted once for AR and for auto-allocation targets.
- Older overlapping documents may be marked “included in later statement” without deletion.

## Partial receipt / prepayment

```
outstanding(sale) = billed(sale) - effectiveAllocations(sale)
clientOutstanding = Σ outstanding(sale in billed union)
Receipt.gross = allocated + unallocatedPrepaid
```

- Partial payment leaves later sales unpaid.
- Excess cash stays as unallocated prepaid (Receipt not deleted).
- When a new statement is sent, prepaid auto-applies FIFO to newly billed unpaid saleIds (append-only reallocations).
- Manual reallocate only with user-selected evidence; history never deleted.

## Partial disbursement / advance

```
payable(workItem) = confirmedDue - effectiveDisbursementAllocations
Disbursement.gross = allocated + unallocatedAdvance
```

- FIFO by oldest work date then stable workItemId.
- Overpay → advance (unallocated), later applied when new payables appear.

## Cash transfer (not a second customer receipt)

- Cash/personal Receipt already posted for a customer.
- Later bank deposit of that cash is **treasury transfer / confirmation**, not a new AR Receipt.
- Creating a second customer Receipt for the same economic cash-in is forbidden (`CASH_TRANSFER_NOT_CUSTOMER_RECEIPT`).

## Ambiguous bank deposits

- Do not invent a client.
- Keep in unmatched inbox with `CLIENT_NOT_FOUND` / `CLIENT_AMBIGUOUS`.

## Status display

| AR | Meaning |
|---|---|
| paid (green) | outstanding = 0 |
| partial (yellow) | 0 < applied < billed |
| unpaid (red) | applied = 0 |
| prepaid (violet) | unallocated prepaid > 0 |
| void (gray) | cancelled / not billable |

| AP | Meaning |
|---|---|
| settled | remaining = 0 |
| partial | 0 < paid < due |
| unpaid | paid = 0 |
| advance | unallocated advance > 0 |
| review | uncertain deductions |

Calendar must show collection and payout as **independent** badges (not one shared border color), with text + aria-label.

## Hard invariants

1. One bank transaction → at most one active Receipt **or** one active Disbursement link (no silent doubles).
2. Overlapping documents never double-count saleId / workItemId.
3. Partial totals never silently overwrite principal.
4. Reverse/reallocate are append-only with effective dates.
5. `operationId` idempotency + payload conflict.
6. VERSION_CONFLICT retries are all-or-nothing (no partial save).
7. Cross-screen parity: calendar ≡ receivables ≡ statement status ≡ client ledger.
8. Legacy voucher create/update/delete remains 0 on generic saves.
9. Deploy / dry-run never mutates production customer cash history without explicit approval.
