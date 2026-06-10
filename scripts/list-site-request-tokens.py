#!/usr/bin/env python3
import json
import os
import sqlite3
import sys

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
path = sys.argv[1] if len(sys.argv) > 1 else "data/erp.sqlite"
conn = sqlite3.connect(path)
payload = json.loads(conn.execute("SELECT payload FROM erp_state WHERE id = 1").fetchone()[0])
inner = payload.get("data") if isinstance(payload.get("data"), dict) else payload
for c in inner.get("clients") or []:
    token = str(c.get("siteRequestToken") or "").strip()
    if not token:
        continue
    print(
        json.dumps(
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "token": token[:12] + "...",
                "createdAt": c.get("siteRequestLinkCreatedAt"),
                "updatedAt": c.get("siteRequestLinkUpdatedAt"),
                "updatedBy": c.get("siteRequestLinkUpdatedBy"),
            },
            ensure_ascii=False,
        )
    )
