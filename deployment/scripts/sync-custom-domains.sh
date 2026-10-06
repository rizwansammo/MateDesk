#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="${MATEDESK_COMPOSE_DIR:-/opt/MateDesk}"
WEBROOT="${MATEDESK_CUSTOM_DOMAIN_WEBROOT:-/var/www/html}"
SITES_AVAILABLE="${NGINX_SITES_AVAILABLE:-/etc/nginx/sites-available}"
SITES_ENABLED="${NGINX_SITES_ENABLED:-/etc/nginx/sites-enabled}"
CERTBOT_HOOK_DIR="${CERTBOT_HOOK_DIR:-/etc/letsencrypt/renewal-hooks/deploy}"
CERTBOT_HOOK_SRC="$COMPOSE_DIR/deployment/scripts/matedesk-custom-domain-certbot-hook.sh"
CERTBOT_HOOK_DST="$CERTBOT_HOOK_DIR/matedesk-custom-domain-nginx.sh"

cd "$COMPOSE_DIR"
mkdir -p "$WEBROOT/.well-known/acme-challenge"
mkdir -p "$CERTBOT_HOOK_DIR"
install -m 0755 "$CERTBOT_HOOK_SRC" "$CERTBOT_HOOK_DST"

state() {
  local domain="$1"
  local next="$2"
  local error="${3:-}"
  if [[ -n "$error" ]]; then
    docker compose exec -T backend python manage.py custom_domain_set_state "$domain" "$next" --error "$error"
  else
    docker compose exec -T backend python manage.py custom_domain_set_state "$domain" "$next"
  fi
}

conf_path() {
  local safe="${1//./_}"
  printf '%s/matedesk-custom-%s.conf' "$SITES_AVAILABLE" "$safe"
}

enabled_path() {
  local safe="${1//./_}"
  printf '%s/matedesk-custom-%s.conf' "$SITES_ENABLED" "$safe"
}

has_conflict() {
  local domain="$1"
  local ours
  ours="$(conf_path "$domain")"
  local escaped="${domain//./\\.}"
  local f
  for f in "$SITES_ENABLED"/*; do
    [[ -e "$f" ]] || continue
    local real
    real="$(readlink -f "$f" 2>/dev/null || printf '%s' "$f")"
    [[ "$real" == "$ours" ]] && continue
    if grep -Eq "server_name[[:space:]]+([^;[:space:]]+[[:space:]]+)*${escaped}([[:space:]]|;)" "$f" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

write_http_config() {
  local domain="$1"
  local conf
  conf="$(conf_path "$domain")"
  cat >"$conf" <<EOF
# MATEDESK CUSTOM DOMAIN v1
server {
    listen 80;
    listen [::]:80;
    server_name $domain;

    location /.well-known/acme-challenge/ {
        root $WEBROOT;
        try_files \$uri =404;
    }

    location / {
        return 404;
    }
}
EOF
  ln -sfn "$conf" "$(enabled_path "$domain")"
}

write_https_config() {
  local domain="$1"
  local conf
  conf="$(conf_path "$domain")"
  cat >"$conf" <<EOF
# MATEDESK CUSTOM DOMAIN v1
server {
    listen 80;
    listen [::]:80;
    server_name $domain;

    location /.well-known/acme-challenge/ {
        root $WEBROOT;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $domain;

    ssl_certificate     /etc/letsencrypt/live/$domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25M;

    proxy_hide_header Strict-Transport-Security;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    location = /platform-admin { return 404; }
    location ^~ /platform-admin/ { return 404; }
    location = /django-admin { return 404; }
    location ^~ /django-admin/ { return 404; }
    location = /admin { return 404; }
    location ^~ /admin/ { return 404; }

    location /api/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host  \$host;
        proxy_redirect off;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /static/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host              \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        add_header Cache-Control "public, max-age=2592000, immutable";
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host              \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
  ln -sfn "$conf" "$(enabled_path "$domain")"
}

provision() {
  local domain="$1"

  if [[ ! "$domain" =~ ^[a-z0-9.-]+$ ]]; then
    state "$domain" failed "Provisioner rejected an unsafe hostname."
    return
  fi

  if has_conflict "$domain"; then
    state "$domain" failed "An existing Nginx server block already owns this hostname."
    return
  fi

  state "$domain" provisioning

  local cert_file="/etc/letsencrypt/live/$domain/fullchain.pem"
  local renewal_file="/etc/letsencrypt/renewal/$domain.conf"

  # Migration fast-path: if this hostname already has a valid certificate whose
  # renewal lineage uses our established MateServer webroot, adopt it directly.
  # This avoids dropping HTTPS just to reissue a certificate during a cutover.
  if [[ -f "$cert_file" ]] \
     && openssl x509 -checkend 86400 -noout -in "$cert_file" >/dev/null 2>&1 \
     && openssl x509 -in "$cert_file" -noout -ext subjectAltName 2>/dev/null | grep -Fq "DNS:$domain" \
     && grep -Fq "webroot_path = $WEBROOT" "$renewal_file" 2>/dev/null; then
    write_https_config "$domain"
    if ! nginx -t; then
      state "$domain" failed "Nginx validation failed while adopting the existing certificate."
      return
    fi
    systemctl reload nginx
    state "$domain" active
    return
  fi

  # New hostname (or an incompatible/near-expiry existing lineage): expose only
  # the ACME path, issue/reconfigure the certificate, then enable HTTPS.
  write_http_config "$domain"

  if ! nginx -t; then
    state "$domain" failed "Nginx validation failed before certificate issuance."
    return
  fi
  systemctl reload nginx

  local cert_args=(
    certonly --webroot -w "$WEBROOT"
    --cert-name "$domain" -d "$domain"
    --non-interactive --agree-tos
  )

  if [[ -f "$cert_file" ]]; then
    if grep -Fq "webroot_path = $WEBROOT" "$renewal_file" 2>/dev/null; then
      cert_args+=(--keep-until-expiring)
    else
      # Existing cert from another deployment/webroot: bind the lineage to the
      # managed MateDesk challenge path before activating it.
      cert_args+=(--force-renewal)
    fi
  fi

  if ! certbot "${cert_args[@]}"; then
    state "$domain" failed "Let's Encrypt certificate issuance failed. Confirm DNS routing reaches MateServer."
    return
  fi

  write_https_config "$domain"
  if ! nginx -t; then
    state "$domain" failed "Nginx validation failed after certificate issuance."
    return
  fi
  systemctl reload nginx
  state "$domain" active
}

deprovision() {
  local domain="$1"
  rm -f "$(enabled_path "$domain")"
  rm -f "$(conf_path "$domain")"
  if nginx -t; then
    systemctl reload nginx
    # Certificate material is intentionally retained for rollback. It can be
    # removed later after the migration/decommission retention window.
    state "$domain" deprovisioned
  else
    state "$domain" deprovision_failed "Nginx validation failed while disabling the custom domain."
  fi
}

while IFS=$'\t' read -r lifecycle domain; do
  [[ -n "${lifecycle:-}" && -n "${domain:-}" ]] || continue
  case "$lifecycle" in
    verified|provisioning) provision "$domain" ;;
    disabled) deprovision "$domain" ;;
  esac
done < <(docker compose exec -T backend python manage.py custom_domain_sync_queue)
