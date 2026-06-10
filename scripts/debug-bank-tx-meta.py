import sqlite3
import json
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "data/erp.sqlite"
conn = sqlite3.connect(db_path)
row = conn.execute("SELECT version, payload FROM erp_state WHERE id = 1").fetchone()
payload = json.loads(row[1])

def unwrap(p):
    if (
        isinstance(p, dict)
        and isinstance(p.get("data"), dict)
        and isinstance(p["data"].get("bankTransactions"), list)
    ):
        inner = p["data"]
        outer_txs = p.get("bankTransactions") or []
        inner_txs = inner.get("bankTransactions") or []
        return inner, "nested", len(outer_txs), len(inner_txs)
    txs = p.get("bankTransactions") or []
    return p, "flat", 0, len(txs)

data, shape, outer_count, inner_count = unwrap(payload)
txs = data.get("bankTransactions") or []
latest = max((t.get("transactionAt") or "" for t in txs), default="")
meta = data.get("bankSyncMeta") or {}
print("version", row[0])
print("shape", shape, "outer_txs", outer_count, "inner_txs", inner_count)
print("count", len(txs))
print("latest", latest)
print("meta", json.dumps(meta, ensure_ascii=False))
