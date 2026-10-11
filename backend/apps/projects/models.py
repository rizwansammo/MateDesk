"""Project delivery domain, independent from the existing support ticket lifecycle."""
import uuid

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

from apps.users.permissions import MSP_ROLES, CLIENT_ROLES


class ValidatedModel(models.Model):
    """Reject invalid cross tenant and cross organization relations on model writes."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class Project(ValidatedModel):
    STATUS = [
        ('planned', 'Planned'),
        ('active', 'Active'),
        ('on_hold', 'On Hold'),
        ('completed', 'Completed'),
        ('archived', 'Archived'),
    ]
    VISIBILITY = [('internal', 'Internal'), ('client', 'Client Visible')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='projects')
    client_org = models.ForeignKey('tenants.ClientOrganization', on_delete=models.PROTECT, related_name='projects')
    key = models.CharField(max_length=12, validators=[
        RegexValidator(r'^[A-Z0-9]{2,12}$', message='Use 2 to 12 uppercase letters or numbers.')
    ])
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='planned')
    visibility = models.CharField(max_length=20, choices=VISIBILITY, default='internal')
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    next_item_number = models.PositiveIntegerField(default=1, editable=False)
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, related_name='created_projects')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    reopened_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'projects'
        ordering = ['name', 'id']
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'key'], name='unique_project_key_per_tenant'),
        ]

    def clean(self):
        if self.client_org_id and self.tenant_id and self.client_org.tenant_id != self.tenant_id:
            raise ValidationError({'client_org': 'Client organization belongs to another tenant.'})
        if self.created_by_id and (
            self.created_by.tenant_id != self.tenant_id or self.created_by.role not in MSP_ROLES
        ):
            raise ValidationError({'created_by': 'Creator must be staff from this tenant.'})
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValidationError({'due_date': 'Due date cannot be earlier than start date.'})

    def __str__(self):
        return f'{self.key}: {self.name}'


class ProjectMember(ValidatedModel):
    ROLES = [
        ('manager', 'Project Manager'),
        ('contributor', 'Contributor'),
        ('viewer', 'Viewer'),
        ('client_reviewer', 'Client Reviewer'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='project_memberships')
    role = models.CharField(max_length=24, choices=ROLES, default='viewer')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_members'
        ordering = ['created_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['project', 'user'], name='unique_project_member'),
        ]

    def clean(self):
        if not self.project_id or not self.user_id:
            return
        user = self.user
        project = self.project
        if not user.is_active or user.tenant_id != project.tenant_id:
            raise ValidationError({'user': 'Member must be active and belong to this tenant.'})
        if user.role in CLIENT_ROLES:
            if not project.client_org.is_active:
                raise ValidationError({'user': 'Client organization must be active.'})
            if user.client_org_id != project.client_org_id or self.role != 'client_reviewer':
                raise ValidationError({'user': 'Client member must belong to the project client organization.'})
        elif user.role in MSP_ROLES:
            if self.role == 'client_reviewer':
                raise ValidationError({'role': 'Staff cannot be assigned the client reviewer role.'})
        else:
            raise ValidationError({'user': 'Unsupported membership role.'})


class ProjectMilestone(ValidatedModel):
    STATUS = [
        ('planned', 'Planned'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]
    VISIBILITY = [('internal', 'Internal'), ('client', 'Client Visible')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='planned')
    visibility = models.CharField(max_length=20, choices=VISIBILITY, default='internal')
    due_date = models.DateField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_milestones'
        ordering = ['position', 'created_at', 'id']


class WorkItem(ValidatedModel):
    KINDS = [
        ('feature', 'Feature'),
        ('task', 'Task'),
        ('bug', 'Bug'),
        ('improvement', 'Improvement'),
    ]
    STATUSES = [
        ('backlog', 'Backlog'),
        ('todo', 'To Do'),
        ('in_progress', 'In Progress'),
        ('in_review', 'In Review'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled'),
    ]
    PRIORITIES = [('low', 'Low'), ('normal', 'Normal'), ('high', 'High'), ('urgent', 'Urgent')]
    VISIBILITY = [('internal', 'Internal'), ('client', 'Client Visible')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='work_items')
    number = models.PositiveIntegerField(editable=False)
    milestone = models.ForeignKey(ProjectMilestone, on_delete=models.SET_NULL, null=True, blank=True, related_name='work_items')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    kind = models.CharField(max_length=20, choices=KINDS, default='task')
    status = models.CharField(max_length=20, choices=STATUSES, default='backlog')
    priority = models.CharField(max_length=20, choices=PRIORITIES, default='normal')
    visibility = models.CharField(max_length=20, choices=VISIBILITY, default='internal')
    assignee = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_work_items')
    due_date = models.DateField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, related_name='created_work_items')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_work_items'
        ordering = ['position', 'created_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['project', 'number'], name='unique_work_item_number'),
        ]

    @property
    def ref(self):
        return f'{self.project.key}-{self.number}'

    def clean(self):
        if self.milestone_id and self.project_id and self.milestone.project_id != self.project_id:
            raise ValidationError({'milestone': 'Milestone belongs to another project.'})
        if self.assignee_id and self.project_id:
            member = self.project.members.filter(user_id=self.assignee_id, role__in=['manager', 'contributor']).exists()
            if (self.assignee.tenant_id != self.project.tenant_id
                    or self.assignee.role not in MSP_ROLES or not self.assignee.is_active or not member):
                raise ValidationError({'assignee': 'Assignee must be an active project staff member.'})
        if self.created_by_id and (
            self.created_by.tenant_id != self.project.tenant_id
            or self.created_by.role not in MSP_ROLES
        ):
            raise ValidationError({'created_by': 'Creator must be staff from this tenant.'})


class WorkItemComment(ValidatedModel):
    VISIBILITY = [('internal', 'Internal'), ('client', 'Client Visible')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_item = models.ForeignKey(WorkItem, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, related_name='work_item_comments')
    body = models.TextField()
    visibility = models.CharField(max_length=20, choices=VISIBILITY, default='internal')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_work_item_comments'
        ordering = ['created_at', 'id']

    def clean(self):
        if not self.work_item_id:
            return
        if self.author_id:
            author = self.author
            project = self.work_item.project
            if author.tenant_id != project.tenant_id or not author.is_active:
                raise ValidationError({'author': 'Author must be an active user of this tenant.'})
            if author.role in CLIENT_ROLES:
                if (author.client_org_id != project.client_org_id or self.visibility != 'client'
                        or self.work_item.visibility != 'client'
                        or project.visibility != 'client'
                        or not project.members.filter(user=author).exists()):
                    raise ValidationError({'author': 'Client cannot comment on this work item.'})
            elif author.role not in MSP_ROLES:
                raise ValidationError({'author': 'Unsupported commenter role.'})


class TicketProjectAssociation(ValidatedModel):
    """A support ticket belongs to at most one delivery project.

    Work items remain independent of support ticket status and SLA.
    Automation rules will reuse this domain model in a later phase.
    """

    SOURCES = [('manual', 'Manual'), ('automation', 'Automation')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.OneToOneField(
        'tickets.Ticket', on_delete=models.CASCADE, related_name='project_association',
    )
    project = models.ForeignKey(
        Project, on_delete=models.PROTECT, related_name='ticket_associations',
    )
    source = models.CharField(max_length=20, choices=SOURCES, default='manual')
    linked_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='linked_ticket_projects',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_ticket_associations'

    def clean(self):
        if not self.ticket_id or not self.project_id:
            return
        ticket = self.ticket
        project = self.project
        if ticket.tenant_id != project.tenant_id:
            raise ValidationError({'project': 'Ticket and project must belong to the same tenant.'})
        if (not ticket.client_org_id or ticket.client_org_id != project.client_org_id
                or ticket.client_org.name == 'Walk-In'):
            raise ValidationError({'project': 'Assign the ticket to the correct client organization first.'})
        if self.linked_by_id and (
            self.linked_by.tenant_id != ticket.tenant_id
            or self.linked_by.role not in MSP_ROLES
        ):
            raise ValidationError({'linked_by': 'Linking user must be support staff from this tenant.'})


class TicketWorkItemLink(ValidatedModel):
    """Optional links to one or more Work Items of the associated project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(
        'tickets.Ticket', on_delete=models.CASCADE, related_name='project_work_item_links',
    )
    work_item = models.ForeignKey(
        WorkItem, on_delete=models.CASCADE, related_name='support_ticket_links',
    )
    linked_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='linked_ticket_work_items',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_ticket_work_item_links'
        ordering = ['created_at', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['ticket', 'work_item'], name='unique_ticket_work_item_link',
            ),
        ]

    def clean(self):
        if not self.ticket_id or not self.work_item_id:
            return
        try:
            association = self.ticket.project_association
        except TicketProjectAssociation.DoesNotExist:
            raise ValidationError({'ticket': 'Link the ticket to a project first.'}) from None
        if (self.work_item.project_id != association.project_id
                or self.ticket.tenant_id != self.work_item.project.tenant_id
                or self.ticket.client_org_id != self.work_item.project.client_org_id):
            raise ValidationError({'work_item': 'Work item must belong to the associated project.'})
        if self.linked_by_id and (
            self.linked_by.tenant_id != self.ticket.tenant_id
            or self.linked_by.role not in MSP_ROLES
        ):
            raise ValidationError({'linked_by': 'Linking user must be support staff from this tenant.'})


