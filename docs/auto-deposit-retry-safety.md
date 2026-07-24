# Auto-deposit retry safety

## Why periodic recheck is authoritative

Barobill/IBK sync previously auto-linked **only** `merged.addedIds` on the sync that
first inserted a deposit. If the matching sent-statement PDF did not exist yet
(statement created after the deposit), that deposit was never re-evaluated.

Event-driven rechecks on statement share-link create/replace were considered, but
they race with concurrent ERP `saveErpState` calls and can leave PDF archive meta
half-applied when a `VERSION_CONFLICT` occurs.

Therefore:

1. Every bank sync (including `added=0`) re-evaluates **recent unmatched deposits**
   within `AUTO_DEPOSIT_RETRY_LOOKBACK_DAYS` (default **30**).
2. PDF archive meta updates are applied **only after** ERP state save succeeds
   (`deferPdfMeta`).
3. Date guards reject `transactionDate < periodStart` and gaps larger than
   `AUTO_DEPOSIT_MAX_DATE_GAP_DAYS` (default **45**) so Mar–May deposits cannot
   attach to June statements.
4. Ambiguous top scores (gap &lt; `AUTO_DEPOSIT_AMBIGUITY_MIN_SCORE_GAP`, default **5**)
   never auto-link; they are counted as `ambiguous`.
5. Score floor stays **75**.

## Ops

Read-only diagnosis (no mutations):

```bash
npx tsx --env-file=.env scripts/diagnose-auto-deposit-retry.mts --clients=에이온디자인,딜라잇홈,키친제니스,퍼니볼트,퍼랩스,밀리퍼니
```

Do **not** run historical full repair scripts against all unmatched deposits.
