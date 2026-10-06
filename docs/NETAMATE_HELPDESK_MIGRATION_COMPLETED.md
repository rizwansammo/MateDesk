# NetaMate HelpDesk migration completed

Completed: 2026-10-06

The former standalone NetaMate HelpDesk deployment has been retired.

Current production architecture:

- Tenant: `netamate`
- Platform: main multi-tenant MateDesk deployment
- Primary custom domain: `helpdesk.netamate.com`
- Custom-domain ownership: verified
- TLS: MateDesk-managed Nginx/Certbot lifecycle
- Mail integration: MateMail Connected App
- Standalone deployment workflow: retired
- Standalone application containers: removed
- Standalone Docker volumes: retained temporarily as rollback artifacts
- Final pre-retirement database backups: verified
- MateServer backup/restore allowlists: updated to back up only the main MateDesk tenant state

The one-off migration/import tooling used during the cutover was removed after verification.
