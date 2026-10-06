# MateDesk Native Custom Domains

MateDesk can map a customer-owned hostname (for example `helpdesk.example.com`) to an
existing multi-tenant workspace without creating a separate application deployment.

## Safety model

Custom domains are deliberately split into two privilege zones:

1. **Django / Platform Admin** owns the domain record, TXT ownership verification,
   tenant mapping and lifecycle status.
2. **MateServer host provisioner** owns Nginx and Certbot. The Django container is
   never given the Docker socket, `/etc/nginx`, or `/etc/letsencrypt`.

This keeps a web application compromise from becoming host-level Nginx/TLS access.

## Domain lifecycle

`pending -> verified -> provisioning -> active -> disabled`

A provisioning error moves the record to `failed`. Platform Admin can explicitly retry.

Ownership record:

- Type: `TXT`
- Name: `_matedesk-verify.<hostname>`
- Value: `matedesk-verification=<random-token>`

Preferred routing for subdomains:

`helpdesk.example.com CNAME matedesk.pro`

The default `tenant.matedesk.pro` workspace remains available. Setting a custom domain
as "Primary" records the preference but does **not** force a redirect, preserving rollback.

## TLS

The host provisioner creates an HTTP-only Nginx block, requests a dedicated Let's Encrypt
certificate with HTTP-01/webroot, then replaces it with the final HTTPS reverse-proxy block.
The final HTTP block keeps the ACME challenge path available for Certbot renewal.

Custom-domain HSTS intentionally omits `includeSubDomains` because MateDesk must not set
policy for unrelated customer subdomains.

## Production enablement (do not run during feature development)

The following is intentionally deferred until the migration/cutover phase:

1. Copy `deployment/scripts/sync-custom-domains.sh` to
   `/opt/MateDesk/deployment/scripts/` and make it executable.
2. Install the two units from `deployment/systemd/`.
3. Run `systemctl daemon-reload` and enable the timer.
4. Set `CUSTOM_DOMAINS_ENABLED=True` in `/opt/MateDesk/.env`.
5. Recreate the backend so the setting is loaded.
6. Verify the normal `matedesk.pro` and `*.matedesk.pro` paths before adding any live
   custom domain.

Always run `nginx -t` before a reload. The provisioner does this automatically.

## Existing Nginx hostname collision

The provisioner refuses to claim a hostname already present in another enabled Nginx site.
This is intentional. A migration from a dedicated deployment (such as the current
NetaMate HelpDesk) must remove/disable the old server block only during the controlled
cutover window, never during feature development.

## Disable / rollback

Disabling a domain removes only the MateDesk-managed Nginx route. Certificate files are
retained temporarily for rollback. Previously provisioned domain rows are also retained as
an audit record instead of being hard-deleted.
