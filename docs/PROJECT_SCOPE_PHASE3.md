# MateDesk Phase 3: Scope and Change Requests

## Purpose

Project Scope is the client approved reference for requirements, deliverables, acceptance criteria, exclusions, an estimated budget, and a target date.

It is separate from the existing Project description, Ticket request, Work Items, Delivery Approval and Billing. The initial Scope is not assumed to be client approved merely because an older Project exists.

## Approval workflow

1. A Project Manager prepares an initial complete Scope Proposal.
2. An active Client Reviewer sees the proposal in Projects > Scope & Changes.
3. Client can approve, request revisions, or reject with an explanation. Staff cannot approve on behalf of a Client.
4. Client approval creates Approved Scope Version 1. All proposals and decisions are retained.
5. Once an approved baseline exists, a Project Contributor or Client Reviewer can raise a Scope Change Request.
6. Project Manager marks that request Under Review, or rejects it with a reason.
7. Manager prepares a complete revised Scope Proposal linked to the Change Request. The proposal includes estimated cost impact even when zero.
8. Client approval establishes the next approved Scope Version. Prior approved versions, proposals and decisions remain available.
9. Client feedback after requesting changes results in a new proposal. The earlier submission is not overwritten.

## Access controls

* Every endpoint requires a signed in user and visible project membership in the same tenant.
* Only Project Managers submit the initial or revised Scope and review Change Requests.
* Only assigned Client Reviewers decide a Scope Proposal.
* Contributors and Client Reviewers may submit Change Requests.
* Completed or Archived Projects, and Projects locked by a pending or approved Delivery, reject changes.
* Client scope proposals require the Project to be Client Visible.
* PostgreSQL project row locks serialize decisions and version creation. At most one proposal can await Client Approval per Project.

## API

| Method | Route | Description |
| --- | --- | --- |
| GET | /api/projects/{project}/scope/ | Current approved Scope, all versions, proposals and Change Requests |
| POST | /api/projects/{project}/scope/proposals/ | Send complete Scope to Client |
| POST | /api/projects/{project}/scope/proposals/{proposal}/decision/ | Approve, request changes, or reject |
| POST | /api/projects/{project}/scope/change-requests/ | Submit a new Change Request |
| POST | /api/projects/{project}/scope/change-requests/{change}/review/ | Manager marks Under Review or Rejects |

Approval statuses and cost estimates are included in Project Activity records without leaking actual monetary amounts in event summaries.

## Financial rules

Estimated Budget and Estimated Cost Impact are informational fields used for reviewing scope. These fields do not create invoices, payment requests or ledger entries. All financial processing remains in Settings > Billing.

## Database changes

Migration 0010 creates ProjectScopeChangeRequest, ProjectScopeProposal, ProjectScopeVersion, scoped indexes and one pending proposal uniqueness constraint, plus additional Project Activity event kinds.

The migration does not rewrite existing Project, Ticket, Billing, Work Item, or Delivery records. The approved baseline is created only after new explicit Client Approval.

## Acceptance checklist

1. Manager sends initial scope and Client approves Version 1.
2. Client requests changes, Manager resubmits, and the earlier proposal remains.
3. Client raises a Change Request, Manager reviews it and sends an updated Scope with cost estimate.
4. Client approves Version 2 and Version 1 remains viewable.
5. Rejection and Requests for Changes do not alter the currently approved baseline.
6. Cross tenant, unrelated Client organizations and unauthorized Staff cannot read or approve Scope.
7. Completed/Archived and delivery locked Projects reject scope changes.
8. Verify Desktop, Mobile, Light Mode and Dark Mode on Agent and Client views.
9. Verify existing Tickets, Project Requests, Files and Delivery Approval work as before.
