# Team Chat SSE — Bearer transport + safe nginx logging

## Problem
Native `EventSource` cannot set `Authorization`, so the client used
`/api/team-chat/events?token=<JWT>`. nginx's default access log records the full
`$request`, which persisted JWTs in `/var/log/nginx/access.log`.

## Policy (current)
- Client: `fetch` SSE with `Authorization: Bearer <token>` only. No `token` /
  `ticket` / `auth` query params.
- Server: `GET /api/team-chat/events` uses `resolveBearerRequestUser` (header
  only). Query tokens return 401 and create zero subscribers.
- Reconnect: exponential backoff (≈400ms → 10s + jitter), single timer,
  online/visibility resume, no retry storms while offline, stop on 401.
- nginx: dedicated `location = /api/team-chat/events` logs
  `"$request_method $uri $server_protocol"` via `teamchat_sse_safe` (no query,
  no Authorization header). Existing access logs are not deleted.

## Apply on production
```bash
cd /home/ubuntu/teammillimeter-erp
bash scripts/apply-nginx-team-chat-sse-log.sh
```
The script backs up `/etc/nginx/sites-available/erp`, runs `nginx -t`, and
restores the backup if the test fails.

## Historical exposure
Count-only forensics (never print token strings) should be run with
`scripts/audit-team-chat-sse-query-token-logs.mjs` on the server. JWT secret
rotation / log deletion require separate approval.
