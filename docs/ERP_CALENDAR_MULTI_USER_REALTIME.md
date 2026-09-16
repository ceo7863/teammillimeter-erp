# ERP Calendar Multi-User Realtime

## Problem (current)

Calendar and sales views refresh peer edits only via a **20s** `GET /erp/version` poll (`ERP_VERSION_POLL_MS = 20000` in `App.tsx`).

Measured **peerDetectionLatency** can reach **~20s** (worst case: change lands just after a poll).

There is no push path for domain revision metadata after a durable save.

## Target

1. **Primary:** Server-Sent Events on `GET /api/erp/events` publish `erp.domain_change` **after durable commit**.
2. Clients refetch (or merge) only the affected domains / viewport when needed.
3. **Fallback:** When the stream is down, poll version at **≤10s** (`ERP_STREAM_FALLBACK_POLL_MS = 10000`).
4. While the stream is healthy, a light version poll (`ERP_VERSION_POLL_HEALTHY_MS = 30000`) remains acceptable as a safety net.

## Auth

- SSE uses **`Authorization: Bearer <token>` only**.
- **Never** put JWT / ticket / auth in the query string (nginx `$request` / access logs).
- Same pattern as team chat (`teamChatEventHub.ts`).

## Privacy

Domain events carry **revision metadata only**:

- `eventId`, `globalVersion`, `domainRevision` (alias of `globalVersion`), `domains`, optional `entityIds`
- optional date hints (`affectedDateFrom` / `affectedDateTo`)
- optional `actorUserId`, `committedAt`, `source`, `correlationId`

**Do not** include amounts, client names, memos, account numbers, or full entities.

## Client modules

| File | Role |
|------|------|
| `src/utils/erpDomainEventHub.ts` | Shared SSE hub (`/erp/events`, Bearer, reconnect) |
| `src/utils/erpDomainSync.ts` | Viewport refetch policy, coalesce, stale guard, edit conflict |
| `src/hooks/useErpDomainRealtime.ts` | React subscription + `syncDegraded` (>3s disconnected) |

`App.tsx` wires apply/refetch; the hook does not mutate ERP data itself.

## Event shapes

```ts
{ type: "erp.hello", eventId: string, globalVersion?: number }

{
  type: "erp.domain_change",
  eventId: string,
  globalVersion: number,
  domainRevision: number, // alias of globalVersion
  domains: string[],
  changeType?: string,
  entityIds?: string[],
  affectedDateFrom?: string | null,
  affectedDateTo?: string | null,
  actorUserId?: string | null,
  committedAt?: string,
  source?: string,
  correlationId?: string | null
}
```

On subscribe, the server writes one `erp.hello` with the current ERP `globalVersion` (from `getErpState().version`) before heartbeats / domain events.

## How to run verification tests

From repo root (throwaway DB; no deploy):

```bash
npm install --prefer-offline
node --import tsx scripts/test-erp-calendar-realtime.mjs
node --import tsx scripts/test-erp-calendar-realtime-browser.mjs
```

Optional faster browser smoke (fewer peer latency iterations):

```bash
# PowerShell
$env:TEST_ITERATIONS=3; node --import tsx scripts/test-erp-calendar-realtime-browser.mjs
```

Artifacts:

- `artifacts/erp-calendar-realtime-results.json` — unit / SSE gates
- `artifacts/erp-calendar-realtime-browser-results.json` — multi-context browser gates

## Gate thresholds

| Gate | Threshold |
|------|-----------|
| Peer visibility **p95** (`totalPeerVisibilityLatency`) | **≤ 3000 ms** over `TEST_ITERATIONS` (default **20**) |
| Stream disconnect fallback visibility | **≤ 15000 ms** (`observedWithinMs` / `fallbackLatency`) |
| Simultaneous same-id import | `duplicateSaleCount === 0` (exactly one sale id) |
| Console errors | `consoleErrorCount === 0` |
| Required scenarios | `requiredNotRunCount === 0` |
| Auth | Bearer-only SSE; query `?token=` must 401 (`queryTokenExposureCount === 0`) |
| Privacy / ordering counters | `lostUpdateCount`, `staleOverwriteCount`, `commitBeforeEventViolationCount`, `unauthorizedEventCount` all **0** |
| Edit draft preservation | `editDraftLossCount === 0` |

Browser suite keeps contexts **A / B / C** (plus mobile **D** at 390×844) and must report `multiBrowserContextCount ≥ 3`.
