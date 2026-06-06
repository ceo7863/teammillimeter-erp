#!/usr/bin/env python3
import json, sqlite3, sys
path = sys.argv[1]
con = sqlite3.connect(path)
row = con.execute("SELECT version, payload FROM erp_state WHERE id = 1").fetchone()
p = json.loads(row[1])
print("version", row[0])
for k in ["sales", "bankTransactions", "taxInvoices", "paymentVouchers", "clients", "workers", "companyExpenses"]:
    v = p.get(k)
    print(k, len(v) if isinstance(v, list) else v)
