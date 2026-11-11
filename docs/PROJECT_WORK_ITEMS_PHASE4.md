# MateDesk Phase 4: Advanced Work Item Management

## Scope

Phase 4 adds Work Item Dependencies, derived Blocked Indicators, and Work Item Checklists. The feature does not introduce a new Work Item Status. Existing statuses remain Backlog, To Do, In Progress, In Review, Done and Cancelled.

**Automatic Work Progress + Manual Business Decisions** remains the rule. Progress indicators update automatically from prerequisite state. No dependency or checklist change automatically advances a task, resumes an On Hold Project or bypasses the established Delivery Approval workflow.

## Dependencies

A dependency connects one Work Item (dependent) to a prerequisite in the same Project.

* A prerequisite is satisfied only when its status is **Done**. Cancelled does not satisfy the dependency.
* If any prerequisite is not Done, `is_blocked` becomes true. The API prevents transitions to In Progress, In Review and Done.
* Completing the last outstanding prerequisite automatically removes Blocked on the next read; the dependent remains To Do or Backlog until an authorized team member advances it.
* Cycles, duplicate edges, self references and cross Project references are rejected. Dependencies are serialized under a Project database row lock to prevent competing users from adding a cycle.
* An unfinished prerequisite cannot be attached to an already active dependent. An active dependent must first be returned to To Do.
* A completed prerequisite cannot be reopened when a dependent item is already In Progress, In Review or Done. Reopen the downstream item first.
* Dependencies of Done or Cancelled Work Items cannot be modified until reopened.
* Each Work Item supports at most 60 direct prerequisites.

### Confidentiality

Clients see a Blocked Indicator and generic waiting information for internal prerequisites. They never receive the internal prerequisite ID, reference, title, status or completion flag. Public prerequisites are linked to their public Work Item Detail pages. Only assigned Project staff can change dependencies.

## Checklist

* Staff can add, rename, complete, uncheck or remove checklist steps.
* Project Managers may publish individual checklist steps as Client Visible only if the parent Work Item is Client Visible. Other steps remain Internal.
* Clients can read only published checklist steps on published Work Items, and cannot modify them.
* The Done transition is rejected until every checklist step is completed, including internal steps.
* After a Work Item becomes Done or Cancelled, its checklist cannot be edited until it is reopened.
* Each Work Item supports at most 100 checklist steps.
* Completing steps records who and when. Work Item Detail, Project Board, Project List and Client View display checklist progress.
* Checklist step edits also update the Work Item modified timestamp and Project activity feed. Delivery locking and Project Completion restrictions remain enforced.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /api/work-items/{item}/dependencies/ | Accessible dependency summaries with private prerequisite masking |
| POST | /api/work-items/{item}/dependencies/ | Add a prerequisite using `prerequisite_id` |
| DELETE | /api/work-items/{item}/dependencies/{dependency}/ | Remove a prerequisite |
| GET | /api/work-items/{item}/checklist/ | List visible checklist steps |
| POST | /api/work-items/{item}/checklist/ | Add a checklist step |
| PATCH | /api/work-items/{item}/checklist/{entry}/ | Update completion, title, visibility or position |
| DELETE | /api/work-items/{item}/checklist/{entry}/ | Delete a checklist step |

The existing Work Item detail and Project Work Item list API also return:

* `is_blocked`: boolean
* `blocked_by_count`: number of unfinished prerequisites visible to the user; internal prerequisite counts are hidden from Clients
* `checklist_total` and `checklist_completed`: number of checklist steps visible to the current user

No internal checklist contents or confidential prerequisite identity is included in these summary fields. Lists use prefetching to avoid database queries for each Work Item.

## Database

Migration `0011_workitemchecklistentry_workitemdependency.py` creates two new tables, their indexes, unique dependency constraints and a database constraint against self dependencies. It does not modify or delete existing Tickets, Project Requests, Projects, Work Items, Billing, Files or Scope data.

## Manual acceptance

1. Create Work Items A and B in the same Project. Add A as prerequisite for B.
2. Confirm B displays Blocked on Board, List and Detail. Starting B is rejected.
3. Mark A Done. Confirm B is no longer Blocked but remains To Do.
4. Add B as prerequisite for A and verify circular dependencies cannot be created.
5. Add a checklist to a Work Item; verify the Done transition fails until all steps are completed.
6. Toggle steps and review the completion audit information.
7. As Client, verify only Client Visible checklist steps and public prerequisite details are shown. Internal prerequisite identity must remain private.
8. Confirm a Project Contributor can edit internal checklist items, but cannot publish them to the Client.
9. Confirm Project On Hold remains On Hold despite task completion and dependency changes.
10. Confirm Pending Client Delivery, Completed and Archived Projects block unauthorized changes.
11. Confirm no changes to Tickets, Billing, File Upload or Scope Approval.
12. Check Light/Dark Mode, mobile scrolling, desktop layout and Agent/Client views.

## Deployment

All development and local tests are completed before a single GitHub Pull Request triggers CI. After success, merge into main for the standard GHCR build and deployment workflow. Confirm project migration, Celery Worker and Beat health, live API authentication, container image tags and website HTTP health.

Browser acceptance remains an independent follow up. Existing Phase 2 and Phase 3 browser acceptance items also remain open until reported by the user.
