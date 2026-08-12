#!/bin/bash
# MateDesk — Production deploy script
# Run on the VPS from /opt/MateDesk or triggered by GitHub Actions via SSH

set -euo pipefail

DEPLOY_DIR="/opt/MateDesk"
LOG_FILE="$DEPLOY_DIR/deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "========================================"
log "  MateDesk — Deployment Starting"
log "========================================"

cd "$DEPLOY_DIR"

log "→ Pulling latest code from main..."
git fetch origin main
git reset --hard origin/main

log "→ Building Docker images..."
docker compose build

log "→ Starting all services..."
# Stop and remove hanging containers to prevent name conflicts during recreate
docker compose stop
docker compose rm -f
docker compose up -d --remove-orphans

log "→ Waiting for services to stabilise..."
sleep 5

log "→ Verifying backend service status..."
if ! docker compose ps backend | grep -q "Up"; then
  log "❌ Backend container is not running. Showing backend logs:"
  docker compose logs --tail=120 backend || true
  exit 1
fi

log "→ Service status:"
docker compose ps

log "→ Pruning old Docker images..."
docker image prune -f

log "========================================"
log "  ✅  Deployment Complete"
log "========================================"
