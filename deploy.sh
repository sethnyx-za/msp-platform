#!/bin/bash
# ─── MSP Platform — First-time deploy script ─────────────────────────────────
# Run this on TrueNAS after copying the project folder.
# Usage: bash deploy.sh
set -e

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.lan.yml"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        MSP Platform — Deploy                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# 1. Check .env exists
if [ ! -f ".env" ]; then
  echo "❌  .env file not found!"
  echo "    Copy the .env file into this directory before deploying."
  exit 1
fi

echo "✓  .env found"

# 2. Pull / build images
echo ""
echo "▶  Building Docker images (this takes a few minutes on first run)..."
$COMPOSE build --no-cache

# 3. Start database + redis first, wait for healthy
echo ""
echo "▶  Starting database and Redis..."
$COMPOSE up -d postgres redis

echo "   Waiting for database to be ready..."
sleep 10

# 4. Run DB migrations
echo ""
echo "▶  Running database migrations..."
$COMPOSE run --rm \
  -e DATABASE_URL="$(grep DATABASE_URL .env | cut -d= -f2-)" \
  app sh -c "cd /app && node -e \"
    const { execSync } = require('child_process');
    process.env.DATABASE_URL = process.env.DATABASE_URL;
    execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
  \"" 2>/dev/null || \
$COMPOSE run --rm app sh -c "npx drizzle-kit migrate" 2>/dev/null || \
echo "   Note: Run migrations manually if needed: docker compose exec app npx drizzle-kit migrate"

# 5. Start everything
echo ""
echo "▶  Starting all services..."
$COMPOSE up -d

echo ""
echo "✓  Waiting for app to become healthy (up to 2 min)..."
for i in $(seq 1 24); do
  STATUS=$($COMPOSE ps app --format json 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('Health',''))" 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "healthy" ] || curl -sf http://localhost:8080/api/health >/dev/null 2>&1; then
    echo "✓  App is healthy!"
    break
  fi
  echo "   ... still starting ($i/24)"
  sleep 5
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅  MSP Platform is running!                    ║"
echo "║                                                  ║"
echo "║  URL:  http://10.50.49.15:8080                   ║"
echo "║                                                  ║"
echo "║  First time? Run the seed to create your         ║"
echo "║  MSP Super Admin account:                        ║"
echo "║                                                  ║"
echo "║  docker compose exec app node seed.js            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
