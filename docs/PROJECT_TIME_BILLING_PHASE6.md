# MateDesk Phase 6: Project Time Tracking and Billing

## Summary

MateDesk Project Time Tracking records effort against individual Work Items, supports approval by Project Managers, summarizes staff workloads, and creates deliberate draft invoices through the existing MateDesk Billing System.

Project Time Entries and Support Ticket Time Logs are deliberately separate. Existing Ticket invoicing, Ticket SLA, Project Scope, Delivery Approval, and client communication are unchanged.

## Roles and access

* MSP Owner and MSP Manager can manage time for their tenant Projects.
* An assigned Project Manager can view and review all time for that Project, configure a Project hourly rate, and create a draft invoice.
* An assigned Project Contributor can log and update their own time. Manager approval is required for contributor entries before billing.
* A Staff Viewer and an unassigned Agent cannot read or write Project Time.
* Client Owners and End Users cannot see Project Time Entries, staff effort, hourly rates, invoice batches, or financial summaries through the Project Workspace.
* API queries always apply the current tenant and Project permissions. Billing Invoice endpoints additionally hide Project invoices from agents who do not manage the associated Project.
* Revoking Project membership immediately withdraws time access, but historical staff names and previously logged effort remain available to authorized Project Managers for audit.

## Time tracking

Each entry records a Work Item, staff member, date, duration in minutes, description, billable flag, review state, reviewer, review note, and timestamps.

* One entry records between 1 and 1440 minutes.
* Future work dates and empty descriptions are rejected.
* A unique client supplied UUID identifies each submission so retries do not create duplicate entries.
* A Project Manager may record time for an assigned staff member, and manager submitted time is approved on creation.
* Contributor submitted time is pending until a Project Manager approves it.
* A contributor editing previously approved time returns it to Pending Review.
* Rejected time is retained for review rather than deleted from history.
* Invoiced time is locked against edits and review state changes.
* Project time remains readable after archive but new logs, approvals, and rate updates are blocked. Completed Projects may be reconciled before archiving.
* Entries are internal only. They never create Client Visible activity events or automatically change Project, Work Item, Ticket, Scope or Delivery statuses.

## Time summary

The Project Time & Billing tab shows total minutes, billable minutes, non billable minutes, pending time, staff totals and Work Item totals.

Project Managers additionally see approved and unbilled minutes, the configured hourly rate, currency and line rounded estimated amount.

The Work Item Detail page has a Time Log section. Contributors see their own entries. Managers can review all entries and approve or reject eligible records.

## Project hourly rate

Each Project has its own optional hourly rate and currency, independent of Client Organization Ticket Billing Rates.

Currencies: USD, GBP, EUR, CAD, AUD, NZD, SGD, AED, INR, PKR and BDT.

The Project Manager must explicitly set a positive rate before a Project invoice can be created. Rate changes do not recalculate existing invoice line items.

## Draft invoice integration

Project invoices use the existing `billing_invoices` and `billing_invoice_line_items` database tables and the existing Billing Invoices screen and PDF download.

An explicit Project Manager action selects a date range, tax percentage and request UUID. In a single database transaction, MateDesk:

1. Locks the tenant for invoice numbering and the Project for time log consistency.
2. Selects approved, billable, unbilled Project Time Entries inside the inclusive date range.
3. Applies the Project specific hourly rate to each entry in minutes, rounding each line to two decimals using ROUND_HALF_UP.
4. Sums all rounded line amounts, calculates tax, and creates an ordinary Draft Invoice for the Project's Client Organization.
5. Saves the Work Item reference, staff name, work date, duration, hourly rate and amount on each invoice line item.
6. Associates each time entry with exactly one invoice line and records the idempotent Project invoice batch.

No Draft Invoice is created without eligible approved billable hours. A repeated request UUID returns the original invoice instead of billing the same hours again. A subsequent request can bill newly approved hours only.

Project invoices do not include Support Ticket Time Logs. Support Ticket invoice generation does not include Project Time Entries. Existing global invoice numbering is protected by a common tenant lock across both flows.

## Invoice lifecycle

* Draft Project invoices can be voided from Project Time & Billing. This removes the draft and releases its entries for correction or a new billing run.
* The existing Billing invoice delete action rejects Project invoices and directs staff to the Project void action.
* Once marked Sent or Paid, a Project invoice cannot be rolled back to Draft or deleted through the ordinary Billing API. Invoiced Project time stays locked.
* Ticket invoices preserve their existing status behavior.
* Project billing is not automatically emailed or charged. Sending and collection remain separate authorized business actions.

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET/POST | `/api/projects/{project}/time-entries/` | List or record Project effort |
| PATCH | `/api/projects/{project}/time-entries/{entry}/` | Edit an unbilled time entry |
| POST | `/api/projects/{project}/time-entries/{entry}/review/` | Manager approval or rejection |
| GET | `/api/projects/{project}/time-summary/` | Workload and billing readiness |
| GET/PUT | `/api/projects/{project}/time-rate/` | Project hourly rate |
| GET/POST | `/api/projects/{project}/time-invoices/` | List or create draft Project invoices |
| POST | `/api/projects/{project}/time-invoices/{invoice}/void/` | Void a draft Project invoice |

## Data migration

Migration `0013_project_time_tracking_and_billing.py` adds three new tables: `project_time_rates`, `project_time_entries`, and `project_time_invoice_runs`. Existing Ticket Time Logs, Ticket Invoice records, and Project tables are not rewritten.

## Browser acceptance

1. Create a Work Item and record Staff Time as a Contributor.
2. Confirm the entry appears as Pending Review and cannot be invoiced.
3. Approve time as Project Manager. Confirm summary totals.
4. Add a Non Billable entry and confirm it is excluded from a new Draft Invoice.
5. Configure a positive Project hourly rate and currency.
6. Generate a Draft Invoice for the selected date range. Inspect its line items and PDF in Billing Invoices.
7. Confirm repeated invoice attempts do not duplicate billable hours.
8. Test the Draft Void action, then create a new invoice and mark it Sent.
9. Confirm Sent or Paid Project invoices cannot be voided, modified or deleted.
10. Verify Client Reviewers cannot view Time & Billing or staff time.
11. Check Desktop, Mobile, Light Mode and Dark Mode layouts.

Production browser acceptance is a separate manual step, alongside pending Phase 2 through Phase 5 acceptance.
