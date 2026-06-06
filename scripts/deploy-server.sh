#!/usr/bin/env bash
# Run on AWS server after git pull: bash scripts/deploy-server.sh
# Production: https://erp.teammillimeter.com  EC2: ubuntu@52.78.74.101
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v pdftoppm >/dev/null 2>&1 || ! command -v pdfinfo >/dev/null 2>&1; then
  echo "==> install poppler-utils (pdftoppm, pdfinfo)"
  sudo apt-get update
  sudo apt-get install -y poppler-utils
fi

if ! fc-list :lang=ko | grep -q .; then
  echo "==> install Korean fonts for contract PDF preview"
  sudo apt-get install -y fonts-noto-cjk
fi

echo "==> git pull"
git pull --ff-only origin main

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
