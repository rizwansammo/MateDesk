# Progress

Session handoff log. Update at the end of every phase. Read with `SPLIT_PLAN.md`.

| Phase | Status | Notes |
|---|---|---|
| M1 — backend | **COMPLETE** | all exit criteria met against Postgres |
| M2 — frontend | **code complete** | `tsc` + `next build` green; visual parity not yet checked |
| M3 — infra | **COMPLETE — DEPLOYED LIVE** | https://matedesk.pro serving over HTTPS with wildcard TLS |
| M4 — docs | **COMPLETE** | written fresh, not split — see below |
| M5 — theme + branding | **Stage 1 shipped · rest PAUSED** | paused for beta-tester feedback, not finished — see below |
| M6 — tests + CI gates | **COMPLETE** | **227 tests (was 16)**; all six slices done |
| M7 — SEO | not started | technical foundation only; see the note on realistic keywords |

---

## M6 Slice 1 — COMPLETE (CI gates + ESLint)

**The workflow now gates on quality before it ships anything:**

```
test-backend  ─┐
test-frontend ─┴─> build ──> deploy
```

- `test-backend` — Postgres 16 service container (required: `users/0008_fix_2fa_fields.py`
  is Postgres-only DDL), then `manage.py check`, `makemigrations --check --dry-run`, and
  the test suite. The drift check is the one that caught the real `users.role` mismatch
  during M1.
- `test-frontend` — `tsc --noEmit` then `eslint .`. Typecheck runs here rather than only
  inside the Docker build because it fails in seconds instead of minutes.

**ESLint configured for the first time.** `eslint` and `eslint-config-next` were installed
with no config file, so linting had *never run* on this codebase. Added
`frontend/eslint.config.mjs` — flat config via `FlatCompat`, since eslint-config-next 15.x
still ships only the legacy format. Declared `@eslint/eslintrc` explicitly rather than
relying on it being present transitively (same failure mode as `autoprefixer`).

**First run: 8 errors, 76 warnings** across 30 of 140 files — far cleaner than expected.
All 8 errors fixed, so CI gates at **zero errors**:

| Fix | Detail |
|---|---|
| `prefer-const` ×3 | `crumbs` ×2, and `let raf` immediately assigned in `PageTransitionOverlay` |
| `react/no-unescaped-entities` ×3 | bare apostrophes in JSX text → `&apos;` |
| `no-require-imports` | `tailwind.config.ts` used `require('tailwindcss-animate')` in a file that is already an ES module — converted to an import |
| `jsx-no-comment-textnodes` | **false positive** — `//c` is literal UI text (the slash command a user types), not a comment. Suppressed with a stated reason rather than mangling correct code. |

Warnings are deliberately **not** gated (`--max-warnings` unset): ~34 `any`, ~32 unused
vars. Real debt, worth paying down, but not worth blocking a release over on day one.
`react-hooks/rules-of-hooks` and `exhaustive-deps` stay at **error** — a hook-order
violation is a runtime bug, not style.

All five gates verified passing locally before commit.

---

## M6 Slices 2-3 — COMPLETE (billing + SLA)

**Test count: 16 → 86.**

**Slice 2 — billing (31 tests).** Hourly and per-ticket rate modes, tax, rounding,
invoice numbering, RBAC, validation. Verified by mutation testing: breaking the tax
divisor, swapping `ROUND_HALF_UP` for `ROUND_DOWN`, and billing `open` tickets each
produced failures (2, 4 and 5 respectively).

One invariant asserted deliberately: **per-line rounding is intentional.** Three 1-minute
logs at 0.30/h bill 0.03, not 0.02 — each line is a real charged amount.

**Slice 3 — SLA (39 tests).** Policy matching and scope precedence, breach evaluation on
both clocks, pause accounting, refresh/notify latching. Five mutations all caught.

### Two SLA bugs found and fixed

Safe to fix at this point because production had zero tickets and zero policies — with
existing data, fixing #1 would have fired a burst of breach emails about historic tickets
via `refresh_ticket_sla`.

1. **`closed` wiped `resolved_at`** (`tickets/views.py`). The `elif new_status != 'solved'`
   branch caught `closed`, and since the normal path is solve → close it cleared the
   timestamp immediately after it was set. Consequences: every closed ticket had
   `resolved_at=None`, so `compute_sla_status` re-measured it against `now` and it drifted
   from `completed` to `breached` as it aged, and it was excluded from the resolution-time
   analytics that filter `resolved_at__isnull=False`. Now `('solved', 'closed')` are both
   resolved states, and the original resolution time survives solved → closed.
2. **First-response breach did not latch** (`sla/services.py`). Only the
   `first_response_at is None` case was checked, so a late reply made the check fall
   through: the ticket reverted from `breached` to `on_track` and `sla_breach_notified`
   reset, undercounting breaches and allowing a second notification. It also disagreed
   with the solved/closed branch, which always treated a late first response as a breach.
   **Owner's decision: a missed first response is permanent.**

