# Progress

Session handoff log. Update at the end of every phase. Read with `SPLIT_PLAN.md`.

| Phase | Status | Notes |
|---|---|---|
| M1 — backend | **COMPLETE** | all exit criteria met against Postgres |
| M2 — frontend | not started | theme audit **PAUSED mid-run** — see below |
| M3 — infra | not started | |
| M4 — docs/branding | not started | |

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

## ⏸ PAUSED — dark/light theme audit (pre-M2)

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
