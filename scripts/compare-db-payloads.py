#!/usr/bin/env python3
import json, sqlite3, sys

def load(path):
    con = sqlite3.connect(path)
    row = con.execute("SELECT version, payload FROM erp_state WHERE id = 1").fetchone()
    p = json.loads(row[1])
    if isinstance(p.get("data"), dict):
        return row[0], p["data"]
    return row[0], p

keys = [
    "sales", "paymentVouchers", "bankTransactions", "taxInvoices", "workers", "clients",
    "companyExpenses", "fixedExpenses", "fixedExpensePayments", "bankLedgerRules",
    "auditLogs", "statementFolders", "workerMonthlyActualVouchers",
]

for path in sys.argv[1:]:
    version, data = load(path)
    print(f"=== {path} (v{version}) ===")
    for k in keys:
        v = data.get(k)
        print(f"  {k}: {len(v) if isinstance(v, list) else v}")