Also hardened `compute_sla_status` so a missing `resolved_at` degrades to "cannot prove a
breach" rather than inventing one from `now` — defence in case a future path forgets the
timestamp.

**Note for beta:** SLA behaviour is now settled. Report whatever the testers hit rather
than pre-emptively changing it.

---

## M6 Slices 4-6 — COMPLETE (email, automation, ticket lifecycle)

**Final: 227 tests, up from 16.**

| App | Tests |
|---|---|
| tickets | 68 (16 RBAC + 52 lifecycle) |
| email_ingestion | 54 |
| automation | 51 |
| sla | 39 |
| billing | 31 |

Every suite was mutation-tested: 19 deliberate defects introduced across the five
apps, all 19 caught. Restores were done with `git checkout --` rather than hand-rolled
backups.

**Slice 4 — email ingestion.** IMAP is never touched; `_process_email` takes a parsed
`email.Message`, so the whole pipeline below the network layer is driven by constructing
messages from strings. Covers threading (reference in subject, In-Reply-To), dedup on
Message-ID, org resolution precedence (KnownSender > domain > Walk-In), requester
auto-creation, RFC 2047 header decoding, and multipart body extraction.

**Slice 5 — automation engine.** All condition operators including the numeric and
boolean branches, `any`/`all` matching, rule ordering, `stop_processing`, org scoping,
tenant isolation, and the thread-local re-entrancy guard.

**Slice 6 — ticket lifecycle.** Status transitions and `resolved_at` bookkeeping
(including regression tests for the `closed` fix), merge and absorb in both directions
with all their guards, and role-based row scoping on the list endpoint.

### Things worth knowing

- **`Ticket.objects.create()` fires a post_save signal that runs the automation engine.**
  Automation tests must create the ticket *before* the rules, or every action applies
  twice and every log row doubles. This caused all five initial failures in Slice 5 and
  is documented in the test class docstring.
- **`TicketListSerializer` exposes `ticket_ref` as `ref`.** Not `ticket_ref`.
- **A mutation test that fails to mutate looks identical to a passing one.** Two of mine
  silently no-op'd: a `sed` regex that failed on escaped brackets, and a `0,/pattern/`
  range that hit the first of fourteen identical RBAC guards rather than the intended
  one. Both reported OK. Verify the mutation actually landed.

### Limitations recorded, not fixed

- **Merge chains are permitted.** After `a -> b`, merging `b -> c` is allowed because the
  guards only refuse a source that is already `secondary`. The result is `a -> b -> c`,
  where `a.merged_into` points at a ticket that is itself secondary, and nothing resolves
  the chain to its final primary. The right fix (refuse, or re-point every secondary at
  the new primary) is a product decision.
- **`_strip_re_fwd` strips only one prefix.** `Re: Re: X` → `Re: X`. Cosmetic; threading
  uses the embedded reference, not subject text.
- **Subject text alone never threads.** A customer composing a fresh mail with the same
  subject opens a second ticket. Deliberate — subject-similarity matching would merge
  unrelated conversations — but worth knowing before support meets it.

---

## M6 — original slice plan (all complete)

Deferred by the owner until after the weekly usage limit resets. **Begin with Slice 1.**

The cost driver is *reading* code never opened in earlier phases — ~5,850 lines across five
areas — so M6 is deliberately split. Each slice is self-contained and must leave the repo
green.

| Slice | Reading | Scope |
|---|---|---|
| **1 — CI gates + ESLint** | ~0 lines | Add to the workflow: run the test suite, `makemigrations --check`, `tsc --noEmit`, `next build`. **Configure ESLint** — it is installed (`eslint`, `eslint-config-next`) with **no config file**, so linting has never run on this codebase. Expect hundreds of first-run warnings; gate on errors only, not style. |
| 2 — Billing | 670 | invoice totals, rate application, rounding, PDF generation on edge cases |
| 3 — SLA | 471 | breach calculation, business-hours arithmetic, VIP rule precedence, timezones |
| 4 — Email ingestion | 1,148 | reply parsing, threading to the correct ticket, duplicate suppression, Fernet round-trip |
| 5 — Automation | 1,700 (≈570 is template data, skimmable) | rule matching, action execution, the overdue/stale sweeps |
| 6 — Tickets | 1,861 (only transition + merge paths needed) | state transitions, merge/absorb, attachment permissions |

**Why Slice 1 first:** without the gates, tests written in later slices can silently rot.
It is also almost free — YAML plus an ESLint config.

**Why billing before SLA** despite SLA being smaller: a silent bug in invoice arithmetic
costs money and trust; a silent SLA bug costs a missed commitment. Both matter, money first.

