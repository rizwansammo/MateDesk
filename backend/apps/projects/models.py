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


def _assert_unchanged_fields(instance, field_names):
    # The normal Model API must never silently change a submitted agreement.
    # QuerySet.update() and raw SQL are intentionally outside the public API.
    if instance._state.adding:
        return
    previous = type(instance).objects.filter(pk=instance.pk).values(*field_names).first()
    if previous and any(getattr(instance, name) != previous[name] for name in field_names):
        raise ValidationError({
            'detail': 'Submitted Scope contents are immutable. Create a new proposal instead.'
        })


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
        # This applies to every normal model save, including bulk work paths
        # that use WorkItem.save(), not only the Work Item REST PATCH route.
        if self.pk and not self._state.adding:
            if self.status in ('in_progress', 'in_review', 'done'):
                if WorkItemDependency.objects.filter(work_item_id=self.pk).exclude(
                    prerequisite__status='done',
                ).exists():
                    raise ValidationError({
                        'status': 'Complete all prerequisite Work Items before starting or finishing this item.'
                    })
            if self.status == 'done' and WorkItemChecklistEntry.objects.filter(
                work_item_id=self.pk, is_done=False,
            ).exists():
                raise ValidationError({
                    'status': 'Complete the checklist before marking this Work Item Done.'
                })
            previous = WorkItem.objects.filter(pk=self.pk).values_list('status', flat=True).first()
            if previous == 'done' and self.status != 'done':
                if WorkItemDependency.objects.filter(prerequisite_id=self.pk).filter(
                    work_item__status__in=('in_progress', 'in_review', 'done'),
                ).exists():
                    raise ValidationError({
                        'status': 'A dependent Work Item is underway or completed. Reopen it first.'
                    })


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
        ('scope_proposed', 'Scope Proposed'),
        ('scope_approved', 'Scope Approved'),
        ('scope_changes_requested', 'Scope Changes Requested'),
        ('scope_change_requested', 'Scope Change Requested'),
        ('scope_change_reviewed', 'Scope Change Reviewed'),
        ('scope_rejected', 'Scope Rejected'),
        ('project_message_client', 'Client Message'),
        ('project_message_staff', 'Team Update'),
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



def project_document_upload_path(instance, filename):
    """Opaque paths: no client-supplied name, tenant and project namespaces."""
    import os
    extension = os.path.splitext(filename)[1].lower()
    return (
        f'project_files/{instance.document.project.tenant_id}/'
        f'{instance.document.project_id}/{instance.document_id}/'
        f'{uuid.uuid4().hex}{extension}'
    )


class ProjectDocument(ValidatedModel):
    """Logical file. Immutable version blobs live in ProjectDocumentVersion."""

    CATEGORIES = (
        ('library', 'Project Library'),
        ('work_item', 'Work Item Attachment'),
        ('delivery', 'Delivery File'),
    )
    VISIBILITY = (('internal', 'Staff Only'), ('client', 'Client Visible'))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='documents')
    category = models.CharField(max_length=20, choices=CATEGORIES)
    work_item = models.ForeignKey(
        WorkItem, null=True, blank=True, on_delete=models.PROTECT, related_name='documents'
    )
    delivery_review = models.ForeignKey(
        ProjectDeliveryReview, null=True, blank=True, on_delete=models.PROTECT,
        related_name='documents',
    )
    title = models.CharField(max_length=255)
    visibility = models.CharField(max_length=12, choices=VISIBILITY, default='internal')
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, related_name='project_documents'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'project_documents'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['project', 'category', 'created_at'], name='proj_docs_by_cat'),
            models.Index(fields=['project', 'work_item'], name='proj_docs_by_work'),
        ]

    def clean(self):
        if not self.project_id:
            return
        if self.created_by_id and (
            self.created_by.tenant_id != self.project.tenant_id or not self.created_by.is_active
        ):
            raise ValidationError({'created_by': 'Uploader must belong to the Project tenant.'})
        if self.category == 'work_item':
            if not self.work_item_id or self.work_item.project_id != self.project_id:
                raise ValidationError({'work_item': 'Work Item must belong to this Project.'})
        elif self.work_item_id:
            raise ValidationError({'work_item': 'Only Work Item attachments may link a Work Item.'})
        if self.category != 'delivery' and self.delivery_review_id:
            raise ValidationError({'delivery_review': 'Only Delivery Files may link a review round.'})
        if self.delivery_review_id and self.delivery_review.project_id != self.project_id:
            raise ValidationError({'delivery_review': 'Delivery round belongs to another Project.'})
        if self.category == 'delivery' and self.visibility != 'client':
            raise ValidationError({'visibility': 'Delivery Files must be Client Visible.'})
        if self.visibility == 'client' and self.category == 'work_item' and self.work_item.visibility != 'client':
            raise ValidationError({'visibility': 'A private Work Item cannot have a Client Visible attachment.'})


