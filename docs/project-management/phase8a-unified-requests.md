# MateDesk Phase 8A: Unified Requests and Project Intake

## Scope

Unifies Support Tickets, Project Requests and Projects in one Agent Requests inbox. Keeps each domain model, Support Ticket conversation and existing Ticket lifecycle intact. This is a feature branch implementation, not production deployment.

## Navigation

The sidebar puts Projects immediately beneath Requests inside Support, for staff and clients. Requests defaults to All Work, with Support Tickets, Project Requests and Projects filters, searchable title and organization, status and assignment. Ticket Tools opens the existing Ticket List with its full filters, assignment, SLA, bulk actions and advanced ticket controls.

## Client Project Request

Client Owner and Client End User can use Request New Project on the Client Projects page or Requests page. The form accepts Name, Type, Description, Requirements, optional Budget, Currency, Deadline and up to five files of at most 10 MB each. Allowed extensions: PNG, JPG, JPEG, WebP, PDF, TXT, CSV, DOCX and XLSX.

A ProjectRequest model handles intake and review. An ordinary Support Ticket holds the request conversation and attachments. Existing ticket notifications still notify MSP staff; outgoing email delivery is not guaranteed by Project Request review.

## Roles

| Role | Submit request | Scope | Review | Project creation |
| --- | --- | --- | --- | --- |
| MSP Owner | No | Tenant requests | All | Yes |
| MSP Manager | No | Tenant requests | All | Yes |
| MSP Agent | No | Tenant requests | Assigned requests | Requires explicit grant |
| Client Owner | Yes | Own client organization | No | No |
| Client End User | Yes | Own submissions | No | No |

Owner or Manager can grant or revoke Agent Project Creation Access from the Projects page. New agents have no creation grant by default. Staff can claim unassigned requests, review with states Under Review, Awaiting Details, Approved and Rejected, and save notes to the original ticket. Rejections require a note.

## Approval and conversion

Only an Approved request is eligible for conversion. The converter checks reviewer assignment and explicit Agent grant, tenant, organization, unique project key and active client account within a database transaction. It creates a Client Visible Project, sets the converting agent as Project Manager and the requesting client as Client Reviewer, and associates the original Support Ticket with the new Project.

Conversion does not delete the request or ticket. The request becomes Converted and its ticket becomes Solved. Repeated conversions return the existing Project without creating duplicates.

The unified Requests inbox displays one Project row after conversion. The original Project Request and Ticket remain available in their history and Ticket Tools views.

## Security

* Authenticated tenant and client organization isolation is enforced on every endpoint.
* Client End Users cannot read another person's Project Request.
* The Project Reviewer permission system is unchanged.
* Agent grants are restricted to the same tenant and require MSP Owner or Manager permissions.
* File uploads are type and size checked. Protected attachment downloads now check the originating Ticket, user role, organization, requester and internal reply visibility.
* Existing automatic Link to Project rules cannot convert Project Request tickets prematurely.
* Project Request ticket history is protected from bulk deletion and merge or absorb.
* Existing Ticket ingestion, SLA, Support Ticket pages, Work Item lifecycle and Project Email safety gate remain intact.

## Endpoints

* GET and POST /api/project-requests/
* GET and PATCH /api/project-requests/{uuid}/
* POST /api/project-requests/{uuid}/claim/
* POST /api/project-requests/{uuid}/convert/
* GET /api/requests/workspace/?kind=all&page=1&q=...
* GET /api/projects/capabilities/
* GET /api/projects/agent-permissions/
* PUT /api/projects/agent-permissions/{agent_uuid}/

## Acceptance

1. Run Django System Checks and Migration Check against PostgreSQL.
2. Run entire Django test suite, TypeScript typecheck and ESLint.
3. Verify Client Owner and End User request submission, attachments and organization isolation in a Beta tenant.
4. Verify Agent claim, review, approval and conversion, including agent grant and revocation.
5. Verify no duplicate unified row after conversion; source ticket and discussion remain accessible.
6. Verify staff Ticket List controls and ordinary Support Ticket automation remain intact.
7. Verify responsive light and dark themes in a real browser.
8. Before Production release, verify Backup and authorize Main merge.

## Intentionally remaining for Phase 8B and 8C

Project-specific Support Ticket submission, full Project Activity Feed, new-comment attention badges, Project Delivery Completion and Client Approval are in the following phases. Phase 8A sorts unified rows by their own updated timestamp, not by every Work Item or comment update.

Production remains unchanged until explicit release approval and live checks.