Current baseline: **16 tests for ~12,000 lines**, all RBAC, all in `apps/tickets/tests_rbac.py`.
Zero coverage on billing, SLA, automation and email ingestion.

Also queued, both small and independent of M6:
- **`noindex` on tenant subdomains** — Google can currently index every tenant's login page
  (no robots.txt, no sitemap, no `X-Robots-Tag` anywhere). This is a defect, not an SEO campaign.
- **Replace `appleboy/ssh-action` with plain `ssh`** — it downloads a `drone-ssh` binary from
  GitHub releases on every run and has already failed once (`curl: (56)`), killing a deploy
  after a successful build. The runner has `ssh` built in; ~10 lines removes the flake and a
  third-party action from the path of your production SSH key.

---

## M5 — Stage 1 shipped, remainder paused

**Shipped and live** (verified in the deployed CSS bundle on matedesk.pro):

- `--text-4` was byte-identical `#64748b` in both blocks — i.e. not themed at all — and failed
  AA (3.5:1 on `--bg-card`). Now `#7c8ba1` dark / `#5b6675` light, both >5:1.
- `--text-5` was 2.5:1 dark and 2.3:1 light — **both halves of the original "dull in dark,
  washed out in light" complaint**. Now an alias of `--text-3`.
- `--text-pale` inverted its contrast rank between themes. Also aliased to `--text-3`.
- `--bg-panel` and `--bg-input` were consumed at 14 sites and **defined in neither block** —
  see-through KB menus in both themes. Now defined in both.

Aliasing rather than rewriting ~280 call sites was deliberate: same outcome, far less risk.

**Decision made (owner delegated it):** the text ramp is now **four readable steps (0–3)
plus one explicitly decorative step (4)**. Six mutually distinguishable greys cannot all
clear 4.5:1 on `#0f1117`, so the previous six-step ramp guaranteed unreadable labels.
`--text-4` sits at 4.2:1 on `--bg-elevated` in dark — acceptable only because it is
decorative-by-contract; using it for a label is a defect again. See `DECISIONS.md` D18.

**NOT done — 4 of the 5 criticals remain live:**

| Critical | Where |
|---|---|
| Ticket queue badges dark-only → 1.4–2.1:1 in light | `requests/page.tsx:22-31` |
| Dashboard donut legend + tooltip invisible in light (1.0:1) | `charts/PriorityDonutChart.tsx` |
| Public-reply vs internal-note label unreadable | `requests/[id]/page.tsx:1266,1276` |
| KB code blocks unreadable in light (no light hljs palette) | `kb/TipTapEditor.tsx:264` |

Also pending: ~90 hardcoded colour literals, badge consolidation, the black flash on every
navigation, an Appearance-page theme toggle (the only one is buried in the profile
dropdown), and the `MATEDESKPRO` → `MATEDESK` branding sweep.

Roughly 25–30% of M5 by effort, but the highest-leverage part.

---

## M1 — backend carve (this session)

**Done**

- `backend/` copied from frozen `MateDesk-Pro`; `apps/rmm/` excluded. Source untouched.
- `core/settings.py` — dropped `apps.rmm` from `INSTALLED_APPS`, removed the whole `RMM_*`
  settings block (63 lines), removed the `rmm-dispatch-scheduled-scripts` beat task,
  reworded the throttle comment that referenced RMM agent endpoints.
- `core/urls.py` — removed `path('api/rmm/', ...)`.
- `core/asgi.py` — removed `rmm_ws`; **fix #3a**: the channels import is no longer wrapped
  in `try/except`, so a failure crashes at boot instead of silently degrading to HTTP-only.
- **fix #5**: `CELERY_RESULT_BACKEND` now reads its own env var, defaulting to `CELERY_BROKER_URL`.
- `apps/platform_admin/` — removed the `RMMDevice` import, both `Count('rmm_devices')`
  annotations, the `devices` query + context, the MateConnect dashboard KPI, the
  `tenant_toggle_mateconnect` and `mateconnect_status` views, their URL routes, the
  `max_devices`/`mateconnect_enabled` tenant-create form handling, and the `mc_*` branding fields.
- Templates — deleted `templates/platform_admin/mateconnect/`; stripped MC blocks from
  `base.html`, `dashboard.html`, `settings/index.html`, `tenants/{create,list,detail}.html`.
  `detail.html` went 874 → 696 lines (MC tab panel, RMM device tile, device usage bar,
  MC branding panel, and the `'mc'` half of the branding-preview JS).
- `apps/tenants/serializers.py` — stopped exposing `mateconnect_enabled` on `/api/tenant/`.
- `apps/tickets/tests_rbac.py` — removed `RMMAccessTest` (3 tests hitting `/api/rmm/devices/`,
  which would now 404) and the `mateconnect_enabled` kwarg in `_make_tenant`.
