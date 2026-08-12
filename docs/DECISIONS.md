# Decisions

Decisions currently in force, with the reasoning that produced them. Written fresh after
the MateDesk / MateConnect split — pre-split decisions, most of which concerned the RMM
product, remain in the archived `MateDesk-Pro` repository and have not been carried over
wholesale. Anything below has been verified against the deployed code.

Each entry states the rule and **why**, because the reason is what tells you whether a
future change is safe.

---

## Product

### D1 — MateDesk and MateConnect are separate products with separate databases
No shared kernel package, no shared runtime, no cross-database foreign keys. MateConnect
gets an explicit *"Import from MateDesk"* feature instead, built on its own timeline.

**Why:** the two are sold, deployed and scaled independently. A shared identity layer would
couple their release cycles forever and make either one's schema changes a negotiation. An
import feature is also something an MSP actually wants at onboarding, rather than invisible
plumbing that has to be kept in sync.

**Consequence:** the import is one-way and point-in-time. A client organization added in
MateDesk afterwards will not appear in MateConnect. That is correct behaviour for two
separate products, not a defect.

### D2 — Preserve UUID primary keys across any future import
When MateConnect imports organizations or users, it must keep the same UUIDs rather than
generating new ones.

**Why:** free to do now, and it keeps cross-referencing possible later (linking a device to
a ticket, say) without a mapping table. Regenerating IDs closes that door permanently.

### D3 — Three inert RMM columns remain on `Tenant`
`mateconnect_enabled`, `branding_mc_logo`, `max_devices` are unused. No API exposes them, no
UI reads them.

**Why:** they were kept so that the production cutover from the old deployment would be a
no-op schema-wise. **That rationale has since lapsed** — the old server was decommissioned
and MateDesk deployed onto a fresh database, so nothing depends on schema compatibility any
more. They are now simply three unused columns, safe to drop in a dedicated migration
whenever convenient.

---

## Tenancy and hostnames

### D4 — Tenancy is resolved from the subdomain, and enforced on both sides
The hostname's first label is the tenant slug. `IsTenantUser` additionally checks that the
JWT's tenant matches the resolved tenant, and in production rejects any tenant-scoped call
with no resolved tenant.

**Why:** it makes cross-tenant token replay structurally impossible rather than a matter of
remembering to filter a queryset. The cost is that the hostname is load-bearing.

### D5 — A wildcard TLS certificate is a hard requirement
`*.matedesk.pro` must be covered, which means DNS-01 issuance — `--nginx`, `webroot` and
`standalone` cannot produce wildcards.

**Why:** a direct consequence of D4. Without it, tenant workspaces are unreachable over
HTTPS and the product does not work at all. This is not a nice-to-have.

### D6 — DNS lives at Cloudflare, records unproxied (grey cloud)
Namecheap remains registrar; nameservers point at Cloudflare. All A records are DNS-only.

**Why (Cloudflare):** wildcard renewal must be unattended. Namecheap's API is gated behind
account-eligibility rules and cannot be relied on; manual DNS-01 would mean a human pasting
TXT records every ~60 days, where one missed renewal takes every tenant offline
simultaneously. Cloudflare's certbot plugin is packaged and renews itself.

**Why (grey cloud):** proxying puts a second TLS terminator and an IP-rewriting layer in
front of nginx, changing the `Host` and `X-Forwarded-*` handling that tenant resolution and
`SECURE_PROXY_SSL_HEADER` depend on. One predictable TLS path was worth more than DDoS
filtering for a product that had not launched. Revisit deliberately, and re-test tenant
login plus WebSocket chat if you do.

### D7 — There is no `app.matedesk.pro`, and `www` gets its own server block
`app.` was removed entirely. `www` is 301'd to the apex from a **separate** nginx server
block, not folded into the main `server_name`.

**Why:** the two middlewares disagreed about `app.`. Django listed it in `NON_TENANT_HOSTS`
(so `request.tenant = None`), while the Next.js middleware stripped the suffix and read the
leftover label as tenant slug `"app"`. The result could only ever be a login form whose API
calls were refused — and it made `app` an unusable tenant slug. `www` falls into the
identical trap unless nginx redirects it before Next.js sees it.

---

## Runtime and infrastructure

### D8 — Build images in CI, pull them on the server
GitHub Actions builds and pushes to GHCR; the server only ever runs `docker compose pull`.
`build:` remains in the compose file solely as a first-deploy fallback.

**Why:** building on the VPS spends production CPU and RAM on every deploy and requires a
source checkout on the box. The other applications on this host already use pull-only
deploys, so this matches. Deploys dropped to ~26 seconds.

### D9 — MateDesk authenticates to GHCR through an isolated `DOCKER_CONFIG`
`/root/.docker-matedesk`, created per-deploy with the run's ephemeral `GITHUB_TOKEN` and
removed afterwards. The host's shared `/root/.docker/config.json` is never read or written.

**Why:** that shared credential belongs to a different account, which has read access to the
other apps' packages but not MateDesk's. Docker keeps only one credential per registry
hostname, so "fixing" the denial by repointing it would have broken the neighbours' deploys.
Isolation keeps each app's registry access its own concern.