class ProjectEmailNotification(ValidatedModel):
    """One deliberate, audited notification to a named client reviewer."""

    STATUSES = [
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='project_email_notifications',
    )
    work_item = models.ForeignKey(
        WorkItem, on_delete=models.CASCADE, related_name='email_notifications',
    )
    recipient = models.ForeignKey(
        'users.User', on_delete=models.PROTECT, related_name='received_project_emails',
    )
    sent_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, related_name='sent_project_emails',
    )
    idempotency_key = models.UUIDField()
    message_id = models.CharField(max_length=998, null=True, blank=True)
    subject = models.CharField(max_length=500)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default='pending')
    last_error = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'project_email_notifications'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                name='unique_proj_email_idem',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'message_id'],
                name='unique_proj_email_msg',
            ),
        ]

    def clean(self):
        if not self.work_item_id or not self.tenant_id or not self.recipient_id:
            return
        item = self.work_item
        project = item.project
        reviewer = self.recipient
        if project.tenant_id != self.tenant_id:
            raise ValidationError({'tenant': 'Notification tenant must match the project.'})
        if (project.visibility != 'client' or item.visibility != 'client'
                or project.status == 'archived' or not project.client_org.is_active):
            raise ValidationError({'work_item': 'Only active client visible work can be emailed.'})
        if (reviewer.tenant_id != self.tenant_id
                or reviewer.client_org_id != project.client_org_id
                or reviewer.role not in CLIENT_ROLES
                or not reviewer.is_active
                or not project.members.filter(user=reviewer, role='client_reviewer').exists()):
            raise ValidationError({'recipient': 'Recipient must be an active client reviewer in this project.'})
        if self.sent_by_id and (
            self.sent_by.tenant_id != self.tenant_id
            or self.sent_by.role not in MSP_ROLES
        ):
            raise ValidationError({'sent_by': 'Only staff from this tenant can notify a reviewer.'})


