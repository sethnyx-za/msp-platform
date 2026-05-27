#!/usr/bin/env bash
set -euo pipefail

# Write crontab from BACKUP_SCHEDULE env var (default: 2am daily)
SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"
echo "$SCHEDULE /app/backup.sh >> /var/log/backup.log 2>&1" > /tmp/crontab

echo "[entrypoint] Backup schedule: $SCHEDULE"
echo "[entrypoint] Starting supercronic..."

exec /usr/local/bin/supercronic /tmp/crontab
