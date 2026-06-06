#!/usr/bin/env python3
import json, sqlite3, sys
path = sys.argv[1]
con = sqlite3.connect(path)
row = con.execute("SELECT version, payload FROM erp_state WHERE id = 1").fetchone()
p = json.loads(row[1])
print("version", row[0])
print("top keys", sorted(p.keys())[:20])
inner = p.get("data") if isinstance(p.get("data"), dict) else None
if inner:
    print("nested data keys sample", sorted(inner.keys())[:15])
    for k in ["sales", "bankTransactions", "taxInvoices", "paymentVouchers"]:
        v = inner.get(k)
        print("data." + k, len(v) if isinstance(v, list) else v)
