# Architecture

Describes MateDesk as actually deployed, not as originally planned.

---

## 1. Tenancy — the central idea

Every MSP is a **Tenant**, identified by a slug that becomes its subdomain:

```
matedesk.pro                  public marketing site, login, register
netamate.matedesk.pro         the NetaMate workspace
someothermsp.matedesk.pro     a different workspace, fully isolated
```

Each tenant owns **ClientOrganizations** (the MSP's customers), **Users**, tickets, SLA
policies, KB articles and so on. Nothing is shared between tenants.

### How a tenant is resolved

`core/middleware/tenant.py` runs on every request:

1. Strip the port from `request.get_host()`
2. If the host is in `NON_TENANT_HOSTS` (`matedesk.pro`, `www.matedesk.pro`) →
   `request.tenant = None`, treat as the public site
3. Otherwise take the first label as a slug and look up an active `Tenant`
4. Failure → `request.tenant = None`

### Why a wildcard TLS certificate is mandatory

`IsTenantUser` (in `apps/users/permissions.py`) enforces two things:

- The JWT's `tenant_id` must match the tenant resolved from the hostname — so a token
  stolen from one workspace **cannot be replayed against another**
- In production (`DEBUG=False`), a request with **no** resolved tenant is rejected outright:
  *"Tenant workspace required. Access this API via your tenant subdomain."*

So tenant-scoped API calls only work on `{slug}.matedesk.pro`, which means every tenant
subdomain must be covered by TLS. A wildcard cert is not a convenience here — without it
the product does not function. See `DEPLOYMENT.md`.

## 2. Request flow in production

```
                         ┌──────────────────────────────┐
   browser ── 443 ──────▶│  nginx  (host, shared with    │
                         │  NetaMate + TalkRoom)         │
                         └──────────┬───────────────────┘
                                    │
        ┌───────────────────────────┼────────────────────────────┐
        │ /api/  /platform-admin/   │  /ws/  /static/  /media/   │  everything else
        ▼                           ▼                            ▼
  127.0.0.1:8005                                          127.0.0.1:3005
  Django (Gunicorn + UvicornWorker)                       Next.js
        │                                                        │
        ├── postgres:5432 ──┐   internal bridge network,         │
        └── redis:6379   ───┤   no host ports published          │
                            │                                    │
          celery worker ────┤                                    │
          celery beat   ────┘                                    │
```

nginx terminates TLS and is the only publicly bound service. Both app containers listen on
loopback only. Postgres and Redis have **no host port at all** — they are reachable solely
from the app containers over the compose network.

### Why one ASGI server, not WSGI

Chat is WebSocket-only, so `core/asgi.py` wraps the Django app in a Channels
`ProtocolTypeRouter` and `entrypoint.sh` runs Gunicorn with `uvicorn.workers.UvicornWorker`.
HTTP and WebSocket traffic share the same process pool and the same port.

The Channels imports in `asgi.py` are deliberately **not** wrapped in `try/except`. See
`DECISIONS.md` — a failure there must crash at boot rather than silently serving HTTP-only
with chat permanently dead.

## 3. Authentication — two separate systems

The `User` model serves both, distinguished by whether `tenant` is set.

| | Tenant users | Platform admins |
|---|---|---|
| Identified by | `tenant=<Tenant>` + a role | `tenant=None`, `is_staff=True` |
| Backend | `TenantBackend` | `PlatformAdminBackend` |
| Credential flow | JWT (access 1h, refresh 7d, rotated + blacklisted) | Django session |
| Entry point | `{slug}.matedesk.pro/login` | `matedesk.pro/platform-admin/login/` |
| Scope | one workspace | all tenants |

`PlatformAdminBackend` refuses to activate when `request.tenant` is set, so a platform
admin cannot be authenticated through a tenant subdomain. Email uniqueness is per-tenant,
which is why `auth.E003` is silenced in settings — Django's global-uniqueness check does
not apply, and its built-in `authenticate()` is never used for tenant logins.

### Token refresh

`frontend/src/lib/api.ts` retries once on a 401 after silently refreshing. A promise lock
deduplicates concurrent refreshes, which matters because `ROTATE_REFRESH_TOKENS` plus
`BLACKLIST_AFTER_ROTATION` means a second caller using the old refresh token would be
rejected. Successful refreshes are written back into the Zustand store so its `persist`
middleware cannot overwrite them with stale values.

## 4. Backend apps

| App | Responsibility |
|---|---|
| `tenants` | `Tenant`, `ClientOrganization`, branding, business hours |
| `users` | custom user model, five roles, DRF permission classes, TOTP + email 2FA |
| `tickets` | tickets, replies, internal notes, attachments, notifications, time logs, support groups, merge |
| `sla` | policies, per-priority targets, VIP rules, breach evaluation |
| `automation` | rule engine, condition/action registry, prebuilt templates |
| `email_ingestion` | IMAP/OAuth2 polling, email-to-ticket, reply parsing, Fernet-encrypted credentials |
| `kb` | articles, folders, versions, tags |
| `canned` | canned responses |
| `billing` | rates, invoices, ReportLab PDF generation |
| `chat` | WebSocket consumers, routing, JWT auth over the socket |
| `events` | activity and notification feed |
| `productivity` | agent metrics |
| `platform_admin` | operator console — server-rendered Django templates, not the API |

`platform_admin` is intentionally not part of the REST API. It renders its own templates
and uses session auth, so an API token can never reach cross-tenant operator functions.

## 5. Scheduled work

Celery beat, defined in `core/settings.py`:

| Task | Schedule |
|---|---|
| `automation.tasks.run_overdue_ticket_rules` | every 5 minutes |
| `automation.tasks.run_stale_ticket_rules` | every 15 minutes |
| `email_ingestion.tasks.poll_all_tenant_mailboxes` | every 30 seconds |

Worker and beat run as separate containers from the same image. Both share the media volume
with the backend so attachments written by either are visible to the other.

## 6. Frontend

Next.js App Router, two route groups:

- **`(public)`** — marketing site, pricing, login, register. Served on the apex.
- **`(dashboard)`** — the application. Served on tenant subdomains.

`src/middleware.ts` runs at the edge and enforces the host model: apex versus tenant
subdomain, redirecting authenticated users to their own workspace and unauthenticated ones
to the right login page. It also handles the cross-domain token handoff at
`/auth-callback`, which must pass through before cookies exist.

Data fetching is TanStack Query, one hook module per domain (`useTickets`, `useSLA`,
`useBilling`, …), all going through `lib/api.ts`.

### Styling — a known weakness

The UI is built almost entirely from **inline `style` props**, not Tailwind classes or a
component library. Consequences:

- ~1,087 hardcoded hex colours and ~769 `rgba()` literals bypass the design tokens
- Only about 47% of colour decisions go through a `var(--token)`
- 6 of the 7 files in `components/ui/` were dead code and have been removed; only
  `tooltip.tsx` was ever imported

This is the root cause of the theming defects catalogued in `THEME_AUDIT.md`. Theme tokens
are defined in `globals.css` — dark on bare `:root`, light overrides under
`[data-theme="light"]` — with `next-themes` driving the attribute.

## 7. Data model highlights

```
Tenant ──┬── ClientOrganization ──┬── User (client_owner, end_user)
         │                        └── Ticket
         ├── User (msp_owner, msp_manager, msp_agent)
         ├── SLAPolicy ── SLATarget
         ├── AutomationRule
         ├── EmailAccount, KnownSender, ProcessedEmail
         ├── KBArticle ── KBArticleVersion
         ├── Rate, Invoice
         └── SupportGroup
```

All primary keys are UUIDs. Every tenant-owned model carries a `tenant` FK and querysets
are filtered by it.

Three columns on `Tenant` — `mateconnect_enabled`, `branding_mc_logo`, `max_devices` — are
inert leftovers from the RMM product. Nothing reads or exposes them. See `DECISIONS.md`.

## 8. Security posture

- TLS terminated at nginx; HSTS set once at the edge with the upstream copy stripped
- Tenant-scoped JWT validation prevents cross-workspace token replay
- Refresh token rotation with blacklisting
- Email account credentials encrypted at rest (Fernet, `email_ingestion/crypto.py`)
- TOTP and email-OTP 2FA for platform admins
- `/media/` is **not** served raw in production; attachments go through the authenticated,
  tenant-scoped `/api/files/<id>/` endpoint
- Throttling deliberately avoids a global `AnonRateThrottle` — a whole office shares one
  NAT egress IP, so anonymous IP-based throttling would lock out real users. Login,
  register, password reset and staff creation carry their own scoped throttles.
- Production hardening (secure cookies, HSTS, nosniff) activates on `DEBUG=False`

### Not yet addressed

No penetration test, no dependency audit, no load testing. Test coverage does not reach
billing, SLA evaluation, the automation engine or email parsing — the areas where a silent
bug costs money or breaks a customer commitment.