class ProjectEmailReply(ValidatedModel):
    """Accepted inbound message with a single client visible work item comment."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='project_email_replies',
    )
    notification = models.ForeignKey(
        ProjectEmailNotification, on_delete=models.PROTECT, related_name='email_replies',
    )
    comment = models.OneToOneField(
        WorkItemComment, on_delete=models.CASCADE, related_name='email_reply',
    )
    message_id = models.CharField(max_length=998)
    from_email = models.EmailField()
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_email_replies'
        ordering = ['received_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'message_id'], name='unique_proj_reply_msg',
            ),
        ]

    def clean(self):
        if not self.notification_id or not self.comment_id or not self.tenant_id:
            return
        if (self.tenant_id != self.notification.tenant_id
                or self.comment.work_item_id != self.notification.work_item_id
                or self.comment.author_id != self.notification.recipient_id
                or self.comment.visibility != 'client'
                or self.from_email.casefold() != self.notification.recipient.email.casefold()):
            raise ValidationError({'comment': 'Inbound Project Reply must match its notification and recipient.'})


class ProjectAgentPermission(ValidatedModel):
    """Explicit manager-granted project creation access for MSP agents."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='project_agent_permissions')
    user = models.OneToOneField('users.User', on_delete=models.CASCADE, related_name='project_creation_permission')
    granted_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, related_name='granted_project_permissions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_agent_permissions'

    def clean(self):
        if self.user_id and (
            self.user.tenant_id != self.tenant_id or self.user.role != 'msp_agent' or not self.user.is_active
        ):
            raise ValidationError({'user': 'Only an active agent from the same tenant may receive this permission.'})
        if self.granted_by_id and (
            self.granted_by.tenant_id != self.tenant_id or
            self.granted_by.role not in ('msp_owner', 'msp_manager')
        ):
            raise ValidationError({'granted_by': 'Only an owner or manager may grant project permissions.'})


