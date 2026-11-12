# MateDesk Project Management Phase 8: Final Security, QA and Acceptance

## 1. Release Scope

Phase 8 closes the planned Project Management roadmap through Phase 7. The intent is to validate and harden existing features, not introduce new workflow modules.

The feature set includes Project Requests and conversion, staff and Client Reviewer membership, Milestones, Work Items, Kanban and lists, Ticket linking, Scope Approval, Delivery Approval, Files and Version History, Dependencies, Checklists, Conversations, Notifications, Time Tracking, Draft Invoices, Reports, Gantt Timeline and Project Templates.

## 2. Security Findings and Fixes

| ID | Severity | Finding | Phase 8 remediation |
| --- | --- | --- | --- |
| P8-01 | High | Legacy Work Item list/detail returned internal Milestone UUIDs and staff effort estimates to Client Reviewers, despite the Phase 7 Timeline correctly hiding these fields | Mask the Milestone ID when its visibility is internal and return null for Estimated Minutes on all Client requests. Preserve values for authorized Staff |
| P8-02 | Medium | Milestone writes checked the Delivery lock outside a transaction, permitting a narrow race with client submission and approval | Serialize Milestone creation and update with Project row locks, then recheck Delivery locks and record Activity inside the same transaction |
| P8-03 | Medium | An Archived Project rejected most mutations, but Work Item Comments still accepted new messages | Reject comments on Archived Projects and recheck after locking the Project, including Client comments |
| P8-04 | Medium | CSV Export directly quoted user supplied strings, which spreadsheet software may interpret as formulas | Escape dangerous formula prefixes before CSV quoting, including leading whitespace and line breaks |
| P8-05 | Reliability | GHCR transport resets interrupted a Phase 7 Production Pull and required an extra Deployment Job | Retry Docker Image Pull up to three attempts without rerunning Tests or Image Builds |
| P8-06 | Security Hygiene | Deployment failure could leave ephemeral GHCR credentials in a private Docker Config directory until later cleanup | Install shell EXIT trap for Docker logout and deletion of the isolated credentials directory, including failed deployments |

| P8-07 | Critical to Moderate, depending on advisory | Outdated Frontend packages included Next.js, Tiptap and a nested PostCSS copy with published vulnerability advisories | Upgrade Next.js within v15, align all Tiptap v3 packages and override PostCSS to patched v8.5.32; verify all Production npm advisories are gone |
| P8-08 | Security Hardening | Eight pinned Backend Python dependencies matched published OSV advisories | Update Django, DRF, SimpleJWT, PyJWT, Pillow, Cryptography, Bleach and dnspython to advisory free versions, install into a fresh isolated Python environment and rerun regression tests |

All changes preserve the existing Project schema. No new migration is required for Phase 8.

### Dependency Audit Results

**Frontend Production audit:** Before remediation, **49** advisories (1 Critical, 6 High, 42 Moderate) were reported. After remediation: **zero** via `npm audit --omit=dev --audit-level=high`. Next.js 15.5.29, Tiptap 3.33.1 and PostCSS 8.5.32 remain inside the current Major Versions. The complete lockfile is pinned for reproducible CI installation.

**Backend Python audit:** Initially 8 of 25 direct requirements matched OSV advisories. Patched versions: Django 5.2.19, Django REST Framework 3.18.3, SimpleJWT 5.5.1, PyJWT 2.15.1, Pillow 13.0.0, Cryptography 50.0.2, Bleach 6.4.0 and dnspython 2.9.2. A second OSV scan of all **56 installed distributions** in an isolated Python environment returned **zero** matches. These are point in time advisory database results, not a guarantee against future disclosures.

## 3. Automated Acceptance Gates

**Backend:** `python manage.py test apps.projects apps.billing --verbosity 1` against a dedicated, isolated PostgreSQL instance. Tests include previous Phases 1 through 7 plus Phase 8 security acceptance tests.

**Phase 8 targeted security suite:** `python manage.py test apps.projects.tests_phase8`. The targeted suite contains 33 assertions and scenarios for Client isolation, private milestones, staff estimates, tenant boundaries, client organization restrictions, revoked membership, dependency and checklist privacy, archived comments, financial endpoint privacy, Delivery locks, file access and read only report endpoints.

**Frontend:** Full TypeScript check, ESLint, optimized Next.js Production Build, and 12 CSV formula safety tests. The CSV security tests are now a required GitHub Actions Frontend validation step.

**Django:** `manage.py check` and `manage.py makemigrations --check --dry-run`, confirming no new pending migrations.

