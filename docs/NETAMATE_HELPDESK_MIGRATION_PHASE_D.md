# NetaMate HelpDesk consolidation — Phase D

Phase D performs the controlled production merge of the standalone NetaMate HelpDesk
into the existing MateDesk `netamate` tenant.

## Safety gates

1. Verified custom-format PostgreSQL backups of both MateDesk databases must exist.
2. Phase B and Phase C code must be deployed to both stacks.
3. Final Phase C dry-run must be repeated immediately before source freeze.
4. If attachment count is non-zero, stop and copy/verify media before applying the DB merge.
5. Source application containers are frozen before the final merge.
6. The source PostgreSQL connection used by `tenant_db_merge` is forced read-only.
7. The merge command is dry-run by default; writes require explicit `--apply`.
8. Destination legacy email polling is disabled during merge to prevent duplicate ingestion.
9. `helpdesk.netamate.com` remains on the old route until data validation passes.

## Merge policy

- Existing destination tenant UUID is retained.
- Standalone organization identities match by non-empty domain, otherwise by normalized name.
- Existing destination organization UUIDs are retained; current standalone metadata wins.
- Users match by normalized email. Existing destination UUIDs are retained.
- Current standalone profile, role, password hash, and 2FA state win for matched users.
- Source-only users preserve source UUIDs when collision-free.
- Source tickets/replies/notifications/time logs preserve UUIDs and timestamps.
- Ticket reference collisions are fatal.
- ProcessedEmail records dedupe by Message-ID.
- Tenant billing/subscription/limits remain destination-owned.
- Email credential/token ciphertext is never copied between deployments because the encryption keys differ.

## Host orchestrator

`deployment/scripts/netamate-tenant-db-merge.sh dry-run`

Temporarily connects the target backend container to the source PostgreSQL Docker
network, constructs the source DB URL in-process, runs the read-only merge preflight,
and disconnects the network afterward. Database credentials are not printed.

`deployment/scripts/netamate-tenant-db-merge.sh apply`

Runs the same merge with explicit write permission to the destination only.

## Email handoff

The current standalone HelpDesk uses the MateMail Connected App and remains the
authoritative mailbox configuration. The destination's old Gmail/basic IMAP/SMTP
configuration is disabled during the merge. MateMail is then reconnected/re-bound
under the destination encryption key before target polling is enabled.

Never enable source and destination IMAP polling simultaneously.

## Rollback

Before cutover, rollback is simply to keep the existing standalone route and restart
its application containers. After cutover, the pre-Phase-D database dumps and the
old Nginx site/certificate remain available until the migration is verified and the
rollback window is intentionally closed.
