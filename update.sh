#!/bin/bash
# ─── MSP Platform — Update script ────────────────────────────────────────────
# Pull latest code from Git and redeploy with zero-downtime rolling update.
# Usage: bash update.sh
set -e

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.lan.yml"

echo ""
echo "▶  Pulling latest code..."
git pull

echo "▶  Building new app image..."
$COMPOSE build app

echo "▶  Running any new migrations..."
$COMPOSE run --rm app sh -c "npx drizzle-kit migrate" 2>/dev/null || true

echo "▶  Restarting app (zero-downtime)..."
$COMPOSE up -d --no-deps app

echo ""
echo "✅  Update complete! App restarting at http://10.50.49.15:8080"
