# Nginx server block for matedesk.pro — MateDesk (helpdesk).
#
# Filename follows the convention already on MateServer (netamate.com,
# talkroom.club). Install as a NEW file and symlink it in; do not edit any
# existing site file — NetaMate and TalkRoom keep their own configs untouched:
#
#   scp deployment/nginx/matedesk.pro root@169.58.114.252:/etc/nginx/sites-available/matedesk.pro
#   ln -s /etc/nginx/sites-available/matedesk.pro /etc/nginx/sites-enabled/matedesk.pro
#   nginx -t && systemctl reload nginx
#
# ── TLS ───────────────────────────────────────────────────────────────────────
# Tenancy is subdomain-based (company.matedesk.pro) and in production
# IsTenantUser rejects tenant-scoped API calls made on the root domain, so the
# certificate MUST cover *.matedesk.pro. A wildcard can only be issued via
# DNS-01 — --nginx / webroot / standalone cannot do it. Issued with:
#
#   certbot certonly --dns-cloudflare \
#     --dns-cloudflare-credentials /root/.cloudflare.ini \
#     --dns-cloudflare-propagation-seconds 30 \
#     -d matedesk.pro -d '*.matedesk.pro' --cert-name matedesk.pro
#
# Renewal is unattended via the existing certbot.timer. Verify occasionally with
# `certbot renew --dry-run`.

# ── HTTP → HTTPS (apex + all tenant subdomains) ───────────────────────────────
server {
    listen      80;
    listen      [::]:80;
    server_name matedesk.pro *.matedesk.pro;

    # Let certbot answer HTTP-01 if it is ever used as a fallback.
    location /.well-known/acme-challenge/ { root /var/www/html; }

    location / { return 301 https://$host$request_uri; }
}

# ── www → apex ────────────────────────────────────────────────────────────────
# MUST be its own server block. If www is folded into the main server_name below,
# Next.js middleware strips the suffix, reads the leftover "www" as a tenant slug,
# and renders a login page for a non-existent workspace — while the Django side
# treats the same host as non-tenant and rejects every API call from it.
server {
    listen      443 ssl;
    listen      [::]:443 ssl;
    http2       on;
    server_name www.matedesk.pro;

    ssl_certificate     /etc/letsencrypt/live/matedesk.pro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/matedesk.pro/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://matedesk.pro$request_uri;
}

# ── apex + tenant subdomains ──────────────────────────────────────────────────
# Deliberately NO app.matedesk.pro. It had no handler on either side: Django
# listed it as a non-tenant host while the frontend parsed it as tenant "app",
# so it could only ever serve a login form whose API calls were refused. It also
# made "app" an unusable tenant slug.
server {
    listen      443 ssl;
    listen      [::]:443 ssl;
    http2       on;
    server_name matedesk.pro *.matedesk.pro;

    ssl_certificate     /etc/letsencrypt/live/matedesk.pro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/matedesk.pro/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers, set once at the edge.
    #
    # Django also emits HSTS when DEBUG=False, which would give proxied responses
    # the header twice. proxy_hide_header drops the upstream copy so exactly one
    # is sent, and the edge stays the single place this is configured.
    proxy_hide_header Strict-Transport-Security;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options           "SAMEORIGIN"                      always;
    add_header X-Content-Type-Options    "nosniff"                         always;
    add_header X-XSS-Protection          "1; mode=block"                   always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;

    # Ticket attachments and KB images.
    client_max_body_size 25M;

    access_log /var/log/nginx/matedesk.access.log;
    error_log  /var/log/nginx/matedesk.error.log;

    # ── Django REST API ───────────────────────────────────────────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_redirect        off;
        proxy_connect_timeout 10s;
        proxy_read_timeout    120s;
        proxy_send_timeout    120s;
    }

    # ── Platform Admin (operator console, server-rendered Django) ─────────────
    location /platform-admin/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /platform-admin { return 301 /platform-admin/; }

    # /admin → platform-admin, handled here so Next.js never sees it
    location = /admin  { return 301 /platform-admin/login/; }
    location /admin/   { return 301 /platform-admin/login/; }

    # ── Hidden Django built-in admin (emergency access only) ─────────────────
    location /django-admin/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── Static files (WhiteNoise, content-hashed → cache hard) ───────────────
    location /static/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=2592000, immutable";
        # Repeated because the add_header above suppresses inheritance from the
        # server level — nginx only inherits when the location declares none.
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header X-Frame-Options           "SAMEORIGIN"                      always;
        add_header X-Content-Type-Options    "nosniff"                         always;
        add_header X-XSS-Protection          "1; mode=block"                   always;
        add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
        access_log off;
    }

    # ── Media uploads ────────────────────────────────────────────────────────
    # In production Django does not register the raw /media/ route; attachments
    # are served through the authenticated, tenant-scoped /api/files/<id>/
    # endpoint. This block exists only for anything WhiteNoise still hands back.
    location /media/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── WebSocket — live chat + notifications ────────────────────────────────
    location /ws/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # ── Health check (host + monitoring only) ────────────────────────────────
    location = /api/health/ {
        proxy_pass http://127.0.0.1:8005;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        access_log off;
    }

    # ── Next.js frontend ─────────────────────────────────────────────────────
    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
