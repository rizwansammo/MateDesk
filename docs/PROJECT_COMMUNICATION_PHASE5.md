# MateDesk Phase 5: Project Notifications and Client Communication

## Purpose

Project discussion and attention tracking now share a consistent Project Workspace experience without changing Tickets, Scope approvals, Delivery approvals, Billing, or automatic project status rules.

## Project Conversation

Each Project provides a **Conversation** tab for ongoing communication.

* Project Managers can post team only updates or publish client visible updates when the Project is client visible.
* Assigned Project Contributors can post team only messages.
* Assigned Client Reviewers can post shared messages when the Project is client visible and their client organization is active.
* Staff viewers, unassigned agents, unrelated client organizations and other tenants cannot post project messages.
* Archived Projects are read only. Completed Projects may still receive ongoing support and project discussion.
* All messages are immutable and show their author and timestamp. A request UUID prevents accidental duplicate posts on retry.
* The API limits each message to 5000 characters and paginates 25 messages per page.
* The user interface uses React text rendering rather than untrusted HTML, so messages are not interpreted as markup.
* Posting a message creates an activity event in the existing Project Activity Feed without displaying private message contents in activity summaries.

**Important:** Project messages are discussions, not formal Scope or Delivery approvals. No message changes Project, Work Item, Ticket or Billing state.

## Project Notifications

The **Project Notifications** inbox provides attention events from accessible projects:

* Client feedback, Project Support ticket updates, Scope decisions, Delivery decisions, and Project messages.
* Uses the existing Project Activity records and per user read cursors. No duplicate notification table is created.
* Excludes the current user's own events.
* Shows unread counts and links to their Project or Work Item.
* The **Review Project** action marks the matching Project Activity feed as read, never the user's other projects.
* Refreshes automatically every 60 seconds when the inbox is open, and supports manual refresh.
* Read status does not change simply because a user loads the inbox.

## Privacy and Access Control

* All queries begin from the current user's accessible Projects and tenant.
* Project Managers and Owners can view their tenant's Projects, while agents need Project membership.
* Client Reviewers need an active client organization and current Project membership.
* Clients never receive staff only messages, private Work Item references or internal Project Activity events.
* Revoking Project membership, hiding a Project or Work Item, or disabling the Client Organization removes access immediately on subsequent reads.
* Archived Project messages can be read by authorized members but not newly posted.
* Only managers can publish team messages to clients.
* The email reply feature still requires `PROJECT_EMAIL_REPLIES_ENABLED=true` and verified outbound email configuration; Phase 5 does not enable email automatically or bypass the existing sender authentication guard.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/projects/{project}/conversation/?page=1` | Paginated visible messages |
| POST | `/api/projects/{project}/conversation/` | Post text, visibility and required request UUID |
| GET | `/api/projects/notifications/?page=1` | Inbox with per user unread flags |
| POST | `/api/projects/{project}/activity/read/` | Review all visible activity in one Project |
| GET | `/api/projects/{project}/activity/` | Existing timeline, now including messages |

## Schema

Migration `0012_project_conversation_and_activity.py` creates the `project_conversation_messages` table with uniqueness for project, author and request UUID. It extends the Activity event type choices, and preserves all existing data and approvals.

## Verification and Acceptance

Automated coverage validates message permissions, cross tenant and client isolation, author audit, idempotency, immutable messages, unread state, pagination, archived projects, visibility withdrawal, and unchanged Project and Work Item statuses.

Browser acceptance:

1. Sign in as Manager, open a visible Project, post a private message and then a shared update.
2. Sign in as its Client Reviewer and confirm only the shared update is readable.
3. Reply as Client; confirm Manager receives a notification.
4. Review the Project from the Notifications inbox and confirm its unread count resets.
5. Post another Client reply and confirm the unread count increases again.
6. Revoke membership or change Project visibility and confirm access disappears.
7. Verify responsive light and dark layouts and client/agent tabs.
8. Verify Scope and Delivery approvals remain separate, and Ticket email ingestion remains unchanged.

Existing Phase 2, Phase 3 and Phase 4 manual browser acceptance remains open until user verification.