- `apps/chat/consumers.py` — reworded a comment referencing the RMM consumer.
- Added `.gitignore` (copied from source) so `.venv`/`.env`/`__pycache__` stay untracked.
- Created `backend/.venv` (Python 3.12.10, Django 5.2.1) + a local dev `backend/.env`.

**Verified**

- `manage.py check` → no issues (1 silenced).
- All 113 app modules import cleanly.
- URLconf resolves: 66 root names, 42 platform_admin names. `mateconnect_status` and
  `tenant_toggle_mc` confirmed gone.
- All 19 platform_admin templates compile; all 30 distinct `{% url %}` names resolve — no danglers.
- Full-text sweep: no `rmm` / `mateconnect` references left outside migrations and the
  `AdminActionLog.ACTION_CHOICES` history entries (both intentionally kept).

**Verified against Postgres** (all M1 exit criteria met)

- `migrate` — all ~60 migrations applied clean on Postgres 16.
- `manage.py test` — **16 tests, OK.**
- `makemigrations --check` — exits 0, no drift.

**Ledger #7 fixed this phase.** Generated `users/0010_alter_user_role.py` to close the
drift left by `0006_remove_vip_manager_role`. `sqlmigrate` confirms it emits `-- (no-op)`
on Postgres — state-only, so applying it at cutover just writes a `django_migrations`
row. No schema change, no cutover risk.

**Ledger #6 still open** — `users/0008_fix_2fa_fields.py` is Postgres-only DDL. Proven
both directions: fails on SQLite, applies clean on Postgres. **Postgres is therefore
required to run this project at all**, despite `settings.py` advertising a SQLite
fallback. Needs a decision (see `SPLIT_PLAN.md`).

---

## M2 — frontend carve

**Removed (37 files):** `src/app/mateconnect/` (21), `src/components/mateconnect/` (8),
`hooks/useRMM.ts`, `types/rmm.ts`, `components/MCSplashScreen.tsx`,
`public/monogram-mateconnect.svg`, `(public)/_components/MateConnectSection.tsx`,
plus **7 dead files** — `requests/TicketSidebar.tsx` and `ui/{avatar,badge,button,dropdown-menu,scroll-area,separator}.tsx`
(only `ui/tooltip.tsx` was ever imported).

**Edited:** `MainSidebar.tsx` (MC launcher block + `useMateConnectAccess` hook —
also removes 3 theme defects), `layout.tsx` (MC splash variants, `SPLASH_BOOT`
script, `html[data-splash="mc"]` CSS; 8672 → 5091 chars), `(public)/page.tsx`,
`settings/branding/page.tsx` copy.

**Fixes applied:** ledger **#2** (204/205 guard on `apiFetch`'s retry path),
`middleware.ts` minors (dotted-path auth bypass now anchored to the final segment;
dead `/features` `/about` `/contact` removed from `PUBLIC_ROUTES`), and **new ledger #8**
(below).

**Verified:** `tsc --noEmit` clean · `next build` succeeds, **53 routes, 0 mateconnect** ·
no dangling imports · full `mateconnect|useRMM|rmm` sweep clean.

**Parity — verified by source diff** (chosen over screenshots to save session budget;
`next build` already *renders* all 53 pages, so a page that crashed would have failed
the build):

- Exactly **6 files differ** — the 6 intended edits. **Nothing was added** to the tree.
- Files removed: only the MateConnect artifacts + the 7 dead files. Nothing else.
- `layout.tsx` true content delta (ignoring line endings): **77 lines removed, 6 added —
  all 6 are reworded comments.** No functional code introduced.
- `MainSidebar.tsx`: 53 removed, **0 added** — pure deletion.
- `api.ts` +5 (the 204 guard), `middleware.ts` -2/+6, `(public)/page.tsx` -2,
  `branding/page.tsx` -1/+1.

Conclusion: no over-deletion. The carve is faithful.

**Cosmetic note:** the Python-based edits rewrote `layout.tsx` (and the M1
platform-admin templates) with LF endings while the rest of the repo is CRLF. No
functional effect; git's `core.autocrlf` normalises on commit. Mentioned only so a
future whole-file diff isn't mistaken for a real change.

