#!/bin/sh
# Reload nginx only after a MateDesk-managed custom-domain certificate renews.
set -eu

lineage="${RENEWED_LINEAGE:-}"
[ -n "$lineage" ] || exit 0

case "$lineage" in
  /etc/letsencrypt/live/*) ;;
  *) exit 0 ;;
esac

hostname=$(basename -- "$lineage")
case "$hostname" in
  *[!a-z0-9.-]*|.*|*..*|*.) exit 0 ;;
esac

safe=$(printf '%s' "$hostname" | tr '.' '_')
site="/etc/nginx/sites-available/matedesk-custom-${safe}.conf"
[ -f "$site" ] || exit 0

first_line=$(head -n 1 "$site" 2>/dev/null || true)
[ "$first_line" = "# MATEDESK CUSTOM DOMAIN v1" ] || exit 0

/usr/sbin/nginx -t
/bin/systemctl reload nginx
