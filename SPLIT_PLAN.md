# MateDesk / MateConnect — Split Plan

Source of truth for the product split. **Read this file first in every session.**
Do not re-read `PROJECT_STATUS.md` (100KB), `DECISIONS.md` (43KB), `ARCHITECTURE.md` (37KB),
`package-lock.json`, or `Cargo.lock` in a working session — everything needed is here.

---

## Ground rules

1. **`Desktop/MateDesk-Pro` is FROZEN. Never write to it.** Reads only.
   It stays live in production and is the rollback target + the reference for
   visual diffing. Every fix goes into the new projects instead.
2. `Desktop/MateDesk` — new standalone helpdesk. **Active now.**
3. `Desktop/MateConnect` — new standalone RMM. **Later track, not started.**
4. One phase = one session = one commit. The repo must build at every phase boundary.
5. Copy files at the shell (`cp`/`git mv`), then edit only the specific lines.
   Never read-and-rewrite large files (`rmm/views.py` is 3,786 lines).

---

## Product decisions (locked)

| Decision | Choice |
|---|---|
| Identity / data | **Separate databases.** No shared kernel package, no runtime coupling. |
| Cross-product data | MateConnect gets an **"Import from MateDesk"** feature, built on the MateConnect track. One-way, point-in-time. |
| Build order | **MateDesk first** (owns the kernel natively), MateConnect second. |
| Migration history | **Keep as-is.** Do not squash. Keeps eventual production cutover close to a no-op. |
| Dormant Tenant columns | `mateconnect_enabled`, `branding_mc_logo`, `max_devices` **stay in the DB** (unused, unexposed). Dropping them needs a schema migration that would break the point above. Remove in a dedicated migration after cutover. |
| Future import IDs | **Preserve UUID primary keys.** Do not regenerate on import — keeps device↔ticket cross-reference possible later. |

---

## Phase plan

### MateDesk track (current)

| Phase | Scope | Exit criterion | Status |
|---|---|---|---|
| M1 | Backend: copy all apps except `rmm`; remove every RMM reference; fixes #3a, #5 | `check` + `migrate` clean, `tests_rbac.py` passes | see PROGRESS.md |
| M2 | Frontend: copy minus `mateconnect/`; remove `useRMM`, `types/rmm`, MC chrome; fix #2 | `next build` clean, all helpdesk routes render | not started |
| M3 | Infra: compose, nginx, env; fixes #1, #4 | full stack up locally | not started |
| M4 | Docs split, stale `NEXT_PHASE.md`, README/branding | clean repo | not started |

### MateConnect track (later)

Re-plan when started. Roughly: backend + kernel copy → frontend shell → route re-root →
agent & release pipeline → infra → **import-from-MateDesk feature**.

### Cutover track (later)

Data migration dry run → agent continuity bridge → production cutover.

---

## ⚠ Handoff rule for the MateConnect track

When MateConnect starts, copy its kernel (`tenants`, `users`, `core`) from
**`Desktop/MateDesk`**, NOT from `MateDesk-Pro` — otherwise it re-inherits every
bug in the ledger below.

---

## Fix ledger

Bugs found in MateDesk-Pro. Never fixed there; each lands in a new project at the phase shown.