**Visual QA — deliberately deferred to VPS beta testing** (owner's decision). Do not
spend a future session on local screenshot comparison. The diff above already proves
nothing was deleted by accident, which was the real carve risk.

**⚠ Recommendation attached to that decision: ship M5 (or at least Sweep A) BEFORE the
beta.** Otherwise testers meet an invisible dashboard chart (1.0:1), an unreadable
ticket queue in light mode, and a reply box where public-reply vs internal-note is
indistinguishable (`requests/[id]:1266`) — that last one risks a tester posting an
internal note to a client. Dark mode is not a safe fallback: `--text-4`/`--text-5` fail
contrast in dark too. Minimum viable pre-beta slice = **Sweep A (5 lines in
`globals.css`, fixes 695 call sites)** + the 5 CRITICAL items in `THEME_AUDIT.md`,
roughly 4-6 h versus the full 30-42 h.

### Ledger #8 (new, found during M2) — FIXED

`postcss.config.mjs` requires `autoprefixer`, but it was **absent from `package.json`,
absent from `package-lock.json` entirely, and pulled in by nothing transitively**. The
frozen frontend cannot build from a clean checkout. Production only worked because
`Dockerfile:7` did `npm ci && npm install autoprefixer` — an unpinned ad-hoc install
that made images non-reproducible.

Fixed by declaring `autoprefixer ^10.5.4` in devDependencies and reducing
`Dockerfile:7` to plain `npm ci`.

### Deferred to M6 (found during M2)

- **7 now-unused dependencies:** `@radix-ui/react-{avatar,dropdown-menu,scroll-area,separator,slot,popover}`
  and `class-variance-authority`. Verified unreferenced in `src`. Left in place —
  removal is hygiene, not carve work, and has no parity benefit.
- **ESLint is installed but never configured.** `eslint` + `eslint-config-next` are in
  devDependencies with no config file, so `next lint` prompts for first-time setup.
  Linting has never run on this codebase.

---

## M3 — infra

**Copied:** `docker-compose.yml`, root `.env.example`, `deployment/` (nginx + deploy.sh +
backup.sh), `.github/workflows/deploy.yml`.

**Excluded / removed (MateConnect):** `docker-compose.remote.yml`,
`deployment/REMOTE_RUSTDESK_SETUP.md`, `deployment/remote.env.example`,
`deployment/scripts/deploy-remote.sh`, `.github/workflows/build-agent.yml`,
`.github/workflows/sign-agent-update-manifest.yml`.

**`.env.example`:** 78 → 53 lines. Removed all 24 `RMM_*` / RustDesk vars.

**Fixes applied:**
- **#1** — pgAdmin now binds `127.0.0.1:5050:80`. Verified via `docker compose config`:
  all three published ports (`8005`, `3005`, `5050`) resolve `host_ip: 127.0.0.1`.
- **#4** — the 5 server-level security headers are now repeated inside
  `location /static/`. nginx only inherits `add_header` when the child level declares
  none, and that block sets `Cache-Control`, so they were being silently dropped.
- **Branding (early M4 work, done opportunistically):** `MateDesk Pro` → `MateDesk` in
  `matedesk.conf`, `deploy.sh` (banner + log line), `backup.sh`. Reworded the stale
  "future: RMM agent gateway" nginx comment.

**Verified:** `docker compose config --quiet` → VALID. No `rmm` / `mateconnect` /
`rustdesk` / `MateDesk Pro` references remain in any infra file.

## M4 — docs written fresh (scope changed mid-phase)

The original plan was to copy the six pre-split docs and surgically remove the ~810 of
~4,000 lines that were MateConnect content. **Dropped that approach.** The old docs are
preserved permanently in the frozen `MateDesk-Pro` repo, so copying them just to delete a
fifth of each achieved nothing — and an index of `DECISIONS.md` showed the large majority
of it was MateConnect (Phases R0–R8C: agent, enrollment, installer, remote access).

Written instead — 809 lines describing what actually exists:

| File | Lines | Purpose |
|---|---|---|
| `README.md` | 126 | Entry point: capabilities, stack, layout, local dev |
| `ARCHITECTURE.md` | 204 | Tenancy model, request flow, the two auth systems, apps, known weaknesses |
| `DEPLOYMENT.md` | 258 | **Operations runbook** — the highest-value piece |
| `DECISIONS.md` | 221 | 19 decisions in force with rationale, plus 5 open questions |

`DEPLOYMENT.md` captures the operational knowledge that previously existed only in a chat
session: the port map including the neighbouring apps, why the shared Docker credential must
not be repointed, that deleting `/root/.cloudflare.ini` silently kills TLS renewal ~90 days
later, SHA-pinned rollback, and the three CI failures with their causes.

Stale `NEXT_PHASE.md` was never copied, so there was nothing to delete — it remains only in
the frozen repo. Brand images (`MateDesk.png`, `MetaDeskWide.png`, `NetaMate.png`,
`favicon.png`) were carried over as assets.

## 🟢 LIVE — https://matedesk.pro

Deployed to MateServer (169.58.114.252), `/opt/MateDesk`. Verified externally with full
cert validation:

| URL | Result |
|---|---|
| `https://matedesk.pro` | 200 (marketing site) |
| `http://matedesk.pro` | 301 → HTTPS |
| `https://www.matedesk.pro` | 301 → apex |
| `https://netamate.matedesk.pro/login` | 200 (tenant workspace) |
| `https://matedesk.pro/platform-admin/login/` | 200 (operator console) |
| `https://matedesk.pro/api/health/` | `{"status": "ok", "service": "MateDesk API"}` |
| API login as `contact@netamate.com` | access token issued, role `msp_owner`, tenant `netamate` |

**TLS:** wildcard cert `matedesk.pro` + `*.matedesk.pro`, expires 2026-11-10, issued via
`dns-cloudflare` DNS-01. `certbot renew --dry-run` succeeds for **all three** certs on the
box (matedesk, netamate, talkroom) — unattended renewal confirmed on the existing
`certbot.timer`. Token at `/root/.cloudflare.ini` (chmod 600) — **deleting it breaks renewal.**

**DNS:** Cloudflare (free) as nameservers, Namecheap still registrar. Records `@`, `www`, `*`
→ 169.58.114.252, all **DNS-only / grey cloud** (not proxied — deliberate, so there is one
predictable TLS path).

**CI/CD:** push to `main` → build both images in Actions → GHCR → SSH → `docker compose pull`
+ health-gated restart. **~26 second deploys.** GHCR auth uses an isolated
`DOCKER_CONFIG=/root/.docker-matedesk` with the ephemeral `GITHUB_TOKEN`, so the box's
shared credential (a different account, used by TalkRoom/NetaMate) is never touched.

**Accounts created:**
- Platform admin — `mrizwan.sammo@gmail.com` (tenant=None, is_staff, is_superuser)
- Tenant — `NetaMate Solutions` / slug `netamate`, plan `enterprise`, status `active`
- MSP owner — `contact@netamate.com`, role `msp_owner`

**Three CI failures along the way, all diagnosed:**
1. old workflow using non-existent `CNTB_*` secrets → replaced the workflow
2. GHCR `denied` → box's shared docker credential belongs to another account; fixed with
   the isolated config above
3. health probe 400 → `curl 127.0.0.1` has a Host header Django rejects via ALLOWED_HOSTS.
   Fixed by sending `Host: matedesk.pro` rather than loosening ALLOWED_HOSTS.

### ⚠️ Open items

1. **No database backups.** `deployment/scripts/backup.sh` exists in git but is **not on the
   box and not in cron**. Neither are the other two apps. Highest-priority gap now that
   real data will accumulate.
2. **Email ingestion not configured** — the helpdesk's email-to-ticket core needs mailbox
   credentials via Settings → Email in the app.
3. **No monitoring/uptime checks.**
4. **Secrets in session transcript:** `SECRET_KEY`, `JWT_SECRET_KEY`, `POSTGRES_PASSWORD`,
   the Cloudflare token, and both account passwords. Rotate when convenient.
5. **M5 theme bugs are live** — 64 confirmed defects incl. 5 critical. Deliberately deferred.

### M3 — retargeted to MateServer (169.58.114.252)

**Target box:** `MateServer`, Ubuntu 26.04, 6 cores / 11 GB RAM / 180 GB free.
Shares one host nginx with **NetaMate** (`127.0.0.1:8001`, netamate.com) and
**TalkRoom** (`network_mode: host`, `*:4000`, talkroom.club). Host Postgres 18 on
`127.0.0.1:5432` and host Redis on `127.0.0.1:6379` belong to other apps —
MateDesk does **not** share them.

**Ports chosen:** backend `127.0.0.1:8005`, frontend `127.0.0.1:3005`. Verified free.
Postgres + Redis have **no host port at all**.

**Deploy dir:** `/opt/MateDesk` (capital D — corrected in `deploy.sh`, `backup.sh`,
and the workflow).

**⚠️ The OLD production box (`176.57.188.13`) is DEAD** — ports 22/80/443 all closed,
100% packet loss. `matedesk.pro` DNS still points there. This means there is **no live
production to cut over from**, so the originally-planned Phase 7/8/9 (data migration
rehearsal, agent continuity bridge, cutover) are **not needed** — this is a first
deploy. Unconfirmed: whether any data on that box is still wanted.

**Done this session:**
- Deploy keypair `github-actions-matedesk-deploy` (ed25519) generated; public key
  **appended** to `/root/.ssh/authorized_keys` (backup at
  `authorized_keys.bak.before-matedesk`, 3 → 4 keys, existing 3 intact). Auth verified.
- GitHub secrets set on `rizwansammo/MateDesk`: `VPS_HOST`, `VPS_USER`, `VPS_PATH`,
  `VPS_SSH_KEY` (private key piped from file, never echoed).
- `docker-compose.yml` rewritten for this box: **pgAdmin dropped entirely** (was
  ledger #1), isolated Redis + Postgres with no host ports, GHCR images with
  `${MATEDESK_*_IMAGE}` overrides, `build:` kept only as a first-deploy fallback.
- `.github/workflows/deploy.yml` rewritten: **build in Actions → push to GHCR → SSH →
  `docker compose pull && up -d`**, with a health-check gate and SHA-pinned images for
  rollback. The old version built on the VPS, which the other apps on this box don't do.
- `deployment/nginx/matedesk.pro` written (replaces `matedesk.conf`), HTTP-only so
  certbot can add TLS. Filename matches the box convention.
- `.env.example`: pgAdmin block removed, `CELERY_BROKER_URL` added (settings.py reads
  it but it was never in the file), host-port + image-pinning sections added.
- `/opt/MateDesk/docker-compose.yml` + `/opt/MateDesk/.env` (chmod 600, 19 keys) placed
  and validated on the VPS. `docker compose config` → VALID, 6 services, only the two
  expected `127.0.0.1` bindings. NetaMate + TalkRoom confirmed still running.

**Not done — waiting on external steps:**
1. **Nothing pushed to GitHub yet.** Owner is handling pushes. No GHCR images exist
   until CI runs, so the stack has not been started.
2. **DNS.** `matedesk.pro` (Namecheap BasicDNS) still points at the dead box. A
   wildcard `*` A record already exists, so only the target IP needs changing.
   **Records needed: `@`, `www`, `*` → 169.58.114.252. That is all — no `app`.**
   `app.matedesk.pro` was dropped: Django listed it in `NON_TENANT_HOSTS` while the
   Next.js middleware parsed the leftover label as tenant slug `"app"`, so it could
   only ever serve a login form whose API calls `IsTenantUser` refused — and it made
   `app` an unusable tenant slug. Removed from nginx, both `.env.example` files, and
   the live `/opt/MateDesk/.env`.
   `www` now has its **own nginx server block returning 301 to the apex**. It must not
   share `server_name` with the apex, or it hits the identical "tenant www" trap.
3. **Wildcard TLS.** certbot 4.0.0 on the box has only `nginx`/`standalone`/`webroot` —
   **none can issue a wildcard.** Needs `python3-certbot-dns-cloudflare` +
   a Zone:DNS:Edit token. Recommendation: move nameservers to Cloudflare (free) and
   keep Namecheap as registrar. Namecheap's own API is gated behind account
   eligibility rules and is not reliable here.
4. **nginx site not installed on the VPS yet** — deliberately deferred, since
   `nginx -t && systemctl reload` briefly touches two live sites and the block does
   nothing until DNS points here.

**Secrets note:** `SECRET_KEY`, `JWT_SECRET_KEY`, `POSTGRES_PASSWORD` were generated and
appear in this session's transcript. Rotate before go-live if that matters; the app is
not serving traffic yet. The deploy private key lives only in the GitHub secret now
(local copy is in a session-temp scratchpad and should not be relied on).

### 🔴 Superseded — the old-VPS values M3 originally inherited

The infra was copied verbatim, so all deployment-specific values are inherited from the
existing Contabo box and are **wrong for a new VPS**. Do not deploy until these are set.

| What | Current (old VPS) | Where to change |
|---|---|---|
| Backend port | `8005` | `docker-compose.yml:42,45`; `backend/Dockerfile:20`; `backend/entrypoint.sh:15,18`; `matedesk.conf` proxy_pass ×6 |
| Frontend port | `3005` | `docker-compose.yml:124`; `frontend/Dockerfile:45,46`; `matedesk.conf` proxy_pass ×1 |
| pgAdmin port | `5050` | `docker-compose.yml:100` |
| Deploy dir | `/opt/matedesk` | `deployment/scripts/deploy.sh:3,7`; `backup.sh:3,7`; `.github/workflows/deploy.yml:29` |
| Domain | `matedesk.pro` + `app.` + `www.` + `*.` | `matedesk.conf:10,17,24,30`; `.env.example` ALLOWED_HOSTS / NON_TENANT_HOSTS / CORS ×2 / CSRF / NEXT_PUBLIC_APP_DOMAIN / PGADMIN_EMAIL |
| TLS certs | `/etc/letsencrypt/live/matedesk.pro/` | `matedesk.conf:19,20,33,34` |
| CI SSH secrets | `CNTB_HOST`, `CNTB_USER`, `CNTB_SSH_KEY` | `.github/workflows/deploy.yml:22-24` |

**⚠ Wildcard DNS + wildcard TLS are mandatory, not optional.** Tenancy is
subdomain-based (`{slug}.domain`) and in production `IsTenantUser` rejects every
tenant-scoped API call made on the root domain. The new VPS needs a `*.domain` A record
and a wildcard cert, which requires Certbot **DNS-01** (HTTP-01 cannot issue wildcards).

**Open question:** will MateConnect share this VPS? If yes, the two products need
non-overlapping ports and separate nginx server blocks — that changes the port plan.

**NOT verified:** `docker compose build`. The Docker daemon crashed mid-build
(`npipe dockerDesktopLinuxEngine` unreachable) and did not recover. Docker Desktop has
been unstable this session — it also killed the `md-verify` Postgres container earlier
with exit 255.

The specific thing still unproven is the **frontend Dockerfile change** (ledger #8):
`RUN npm ci` now relies on `autoprefixer` being in the lockfile instead of the old
ad-hoc `npm install autoprefixer`. It builds natively (`next build` passed in M2), so
the risk is low, but the image build itself is untested. To close:

```bash
cd /c/Users/Rizwan/Desktop/MateDesk
docker compose build frontend      # then optionally: docker compose up -d
```

### Known carry-over from M1 (fix in M4)

`apps/platform_admin/templates/platform_admin/tenants/detail.html` was copied verbatim
and still renders the legacy wordmark `MateDesk<span>Pro</span>` at **lines 565 and 839**
(post-M1 line numbers), while the real app renders `MATEDESK`. Line 596 in the same file
already says `(MATEDESK)`. Full mapping and the do-not-touch list are in `SPLIT_PLAN.md`
under "CRITICAL BRANDING RULE".

### Local dev environment

- `backend/.venv` — Python 3.12.10, Django 5.2.1 (Python 3.14 is the system default; do not use it).
- `backend/.env` — local dev, gitignored. Points at the throwaway Postgres below.
- Verification DB, **disposable** — recreate any time:
  ```bash
  docker run -d --name md-verify \
    -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=matedesk -e POSTGRES_DB=matedesk \
    -p 5433:5432 postgres:16-alpine
  ```
  Remove with `docker rm -f md-verify`. It died once mid-session with exit 255
  (killed externally); `docker start md-verify` brought it back.

**Not yet copied** (later phases): `frontend/`, `deployment/`, `docker-compose.yml`,
`.github/`, root docs.

---

## ✅ COMPLETE — dark/light theme audit (pre-M2)

**76 confirmed / 33 refuted** → ~64 distinct defects. 5 critical, 17 high, 29 medium, 25 low.
71 MateDesk scope, 5 MateConnect (do not fix — leaving with the RMM product).

Full report: **`THEME_AUDIT.md`** (root causes, severity table, 6 sweeps, 13-step ordered
plan, visual-QA checklist, token contract). Raw records: `THEME_AUDIT_findings.json`.

**Headline:** the primary cause is NOT the hardcoded literals — it is the token ramp.
`--text-4` is byte-identical `#64748b` in both blocks (not themed at all) and `--text-5`
fails 4.5:1 in *both* themes. Those two own **695 call sites = 42% of all token
references**. Five lines in `globals.css` is the single highest-leverage fix.

Estimated remediation: **~30-42 h engineering + 6-8 h visual QA.**

**Recommendation: this is NOT M2 work — it becomes M5.** M2's exit criterion is
"pixel-identical to the frozen source", which is the only way to prove the carve broke
nothing. Theme fixes deliberately change pixels, so doing both in one pass destroys the
baseline and makes visual regressions impossible to bisect. Exception: step 10 of the
plan (delete the MateConnect launcher instead of repairing it) is genuinely M2 work.

### Audit run metadata (superseded — kept for provenance)

Read-only audit of the frozen frontend's theming. Stopped deliberately at a phase
boundary to stay under a session rate limit. **Discovery is done; verification is not.**

| | |
|---|---|
| Run ID | `wf_7190586b-62b` |
| Script | `C:\Users\Rizwan\.claude\projects\c--Users-Rizwan-Desktop-MateDesk\b33a2c12-9918-43c6-8854-12e7e5fb9350\workflows\scripts\theme-audit-matedesk-wf_7190586b-62b.js` |
| Transcript + journal | `...\subagents\workflows\wf_7190586b-62b\` |
| Session ID | `b33a2c12-9918-43c6-8854-12e7e5fb9350` |

**Banked (replays instantly from cache):**
- All **6 finders complete** — 109 raw findings.
- Unverified severity spread: 22 critical, 34 high, 37 medium, 16 low.
- Unverified scope spread: 65 matedesk, 37 shared, 7 mateconnect.

**Still to run:** 6 adversarial verifiers + 1 synthesizer. The 109 findings are
**unverified** — the verify pass exists specifically to refute false positives,
so expect the confirmed count to drop.

### To resume

```
Workflow({
  scriptPath: "C:\\Users\\Rizwan\\.claude\\projects\\c--Users-Rizwan-Desktop-MateDesk\\b33a2c12-9918-43c6-8854-12e7e5fb9350\\workflows\\scripts\\theme-audit-matedesk-wf_7190586b-62b.js",
  resumeFromRunId: "wf_7190586b-62b"
})
```

Do not edit the script before resuming — an edited prompt invalidates the cache from
that agent onward and the finders would re-run.

### ⚠ If resume fails

`resumeFromRunId` is **same-session only**. Resuming inside this conversation works;
starting a brand-new conversation may not find the cache.

Fallback: all 109 findings are on disk in `journal.jsonl` (rows where `type == "result"`
and the result object has a `findings` key). Parse them out and feed them straight into
the verification stage — no discovery work is lost either way.
