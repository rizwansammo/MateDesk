# MateDesk

Multi-tenant helpdesk platform for managed service providers. Each MSP gets an isolated
workspace on its own subdomain, manages its client organizations, and handles support
requests from email, chat, or the portal.

**Live:** https://matedesk.pro · **Operator console:** https://matedesk.pro/platform-admin/

---

## What it does

| Area | Capability |
|---|---|
| Tickets | Threaded requests, internal notes, attachments, time logging, merge/absorb, support groups |
| SLA | Policies, per-priority targets, VIP rules, breach tracking and notification |
| Automation | Rule engine with prebuilt templates, plus scheduled overdue/stale sweeps |
| Email | IMAP and OAuth2 mailbox polling, email-to-ticket, reply parsing, encrypted credentials |
| Knowledge base | Articles, folders, versioning, tags, rich editor with slash commands |
| Billing | Rates, invoice generation, PDF export |
| Chat | WebSocket messaging between agents and client users |
| Multi-tenancy | Subdomain-isolated workspaces, five-role RBAC, per-tenant branding |
| Operations | Platform-admin console for tenants, plans, subscriptions, audit log, 2FA |

Roles: `msp_owner`, `msp_manager`, `msp_agent`, `client_owner`, `end_user`.

## Stack

- **Backend** — Django 5.2 · DRF · SimpleJWT (rotation + blacklist) · Channels over ASGI · Celery
- **Frontend** — Next.js 15 (App Router) · React 19 · TanStack Query · Zustand · Tailwind
- **Data** — PostgreSQL 16 · Redis (channel layer + Celery broker)
- **Serving** — Gunicorn with Uvicorn workers · WhiteNoise for static · nginx at the edge
- **Delivery** — GitHub Actions → GHCR → Docker Compose on a VPS

## Repository layout

```
backend/            Django project
  core/             settings, ASGI/WSGI, tenant middleware, Celery app
  apps/
    tenants/        Tenant, ClientOrganization, branding
    users/          custom user model, roles, permissions, 2FA
    tickets/        tickets, replies, attachments, notifications, time logs
    sla/            policies, targets, breach evaluation
    automation/     rule engine, templates, scheduled tasks
    email_ingestion/  mailbox polling, email-to-ticket, credential encryption
    kb/             knowledge base articles, folders, versions
    canned/         canned responses
    billing/        rates, invoices, PDF
    chat/           WebSocket consumers and routing
    events/         activity and notification feed
    productivity/   agent metrics
    platform_admin/ operator console (server-rendered)
frontend/           Next.js app
  src/app/          routes — (public) marketing, (dashboard) app
  src/components/   UI, layout, charts, editor
  src/hooks/        TanStack Query hooks per domain
  src/lib/api.ts    fetch wrapper with silent token refresh
deployment/
  nginx/matedesk.pro     production server block
  scripts/               deploy and backup helpers
.github/workflows/       build → GHCR → deploy
```

## Local development

Requires **Python 3.12** (not 3.14) and **PostgreSQL** — see the note below.

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
cp .env.example .env                                           # then fill in values
.venv/Scripts/python.exe manage.py migrate
.venv/Scripts/python.exe manage.py runserver

# Frontend
cd frontend
npm ci
npm run dev
```

> **PostgreSQL is required.** `settings.py` advertises a SQLite fallback, but
> `users/0008_fix_2fa_fields.py` uses Postgres-only DDL (`ADD COLUMN IF NOT EXISTS`),
> so migrations cannot run on SQLite. A throwaway database is enough:
> ```bash
> docker run -d --name md-dev -e POSTGRES_PASSWORD=devpass \
>   -e POSTGRES_USER=matedesk -e POSTGRES_DB=matedesk -p 5433:5432 postgres:16-alpine
> # DATABASE_URL=postgresql://matedesk:devpass@localhost:5433/matedesk
> ```

### Tenancy in development

Tenant resolution reads the request subdomain. With `NEXT_PUBLIC_APP_DOMAIN` unset or set
to `localhost`, the frontend middleware runs in dev mode and skips subdomain enforcement,
and `IsTenantUser` allows a missing tenant when `DEBUG=True`. To exercise real tenancy
locally, use `*.localhost` hostnames — `acme.localhost:3000` resolves without hosts-file
edits in modern browsers.

## Tests

```bash
cd backend && .venv/Scripts/python.exe manage.py test
```

16 tests, all RBAC and tenant isolation. Coverage is thin — billing, SLA evaluation, the
automation engine and email parsing have none. See `docs/DECISIONS.md`.

## Documentation

| File | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | How the system fits together and what runs in production |
| `docs/DEPLOYMENT.md` | Operations runbook — deploy, roll back, TLS, troubleshooting |
| `docs/DECISIONS.md` | Design decisions in force, with rationale |
| `docs/THEME_AUDIT.md` | Audit of 64 dark/light theming defects, with a fix plan |
| `docs/SPLIT_PLAN.md` | The MateDesk / MateConnect product split |
| `docs/PROGRESS.md` | Phase-by-phase log of that split |

## Related

MateDesk was separated from a combined codebase that also contained **MateConnect**, an RMM
product. MateConnect is now a separate product with its own repository, domain and
deployment; nothing in this repository depends on it. Pre-split history lives in the
archived `MateDesk-Pro` repository.