class ProjectDocumentVersion(ValidatedModel):
    """File revisions are append-only. No public storage URLs are exposed."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        ProjectDocument, on_delete=models.CASCADE, related_name='versions',
    )
    number = models.PositiveIntegerField()
    blob = models.FileField(upload_to=project_document_upload_path, max_length=500)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True,
        related_name='project_document_versions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_document_versions'
        ordering = ['-number', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['document', 'number'], name='unique_project_document_version',
            ),
        ]

    def clean(self):
        if not self.document_id:
            return
        if self.created_by_id and (
            self.created_by.tenant_id != self.document.project.tenant_id
            or not self.created_by.is_active
        ):
            raise ValidationError({'created_by': 'Version uploader belongs to another tenant.'})
        if not self.number or self.number < 1:
            raise ValidationError({'number': 'Version number must be positive.'})


class ProjectScopeChangeRequest(ValidatedModel):
    """Client or project team request for a controlled change of agreed scope."""

    STATUS = [
        ('submitted', 'Submitted'),
        ('under_review', 'Under Review'),
        ('awaiting_client', 'Awaiting Client Approval'),
        ('changes_requested', 'Client Requested Changes'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='scope_change_requests')
    title = models.CharField(max_length=200)
    reason = models.TextField(blank=True)
    requested_changes = models.TextField()
    status = models.CharField(max_length=24, choices=STATUS, default='submitted')
    requested_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True,
        related_name='requested_project_scope_changes',
    )
    reviewed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_project_scope_changes',
    )
    review_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_scope_change_requests'
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['project', 'status'], name='proj_scope_cr_status')]

    def save(self, *args, **kwargs):
        _assert_unchanged_fields(self, (
            'project_id', 'requested_by_id', 'title', 'reason', 'requested_changes',
        ))
        return super().save(*args, **kwargs)

    def clean(self):
        if not self.project_id:
            return
        if self.requested_by_id and (
            self.requested_by.tenant_id != self.project.tenant_id
            or not self.requested_by.is_active
        ):
            raise ValidationError({'requested_by': 'Requester must belong to the Project tenant.'})
        if self.reviewed_by_id and (
            self.reviewed_by.tenant_id != self.project.tenant_id
            or not self.reviewed_by.is_active
        ):
            raise ValidationError({'reviewed_by': 'Reviewer must belong to the Project tenant.'})


class ProjectScopeProposal(ValidatedModel):
    """Immutable scope presented for a dedicated Client decision.

    A revision request means a *new* proposal, retaining the earlier payload.
    The resulting approved baseline is a separate immutable ScopeVersion.
    """

    STATUS = [
        ('pending_client', 'Awaiting Client Approval'),
        ('changes_requested', 'Changes Requested'),
        ('rejected', 'Rejected'),
        ('approved', 'Approved'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='scope_proposals')
    change_request = models.ForeignKey(
        ProjectScopeChangeRequest, on_delete=models.PROTECT, blank=True, null=True,
        related_name='scope_proposals',
    )
    status = models.CharField(max_length=24, choices=STATUS, default='pending_client')
    title = models.CharField(max_length=200)
    requirements = models.TextField()
    deliverables = models.JSONField(default=list)
    acceptance_criteria = models.JSONField(default=list)
    exclusions = models.TextField(blank=True)
    budget_estimate = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    budget_currency = models.CharField(max_length=3, default='USD')
    target_date = models.DateField(blank=True, null=True)
    cost_impact = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    proposed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True,
        related_name='proposed_project_scopes',
    )
    decided_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='decided_project_scopes',
    )
    client_feedback = models.TextField(blank=True)
    proposed_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'project_scope_proposals'
        ordering = ['-proposed_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['project'], condition=models.Q(status='pending_client'),
                name='uniq_pending_scope_proposal',
            ),
        ]

    def save(self, *args, **kwargs):
        _assert_unchanged_fields(self, (
            'project_id', 'change_request_id', 'title', 'requirements',
            'deliverables', 'acceptance_criteria', 'exclusions',
            'budget_estimate', 'budget_currency', 'target_date',
            'cost_impact', 'proposed_by_id',
        ))
        return super().save(*args, **kwargs)

    def clean(self):
        if not self.project_id:
            return
        if self.change_request_id and self.change_request.project_id != self.project_id:
            raise ValidationError({'change_request': 'Change Request must belong to this Project.'})
        if self.proposed_by_id and (
            self.proposed_by.tenant_id != self.project.tenant_id
            or not self.proposed_by.is_active
        ):
            raise ValidationError({'proposed_by': 'Proposal author must belong to this Project tenant.'})
        if self.decided_by_id and (
            self.decided_by.tenant_id != self.project.tenant_id
            or not self.decided_by.is_active
        ):
            raise ValidationError({'decided_by': 'Decision maker must belong to the Project tenant.'})
        if self.decided_by_id and (
            self.decided_by.role not in CLIENT_ROLES
            or self.decided_by.client_org_id != self.project.client_org_id
            or not self.project.members.filter(
                user_id=self.decided_by_id, role='client_reviewer',
            ).exists()
        ):
            raise ValidationError({
                'decided_by': 'Scope approval requires the assigned Client Reviewer.'
            })
        if not isinstance(self.deliverables, list) or not isinstance(self.acceptance_criteria, list):
            raise ValidationError('Deliverables and Acceptance Criteria must be lists.')


class ProjectScopeVersion(ValidatedModel):
    """Approved and immutable scope snapshot; past versions are never overwritten."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='scope_versions')
    number = models.PositiveIntegerField()
    proposal = models.OneToOneField(
        ProjectScopeProposal, on_delete=models.PROTECT, related_name='approved_version',
    )
    title = models.CharField(max_length=200)
    requirements = models.TextField()
    deliverables = models.JSONField(default=list)
    acceptance_criteria = models.JSONField(default=list)
    exclusions = models.TextField(blank=True)
    budget_estimate = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    budget_currency = models.CharField(max_length=3, default='USD')
    target_date = models.DateField(blank=True, null=True)
    cost_impact = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    approved_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True,
        related_name='approved_project_scope_versions',
    )
    approved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_scope_versions'
        ordering = ['-number']
        constraints = [
            models.UniqueConstraint(fields=['project', 'number'], name='uniq_project_scope_version'),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding and type(self).objects.filter(pk=self.pk).exists():
            raise ValidationError({
                'detail': 'An approved Project Scope Version cannot be edited.'
            })
        return super().save(*args, **kwargs)

    def clean(self):
        if not self.project_id or not self.proposal_id:
            return
        if self.proposal.project_id != self.project_id or self.proposal.status != 'approved':
            raise ValidationError({
                'proposal': 'Version must reference an approved proposal in this Project.'
            })
        if self.approved_by_id and (
            self.approved_by.tenant_id != self.project.tenant_id
            or not self.approved_by.is_active
        ):
            raise ValidationError({'approved_by': 'Approving user belongs to another tenant.'})
        if self.approved_by_id and (
            self.approved_by.role not in CLIENT_ROLES
            or self.approved_by.client_org_id != self.project.client_org_id
            or not self.project.members.filter(
                user_id=self.approved_by_id, role='client_reviewer',
            ).exists()
        ):
            raise ValidationError({
                'approved_by': 'Only an assigned Client Reviewer may approve Project Scope.'
            })


class WorkItemDependency(ValidatedModel):
    """Directed prerequisite edge: work_item waits for prerequisite to be Done."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_item = models.ForeignKey(
        WorkItem, on_delete=models.CASCADE, related_name='dependency_edges',
    )
    prerequisite = models.ForeignKey(
        WorkItem, on_delete=models.CASCADE, related_name='dependent_edges',
    )
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True,
        related_name='created_work_item_dependencies',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_work_item_dependencies'
        ordering = ['created_at', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['work_item', 'prerequisite'], name='uniq_work_item_prerequisite',
            ),
            models.CheckConstraint(
                condition=~models.Q(work_item=models.F('prerequisite')),
                name='work_dep_no_self',
            ),
        ]
        indexes = [
            models.Index(fields=['prerequisite'], name='work_dep_prerequisite_idx'),
        ]

    def clean(self):
        if not self.work_item_id or not self.prerequisite_id:
            return
        if self.work_item_id == self.prerequisite_id:
            raise ValidationError({'prerequisite': 'A Work Item cannot depend on itself.'})
        if self.work_item.project_id != self.prerequisite.project_id:
            raise ValidationError({'prerequisite': 'Dependencies must belong to the same Project.'})
        if self._state.adding and self.work_item.status in ('done', 'cancelled'):
            raise ValidationError({'work_item': 'Reopen the Work Item before changing its dependencies.'})
        if (self._state.adding and self.prerequisite.status != 'done'
                and self.work_item.status in ('in_progress', 'in_review')):
            raise ValidationError({
                'prerequisite': 'Move the dependent Work Item to To Do before adding an unfinished prerequisite.'
            })
        if self.created_by_id and (
            self.created_by.tenant_id != self.work_item.project.tenant_id
            or not self.created_by.is_active
            or self.created_by.role not in MSP_ROLES
        ):
            raise ValidationError({'created_by': 'Only active Project staff may add dependencies.'})
        # The caller serializes writes under the Project row lock. A new edge
        # A -> B is invalid if B can already reach A via prerequisite edges.
        seen = set()
        frontier = {self.prerequisite_id}
        while frontier:
            if self.work_item_id in frontier:
                raise ValidationError({'prerequisite': 'Circular dependencies are not allowed.'})
            seen.update(frontier)
            frontier = set(
                WorkItemDependency.objects.filter(work_item_id__in=frontier)
                .exclude(pk=self.pk).values_list('prerequisite_id', flat=True)
            ) - seen


class WorkItemChecklistEntry(ValidatedModel):
    """Single checklist line. Completion is manual and audited."""

    VISIBILITY = [('internal', 'Internal'), ('client', 'Client Visible')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    work_item = models.ForeignKey(
        WorkItem, on_delete=models.CASCADE, related_name='checklist_entries',
    )
    title = models.CharField(max_length=255)
    is_done = models.BooleanField(default=False)
    position = models.PositiveIntegerField(default=0)
    visibility = models.CharField(max_length=20, choices=VISIBILITY, default='internal')
    created_by = models.ForeignKey(
        'users.User', null=True, on_delete=models.SET_NULL,
        related_name='created_work_item_checklist_entries',
    )
    completed_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='completed_work_item_checklist_entries',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_work_item_checklist'
        ordering = ['position', 'created_at', 'id']
        indexes = [
            models.Index(fields=['work_item', 'position'], name='work_checklist_position'),
        ]

    def clean(self):
        if not self.work_item_id:
            return
        project = self.work_item.project
        if self.work_item.status in ('done', 'cancelled'):
            raise ValidationError({
                'work_item': 'Reopen the Work Item before editing its checklist.'
            })
        if self.visibility == 'client' and self.work_item.visibility != 'client':
            raise ValidationError({
                'visibility': 'A private Work Item cannot have a Client Visible checklist line.'
            })
        for field in ('created_by', 'completed_by'):
            user = getattr(self, field, None)
            if user and (
                user.tenant_id != project.tenant_id
                or user.role not in MSP_ROLES
                or (self._state.adding and not user.is_active)
            ):
                # Existing audit history must remain editable even if the
                # original staff member was later deactivated.
                raise ValidationError({
                    field: 'Checklist staff must belong to the Project tenant.'
                })

class ProjectMessage(ValidatedModel):
    """Immutable project conversation entry, independent from ticket replies."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='conversation_messages')
    author = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, related_name='project_conversation_messages',
    )
    body = models.TextField(max_length=5000)
    visibility = models.CharField(max_length=20, choices=WorkItem.VISIBILITY, default='internal')
    request_id = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_conversation_messages'
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'author', 'request_id'], name='uniq_project_message_request',
            ),
        ]
        indexes = [models.Index(fields=['project', '-created_at'], name='project_message_recent')]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError({'detail': 'Project messages are immutable.'})
        return super().save(*args, **kwargs)

    def clean(self):
        if not self.project_id or not self.author_id:
            return
        user = self.author
        project = self.project
        if project.status == 'archived':
            raise ValidationError({'project': 'Archived projects are read only.'})
        if not user.is_active or user.tenant_id != project.tenant_id:
            raise ValidationError({'author': 'The sender must be an active tenant user.'})
        if not self.body.strip() or len(self.body) > 5000:
            raise ValidationError({'body': 'Message must contain 1 to 5000 characters.'})
        if user.role in CLIENT_ROLES:
            if (self.visibility != 'client' or project.visibility != 'client'
                    or not project.client_org.is_active
                    or user.client_org_id != project.client_org_id
                    or not project.members.filter(user=user, role='client_reviewer').exists()):
                raise ValidationError({'author': 'Client message requires an assigned client reviewer.'})
        elif user.role in MSP_ROLES:
            if user.role == 'msp_agent' and not project.members.filter(
                user=user, role__in=['manager', 'contributor'],
            ).exists():
                raise ValidationError({'author': 'Only assigned project staff may send messages.'})
            if self.visibility == 'client' and (
                project.visibility != 'client' or not project.client_org.is_active
                or (user.role == 'msp_agent' and not project.members.filter(
                    user=user, role='manager',
                ).exists())
            ):
                raise ValidationError({'visibility': 'Client updates require a visible project and manager.'})
        else:
            raise ValidationError({'author': 'Unsupported project message sender.'})


