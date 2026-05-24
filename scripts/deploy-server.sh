#!/usr/bin/env bash
# Run on AWS server after git pull: bash scripts/deploy-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm install"
npm install

echo "==> build frontend"
npm run build

echo "==> restart API (pm2)"
if pm2 describe erp >/dev/null 2>&1; then
  pm2 restart erp
else
  pm2 start server/index.mjs --name erp
fi

pm2 save
echo "==> deploy done"
