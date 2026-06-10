#!/usr/bin/env python3
import json
import os
import sqlite3
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

paths = sys.argv[1:] or [
    "data/erp.sqlite",
    "data/erp.sqlite.bak-202606010611",
    "data/erp.sqlite.bak-restore.sqlite",
    "data/erp.sqlite.bak-pre-restore-",
]

for db_path in paths:
    matches = [p for p in os.listdir("data") if p.startswith(os.path.basename(db_path))] if db_path.endswith("-") else [db_path]
    for match in sorted(set(matches)):
        full = os.path.join("data", match) if not match.startswith("data/") else match
        if not os.path.isfile(full):
            continue
        print(f"=== {full} ===")
        con = sqlite3.connect(full)
        row = con.execute("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").fetchone()
        if not row:
            print("  no erp_state")
            con.close()
            continue
        payload = json.loads(row[2])
        txs = payload.get("bankTransactions") or []
        sales = payload.get("sales") or []
        dates = [str(t.get("transactionAt") or "")[:10] for t in txs if t.get("transactionAt")]
        sale_dates = [str(s.get("date") or "")[:10] for s in sales if s.get("date")]
        print(f"  version={row[0]} updated={row[1]}")
        print(f"  bankTransactions={len(txs)} sales={len(sales)} taxInvoices={len(payload.get('taxInvoices') or [])}")
        if dates:
            print(f"  bank date range: {min(dates)} ~ {max(dates)}")
            by_month = Counter(d[:7] for d in dates if len(d) >= 7)
            print(f"  bank by month: {dict(sorted(by_month.items()))}")
        if sale_dates:
            print(f"  sales date range: {min(sale_dates)} ~ {max(sale_dates)}")
            by_month = Counter(d[:7] for d in sale_dates if len(d) >= 7)
            print(f"  sales by month: {dict(sorted(by_month.items()))}")
        con.close()
