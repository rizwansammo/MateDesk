import uuid
import os
from django.db import models


def _attachment_upload_path(instance, filename):
    ext  = os.path.splitext(filename)[1].lower()
    name = f"{uuid.uuid4().hex}{ext}"
    return f"attachments/{instance.tenant_id}/{name}"


NOTIFICATION_TYPE_CHOICES = [
    ('new_ticket',  'New Ticket'),
    ('assigned',    'Assigned to Ticket'),
    ('new_reply',   'New Reply'),
]


STATUS_CHOICES = [
    ('open',                 'Open'),
    ('pending',              'Pending'),
    ('in_progress',          'In Progress'),
    ('waiting_on_customer',  'Waiting on Customer'),
    ('solved',               'Solved'),
    ('closed',               'Closed'),
]

SLA_STATUS_CHOICES = [
    ('not_applied', 'Not Applied'),
    ('on_track',    'On Track'),
    ('due_soon',    'Due Soon'),
    ('breached',    'Breached'),
    ('completed',   'Completed'),
]

PRIORITY_CHOICES = [
    ('low',      'Low'),
    ('normal',   'Normal'),
    ('high',     'High'),
    ('critical', 'Critical'),
]

LEVEL_CHOICES = [
    ('',   '—'),
    ('L1', 'L1'),
    ('L2', 'L2'),
    ('L3', 'L3'),
]

REPLY_TYPE_CHOICES = [
    ('public_reply',  'Public Reply'),
    ('internal_note', 'Internal Note'),
    ('system_event',  'System Event'),
]

MERGE_STATUS_CHOICES = [
    ('none',      'None'),
    ('primary',   'Primary'),
    ('secondary', 'Secondary'),
]


class SupportGroup(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='support_groups')
    name        = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_default  = models.BooleanField(default=False)
    agents      = models.ManyToManyField('users.User', blank=True, related_name='support_groups')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'support_groups'
        ordering        = ['name']
        constraints     = [
            models.UniqueConstraint(fields=['tenant', 'name'], name='uniq_group_name_per_tenant'),
        ]

    def __str__(self):
        return f'{self.name}'


class Ticket(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='tickets'
    )
    ticket_ref  = models.CharField(max_length=20)   # T{DDMMYYYY}-{XXXX}
    seq         = models.PositiveIntegerField()      # global per-tenant sequence

    subject     = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    priority    = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    level       = models.CharField(max_length=10, blank=True, choices=LEVEL_CHOICES)
    category    = models.CharField(max_length=100, blank=True)
    tags        = models.JSONField(default=list, blank=True)

    client_org     = models.ForeignKey(
        'tenants.ClientOrganization', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='tickets'
    )
    # Requester can be a system User OR just a name string (walk-in / email-sourced)
    requester      = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='requested_tickets'
    )
    requester_name = models.CharField(max_length=200, blank=True)
    assignee       = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='assigned_tickets'
    )

    group = models.ForeignKey(
        'SupportGroup', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='tickets'
    )

    secondary_agents = models.ManyToManyField(
        'users.User', blank=True, related_name='secondary_tickets'
    )

    merge_status = models.CharField(max_length=20, choices=MERGE_STATUS_CHOICES, default='none')
    merged_into  = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='absorbed_tickets'
    )

    is_internal           = models.BooleanField(default=False)
    due_by                = models.DateTimeField(null=True, blank=True)
    resolved_at           = models.DateTimeField(null=True, blank=True)
    first_response_at     = models.DateTimeField(null=True, blank=True)
    sla_status            = models.CharField(max_length=20, choices=SLA_STATUS_CHOICES, default='not_applied')
    sla_breach_notified   = models.BooleanField(default=False)
    created_at            = models.DateTimeField(auto_now_add=True)
    updated_at            = models.DateTimeField(auto_now=True)

    class Meta:
        db_table        = 'tickets'
        ordering        = ['-created_at']
        unique_together = [['tenant', 'ticket_ref']]

    def __str__(self):
        return f'{self.ticket_ref}: {self.subject}'

    @property
    def requester_display(self):
        if self.requester:
            return self.requester.full_name
        return self.requester_name or 'Unknown'

    @property
    def assignee_display(self):
        return self.assignee.full_name if self.assignee else None

    @classmethod
    def next_seq(cls, tenant):
        from django.utils import timezone
        today = timezone.now().date()
        return cls.objects.filter(tenant=tenant, created_at__date=today).count() + 1


class Reply(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket     = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='replies')
    author     = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='ticket_replies'
    )
    type       = models.CharField(max_length=20, choices=REPLY_TYPE_CHOICES, default='public_reply')
    body       = models.TextField()
    to_emails  = models.JSONField(default=list, blank=True)
    cc_emails  = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ticket_replies'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.get_type_display()} on {self.ticket.ticket_ref}'


class Notification(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant       = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='notifications')
    recipient    = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='notifications')
    actor        = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='triggered_notifications')
    notif_type   = models.CharField(max_length=20, choices=NOTIFICATION_TYPE_CHOICES)
    ticket       = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='notifications', null=True, blank=True)
    message      = models.CharField(max_length=500)
    is_read      = models.BooleanField(default=False)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.notif_type} → {self.recipient.email}'


class TimeLog(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='timelogs')
    ticket      = models.ForeignKey('Ticket', on_delete=models.CASCADE, related_name='timelogs')
    agent       = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='timelogs')
    minutes     = models.PositiveIntegerField()
    date        = models.DateField()
    description = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ticket_timelogs'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.minutes}m on {self.ticket.ticket_ref}'


class Attachment(models.Model):
    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant   = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='attachments')
    # Exactly one of reply / ticket must be set
    reply    = models.ForeignKey(Reply,  on_delete=models.CASCADE, null=True, blank=True, related_name='attachments')
    ticket   = models.ForeignKey(Ticket, on_delete=models.CASCADE, null=True, blank=True, related_name='attachments')
    file     = models.ImageField(upload_to=_attachment_upload_path)
    filename = models.CharField(max_length=500, blank=True)
    size     = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ticket_attachments'
        ordering = ['created_at']

    def __str__(self):
        return self.filename or str(self.id)
