# MateDesk Project Management: Phase 7 Acceptance and Release Checklist

**Scope:** Client Project Portal, Client Reviewer Management, client visible milestones, cross tenant access checks and final integration readiness.

**Branch:** `feature/projects-phase-2-backend` (Draft PR #24).

**Release policy:** The product owner approved a controlled Main and Production Beta deployment after verifying CI, backups and security mitigations. Live browser and email acceptance remains necessary.

## Delivered in Phase 7

1. Client navigation displays **My Projects** inside the existing MateDesk workspace.
2. Client Portal lists only projects that belong to the authenticated tenant and organization, are published, and explicitly include that client as a Reviewer.
3. A dedicated Client Project Workspace shows published work, progress, published milestones and relevant detail links. It provides no staff Kanban editing, team settings or Ticket Association controls.
4. Authorized Client Reviewers can post **Client Visible feedback** in the Work Item Discussion. Feedback does not approve work or change Ticket state.
5. Project Manager **Team & Reviewers** separates Staff from Reviewers, allows adding existing active users from that project's Client Organization, and supports revocation.
6. Backend Reviewer Candidate API checks current tenant, project access, management permission, active client organization, active account and role. It returns limited fields only.
7. Work Item and Project permissions stay server enforced; frontend controls are not a security boundary.
8. Project Milestones now have **Internal** (default) or **Client Visible** visibility. Client API returns published milestones only. Existing milestones default to Internal after migration `projects.0004`.
9. Revocation removes the client member's portal access. Phase 6 inbound email validation also checks current reviewer membership.
10. Existing Ticket Detail, IMAP parser, Ticket SLA and reply lifecycle remain independent from Project progress.

## Beta security mitigation

- Project Email Notifications and automatic email to Work Item comment ingestion are **OFF by default** under `PROJECT_EMAIL_REPLIES_ENABLED=False`.
- Notification API POST rejects sending when disabled, and the Work Item UI hides Notify Client.
- Previously identified Project notification threads are consumed without creating comments or new tickets when disabled.
- The existing Support Ticket inbound parser remains available.
- Do **not** enable the feature flag until inbound identity verification has been hardened and reviewed, including trust boundaries for DKIM/SPF/DMARC data. A plain From address and thread ID are not authentication.
- Test client feedback in the Project Portal while automatic email replies are disabled.

## Automated verification

- Django system check and migration validation.
- PostgreSQL migrations including `projects.0003` and `projects.0004`.
- Backend test suite including Phase 2 through Phase 7, role checks, cross tenant isolation, internal work and milestone disclosure, client comments, and reviewer revocation.
- Frontend TypeScript typecheck and ESLint.
- Project Notification Mock SMTP and Mock MateMail scenarios from Phase 6.

**Record the actual GitHub Actions run URL and outcomes before accepting.**

## Manual client experience checklist (not satisfied by CI)

Use dedicated test accounts in a nonproduction tenant:

1. Sign in as MSP Manager. Create an active client organization and two different client users through the current Organization Users workflow.
2. Create a Project with `visibility=client`, plus an Internal Project and a Project for another organization.
3. Add one Client Reviewer from the correct Client Organization in **Team & Reviewers**. Confirm foreign and inactive users cannot be selected.
4. Sign in as the approved Client Reviewer. Confirm **My Projects** appears. Verify only explicitly shared Projects appear.
5. Open a Project. Confirm Overview, Work Items and Milestones render in both Light and Dark themes at narrow and wide desktop widths.
6. Create one Internal and one Client Visible Work Item; confirm only the Client Visible item appears to the Reviewer.
7. Create one Internal and one Client Visible Milestone; confirm only the latter appears to the Reviewer.
8. Create one Internal and one Client Visible Comment. Confirm the Reviewer sees only the latter.
9. Post feedback as the Reviewer; confirm it appears as a Client Visible Comment and does not mark the Work Item approved, done or close any related Ticket.
10. Sign in as MSP Manager, revoke Reviewer membership. Confirm a refreshed client session cannot access the Project by link or API and cannot post comments.
11. Repeat with a foreign tenant, another client organization and an inactive Client Organization.
12. Verify Staff Team and Reviewer panels, selection dialogs, empty states, spacing, typography, icon alignment and sharp corners match the existing MateDesk visual language.

## Real email and sender authentication acceptance (not verified by CI)

1. From the configured tenant mailbox, notify an authorized Client Reviewer through **Notify Client**.
2. Repeat once with standard SMTP and once with MateMail Connected App, using controlled test workspaces if available.
3. Confirm outbound delivery, actual Message ID and successful receipt in Gmail and Outlook.
4. Reply from the authorized recipient; inspect `In-Reply-To` and `References` and confirm exactly one Client Visible Discussion Comment.
5. Confirm duplicate processing, another sender, another tenant, a revoked Reviewer and automated replies do not create Project Comments or new Support Tickets.
6. Confirm ordinary inbound Support Emails still create Tickets and established Ticket threads still append to the correct Ticket.
7. Verify authentication at the **trusted receiving mail infrastructure**, including SPF/DKIM/DMARC and authenticated sender identity. A forged `From` header alone is not proof of sender identity. Do not treat the Phase 6 sender equality check as cryptographic email authentication.
8. Review message forwarding, malicious `References`, reply body quoting and attachment requirements before production rollout.

**Security release blocker:** Phase 6 reply authorization currently matches the inbound `From` address against the authorized Reviewer and a known outbound notification thread. The mail transport must provide an independently trusted sender authentication or an equivalent hardened inbound verification path before exposing email based project feedback to untrusted senders.

## Deployment and rollback preparation

- Keep Draft PR unmerged until a reviewer confirms the above.
- Obtain production backup and PostgreSQL restore point first.
- Apply additive migrations; existing milestones default to Internal and need intentional publication.
- Verify Client Organization and Tenant isolation in staging before enabling the new frontend navigation on production.
- Preserve the previous application image tag and migration state. Prefer an application rollback that retains the additive tables and visibility column rather than dropping data.
- Monitor failed email notifications, rejected project replies, backend exceptions, slow queries and any Ticket creation anomaly.
- Require explicit authorization to merge, publish images and deploy to MateServer.

## Evidence status at authoring

- **Code:** prepared in a feature branch.
- **Automated tests:** inspect the latest GitHub CI output before declaring success.
- **Live mailbox delivery:** not performed.
- **Authenticated sender infrastructure validation:** not performed.
- **Real browser visual review:** not performed.
- **Production deployment:** authorized only after latest CI, signed off predeployment backup and security gating; validate the actual deployment result separately.
