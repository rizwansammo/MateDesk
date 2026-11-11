# MateDesk Phase 7: Project Reports, Timeline and Reusable Templates

## Purpose

Phase 7 makes existing Project, Milestone, Work Item and Phase 6 Time Entry records useful for planning, management reporting and repeatable project delivery.

There is no duplicate analytics database and no separate approval or billing workflow. Reports read live Project state. Timeline is a read only view, not an automatic scheduling engine.

## Project Timeline and Gantt View

* Milestones and Work Items now support optional Start Dates, alongside existing Due Dates.
* Work Items now support an Estimated Effort value stored in minutes, with an upper limit of 1,000,000 minutes.
* Project Managers and Contributors can set Work Item schedules in creation and editing forms; Project Managers may edit Milestone dates.
* The Project Timeline tab displays Milestone and Work Item bars, a calendar axis, today's marker, overdue highlights, progress and visible prerequisite counts.
* Compact and Detailed zoom levels are available, plus a toggle for unscheduled work.
* A user can open a Work Item from its Gantt row.
* Scheduling does not change Work Item status, override dependencies, automatically shift other tasks or alter delivery approvals.

## Progress Reports and Workload Analytics

Every Project has a Reports tab. Its live metrics include:

* Total, active, completed, cancelled and overdue Work Items.
* Completion percentage based on noncancelled Work Items.
* Milestone totals, completed milestones and overdue milestones.
* Work Item status and priority distributions.
* Tracked, Billable and Non Billable Time based on Phase 6 Time Entries.
* Project Managers additionally see estimated effort, actual effort, variance, assigned Work Item counts and Staff Workload.
* Contributors see only their own tracked time, with no full team workload.
* Authorized Clients see only Client Visible Work Items and Milestones. No hidden Work Item identities, internal status totals, staff workload or financial values are returned.

A lightweight CSV export is available for the currently authorized report view. Portfolio Reports display project level progress across accessible Projects, 25 projects per page. Client portfolio data is calculated only from client visible records.

Reports are live calculations. There are no scheduled snapshots or fabricated historical progress statistics.

## Reusable Project Templates

Tenant MSP Owners and MSP Managers can capture the structure of an existing accessible Project as a named, immutable reusable Template.

Captured structure:

* Project description and planned delivery schedule offsets.
* Milestone names, descriptions, visibility and date offsets.
* Work Item titles, descriptions, kind, priority, visibility, position, estimated effort, Milestone relationships and date offsets.
* Checklist titles, visibility and positions.
* Work Item prerequisite edges, validated for cycles.

**Never copied:** Client Organization, Staff Assignees, Ticket associations, Time Logs, Invoices, File contents or Documents, comments, Scope Approvals, Delivery decisions, Project status history or client reviewers.

When a Template is applied:

1. The target must be an empty Planned Project owned by the same tenant.
2. Dates are rebased to the target Project Start Date, or the current date if the target has no start date.
3. Milestones are created in Planned status. Work Items start in Backlog status, with no assignees.
4. Checklist entries are created as incomplete. Dependencies are recreated between new Work Items.
5. The Project item sequence advances atomically. No Project, Billing, Ticket, Approval or Staff history is copied.
6. The same template cannot be applied again to the now populated Project.

A user may alternatively select a saved Template directly in the Create Project form. That creates the new Project, its manager membership and its structural blueprint in one database transaction.

Project Templates are tenant scoped, immutable blueprints. MSP Owners and Managers can preview the saved structure before reusing it and must confirm that descriptions are suitable for the target Client Organization. Capturing the same name twice is rejected. Deleting a Template has no effect on already created Projects.

Template size limits: up to 100 Milestones, 300 Work Items, 1200 checklist lines, 1200 dependencies and a 220,000 character JSON payload. Excessive or invalid templates are rejected.

## Security and Isolation

* Report and Timeline API access always passes through the existing Project visibility query.
* Client views filter Work Items and Milestones to records currently visible to them; private parent Milestone IDs and private prerequisite IDs are omitted.
* Changing Project visibility, membership or Client Organization state immediately withdraws access on subsequent requests.
* Templates are restricted to MSP Tenant Owner and Manager roles. Agents with Project Contributor permissions and Clients cannot browse or instantiate Templates.
* Template source and target Projects must belong to the same tenant.
* Template application and Project creation run in database transactions, with a Project row lock before copying.
* Acyclic Work Item dependency validation remains active. Existing Project Delivery locks remain respected.
* No changes to existing Tickets, Billing Invoices, Client Documents, Scope Approvals or Delivery Approval workflows.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/projects/reports/?page=1` | Paginated Portfolio Reports |
| GET | `/api/projects/{id}/reports/` | Project Progress and Workload |
| GET | `/api/projects/{id}/timeline/` | Milestone and Work Item Gantt data |
| GET | `/api/projects/templates/` | Tenant Template list for MSP managers |
| POST | `/api/projects/{id}/templates/capture/` | Capture current Project blueprint |
| POST | `/api/projects/{id}/templates/{template_id}/apply/` | Apply blueprint to empty Planned Project |
| POST | `/api/projects/templates/{template_id}/create-project/` | Create Project and apply blueprint atomically |
| DELETE | `/api/projects/templates/{template_id}/` | Remove Template only |

## Schema

Migration `0014_project_timeline_and_templates.py` adds Work Item start date, estimated minutes, Milestone start date, and the tenant scoped Project Template table. Existing data is preserved with optional dates and zero estimated minutes by default.

## Browser Acceptance

1. Sign in as an MSP Manager and create a Project with two Milestones and three Work Items.
2. Add Start and Due Dates, an Estimated Effort and one dependency. Open Timeline and test both zoom levels.
3. Confirm bars, dates, prerequisites and overdue indicators are displayed correctly.
4. Record Time in Phase 6 and confirm Reports reflect Actual Hours, Estimates and Staff Workload.
5. Export a CSV report and confirm its values match the displayed metrics.
6. Sign in as a Client Reviewer. Confirm Reports and Timeline show only Client Visible data with no private task names or Staff Time.
7. Save a Project Template, then create a new Project from the Template with a different Client Organization and Start Date.
8. Confirm Milestones, tasks, checklists and dependencies are recreated; dates move relative to the new Start Date.
9. Verify all copied tasks are in Backlog and all checklists are incomplete. Staff Assignees, Tickets, Files, Billing, Approvals and Time Logs must not be copied.
10. Try applying the Template again and confirm the operation is rejected without duplicate records.
11. Check mobile and desktop layouts, Light and Dark modes.
12. Confirm existing Phase 1 through Phase 6 Project and Ticket workflows remain operational.

Manual browser acceptance from Phases 2 through 7 remains pending until confirmed with real user accounts. Phase 8 will include the final acceptance audit.