class ProjectRequest(ValidatedModel):
    """Client request with a real support ticket for discussion and attachments.

    Conversion changes the request lifecycle, not the support ticket data.
    The original ticket remains available for history and conversation.
    """

    KINDS = [
        ('web_development', 'Web Development'),
        ('app_development', 'App Development'),
        ('website_redesign', 'Website Redesign'),
        ('infrastructure', 'Infrastructure'),
        ('other', 'Other'),
    ]
    STATUSES = [
        ('submitted', 'Submitted'),
        ('under_review', 'Under Review'),
        ('awaiting_details', 'Awaiting Details'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('converted', 'Converted'),
    ]
    CURRENCIES = [('USD', 'USD'), ('EUR', 'EUR'), ('GBP', 'GBP'), ('CAD', 'CAD'),
                  ('AUD', 'AUD'), ('BDT', 'BDT')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='project_requests')
    client_org = models.ForeignKey('tenants.ClientOrganization', on_delete=models.PROTECT, related_name='project_requests')
    ticket = models.OneToOneField('tickets.Ticket', on_delete=models.PROTECT, related_name='project_request')
    requested_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, related_name='project_requests')
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=32, choices=KINDS, default='other')
    requirements = models.TextField(blank=True)
    budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    budget_currency = models.CharField(max_length=3, choices=CURRENCIES, default='USD')
    expected_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=STATUSES, default='submitted')
    reviewed_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_project_requests')
    converted_project = models.OneToOneField(
        Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='originating_request'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_requests'
        ordering = ['-updated_at', '-created_at']
        indexes = [models.Index(fields=['tenant', 'status'], name='project_request_tenant_status')]

    def clean(self):
        if not self.tenant_id:
            return
        if self.client_org_id and (
            self.client_org.tenant_id != self.tenant_id or not self.client_org.is_active
        ):
            raise ValidationError({'client_org': 'Client organization must be active and belong to this tenant.'})
        if self.ticket_id and (
            self.ticket.tenant_id != self.tenant_id or self.ticket.client_org_id != self.client_org_id or
            self.ticket.is_internal
        ):
            raise ValidationError({'ticket': 'Request ticket must belong to the same tenant and client organization.'})
        if self.requested_by_id and (
            self.requested_by.tenant_id != self.tenant_id or
            self.requested_by.client_org_id != self.client_org_id or
            self.requested_by.role not in CLIENT_ROLES
        ):
            raise ValidationError({'requested_by': 'Requester must be a client from the same organization.'})
        if self.reviewed_by_id and (
            self.reviewed_by.tenant_id != self.tenant_id or self.reviewed_by.role not in MSP_ROLES
        ):
            raise ValidationError({'reviewed_by': 'Reviewer must be staff from this tenant.'})
        if self.converted_project_id and (
            self.converted_project.tenant_id != self.tenant_id or
            self.converted_project.client_org_id != self.client_org_id
        ):
            raise ValidationError({'converted_project': 'Converted project belongs to another tenant or organization.'})


class ProjectActivity(ValidatedModel):
    """Audited event for a delivery Project with explicit visibility boundaries."""

    KINDS = [
        ('project_created', 'Project Created'),
        ('project_updated', 'Project Updated'),
        ('work_item_created', 'Work Item Created'),
        ('work_item_updated', 'Work Item Updated'),
        ('milestone_created', 'Milestone Created'),
        ('milestone_updated', 'Milestone Updated'),
        ('client_feedback', 'Client Feedback'),
        ('staff_feedback', 'Team Feedback'),
        ('ticket_linked', 'Ticket Linked'),
        ('support_ticket_created', 'Support Ticket Created'),
        ('client_ticket_reply', 'Client Ticket Reply'),
        ('staff_ticket_reply', 'Team Ticket Reply'),
        ('delivery_submitted', 'Delivery Submitted'),
        ('delivery_approved', 'Delivery Approved'),
        ('delivery_changes_requested', 'Delivery Changes Requested'),
        ('project_completed', 'Project Completed'),
        ('project_reopened', 'Project Reopened'),
        ('project_archived', 'Project Archived'),
    ]
    VISIBILITY = [('internal', 'Staff Only'), ('client', 'Client Visible')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='activities')
    actor = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='project_activities',
    )
    kind = models.CharField(max_length=32, choices=KINDS)
    visibility = models.CharField(max_length=12, choices=VISIBILITY, default='internal')
    summary = models.CharField(max_length=320)
    ticket = models.ForeignKey(
        'tickets.Ticket', on_delete=models.CASCADE, null=True, blank=True,
        related_name='project_activities',
    )
    work_item = models.ForeignKey(
        WorkItem, on_delete=models.CASCADE, null=True, blank=True,
        related_name='activity_events',
    )
    milestone = models.ForeignKey(
        ProjectMilestone, on_delete=models.CASCADE, null=True, blank=True,
        related_name='activity_events',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_activities'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['project', '-created_at'], name='project_activity_recent'),
            models.Index(fields=['project', 'kind', '-created_at'], name='project_activity_attention'),
        ]

    def clean(self):
        if not self.project_id:
            return
        if self.actor_id and self.actor.tenant_id != self.project.tenant_id:
            raise ValidationError({'actor': 'Activity actor belongs to a different tenant.'})
        if self.ticket_id and (
            self.ticket.tenant_id != self.project.tenant_id
            or self.ticket.client_org_id != self.project.client_org_id
        ):
            raise ValidationError({'ticket': 'Activity ticket must match the project client organization.'})
        if self.work_item_id and self.work_item.project_id != self.project_id:
            raise ValidationError({'work_item': 'Activity work item must belong to this project.'})
        if self.milestone_id and self.milestone.project_id != self.project_id:
            raise ValidationError({'milestone': 'Activity milestone must belong to this project.'})


