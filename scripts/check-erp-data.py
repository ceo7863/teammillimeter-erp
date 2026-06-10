#!/usr/bin/env python3
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

paths = sys.argv[1:] or ["data/erp.sqlite", "data/erp.sqlite.bak-202606010611"]
keys = [
    "sales",
    "workers",
    "workerMonthlyActualVouchers",
    "workerPaymentRecords",
    "bankTransactions",
]

for db_path in paths:
    print(f"=== {db_path} ===")
    if not os.path.exists(db_path):
        print("  MISSING")
        continue
    con = sqlite3.connect(db_path)
    row = con.execute("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").fetchone()
    if not row:
        print("  no erp_state row")
        con.close()
        continue
    payload = json.loads(row[2])
    print(f"  version={row[0]} updated={row[1]}")
    for key in keys:
        value = payload.get(key) or []
        print(f"  {key}: {len(value)}")
    memos = sum(
        1
        for worker in (payload.get("workers") or [])
        if str(worker.get("monthlyPaymentMemo") or "").strip()
    )
    print(f"  workers with monthlyPaymentMemo: {memos}")
    con.close()
