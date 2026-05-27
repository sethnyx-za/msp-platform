#!/bin/bash
# ─── MSP Platform — First-time admin setup ───────────────────────────────────
# Run ONCE after the first deploy to create your MSP org and super admin.
# It is a no-op if users already exist — safe to re-run.
#
# Usage:
#   bash init-admin.sh
#
# Override defaults with env vars:
#   MSP_NAME="ForwardBinary" ADMIN_EMAIL="you@example.com" ADMIN_PASS="Secret123!" bash init-admin.sh

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.lan.yml"

echo ""
echo "▶  Running database migrations..."
$COMPOSE exec app npx drizzle-kit migrate 2>/dev/null || \
$COMPOSE run --rm app npx drizzle-kit migrate

echo ""
echo "▶  Creating first admin account..."
$COMPOSE exec \
  -e MSP_NAME="${MSP_NAME:-My MSP}" \
  -e ADMIN_EMAIL="${ADMIN_EMAIL:-admin@msp.local}" \
  -e ADMIN_PASS="${ADMIN_PASS:-ChangeMe@1234!}" \
  app npx tsx src/lib/db/init-production.ts
