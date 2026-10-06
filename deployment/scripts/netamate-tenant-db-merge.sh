#!/usr/bin/env bash
set -euo pipefail

MAIN_DIR="${MATEDESK_MAIN_DIR:-/opt/MateDesk}"
SOURCE_DIR="${MATEDESK_NETAMATE_SOURCE_DIR:-/opt/NetaMate-HelpDesk}"
TENANT="${MATEDESK_MIGRATION_TENANT:-netamate}"
MODE="${1:-dry-run}"

case "$MODE" in
  dry-run) APPLY_ARG=() ;;
  apply) APPLY_ARG=(--apply) ;;
  *) echo "usage: $0 [dry-run|apply]" >&2; exit 2 ;;
esac

source_compose() {
  (
    cd "$SOURCE_DIR"
    set -a
    # shellcheck disable=SC1091
    source ./.release.env
    set +a
    docker compose "$@"
  )
}

cd "$MAIN_DIR"
TARGET_BACKEND="$(docker compose ps -q backend)"
SOURCE_DB="$(source_compose ps -q postgres)"

if [[ -z "$TARGET_BACKEND" || -z "$SOURCE_DB" ]]; then
  echo "Required MateDesk/source containers were not found." >&2
  exit 1
fi

SOURCE_NETWORK="$(
  docker inspect "$SOURCE_DB"     --format '{{range $name, $cfg := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}'     | head -n1
)"
SOURCE_IP="$(
  docker inspect "$SOURCE_DB"     --format "{{with index .NetworkSettings.Networks \"$SOURCE_NETWORK\"}}{{.IPAddress}}{{end}}"
)"

if [[ -z "$SOURCE_NETWORK" || -z "$SOURCE_IP" ]]; then
  echo "Could not resolve source PostgreSQL network address." >&2
  exit 1
fi

SOURCE_USER="$(docker exec "$SOURCE_DB" printenv POSTGRES_USER)"
SOURCE_PASSWORD="$(docker exec "$SOURCE_DB" printenv POSTGRES_PASSWORD)"
SOURCE_DATABASE="$(docker exec "$SOURCE_DB" printenv POSTGRES_DB)"

SOURCE_URL="$(
  SOURCE_USER="$SOURCE_USER" SOURCE_PASSWORD="$SOURCE_PASSWORD"   SOURCE_DATABASE="$SOURCE_DATABASE" SOURCE_IP="$SOURCE_IP"   python3 - <<'PY'
import os
from urllib.parse import quote
print(
    "postgresql://"
    + quote(os.environ["SOURCE_USER"], safe="")
    + ":"
    + quote(os.environ["SOURCE_PASSWORD"], safe="")
    + "@"
    + os.environ["SOURCE_IP"]
    + ":5432/"
    + quote(os.environ["SOURCE_DATABASE"], safe="")
)
PY
)"

CONNECTED=0
cleanup() {
  unset SOURCE_PASSWORD SOURCE_URL
  if [[ "$CONNECTED" == "1" ]]; then
    docker network disconnect "$SOURCE_NETWORK" "$TARGET_BACKEND" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! docker inspect "$TARGET_BACKEND"   --format '{{range $name, $cfg := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}'   | grep -Fxq "$SOURCE_NETWORK"; then
  docker network connect "$SOURCE_NETWORK" "$TARGET_BACKEND"
  CONNECTED=1
fi

docker compose exec -T   -e SOURCE_DATABASE_URL="$SOURCE_URL"   backend   python manage.py tenant_db_merge     --tenant "$TENANT"     "${APPLY_ARG[@]}"
