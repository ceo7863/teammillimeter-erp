#!/usr/bin/env python3
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

paths = sys.argv[1:] or ["data/erp.sqlite", "data/erp.sqlite.bak-202606010611"]

def load(path):
    con = sqlite3.connect(path)
    row = con.execute("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").fetchone()
    con.close()
    payload = json.loads(row[2])
    return row[0], row[1], payload

def bank_links(payload):
    links = 0
    for tx in payload.get("bankTransactions") or []:
        if tx.get("workerPaymentId") or tx.get("workerMonthlyActualVoucherId"):
            links += 1
    return links

def voucher_summary(payload):
    out = []
    for v in payload.get("workerMonthlyActualVouchers") or []:
        out.append(
            {
                "id": v.get("id"),
                "month": v.get("monthKey") or v.get("month"),
                "workerId": v.get("workerId"),
                "memo": (v.get("memo") or v.get("note") or "")[:40],
                "bankTxIds": len(v.get("bankTransactionIds") or []),
            }
        )
    return out

payloads = {}
for p in paths:
    ver, updated, payload = load(p)
    payloads[p] = payload
    print(f"\n=== {p} v{ver} {updated} ===")
    print(f"  bank links: {bank_links(payload)}")
    print("  vouchers:")
    for v in voucher_summary(payload):
        print(f"    {v}")

if len(paths) >= 2:
    a, b = paths[0], paths[1]
    pa, pb = payloads[a], payloads[b]
    print("\n=== DIFF workerMonthlyActualVouchers by id ===")
    ma = {v.get("id"): v for v in pa.get("workerMonthlyActualVouchers") or []}
    mb = {v.get("id"): v for v in pb.get("workerMonthlyActualVouchers") or []}
    for vid in sorted(set(ma) | set(mb)):
        if ma.get(vid) != mb.get(vid):
            print(f"  changed/missing id={vid}")

    print("\n=== worker memo fields (any non-empty) ===")
    for label, payload in [(a, pa), (b, pb)]:
        fields = []
        for w in payload.get("workers") or []:
            for key in ["monthlyPaymentMemo", "memo", "note", "folderMemo"]:
                val = str(w.get(key) or "").strip()
                if val:
                    fields.append((w.get("id"), w.get("name"), key, val[:50]))
        print(f"  {label}: {len(fields)} non-empty memo fields")
        for item in fields[:10]:
            print(f"    {item}")
