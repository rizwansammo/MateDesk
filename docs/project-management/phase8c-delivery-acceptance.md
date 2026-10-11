# MateDesk Phase 8C: Client Approval, Delivery, Project Completion and Closure

## Goal

A Project must travel from work delivery to Client Approval, then separate administrative Project Completion and optional Archive. Neither agents nor clients can bypass approval by changing the Project status.

This change is layered on Phases 8A and 8B. The unified Requests workspace, original Support Ticket history, Project Support Tickets, Milestones, Work Items, Activity Feed and per-user Needs Attention remain separate but connected.

## Lifecycle

1. **Work in progress:** Manager and contributors finish all Work Items. At least one Work Item must be Done. All remaining Work Items must be Done or Cancelled. Any created Milestones must be Completed.
2. **Resolve Project Support:** Every linked Project Support Ticket must be Solved or Closed. Original Project Request Tickets are distinct and are not counted as open Project Support.
3. **Client Reviewer:** The Project must be Active, Client Visible, belong to an active Client Organization and have at least one active member with role Client Reviewer.
4. **Submit Delivery:** An authorized Project Manager or MSP Owner/Manager submits a description of the delivered work (at least 15 characters) and an optional HTTP(S) delivery URL. A new, numbered delivery round is saved with full history.
5. **Client Decision:** Only an authorized current Client Reviewer of the same tenant and Client Organization may Approve Delivery or Request Changes. Request Changes requires feedback. Multiple reviewers are supported; one currently authorized reviewer can make the decision.
6. **Revision:** A Changes Requested decision unfreezes Project work. The team implements the feedback and submits a new delivery round. Previous decisions and feedback remain.
7. **Complete Project:** After Client Approval, a Project Manager or MSP Owner/Manager uses Mark Project Completed. Backend reconfirms readiness, approved current round and no Work Item or Milestone changes after approval.
8. **Archive:** An authorized staff Manager can archive a completed Client Approved Project only when Project Support Tickets are resolved. Archive preserves Project and delivery histories.
9. **Reopen:** Managers can reopen a Completed or Archived Project. This clears Completed/Archived timestamps and demands an entirely new Client Approval round before it may be completed again.

## Permission boundaries

| Action | MSP Owner/Manager | Project Manager Agent | Other Agent | Client Reviewer |
| --- | --- | --- | --- | --- |
| View permitted Project delivery history | Yes | Yes | Members only | Own published Project |
| Submit Delivery | Yes | Yes | No | No |
| Approve Delivery or Request Changes | No | No | No | Yes |
| Finalize Completion | Yes | Yes | No | No |
| Archive or Reopen | Yes | Yes | No | No |
| Set Completed through Project Settings | No | No | No | No |

All endpoints use the existing visible_projects boundary, same-tenant authorization and active membership checks. Review summaries are explicitly intended for delivery to Client Reviewers. Internal Work Items and Milestone details are not included in the Client Delivery response.

While a delivery is Pending or Approved, existing Project, Work Item and Milestone edit endpoints prevent updates, including creation of a Work Item through Ticket Links. Support Ticket conversations and Client Feedback remain accessible. Archived or Completed Projects reject work changes until reopened.

## Safe state transitions

The following endpoints are the authoritative transition APIs:

* GET /api/projects/{project_uuid}/delivery/
* POST /api/projects/{project_uuid}/delivery/submit/
* POST /api/projects/{project_uuid}/delivery/decision/
* POST /api/projects/{project_uuid}/delivery/complete/
* POST /api/projects/{project_uuid}/delivery/archive/
* POST /api/projects/{project_uuid}/delivery/reopen/

The normal POST /api/projects/ and PATCH /api/projects/{uuid}/ reject status Completed or Archived. Legacy completed Projects cannot be archived without Client Approval; reopen them and submit a valid delivery first.

Client Approval and staff finalization are separate events. Repeated approval or finalization attempts do not create duplicate history. A Project altered after approval requires a new review round; the original approval is retained, not overwritten.

## Activity and Agent Inbox

New Activity event types:

* Delivery Submitted, visible in Client Needs Attention
* Client Approved Delivery, visible in Staff Needs Attention
* Client Requested Changes, visible in Staff Needs Attention
* Project Completed
* Project Reopened
* Project Archived

Project Activity history remains dynamically scoped by tenant and current Client membership. Opening a Project does not silently mark activity read; Mark Reviewed is an explicit per-user action.

## Data and migrations

Migration 0007 adds Project completed_at and archived_at, the ProjectDeliveryReview model and Activity types. Migration 0008 adds reopened_at to enforce reapproval after reopening. Migrations add nullable fields and a new table rather than deleting or rewriting existing records.

The original Project Ticket Request, project association and Ticket SLA remain independent of Project Completion.

## Verification

* 47 new Phase 8C isolated PostgreSQL tests pass, including role and organization isolation, status bypass prevention, change requests, resubmission, stale approval and archive safeguards.
* Existing Phase 8A and 8B tests remain applicable; run the full GitHub Backend CI on the final source commit.
* Frontend TypeScript, ESLint, Production Next.js Build and Django system/migration checks are required before release.
* The unverified Project Email Reply ingestion security feature stays OFF by default.
* Real desktop/mobile, Light/Dark Theme visuals and authenticated multi-role workflows still require live Beta acceptance after automatic deployment.

## Release sequence

1. Verify full PR CI, migrations and merge compatibility.
2. Verify daily backup and take a fresh PostgreSQL pg_dump Custom Format backup with a successful pg_restore catalog check.
3. Merge the Draft PR only after checks are green and authorization is confirmed.
4. Watch the Main pipeline build and deploy the matching commit images.
5. Verify migration 0005–0008 status, containers, Django System Check, backend health, public HTTPS and unauthenticated endpoint protection.
6. Exercise the Client → Agent → Project → Support Ticket → Client Approval → Completion workflow in Beta using authorized accounts, without sending external mail or altering real customer data.
7. If any critical check fails, stop additional changes and use verified recovery or rollback procedures.

The release is not represented as completed until the GitHub deployment workflow and MateServer checks report success.
