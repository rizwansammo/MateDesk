#!/bin/bash
# MateDesk — Database + media backup script
# Suggested cron: 0 3 * * * /opt/MateDesk/deployment/scripts/backup.sh >> /opt/MateDesk/backup.log 2>&1

set -euo pipefail

DEPLOY_DIR="/opt/MateDesk"
BACKUP_DIR="$DEPLOY_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=7

mkdir -p "$BACKUP_DIR"

# Load .env for credentials (ignore if missing)
set -o allexport
# shellcheck disable=SC1091
source "$DEPLOY_DIR/.env" 2>/dev/null || true
set +o allexport

echo "[$(date '+%Y-%m-%d %H:%M:%S')] → Backing up PostgreSQL..."
docker compose -f "$DEPLOY_DIR/docker-compose.yml" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-matedesk}" "${POSTGRES_DB:-matedesk}" \
    | gzip > "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
echo "  Saved: $BACKUP_DIR/db_${TIMESTAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] → Backing up media files..."
if docker volume inspect matedesk_media_files >/dev/null 2>&1; then
    docker run --rm \
        -v matedesk_media_files:/media:ro \
        -v "$BACKUP_DIR":/backup \
        alpine tar -czf "/backup/media_${TIMESTAMP}.tar.gz" /media 2>/dev/null || true
    echo "  Saved: $BACKUP_DIR/media_${TIMESTAMP}.tar.gz"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] → Removing backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "*.gz" -mtime +"$KEEP_DAYS" -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅  Backup complete"
echo "Current backups:"
ls -lh "$BACKUP_DIR" 2>/dev/null | tail -10
