#!/usr/bin/env python3
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

paths = sys.argv[1:] or ["data/erp.sqlite", "data/erp.sqlite.bak-202606010611"]

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
    for key in sorted(payload.keys()):
        value = payload[key]
        if isinstance(value, list):
            print(f"  {key}: {len(value)}")
        elif isinstance(value, dict):
            print(f"  {key}: dict({len(value)} keys)")
        elif value is None:
            print(f"  {key}: null")
        else:
            print(f"  {key}: {type(value).__name__}")
    con.close()
