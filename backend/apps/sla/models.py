import uuid
from django.db import models
from apps.tickets.models import PRIORITY_CHOICES


SCOPE_CHOICES = [
    ('all_orgs',     'All Organizations'),
    ('specific_org', 'Specific Organization'),
    ('after_hours',  'After Hours'),          # Phase B: requires Business Hours to be configured
]

CLOCK_CHOICES = [
    ('real_time',      'Real Elapsed Time'),
    ('business_hours', 'Business Hours'),     # Phase B
]


class SLAPolicy(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant         = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='sla_policies')
    name           = models.CharField(max_length=200)
    description    = models.TextField(blank=True)
    is_active      = models.BooleanField(default=True)
    priority_order = models.PositiveIntegerField(default=10)
    scope_type     = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='all_orgs')
    scope_org      = models.ForeignKey(
        'tenants.ClientOrganization', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='sla_policies',
    )
    clock_mode    = models.CharField(max_length=20, choices=CLOCK_CHOICES, default='real_time')
    breach_emails = models.JSONField(default=list, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sla_policies'
        ordering = ['priority_order', 'name']

    def __str__(self):
        return f'{self.name} (order={self.priority_order})'


class SLATarget(models.Model):
    id                     = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    policy                 = models.ForeignKey(SLAPolicy, on_delete=models.CASCADE, related_name='targets')
    priority               = models.CharField(max_length=20, choices=PRIORITY_CHOICES)
    first_response_minutes = models.PositiveIntegerField(default=60)
    resolution_minutes     = models.PositiveIntegerField(default=480)
    due_soon_minutes       = models.PositiveIntegerField(default=30)

    class Meta:
        db_table        = 'sla_targets'
        unique_together = [['policy', 'priority']]

    def __str__(self):
        return f'{self.policy.name} / {self.priority}'


class SLAPauseLog(models.Model):
    """Tracks SLA clock pause intervals per ticket. Phase B: populated when status→waiting_on_customer/on_hold."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket     = models.ForeignKey('tickets.Ticket', on_delete=models.CASCADE, related_name='sla_pauses')
    paused_at  = models.DateTimeField()
    resumed_at = models.DateTimeField(null=True, blank=True)
    reason     = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = 'sla_pause_logs'
        ordering = ['paused_at']

    def __str__(self):
        return f'Pause on {self.ticket_id} at {self.paused_at}'


class VIPRule(models.Model):
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant              = models.OneToOneField('tenants.Tenant', on_delete=models.CASCADE, related_name='vip_rule')
    name                = models.CharField(max_length=200, default='VIP Notification Rule')
    is_active           = models.BooleanField(default=True)
    notification_emails = models.JSONField(default=list, blank=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sla_vip_rules'

    def __str__(self):
        return f'VIP Rule [{self.tenant_id}]'
