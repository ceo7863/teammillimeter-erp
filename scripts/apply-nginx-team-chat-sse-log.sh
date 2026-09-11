#!/usr/bin/env bash
# Apply team-chat SSE safe nginx logging:
# - install log_format into /etc/nginx/conf.d/
# - install site config with dedicated location = /api/team-chat/events
# Backs up existing site config; restores on nginx -t failure.
# Does NOT delete or truncate existing access logs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_SRC="$ROOT/deploy/nginx/erp.conf"
FORMAT_SRC="$ROOT/deploy/nginx/teamchat-sse-log-format.conf"
SITE_DEST="/etc/nginx/sites-available/erp"
FORMAT_DEST="/etc/nginx/conf.d/teamchat-sse-log-format.conf"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SITE_BACKUP="/etc/nginx/sites-available/erp.bak-before-teamchat-sse-${STAMP}"
FORMAT_BACKUP=""

if [[ ! -f "$SITE_SRC" || ! -f "$FORMAT_SRC" ]]; then
  echo "missing deploy/nginx sources" >&2
  exit 1
fi

if [[ ! -f "$SITE_DEST" ]]; then
  echo "missing $SITE_DEST" >&2
  exit 1
fi

echo "==> backup $SITE_DEST -> $SITE_BACKUP"
sudo cp -a "$SITE_DEST" "$SITE_BACKUP"

if [[ -f "$FORMAT_DEST" ]]; then
  FORMAT_BACKUP="${FORMAT_DEST}.bak-before-teamchat-sse-${STAMP}"
  echo "==> backup $FORMAT_DEST -> $FORMAT_BACKUP"
  sudo cp -a "$FORMAT_DEST" "$FORMAT_BACKUP"
fi

echo "==> install log_format + site"
sudo cp "$FORMAT_SRC" "$FORMAT_DEST"
sudo cp "$SITE_SRC" "$SITE_DEST"

restore() {
  echo "==> restoring previous nginx config" >&2
  sudo cp -a "$SITE_BACKUP" "$SITE_DEST"
  if [[ -n "$FORMAT_BACKUP" && -f "$FORMAT_BACKUP" ]]; then
    sudo cp -a "$FORMAT_BACKUP" "$FORMAT_DEST"
  else
    sudo rm -f "$FORMAT_DEST"
  fi
}

echo "==> nginx -t"
if ! sudo nginx -t; then
  restore
  sudo nginx -t
  exit 1
fi

echo "==> reload nginx"
sudo systemctl reload nginx
echo "==> nginx team-chat SSE log policy applied"
