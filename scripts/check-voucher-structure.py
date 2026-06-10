#!/usr/bin/env python3
import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

con = sqlite3.connect("data/erp.sqlite")
row = con.execute("SELECT payload FROM erp_state WHERE id = 1").fetchone()
payload = json.loads(row[0])

vouchers = payload.get("workerMonthlyActualVouchers") or []
print(f"vouchers: {len(vouchers)}")
if vouchers:
    print("first voucher keys:", sorted(vouchers[0].keys()))
    print("sample:", json.dumps(vouchers[0], ensure_ascii=False, indent=2)[:2000])

# bank tx worker monthly links
linked = []
for tx in payload.get("bankTransactions") or []:
    for key in ["workerPaymentId", "workerMonthlyActualVoucherId", "linkedWorkerMonthlyActualVoucherId"]:
        if tx.get(key):
            linked.append((tx.get("id"), key, tx.get(key)))
print(f"\nbank tx worker links: {len(linked)}")
for item in linked[:10]:
    print(" ", item)

# obligations in vouchers?
for v in vouchers[:3]:
    print("\nvoucher", v.get("id"))
    for k in ["obligations", "lines", "items", "payments", "entries", "workerRows"]:
        if k in v:
            val = v[k]
            print(f"  {k}: {len(val) if isinstance(val, list) else val}")
