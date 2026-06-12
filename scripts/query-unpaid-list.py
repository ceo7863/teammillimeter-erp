#!/usr/bin/env python3
"""Standalone unpaid list query against erp.sqlite."""
import json
import sqlite3
import sys
from datetime import date

DB_PATH = sys.argv[3] if len(sys.argv) > 3 else "/home/ubuntu/teammillimeter-erp/data/erp.sqlite"
START = sys.argv[1] if len(sys.argv) > 1 else f"{date.today().year}-{date.today().month:02d}-01"
END = sys.argv[2] if len(sys.argv) > 2 else None

if END is None:
    y, m = map(int, START.split("-")[:2])
    if m == 12:
        END = f"{y}-12-31"
    else:
        from calendar import monthrange
        END = f"{y}-{m:02d}-{monthrange(y, m)[1]:02d}"


def get_unpaid(sale):
    amount = float(sale.get("amount") or 0)
    paid = float(sale.get("paid") if sale.get("paid") is not None else sale.get("basePaid") or 0)
    return max(amount - paid, 0)


def fmt_krw(n):
    return f"{int(round(n)):,}"


conn = sqlite3.connect(DB_PATH)
row = conn.execute("SELECT payload FROM erp_domain_state WHERE domain = 'sales'").fetchone()
conn.close()

if not row:
    print("No sales domain payload found")
    sys.exit(1)

payload = json.loads(row[0])
sales = payload.get("sales") or []

rows = []
for sale in sales:
    unpaid = get_unpaid(sale)
    if unpaid <= 0:
        continue
    d = str(sale.get("date") or "")[:10]
    if d < START or d > END:
        continue
    rows.append({
        "date": d,
        "client": str(sale.get("client") or ""),
        "site": str(sale.get("site") or ""),
        "unpaid": unpaid,
    })

rows.sort(key=lambda r: (-r["unpaid"], r["date"]), reverse=False)
rows.sort(key=lambda r: (-r["unpaid"], r["date"]))

total = sum(r["unpaid"] for r in rows)
print(f"DB: {DB_PATH}")
print(f"Period: {START}~{END}")
print(f"Total unpaid: {fmt_krw(total)}? ({len(rows)}?)")
for r in rows[:20]:
    site = f" / {r['site']}" if r["site"] else ""
    print(f"- {r['client']}{site} ({r['date']}): {fmt_krw(r['unpaid'])}?")
if len(rows) > 20:
    print(f"… ? {len(rows) - 20}?")
