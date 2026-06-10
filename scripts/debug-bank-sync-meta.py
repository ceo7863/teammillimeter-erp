import sqlite3
import json
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "data/erp.sqlite"
conn = sqlite3.connect(db_path)
row = conn.execute("SELECT version, updated_at, payload FROM erp_state WHERE id = 1").fetchone()
payload = json.loads(row[2])
txs = payload.get("bankTransactions") or []
latest = max(txs, key=lambda x: x.get("transactionAt", ""), default={})
print("version", row[0])
print("updated", row[1])
print("txCount", len(txs))
print("latest", latest.get("transactionAt"), latest.get("counterpartyName"))
print("bankSyncMeta", json.dumps(payload.get("bankSyncMeta"), ensure_ascii=False, indent=2))
