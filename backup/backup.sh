#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups"
DB_BACKUP_DIR="$BACKUP_DIR/database"
FILES_BACKUP_DIR="$BACKUP_DIR/uploads"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-365}"

mkdir -p "$DB_BACKUP_DIR" "$FILES_BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ─── Database backup ──────────────────────────────────────────────────────────
log "Starting database backup..."
DB_FILE="$DB_BACKUP_DIR/msp_platform_${TIMESTAMP}.sql.gz"

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
  | gzip -9 > "$DB_FILE"

log "Database backup complete: $DB_FILE ($(du -sh "$DB_FILE" | cut -f1))"

# ─── Uploads backup ──────────────────────────────────────────────────────────
log "Starting uploads backup..."
UPLOADS_ARCHIVE="$FILES_BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz"
tar -czf "$UPLOADS_ARCHIVE" -C /uploads . 2>/dev/null || true
log "Uploads backup complete: $UPLOADS_ARCHIVE"

# ─── Sync to remote destinations via rclone ───────────────────────────────────
if [ -f "/root/.config/rclone/rclone.conf" ]; then
    log "Syncing to configured rclone remotes..."
    # Each remote named in rclone.conf will receive a copy of /backups
    for remote in $(rclone listremotes 2>/dev/null | tr -d ':'); do
        log "  Syncing to remote: $remote"
        rclone sync "$BACKUP_DIR" "${remote}:msp-platform-backups" \
            --transfers 4 \
            --checkers 8 \
            --retries 3 \
            --log-level ERROR \
            || log "  WARNING: Sync to $remote failed, continuing..."
    done
    log "Remote sync complete"
else
    log "No rclone.conf found — skipping remote sync (local backup only)"
fi

# ─── Prune old backups ────────────────────────────────────────────────────────
log "Pruning backups older than ${RETENTION_DAYS} days..."
find "$DB_BACKUP_DIR" -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
find "$FILES_BACKUP_DIR" -name "*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete
log "Pruning complete"

# ─── Summary ──────────────────────────────────────────────────────────────────
log "Backup run finished successfully"
log "Local backup count — DB: $(ls "$DB_BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l), Uploads: $(ls "$FILES_BACKUP_DIR"/*.tar.gz 2>/dev/null | wc -l)"