class ProjectActivityRead(ValidatedModel):
    """Per-user activity acknowledgement. GET requests never mark events read."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='activity_reads')
    user = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='project_activity_reads',
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_activity_reads'
        constraints = [
            models.UniqueConstraint(fields=['project', 'user'], name='unique_project_activity_read'),
        ]

    def clean(self):
        if self.project_id and self.user_id and (
            self.user.tenant_id != self.project.tenant_id or not self.user.is_active
        ):
            raise ValidationError({'user': 'Activity acknowledgement requires an active project tenant user.'})


class ProjectDeliveryReview(ValidatedModel):
    """One immutable submission per client-review round.

    Revising delivery creates another round rather than overwriting the
    original client decision. Lifecycle actions are enforced by dedicated APIs.
    """
    STATUS = [
        ('pending', 'Awaiting Client Review'),
        ('changes_requested', 'Changes Requested'),
        ('approved', 'Approved'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name='delivery_reviews')
    round_number = models.PositiveIntegerField()
    summary = models.TextField()
    delivery_url = models.URLField(max_length=2000, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='pending')
    submitted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True,
        related_name='submitted_project_deliveries',
    )
    reviewed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_project_deliveries',
    )
    feedback = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'project_delivery_reviews'
        ordering = ['-round_number']
        constraints = [
            models.UniqueConstraint(fields=['project', 'round_number'], name='uniq_project_delivery_round'),
        ]

    def clean(self):
        if not self.project_id:
            return
        project = self.project
        if self.submitted_by_id and (
            self.submitted_by.tenant_id != project.tenant_id
            or self.submitted_by.role not in MSP_ROLES
        ):
            raise ValidationError({'submitted_by': 'Delivery must be submitted by staff from this tenant.'})
        if self.reviewed_by_id and (
            self.reviewed_by.tenant_id != project.tenant_id
            or self.reviewed_by.role not in CLIENT_ROLES
            or self.reviewed_by.client_org_id != project.client_org_id
            or not project.members.filter(
                user=self.reviewed_by, role='client_reviewer'
            ).exists()
        ):
            raise ValidationError({'reviewed_by': 'Review must be made by an authorized client reviewer.'})
