#!/usr/bin/env bash
# Full ERP backup: SQLite DB + data/ 첨부 폴더 (최근 7일 보관)
# Schedule at midnight KST:
#   0 0 * * * TZ=Asia/Seoul /home/ubuntu/teammillimeter-erp/scripts/backup-erp-db.sh >> /home/ubuntu/teammillimeter-erp/logs/erp-backup.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="${DATABASE_PATH:-$ROOT/data/erp.sqlite}"
DATA_DIR="$ROOT/data"
BACKUP_DIR="$ROOT/data/backups"
DAILY_DIR="$BACKUP_DIR/daily"
RETAIN_DAYS="${ERP_BACKUP_RETAIN_DAYS:-7}"
STAMP="$(TZ=Asia/Seoul date +%Y-%m-%d)"
TARGET_DIR="$DAILY_DIR/$STAMP"
LEGACY_DB="$BACKUP_DIR/erp-$STAMP.sqlite"
MANIFEST="$TARGET_DIR/manifest.json"

# Attachment dirs (config.mjs defaults)
FOLDERS=(
  pdf-archives
  client-business-reg
  client-contracts
  board-attachments
)

log() {
  echo "[$(date -Is)] $*"
}

copy_tree() {
  local src="$1"
  local dest="$2"
  if [[ ! -d "$src" ]]; then
    mkdir -p "$dest"
    return 0
  fi
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src/" "$dest/"
  else
    mkdir -p "$dest"
    cp -a "$src/." "$dest/"
  fi
}

folder_stats() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "0 0"
    return
  fi
  local files bytes
  files="$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')"
  bytes="$(du -sb "$dir" 2>/dev/null | awk '{print $1}' || echo 0)"
  echo "$files $bytes"
}

mkdir -p "$BACKUP_DIR" "$DAILY_DIR" "$TARGET_DIR" "$ROOT/logs"

if [[ ! -f "$DB_PATH" ]]; then
  log "backup skipped: missing db $DB_PATH"
  exit 1
fi

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
  sqlite3 "$DB_PATH" ".backup '$TARGET_DIR/erp.sqlite'"
  sqlite3 "$DB_PATH" ".backup '$LEGACY_DB'"
else
  cp "$DB_PATH" "$TARGET_DIR/erp.sqlite"
  cp "$DB_PATH" "$LEGACY_DB"
fi

DB_BYTES="$(du -sb "$TARGET_DIR/erp.sqlite" | awk '{print $1}')"

FOLDER_JSON=""
for name in "${FOLDERS[@]}"; do
  src="$DATA_DIR/$name"
  dest="$TARGET_DIR/$name"
  copy_tree "$src" "$dest"
  read -r file_count byte_count <<<"$(folder_stats "$dest")"
  if [[ -n "$FOLDER_JSON" ]]; then
    FOLDER_JSON+=","
  fi
  FOLDER_JSON+="\"$name\":{\"files\":$file_count,\"bytes\":$byte_count}"
done

CREATED_AT="$(date -Is)"
cat >"$MANIFEST" <<EOF
{
  "date": "$STAMP",
  "createdAt": "$CREATED_AT",
  "retentionDays": $RETAIN_DAYS,
  "dbFile": "erp.sqlite",
  "dbBytes": $DB_BYTES,
  "legacyDbCopy": "$(basename "$LEGACY_DB")",
  "folders": { $FOLDER_JSON },
  "includesDbState": [
    "bank_transactions",
    "ledger categories and account links",
    "tax invoices",
    "sales and payments",
    "pdf archive metadata"
  ]
}
EOF

find "$DAILY_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETAIN_DAYS" -exec rm -rf {} + 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 -name 'erp-*.sqlite' -type f -mtime +"$RETAIN_DAYS" -delete 2>/dev/null || true
# latest-only 전환 잔여물 정리
rm -rf "$DAILY_DIR/latest" 2>/dev/null || true
rm -f "$BACKUP_DIR/erp-latest.sqlite" 2>/dev/null || true

TOTAL_H="$(du -sh "$TARGET_DIR" | awk '{print $1}')"
log "backup ok $TARGET_DIR (total $TOTAL_H, db $(du -h "$TARGET_DIR/erp.sqlite" | awk '{print $1}'), retain ${RETAIN_DAYS}d)"