| # | Bug | File | Lands in | Status |
|---|---|---|---|---|
| 1 | pgAdmin published on `0.0.0.0:5050` while every other service is loopback-only | `docker-compose.yml` | M3 + MC infra | **also a LIVE prod exposure — check `ufw` on the VPS independently** |
| 2 | Token-refresh retry path calls `.json()` with no 204/205 guard; 14 `apiFetch<void>` DELETEs can hit it. Same shape in `apiFetchBlob`. | `frontend/src/lib/api.ts:162`, `:218` | M2 | pending |
| 3a | `asgi.py` swallows channels import errors → silent HTTP-only fallback, no log | `backend/core/asgi.py` | M1 | **done** |
| 3b | `_emit_shell_event` silently no-ops when channels is None | `apps/rmm/views.py` | MateConnect track | pending |
| 4 | `location /static/` defines `add_header`, so it inherits none — drops HSTS, X-Frame-Options, nosniff, XSS, Referrer-Policy | `deployment/nginx/matedesk.conf` | M3 + MC infra | pending |
| 5 | `CELERY_RESULT_BACKEND` read from `CELERY_BROKER_URL`, so setting it in `.env` was silently ignored | `backend/core/settings.py` | M1 | **done** |
| 6 | `users/0008_fix_2fa_fields.py` uses Postgres-only DDL (`ADD COLUMN IF NOT EXISTS`). **SQLite dev fallback advertised in `settings.py` cannot migrate at all.** Confirmed both ways: fails on SQLite, applies clean on Postgres. | `apps/users/migrations/0008_fix_2fa_fields.py` | **open decision** | pending |
| 7 | Model/migration drift: `makemigrations --check` failed, wanting `0010_alter_user_role` (leftover from `0006_remove_vip_manager_role` changing `ROLE_CHOICES` with no follow-up `AlterField`) | `apps/users/` | M1 | **done** |
| — | minor: `middleware.ts` skips auth for any path containing `.`; `PUBLIC_ROUTES` lists non-existent `/features`, `/about`, `/contact` | `frontend/src/middleware.ts` | M2 | pending |

**#7 resolved.** Generated `users/0010_alter_user_role.py`. Verified with `sqlmigrate`:
it emits `-- (no-op)` on Postgres — a pure state-only migration, so applying it to the
production DB at cutover only writes a `django_migrations` row. Zero schema risk.
`makemigrations --check` now exits 0, so CI can gate on it.

**#6 is still an open decision.** It pre-dates the split (verified: `apps/users` was
byte-identical to the frozen source before this phase). Fixing it means editing migration
history, which trades against "keep migrations as-is so cutover is a no-op" — a
backend-conditional `RunSQL` would keep Postgres behaviour byte-identical while
unblocking SQLite dev. Until it is fixed, **Postgres is required to run this project at all.**

---

## What goes where

| Path | MateDesk | MateConnect |
|---|---|---|
| `backend/apps/rmm/` | ✗ | ✓ |
| `backend/apps/{tenants,users,tickets,kb,sla,billing,automation,chat,canned,events,email_ingestion,productivity,platform_admin}` | ✓ | kernel subset only (`tenants`, `users`) |
| `backend/core/` | ✓ | ✓ (own copy) |
| `frontend/src/app/mateconnect/`, `components/mateconnect/`, `hooks/useRMM.ts`, `types/rmm.ts`, `components/MCSplashScreen.tsx`, `public/monogram-mateconnect.svg` | ✗ | ✓ |
| `agents/`, `docker-compose.remote.yml`, `deployment/REMOTE_RUSTDESK_SETUP.md`, `deploy-remote.sh` | ✗ | ✓ |
| `.github/workflows/{build-agent,sign-agent-update-manifest}.yml` | ✗ | ✓ |
| `frontend/src/app/globals.css` token block, `public/fonts/`, `tailwind.config.ts` | ✓ | ✓ (must copy — MC styling resolves through MateDesk CSS vars) |

---

## UI parity requirement (MateConnect track)

MateConnect must look **pixel-identical** to today. It is ~99.8% inline styles
(1,071 `style=` vs 2 `className=`), so this is a copy job. Must travel together:

- `globals.css` token block (dark `:root` + `[data-theme="light"]`), scrollbar rules, `::selection`
- Fonts — declared via `next/font` in `layout.tsx`, not CSS: Inter, JetBrains Mono (`--font-mono`),
  Saira, and local `HemiHead-Bold.otf` (`--font-hemi`). *Confirm the HemiHead licence covers a second product.*
- `mc-utils.ts` verbatim — carries MC's accent `#2563eb`/`#60a5fa` and semantics
- `next-themes` config: `attribute="data-theme"`, `defaultTheme="dark"`, `enableSystem={false}`
- `tailwind.config.ts` (for `--radius: 0rem` sharp-corner language), plus audit the 2 stray `className=` uses

Verify by side-by-side screenshot diff of all 21 routes, dark + light, against frozen MateDesk-Pro.
