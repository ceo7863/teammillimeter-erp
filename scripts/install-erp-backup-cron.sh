#!/usr/bin/env bash
# Install daily midnight (KST) full ERP backup cron job (DB + attachment folders).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRON_LINE="0 0 * * * TZ=Asia/Seoul $ROOT/scripts/backup-erp-db.sh >> $ROOT/logs/erp-backup.log 2>&1"
MARKER="# teammillimeter-erp-daily-backup"

chmod +x "$ROOT/scripts/backup-erp-db.sh"

TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v "$MARKER" | grep -v "backup-erp-db.sh" > "$TMP" || true
echo "$CRON_LINE $MARKER" >> "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "Installed cron:"
crontab -l | grep "$MARKER" || true
