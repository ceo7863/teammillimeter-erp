import sqlite3
import json
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "data/erp.sqlite"
conn = sqlite3.connect(db_path)
row = conn.execute("SELECT version, updated_at, updated_by, payload FROM erp_state WHERE id = 1").fetchone()
payload = json.loads(row[3])

def unwrap(p):
    if (
        isinstance(p, dict)
        and isinstance(p.get("data"), dict)
        and isinstance(p["data"].get("bankTransactions"), list)
    ):
        inner = dict(p["data"])
        wrapper_reqs = p.get("clientSiteRequests") or []
        inner_reqs = inner.get("clientSiteRequests") or []
        if wrapper_reqs and not inner_reqs:
            inner["clientSiteRequests"] = wrapper_reqs
        return inner, "nested"
    return p, "flat"

payload, shape = unwrap(payload)
requests = payload.get("clientSiteRequests") or []
clients_with_token = [
    c for c in (payload.get("clients") or []) if str(c.get("siteRequestToken") or "").strip()
]
print("version", row[0])
print("updated_at", row[1])
print("updated_by", row[2])
print("payload_shape", shape)
print("clientSiteRequests_count", len(requests))
if requests:
    latest = sorted(requests, key=lambda r: str(r.get("submittedAt") or ""), reverse=True)[:5]
    for item in latest:
        print(
            " -",
            item.get("id"),
            item.get("status"),
            item.get("submittedAt"),
            item.get("clientName"),
            item.get("siteName"),
        )
print("clients_with_site_request_token", len(clients_with_token))
