# NetaMate HelpDesk consolidation — Phase C

Phase C is the **read-only migration preparation and collision-analysis phase**.
It does not change DNS, Nginx, either production database, or the live
`helpdesk.netamate.com` route.

## Current live baseline

Snapshot taken on 2026-10-06 while both deployments were running the same MateDesk
schema generation.

| Item | Main MateDesk `netamate` | Standalone NetaMate HelpDesk |
|---|---:|---:|
| Users | 8 | 4 |
| Client organizations | 4 | 3 |
| Tickets | 2 | 1 |
| Replies | 2 | 3 |
| Notifications | 8 | 4 |
| Processed emails | 5 | 2 |
| Attachments | 0 | 0 |

The live databases had the same applied migration fingerprint at the Phase C
baseline (85 applied migrations each). Their tenant UUIDs are different, so every
source tenant foreign key must be remapped to the existing main MateDesk tenant.

### Collision findings

- **Users:** one normalized email exists in both databases.
  - The target row is currently `client_owner`.
  - The standalone/current-production row is `msp_owner`.
  - Phase D policy: match by normalized email and let the standalone/current
    production authentication/profile/role state win for the overlapping account.
- **Client organizations:** all three standalone organizations already have a
  deterministic match in the main tenant.
  - Two match by non-empty organization domain.
  - One has no domain and matches by normalized organization name.
  - The two domain matches have different display names between old main data and
    current standalone data.
  - Phase D policy: domain is the stronger identity key; reuse the target
    organization row and apply current standalone organization metadata.
- **Tickets:** no ticket-reference collision and no ticket UUID collision.
- **Replies / notifications:** no UUID collision in the baseline.
- **Processed email:** no Message-ID collision in the baseline.
- **Attachments:** none in either deployment at the baseline.

Because the standalone HelpDesk remains live until cutover, **Phase D must repeat
the dry-run after the source is frozen**. This document is a baseline, not a
license to skip the final preflight.

## Deterministic merge policy

The main MateDesk `netamate` tenant is the destination and keeps its tenant UUID.
Target-only historical data stays intact.

### Organizations

Matching order:

1. non-empty normalized organization domain
2. normalized organization name only when the source organization has no domain

Never use an empty domain as a match key.

For a matched organization, retain the target UUID and apply current standalone
metadata (name, contact fields, timezone, business hours, active state). This is
important because current standalone data is the active production state.

### Users

Match by normalized email.

- Existing target user: retain the target UUID so old main-ticket references remain
  valid; apply the standalone profile, role, password hash, 2FA state and mapped
  organization relationship.
- Source-only user: create it in the target tenant. Preserve the source UUID when
  it is collision-free; the Phase C dry-run treats a UUID collision as fatal.
- Target-only user: leave unchanged.

Copying a Django password **hash** is safe and preserves the current standalone
login password; no plaintext password is exported.

### Tickets and replies

- Preserve source ticket UUID and ticket reference when collision-free.
- Remap tenant, organization, requester, assignee, support group and agent
  relationships to destination objects.
- Preserve ticket timestamps and HTML/plain-text email content.
- Preserve reply UUIDs and remap author/ticket relationships.
- Target-only historical tickets remain untouched.

### Notifications and processed email

- Preserve collision-free notification UUIDs and remap users/tickets.
- `ProcessedEmail` uses its Message-ID as the semantic dedupe key. Its local
  database primary key is not portable between databases and must be regenerated.
- If a Message-ID already exists at the final dry-run, skip it rather than create
  a duplicate.

### Attachments / media

The baseline contains zero attachments. The final preflight must check again.
If attachments appear before freeze, Phase D must copy their media files and
records before cutover, then verify every referenced file exists in destination
storage.

## Email settings — important exception

The main tenant currently uses the older basic IMAP/SMTP configuration, while the
standalone production HelpDesk uses the current MateMail Connected App mailbox.

A safe dummy encryption probe proved that the two deployments' email credential
encryption keys are **not compatible**.

Therefore Phase D must **never copy encrypted credential/token ciphertext directly**
from the standalone database into the main database.

The current standalone MateMail configuration is authoritative, but its secrets
must be re-bound/re-encrypted under the destination MateDesk key (or the Connected
App must be securely reconnected) during the controlled cutover. Mail polling must
not run simultaneously from both deployments.

## Phase C tooling

`python manage.py tenant_migration_manifest --tenant netamate`

Emits a PII-minimized JSON manifest containing hashes and structural identifiers,
not raw email addresses, organization names, subjects, message bodies, or mailbox
credentials.

`deployment/scripts/netamate-migration-dry-run.sh`

Runs the manifest on both production stacks and checks:

- schema fingerprint compatibility
- user-email overlap
- organization matches
- ticket-reference collisions
- UUID collisions
- ProcessedEmail Message-ID overlap
- email encryption-key compatibility via a dummy probe

The script performs no database writes.

## Gate to Phase D

Phase D may begin only when the final dry-run reports no fatal ticket-ref/schema/
UUID collision. The standalone system remains authoritative for current NetaMate
HelpDesk state until the freeze-and-export step.