**Deployment workflow:** YAML parse, Bash syntax validation, transient GHCR pull retry and automatic credentials cleanup.

**Production checks:** Docker images pinned to the merged commit, Backend and Frontend Running, zero unexpected restarts, Celery Redis connection, PostgreSQL and Redis healthy, migrations through `0014` applied, both public frontends responsive and unauthorized API requests denied.

## 4. Role and Tenant Matrix

| Identity | Project Access | Client Visible Work | Internal Work | Time and Billing | Templates |
| --- | --- | --- | --- | --- | --- |
| MSP Owner or Manager | Tenant Projects | Yes | Yes | Project Manager | Capture, preview and apply |
| Assigned Project Manager | Assigned Project | Yes | Yes | Manager Rights | Tenant template operations require MSP Owner or MSP Manager role |
| Assigned Contributor | Assigned Project | Yes | Yes | Own Time | Denied |
| Project Client Reviewer | Client Visible Project, own active Client Organization | Yes | Denied | Denied | Denied |
| Same Client Organization nonmember | Denied | Denied | Denied | Denied | Denied |
| Different Client Organization | Denied | Denied | Denied | Denied | Denied |
| Different tenant | Denied | Denied | Denied | Denied | Denied |
| Revoked Client Reviewer | Denied immediately | Denied | Denied | Denied | Denied |

## 5. Privacy, Financial and Workflow Invariants

1. Clients never receive private Work Item titles, private Milestone UUIDs, hidden dependency identifiers, private checklist text, internal effort estimates or financial summaries.
2. Project File content is always fetched through authenticated File Version Download APIs. File responses disable shared caching and reject unauthorized callers.
3. Project Time is staff only. Manager approval is required for contributor time before an invoice, and invoiced entries are immutable.
4. Project invoices use their own auditable source records and cannot duplicate approved time. Sent and Paid Project invoices cannot be voided from Projects.
5. Scope Approval and Delivery Approval remain authoritative, with Milestone changes serialized against Delivery decisions.
6. Archived Projects are read only for Work Item Comments.
7. Template capture is limited to authorized tenant staff, never copies tickets, billing, original staff assignments, client reviews, or prior approvals, and cannot be applied twice to a populated Project.
8. CSV Export neutralizes common spreadsheet formula injection patterns.

## 6. Browser User Acceptance Matrix

These manual scenarios require authenticated, real User Accounts and are **not considered passed until performed by an operator**. Automated API tests and public HTTP smoke checks do not replace browser role verification.

| Scenario | Account | Expected |
| --- | --- | --- |
| Client creates Project Request | Client Owner | Request appears for MSP review |
| Project Request approval and conversion | MSP Owner or Manager | Project created without duplicate conversion |
| Project Milestones, Work Items and Dependencies | Manager and Contributor | Work progresses and dependency restrictions apply |
| Scope Approval and Change Request | Client Reviewer and Manager | Review decisions and approval history retained |
| Delivery Submit, Approve, Complete and Archive | Manager and Client Reviewer | State changes require authorization |
| Files and Version History | Client Reviewer and Staff | Client sees only shared files, old versions retained |
| Conversations and Notifications | Client Reviewer and Staff | Private messages never appear in Client view |
| Time Tracking and Invoices | Contributor and Manager | Pending approval, rate, draft and audit constraints hold |
| Timeline, Reports and CSV | Manager and Client Reviewer | Private work hidden and CSV formula escaped |
| Project Template Reuse | MSP Owner or Manager | Dates rebased; staff, approvals, billing and files not copied |
| Responsive Layout and Theme | Desktop, Mobile, Light and Dark Mode | No inaccessible controls, clipping or broken navigation |

## 7. Rollback and Operational Safety

Production release is through the existing Main Branch workflow using pinned GHCR images. Any rollback must preserve the Production Database and unrelated applications.

The pre Phase 8 image baseline is commit `929f2ae38587924658c2b0f714f77f14121a0521`. Phase 8 includes no schema migration and is compatible with the already applied Phase 7 migration `0014`.

Do not execute broad host Docker Compose commands, delete volumes or reset database content to test this phase. Use the existing project specific service group and release workflow.

## 8. Known Constraints and Handover

- Real Account browser acceptance remains a separate operator action.
- Public smoke tests prove URL and authentication guard behavior, not authenticated end to end journeys.
- Unit and integration tests reduce risk but do not constitute an external penetration test or formal SOC 2/ISO 27001 certification.
- Template descriptions may include Client specific text. Managers must preview and confirm suitability before reusing templates with another Client.
- Historical Phase 2 through Phase 7 browser acceptance items remain open where not manually confirmed.
