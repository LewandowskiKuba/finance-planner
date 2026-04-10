#!/bin/bash
set -e

APP_DIR="/opt/finance-planner"
FRONTEND_DIR="$APP_DIR/frontend"

echo "==> Pulling latest code..."
cd "$APP_DIR"
git pull origin main

echo "==> Building frontend..."
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Restarting backend..."
cd "$APP_DIR"
docker compose pull --quiet 2>/dev/null || true
docker compose up --build -d

echo "==> Reloading nginx..."
nginx -t && systemctl reload nginx

echo "==> Done! Finance Planner deployed."