### D10 — Every app owns its own Postgres and Redis, with no host ports
MateDesk's databases are containers on an internal bridge network, unreachable from the
host. The host's own Postgres and Redis belong to other applications and are not shared.

**Why:** blast-radius containment. A migration, a version bump or a bad query in one product
cannot affect another. The cost is a little more RAM, which this box has.

### D11 — No pgAdmin
Removed from the stack entirely.

**Why:** it was previously published on `0.0.0.0:5050` while every other service was bound to
loopback — a database console exposed to the internet, outside nginx, without TLS. Use
`docker compose exec postgres psql` or an SSH tunnel. Convenience did not justify the
surface area.

### D12 — `core/asgi.py` imports Channels unguarded
No `try/except` around the Channels imports, deliberately.

**Why:** it previously caught every exception and fell back to an HTTP-only application. A
broken import or a routing typo would leave WebSockets permanently dead with nothing in any
log — chat simply never worked and no error existed to find. Crashing at boot is strictly
better than silent degradation.

### D13 — `CELERY_RESULT_BACKEND` is independently configurable
It defaults to `CELERY_BROKER_URL` but reads its own environment variable.

**Why:** it previously read `CELERY_BROKER_URL` directly, so setting
`CELERY_RESULT_BACKEND` in `.env` was silently ignored. Same effective default, no silent
surprise.

### D14 — Health probes send a real `Host` header; `ALLOWED_HOSTS` stays tight
`ALLOWED_HOSTS` lists only genuine public hostnames. The deploy health check sends
`Host: matedesk.pro` rather than relying on a bare loopback request.

**Why:** the alternative was adding `127.0.0.1` to `ALLOWED_HOSTS` to accommodate a test.
Sending the real header keeps the host allowlist minimal *and* makes the probe exercise the
same code path nginx does, instead of a special case that proves less.

### D15 — HSTS is set once, at the edge
nginx sets `Strict-Transport-Security` and uses `proxy_hide_header` to strip Django's copy.

**Why:** Django also emits HSTS when `DEBUG=False`, so proxied responses would carry the
header twice. Stripping upstream leaves exactly one, and makes the edge the single place
this is configured.

### D16 — Keep the existing migration history; do not squash
All migrations were carried across from the pre-split codebase unchanged.

**Why originally:** so a production cutover would be near no-op. **That reason has lapsed**
(see D3) — the old server is gone. The history is nonetheless kept because squashing buys
little and discards the record of how the schema arrived here.

**Known consequence:** `users/0008_fix_2fa_fields.py` uses Postgres-only DDL
(`ADD COLUMN IF NOT EXISTS`), so **migrations cannot run on SQLite** despite `settings.py`
advertising a SQLite fallback. Postgres is required for local development. Fixing this means
editing applied migration history; a backend-conditional `RunSQL` would keep Postgres
behaviour byte-identical while unblocking SQLite. Not yet done.

### D17 — `autoprefixer` is a declared dependency
Listed in `frontend/package.json`; the Dockerfile runs a plain `npm ci`.

**Why:** `postcss.config.mjs` requires it, but it was absent from `package.json` and from
the lockfile entirely. Production built only because the Dockerfile appended an unpinned
`npm install autoprefixer`, which made images non-reproducible and left a clean `npm ci`
unbuildable for any developer.

---

## Frontend

### D18 — Token contract for colour
Every colour that can appear on more than one background must be a `var(--token)`, and
foreground and background must come from the same layer of abstraction — never one token and
one literal.

A raw hex or `rgba()` is permitted only when the value is theme-invariant *by intent*
(brand blue, a semantic status colour, white on a solid brand fill) or inside the
always-light marketing pages under `src/app/(public)/`.

Text uses `--text-0` … `--text-3`. `--text-4` and below are for non-informational
decoration only — never labels, values, placeholders, table headers, or the idle state of
an interactive control.

Every token must be defined in **both** the `:root` and `[data-theme="light"]` blocks. A
token defined in only one block, or holding the identical hex in both, is a bug by
definition.

**Why:** the app is ~99% inline styles, so there is no component layer to fix a colour
mistake in one place. Roughly 53% of colour decisions currently bypass tokens, which is the
direct cause of the 64 defects in `THEME_AUDIT.md`. Without a stated rule the same class of
bug returns with the next feature.

**Status:** stated, not yet enforced. Ideally a lint rule bans hex literals in `style`
props.

### D19 — Dead scaffolding is deleted, not kept "just in case"
Seven unused files were removed during the split: `requests/TicketSidebar.tsx` and six of
the seven `components/ui/` primitives. Only `ui/tooltip.tsx` was ever imported.

**Why:** an audit reported real contrast defects in files nothing renders, which wasted
review effort. Unreferenced code is a liability that costs attention at every audit.

---

## Known open decisions

| Question | Status |
|---|---|
| Fix the SQLite-incompatible migration (D16)? | open — requires editing migration history |
| Drop the three inert `Tenant` columns (D3)? | open — now safe, rationale for keeping has lapsed |
| Grey cloud → orange cloud at Cloudflare (D6)? | open — revisit after launch, re-test tenancy first |
| Reduce the six-step grey text ramp to four? | open — `THEME_AUDIT.md` shows six cannot all pass contrast |
| Enforce D18 with a lint rule? | open |
