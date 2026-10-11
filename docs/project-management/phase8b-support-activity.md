# MateDesk Phase 8B: Project Support, Activity and Agent Attention

## Objective

Client Project Reviewers submit Support Tickets from an approved Project. The Project Activity tab contains relevant work, support and feedback events. The Agent Requests Inbox brings new tickets and feedback together with existing Support Tickets and Project Requests.

All changes remain in the Phase 8A and 8B Feature Branch. Production and Main are not modified.

## Project Support Tickets

Client Reviewers can create a Support Ticket from a Client Visible Project. Form fields: Subject, Description, Priority, optional Client Visible Work Item and up to five supported screenshots (maximum 10 MB each).

* Permission: active client account, tenant and organization match, explicit Project Reviewer membership, client-published Project, nonarchived Project.
* The original Support Ticket is created in the existing Helpdesk data model, with its normal Ticket reference, requester, priority, client organization and notification lifecycle.
* Project Association and optional Work Item link are created atomically in the same transaction. Failure rolls back the Ticket.
* New Project Support Tickets bypass only the automatic Link to Project action in existing Ticket automation, avoiding conflicting Project links. Other Ticket automation behavior remains intact.
* Original Project Request Tickets are preserved in their history but excluded from the current Project Support Ticket list.
* Client Owners see authorized organization tickets; Client End Users see only their own; MSP staff remain subject to Project permissions for Project Support listing.
* Ordinary Support Tickets, SLA and the mail parser remain the same.

## Project Activity Feed

Project Activity records actor, type, event summary, visibility, source Ticket / Work Item / Milestone, and creation timestamp.

Events cover Project creation and update, Work Items, Milestones, Client and Staff Feedback, Support Ticket linkage, new Project Support Tickets and Ticket replies.

The server applies current permissions to every Activity Feed request. When a Work Item or Milestone becomes Internal, its historical events no longer appear to Client users. Ticket events are visible only to clients who can view the underlying Ticket. This prevents cross-client leaks.

Activity is paginated with twenty-five records per page, includes a full unread count, and supports explicit per-user Mark Reviewed. GET does not mark records as reviewed.

## Unified Requests Needs Attention

Requests provides All, Needs Attention and Assigned to Me, plus the existing Ticket / Project Request / Project filters.

Actionable Project events for agents: new Client Feedback, new Project Support Ticket, and new Client Ticket Reply. New unassigned Support Tickets also appear. Assigned Ticket replies remain actionable until staff responds. Project Requests needing initial review or approved conversion also appear.

Server-side filtering occurs before counting and pagination. Per-user Project Read markers determine what remains new, while recent Support Ticket and Request conversations update their queue timestamps.

## APIs

* GET /api/projects/{uuid}/support-tickets/
* POST /api/projects/{uuid}/support-tickets/
* GET /api/projects/{uuid}/activity/
* POST /api/projects/{uuid}/activity/read/
* GET /api/requests/workspace/?attention=1
* GET /api/requests/workspace/?assigned=mine

Existing Ticket and Project APIs are retained without backwards incompatible endpoint changes.

## Verification

Local isolated PostgreSQL testing:
* Phase 8B unit, permission and integration tests: 41 passed.
* Combined Phase 8A and 8B, Client Portal, Ticket Linking and Project Automation tests: 182 passed.
* Django System Check and Migration Consistency: passed.
* Frontend TypeScript and ESLint: passed, zero lint errors.

Before Main Merge, verify GitHub Full CI on the exact final head commit and review both desktop and mobile UI, Light/Dark Themes, Client End User to Agent Workflows, and Backup and Migration rollout.

Phase 8C remains Project Delivery, Client Approval, Closure and final Product Acceptance.

## Release Boundary

Do not merge or deploy these changes without explicit user authorization. The Project Email Reply authentication safety gate remains disabled by default.