class ProjectTimeRate(ValidatedModel):
    """Explicit hourly rate for project work, independent from support ticket rates."""
    from apps.billing.models import CURRENCY_CHOICES
    CURRENCIES = CURRENCY_CHOICES + [('BDT', 'BDT')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name='time_rate')
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, choices=CURRENCIES, default='USD')
    updated_by = models.ForeignKey('users.User', null=True, on_delete=models.SET_NULL,
                                   related_name='updated_project_time_rates')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_time_rates'

    def clean(self):
        if self.hourly_rate is None or self.hourly_rate <= 0:
            raise ValidationError({'hourly_rate': 'Set a positive hourly rate.'})
        from .permissions import can_manage_project
        if self.updated_by_id and (
            self.updated_by.tenant_id != self.project.tenant_id
            or self.updated_by.role not in MSP_ROLES
            or not can_manage_project(self.updated_by, self.project)
        ):
            raise ValidationError({'updated_by': 'Only a Project Manager may set the rate.'})


class ProjectTimeEntry(ValidatedModel):
    """Staff effort is not ticket time and is never invoiced until manager review."""
    REVIEW_STATES = [
        ('pending', 'Pending Review'), ('approved', 'Approved'), ('rejected', 'Rejected'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='time_entries')
    work_item = models.ForeignKey(WorkItem, on_delete=models.PROTECT, related_name='time_entries')
    staff = models.ForeignKey('users.User', null=True, on_delete=models.SET_NULL,
                              related_name='project_time_entries')
    staff_name = models.CharField(max_length=200)
    logged_by = models.ForeignKey('users.User', null=True, on_delete=models.SET_NULL,
                                  related_name='logged_project_time')
    spent_on = models.DateField()
    minutes = models.PositiveIntegerField()
    description = models.TextField(max_length=2000)
    billable = models.BooleanField(default=False)
    review_state = models.CharField(max_length=12, choices=REVIEW_STATES, default='pending')
    review_note = models.CharField(max_length=1000, blank=True)
    reviewed_by = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='reviewed_project_time')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    request_id = models.UUIDField(default=uuid.uuid4)
    invoice_line = models.OneToOneField('billing.InvoiceLineItem', null=True, blank=True,
                                        on_delete=models.PROTECT,
                                        related_name='project_time_entry')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_time_entries'
        ordering = ['-spent_on', '-created_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'logged_by', 'request_id'], name='unique_project_time_request',
            ),
        ]
        indexes = [
            models.Index(fields=['project', 'spent_on'], name='proj_time_date_idx'),
            models.Index(fields=['project', 'billable', 'review_state'], name='proj_time_bill_idx'),
        ]

    def clean(self):
        from django.utils import timezone
        from .permissions import can_manage_project
        if not self.project_id or not self.work_item_id:
            return
        project = self.project
        if project.status == 'archived':
            raise ValidationError({'project': 'Archived projects are read only.'})
        if self.work_item.project_id != self.project_id:
            raise ValidationError({'work_item': 'Work Item belongs to another project.'})
        if self.minutes < 1 or self.minutes > 1440:
            raise ValidationError({'minutes': 'Enter 1 to 1440 minutes per entry.'})
        if self.spent_on and self.spent_on > timezone.localdate():
            raise ValidationError({'spent_on': 'Future work time cannot be recorded.'})
        if not self.description or not self.description.strip():
            raise ValidationError({'description': 'Describe the work performed.'})
        if self.staff_id and self._state.adding and (
            not self.staff.is_active or self.staff.tenant_id != project.tenant_id
            or self.staff.role not in MSP_ROLES
            or (not can_manage_project(self.staff, project)
                and not project.members.filter(
                    user=self.staff, role__in=['manager', 'contributor'],
                ).exists())
        ):
            raise ValidationError({'staff': 'Staff must belong to this project.'})
        from .permissions import can_edit_work
        if self.logged_by_id and self._state.adding and (
            self.logged_by.tenant_id != project.tenant_id
            or self.logged_by.role not in MSP_ROLES
            or not can_edit_work(self.logged_by, project)
        ):
            raise ValidationError({'logged_by': 'Logger must belong to the project tenant.'})
        if self.reviewed_by_id and (
            self.reviewed_by.tenant_id != project.tenant_id
            or not can_manage_project(self.reviewed_by, project)
        ):
            raise ValidationError({'reviewed_by': 'Reviewer must manage this project.'})
        if self.invoice_line_id:
            line = self.invoice_line
            if (line.invoice.tenant_id != project.tenant_id
                    or line.invoice.org_id != project.client_org_id
                    or not self.billable or self.review_state != 'approved'):
                raise ValidationError({'invoice_line': 'Invoice must match approved Project time.'})
        if self.review_state == 'approved' and (not self.reviewed_by_id or not self.reviewed_at):
            raise ValidationError({'review_state': 'Approved time requires a reviewer and timestamp.'})
        if self.review_state != 'approved' and self.reviewed_at and self.reviewed_by_id:
            # Rejections are audited too, while pending edits clear the reviewer.
            pass
        if not self._state.adding:
            previous = ProjectTimeEntry.objects.filter(pk=self.pk).values(
                'invoice_line_id', 'work_item_id', 'project_id', 'staff_id',
                'logged_by_id',
            ).first()
            if previous and previous['invoice_line_id']:
                raise ValidationError({'detail': 'Invoiced time is immutable.'})
            if previous and (previous['work_item_id'] != self.work_item_id
                             or previous['project_id'] != self.project_id
                             or previous['staff_id'] != self.staff_id
                             or previous['logged_by_id'] != self.logged_by_id):
                raise ValidationError({'work_item': 'Time history and ownership are immutable.'})


class ProjectTimeInvoiceRun(ValidatedModel):
    """Idempotent, traceable Project billing batch for an existing draft invoice."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name='time_invoice_runs')
    invoice = models.OneToOneField('billing.Invoice', on_delete=models.CASCADE,
                                   related_name='project_time_run')
    request_id = models.UUIDField()
    created_by = models.ForeignKey('users.User', null=True, on_delete=models.SET_NULL,
                                   related_name='created_project_time_invoices')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'project_time_invoice_runs'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['project', 'request_id'],
                                    name='unique_project_time_invoice_request'),
        ]

    def clean(self):
        if self.project_id and self.invoice_id:
            if (self.invoice.tenant_id != self.project.tenant_id
                    or self.invoice.org_id != self.project.client_org_id):
                raise ValidationError({'invoice': 'Invoice must belong to the project client and tenant.'})
        from .permissions import can_manage_project
        if self.created_by_id and (
            self.created_by.tenant_id != self.project.tenant_id
            or not can_manage_project(self.created_by, self.project)
        ):
            raise ValidationError({'created_by': 'Only a Project Manager may invoice time.'})
