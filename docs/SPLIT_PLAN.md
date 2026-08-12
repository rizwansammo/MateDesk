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
| M1 | Backend: copy all apps except `rmm`; remove every RMM reference; fixes #3a, #5, #7 | `check` + `migrate` clean, tests pass | **complete** |
| M2 | Frontend: **carve only.** Copy minus `mateconnect/`; remove `useRMM`, `types/rmm`, MC chrome; drop 3 dead files; fix #2 + `middleware.ts` minors | `next build` + `tsc` clean; **visual parity with frozen source** | next |
| M3 | Infra: compose, nginx, env; fixes #1, #4 | full stack up locally | not started |
| M4 | Docs split, stale `NEXT_PHASE.md`, README | clean repo | not started |
| M5 | **Theme remediation + branding/naming sweep.** All 64 theme defects per `THEME_AUDIT.md`, plus the `MATEDESKPRO` → `MATEDESK` map | AA contrast in both modes; branding greps clean | not started |
| M6 | **Hygiene.** Tests for billing / SLA / automation / email ingestion + ticket state transitions; `makemigrations --check` in CI; fix ledger #6 (SQLite dev fallback); coverage gate | suite covers money + SLA logic; CI gates drift | not started |
| M7 | **Post-cutover only.** Component layer to replace ~1,850 inline styles | reusable primitives; theme fixable in one place | not started |

**Features are explicitly out of scope for M2–M7** — product owner's call, not an
engineering phase. Realistic ceilings for the remaining work: hygiene 5→9,
frontend 4→8 (→9 after M7), backend 8→9. Backend cannot reach 10 without a pentest,
dependency audit and load testing, none of which are code changes.

### Why M2 and M5 are separate (do not merge them)

M2's exit criterion is **visual parity with the frozen source**. That diff is the only
reliable proof the carve did not break something subtle across ~150 files. Theme fixes
deliberately change pixels, so doing both in one pass makes every difference "expected"
and destroys the ability to bisect a regression.

**Parity in M2 means the theme bugs are still present and identical to the frozen source.**
That is correct and intended — "equally broken" is the right baseline. M5 then fixes them
deliberately, against a known-good starting point.

One exception, folded into M2: deleting the MateConnect sidebar launcher
(`MainSidebar.tsx:184/204/213`) is carve work, not repair work — and it removes 3
accent-on-tint theme defects for free (this is step 10 of the `THEME_AUDIT.md` plan).

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

## 🔴 CRITICAL BRANDING RULE — product name is `MateDesk`, never `MateDeskPro`

The product name is **strictly `MateDesk`** (wordmark: `MATEDESK`). Every `MateDeskPro`,
`MateDesk Pro`, `MATEDESKPRO`, `matedesk-pro`, and `matedesk_pro` form is legacy and must go.

Applied in **M4** (the docs/branding/naming phase — this is what the original 12-phase
plan called "Phase 12").

### ⚠ DO NOT TOUCH — three false positives that a careless sweep will break

Never run a blind find/replace on `matedesk.pro`, `matedesk-pro`, or `Pro`:

| Looks like the product name | Actually is | Breaks if renamed |
|---|---|---|
| `matedesk.pro` | **the domain** (matedesk **dot** pro) | nginx `server_name`, TLS cert paths, `ALLOWED_HOSTS`, `NON_TENANT_HOSTS`, `APP_DOMAIN`, CORS/CSRF origins, cookie domains, tenant subdomain routing, `downloads.matedesk.pro` |
| `PricingCards.tsx:25` → `name: 'Pro'` | a **pricing tier** (Starter/Pro/Enterprise) | public pricing page and plan mapping |
| `platform_admin/migrations/0002_*.py` → `default='MateDesk Pro'` | **migration history** | never edit applied migrations; `0006_matedesk_brand_defaults.py` already rewrites this value at the data layer |

### Already correct — verify, don't change

| Location | Current state |
|---|---|
| `frontend/src/components/BrandLogo.tsx` | renders `Mate` + `Desk`, `textTransform: uppercase` → **`MATEDESK`** ✓ |
| `frontend/src/app/layout.tsx:36-38` | `title.default: 'MateDesk'`, template `'%s │ MateDesk'` ✓ |
| `(public)/_components/Footer.tsx` | no product name; only "NetaMate Solutions" ✓ |
| `platform_admin/models.py` | `platform_name='MateDesk'`, `build_info='MateDesk v2.0 …'` ✓ |
| `docker-compose.yml` | `POSTGRES_DB: matedesk` ✓ |

### Must change — the actual M4 work list

| # | File | Line | Current | Target |
|---|---|---|---|---|
| 1 | `platform_admin/templates/platform_admin/tenants/detail.html` | 565 | `MateDesk<span…>Pro</span>` in `#md-preview-text` | `MateDesk` (drop the `Pro` span) |
| 2 | same file | 839 | JS fallback `'MateDesk<span…>Pro</span>'` | `'MateDesk'` |
| 3 | `backend/.env.example` | 8 | `…/matedesk_pro` | `…/matedesk` |
| 4 | `frontend/package.json` | 2 | `"matedesk-pro-frontend"` | `"matedesk-frontend"` |
| 5 | `deployment/nginx/matedesk.conf` | 1 | `# MateDesk Pro — Nginx configuration` | `# MateDesk — …` |
| 6 | `deployment/scripts/deploy.sh` | 2, 13 | `MateDesk Pro — Production deploy` / log banner | `MateDesk — …` |
| 7 | `deployment/scripts/backup.sh` | 2 | `MateDesk Pro — Database + media backup` | `MateDesk — …` |
| 8 | root docs | — | `MateDesk Pro` throughout | `MateDesk` |

**#1 and #2 are the real live defect.** The platform-admin branding preview renders
`MATEDESKPRO` while the actual app renders `MATEDESK` — the admin panel lies about the
wordmark. The same file's placeholder on line 596 already reads `(MATEDESK)`, so the
file is internally inconsistent. **This was copied into `Desktop/MateDesk` during M1**,
so it is already present in the new repo and must be fixed there.

### MateConnect track (not M4)

`agents/mateconnect-agent/` carries `Parent product: MateDesk Pro` in 5 places:
`AGENT_COMPONENT_STRATEGY.md:4`, `README.md:57`, `scripts/INSTALLER_BRANDING.md:4`,
`scripts/linux/build-linux-deb-package.sh:148`, `scripts/windows/MateConnect-Agent-Setup.iss:4`.
After the split there is no parent product — reword, don't just rename.

### Also worth fixing while in there

- `platform_admin/models.py` — `platform_url` default is `matedesk.app`, a **third**
  domain variant alongside `matedesk.pro`. Pick one.
- Same file — `build_info` default says `Django 4.x`; the project runs **Django 5.2.1**.

### Sweep verification

```bash
grep -rniE "matedeskpro|matedesk[ _-]pro" --exclude-dir=.git --exclude-dir=node_modules \
  --exclude=package-lock.json .
```
Must return only: migration history under `platform_admin/migrations/`, and nothing else.
Then confirm the domain survived: `grep -rn "matedesk\.pro" deployment/ backend/core/settings.py`
should still match.

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
