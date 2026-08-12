# Deployment Runbook

Operations reference for MateDesk in production. Read the **Shared infrastructure** warning
before touching anything on the server.

---

## Facts

| | |
|---|---|
| Host | `MateServer` — Ubuntu 26.04, 6 cores, 11 GB RAM, 193 GB disk |
| IP | `169.58.114.252` |
| Directory | `/opt/MateDesk` — holds only `docker-compose.yml` and `.env` (no source checkout) |
| Domain | `matedesk.pro` — registrar Namecheap, DNS at Cloudflare |
| Registry | `ghcr.io/rizwansammo/matedesk-backend`, `…/matedesk-frontend` |
| Repo | `rizwansammo/MateDesk` (private) |

## ⚠️ Shared infrastructure — do not break the neighbours

This box also runs **NetaMate** and **TalkRoom**. They share the host's nginx and Docker
daemon. Three specific hazards:

**1. Port map — check before binding anything.**

| Port | Bound to | Owner |
|---|---|---|
| 80, 443 | `0.0.0.0` | **nginx — shared by all three apps** |
| 8005 | `127.0.0.1` | MateDesk backend |
| 3005 | `127.0.0.1` | MateDesk frontend |
| 8001 | `127.0.0.1` | **NetaMate** |
| 4000 | `0.0.0.0` | **TalkRoom** (`network_mode: host`) |
| 5432 | `127.0.0.1` | host PostgreSQL 18 — **not MateDesk's** |
| 6379 | `127.0.0.1` | host Redis — **not MateDesk's** |

MateDesk runs its **own** Postgres and Redis containers with no host ports. Do not point it
at the host instances.

**2. nginx is shared.** Only ever touch `/etc/nginx/sites-available/matedesk.pro`. Always
`nginx -t` before `systemctl reload nginx` — a bad config takes down all three sites. After
any reload, verify all three:

```bash
for h in netamate.com talkroom.club matedesk.pro; do
  printf "%-16s %s\n" "$h" "$(curl -sk -o /dev/null -w %{http_code} --resolve $h:443:127.0.0.1 https://$h/)"
done
```

**3. The Docker registry credential is not ours.** `/root/.docker/config.json` is logged
into GHCR as a **different account** which has read access to the other apps' images but
not MateDesk's. **Do not repoint it** — that would break their deploys. MateDesk uses an
isolated config instead:

```
/root/.docker/            → other apps' account   ← never modify
/root/.docker-matedesk/   → MateDesk only         ← created per-deploy by CI
```

For a manual pull, authenticate into the isolated config:

```bash
export DOCKER_CONFIG=/root/.docker-matedesk
echo "<a PAT with read:packages>" | docker login ghcr.io -u rizwansammo --password-stdin
cd /opt/MateDesk && docker compose pull
```

## Deploying

Push to `main`. That is the whole procedure.

```
push → Actions builds both images (cached) → pushes :latest and :<sha> to GHCR
     → SSHes to the box → docker compose pull → up -d → health gate → prune
```

Typical deploy is **~26 seconds** after the ~6 minute build. The workflow authenticates to
GHCR on the server with the run's ephemeral `GITHUB_TOKEN` (which can read the images
because pushing from this repo auto-links the packages), then deletes that credential.

Watch a run:

```bash
gh run watch --repo rizwansammo/MateDesk --exit-status
```

### Migrations run automatically

`backend/entrypoint.sh` runs `migrate --noinput` and `collectstatic` before starting
Gunicorn. No manual step. Verify:

```bash
cd /opt/MateDesk && docker compose exec -T backend python manage.py showmigrations --plan | grep -c '^\[ \]'   # want 0
```

### Rolling back

Images are tagged with the commit SHA, so rollback needs no rebuild:

```bash
cd /opt/MateDesk
export MATEDESK_BACKEND_IMAGE=ghcr.io/rizwansammo/matedesk-backend:<old-sha>
export MATEDESK_FRONTEND_IMAGE=ghcr.io/rizwansammo/matedesk-frontend:<old-sha>
docker compose up -d
```

To make it stick across restarts, put those two lines in `/opt/MateDesk/.env` instead.

> Rollback does **not** reverse database migrations. If the bad release migrated the schema,
> reverting the image may not be enough. Check what it applied first.

## TLS

Wildcard certificate covering `matedesk.pro` **and** `*.matedesk.pro`, required because
tenancy is subdomain-based (see `ARCHITECTURE.md`).

| | |
|---|---|
| Authenticator | `dns-cloudflare` (DNS-01 — the only method that can issue wildcards) |
| Credential | `/root/.cloudflare.ini`, chmod 600 |
| Renewal | unattended via the existing `certbot.timer` |
| Cert path | `/etc/letsencrypt/live/matedesk.pro/` |

### 🔴 Deleting `/root/.cloudflare.ini` silently breaks renewal

Nothing fails immediately. Roughly 90 days later the certificate expires and **every tenant
loses HTTPS at once**. If you rotate the Cloudflare token, update that file.

Check renewal health — do this occasionally, it covers all three certs on the box:

```bash
certbot renew --dry-run
```

Re-issue by hand if ever needed:

```bash
certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  -d matedesk.pro -d '*.matedesk.pro' --cert-name matedesk.pro
```

## DNS

