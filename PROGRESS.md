# Progress

Session handoff log. Update at the end of every phase. Read with `SPLIT_PLAN.md`.

| Phase | Status | Notes |
|---|---|---|
| M1 — backend | **COMPLETE** | all exit criteria met against Postgres |
| M2 — frontend | **code complete** | `tsc` + `next build` green; visual parity not yet checked |
| M3 — infra | **BLOCKED** | carve + fixes #1/#4 done, but ALL deploy values are still the OLD VPS's — see "M3 blocked" |
| M4 — docs/branding | not started | branding rule + full occurrence map now in `SPLIT_PLAN.md` |

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

### 🔴 M3 BLOCKED — every deploy value is still the OLD VPS's

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
