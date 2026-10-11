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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='planned')
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