Cloudflare nameservers (`jade`/`merlin.ns.cloudflare.com`), Namecheap remains registrar.

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | `169.58.114.252` | **DNS only** |
| A | `www` | `169.58.114.252` | **DNS only** |
| A | `*` | `169.58.114.252` | **DNS only** |

Plus the inherited MX and SPF records for Namecheap email forwarding — leave those alone.

**Records are deliberately grey-cloud (unproxied).** Turning on the orange cloud makes
Cloudflare terminate TLS and rewrite client IPs in front of nginx, which changes the
`Host` and `X-Forwarded-*` handling that tenant resolution and `SECURE_PROXY_SSL_HEADER`
depend on. If you ever enable it, re-test tenant subdomain login and WebSocket chat first.

There is deliberately **no `app.matedesk.pro`** — see `DECISIONS.md`.

## Secrets

| Secret | Location |
|---|---|
| `SECRET_KEY`, `JWT_SECRET_KEY`, `POSTGRES_PASSWORD`, host config | `/opt/MateDesk/.env` (chmod 600) |
| Cloudflare API token | `/root/.cloudflare.ini` (chmod 600) |
| Deploy SSH key (public) | `/root/.ssh/authorized_keys`, comment `github-actions-matedesk-deploy` |
| Deploy SSH key (private) | GitHub secret `VPS_SSH_KEY` — only copy |
| `VPS_HOST`, `VPS_USER`, `VPS_PATH` | GitHub repo secrets |

Rotating the DB password means updating **both** `POSTGRES_PASSWORD` and the password inside
`DATABASE_URL` in the same file, then `docker compose up -d`.

## Common operations

```bash
cd /opt/MateDesk

docker compose ps                            # status
docker compose logs -f --tail=100 backend    # follow logs
docker compose restart backend               # restart one service
docker compose exec backend python manage.py shell
docker compose exec postgres psql -U matedesk -d matedesk

# health — the Host header is REQUIRED, see Troubleshooting
curl -H "Host: matedesk.pro" http://127.0.0.1:8005/api/health/
```

### Creating a tenant and its owner

```python
# docker compose exec backend python manage.py shell
from apps.tenants.models import Tenant
from apps.users.models import User

t = Tenant.objects.create(name='Acme MSP', slug='acme', plan='professional',
                          status='active', billing_status='paid', is_active=True)
u = User.objects.create_user(email='owner@acme.com', password='<temp>',
                            first_name='Acme', last_name='Owner',
                            role='msp_owner', tenant=t)
```

The workspace is then live at `https://acme.matedesk.pro` — no DNS or nginx change needed,
the wildcard covers it.

### Creating a platform admin

```python
u = User.objects.create_user(email='admin@example.com', password='<temp>',
                            first_name='Ops', last_name='Admin', role='msp_owner',
                            tenant=None, is_staff=True, is_superuser=True)
```

`tenant=None` **and** `is_staff=True` are both required — that pair is what
`PlatformAdminBackend` matches on.

## Troubleshooting

**Deploy fails with `error from registry: denied`**
The shared `/root/.docker/config.json` belongs to another account with no access to
MateDesk's packages. The workflow works around this with an isolated `DOCKER_CONFIG`; if you
hit this manually, see *Shared infrastructure* above. Do not repoint the shared credential.

**Health check returns HTTP 400**
Django's `DisallowedHost`. `ALLOWED_HOSTS` intentionally lists only real public hostnames,
so a bare `curl 127.0.0.1` is rejected. Send the real header:
`curl -H "Host: matedesk.pro" …`. Do not "fix" this by adding `127.0.0.1` to
`ALLOWED_HOSTS` — the probe should exercise the same path nginx does.

**Tenant subdomain shows a login page but every API call fails**
The hostname resolved to no tenant while the frontend parsed a slug from it. Check the label
is a real active `Tenant.slug`, and that it is not accidentally listed in `NON_TENANT_HOSTS`.

**A tenant subdomain gives a TLS warning**
The wildcard cert expired or was replaced by a non-wildcard one. Check
`openssl s_client -connect matedesk.pro:443 | openssl x509 -noout -ext subjectAltName` —
it must list `DNS:*.matedesk.pro`.

**WebSocket chat silently does nothing**
Confirm nginx still proxies `/ws/` with the `Upgrade`/`Connection` headers and a long
`proxy_read_timeout`, and that the backend is on `CHANNEL_LAYER_BACKEND=redis`. Note
`core/asgi.py` deliberately does not swallow Channels import errors — if it were broken, the
container would fail to boot rather than serve HTTP-only.

**`docker compose config` errors about a missing variable**
`/opt/MateDesk/.env` is incomplete. `POSTGRES_PASSWORD` uses `:?` so compose refuses to run
without it, on purpose.

## 🔴 Known gaps

1. **No database backups.** `deployment/scripts/backup.sh` exists but is neither on the box
   nor in cron — and no other app on this host has backups either. Highest-priority gap.
2. **No monitoring or uptime checks.** Nothing alerts if the site goes down or a cert lapses.
3. **Email ingestion unconfigured** — mailbox credentials are set per tenant in the app UI.
4. **Test coverage does not reach billing, SLA or automation** — a silent bug there costs
   money or breaks a customer commitment.
5. **Theme defects are live** — 64 confirmed, 5 critical. See `THEME_AUDIT.md`.
