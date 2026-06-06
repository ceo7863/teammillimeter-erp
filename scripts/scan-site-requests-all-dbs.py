#!/usr/bin/env python3
import json
import glob
import os
import sqlite3
import sys

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
paths = sys.argv[1:] or sorted(set(["data/erp.sqlite"] + glob.glob("data/erp.sqlite.bak*")))

def unwrap(payload):
    if (
        isinstance(payload, dict)
        and isinstance(payload.get("data"), dict)
        and isinstance(payload["data"].get("bankTransactions"), list)
    ):
        return payload["data"], "nested"
    return payload, "flat"

for p in paths:
    if not os.path.exists(p):
        continue
    conn = sqlite3.connect(p)
    row = conn.execute(
        "SELECT version, updated_at, updated_by, payload FROM erp_state WHERE id = 1"
    ).fetchone()
    conn.close()
    if not row:
        print(p, "NO_STATE")
        continue
    payload = json.loads(row[3])
    inner, shape = unwrap(payload)
    reqs = inner.get("clientSiteRequests") or []
    tokens = [
        c
        for c in (inner.get("clients") or [])
        if str(c.get("siteRequestToken") or "").strip()
    ]
    top_reqs = payload.get("clientSiteRequests") or []
    print(
        f"{p}\n  v{row[0]} {row[2]} @ {row[1]} shape={shape} "
        f"inner_csr={len(reqs)} top_csr={len(top_reqs)} tokens={len(tokens)}"
    )
    if reqs:
        for r in sorted(reqs, key=lambda x: str(x.get("submittedAt") or ""), reverse=True)[:5]:
            print(
                f"    - {r.get('id')} {r.get('status')} {r.get('submittedAt')} "
                f"{r.get('clientName')} / {r.get('siteName')}"
            )
