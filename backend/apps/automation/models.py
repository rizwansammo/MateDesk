import uuid
from django.db import models

TRIGGER_CHOICES = [
    # Event-based
    ('ticket_created',    'Ticket Created'),
    ('ticket_updated',    'Ticket Updated'),
    ('ticket_closed',     'Ticket Closed'),
    ('ticket_solved',     'Ticket Solved'),
    ('ticket_assigned',   'Ticket Assigned'),
    ('ticket_unassigned', 'Ticket Unassigned'),
    ('priority_escalated','Priority Escalated'),
    ('sla_breached',      'SLA Breached'),
    ('reply_added',       'Reply Added'),
    ('customer_replied',  'Customer Replied'),
    # Time-based (fired by Celery)
    ('ticket_overdue',    'Ticket Overdue'),
    ('ticket_stale',      'Ticket Stale (no update 24h+)'),
]

CONDITION_MATCH_CHOICES = [
    ('all', 'Match All (AND)'),
    ('any', 'Match Any (OR)'),
]

SCOPE_CHOICES = [
    ('all_orgs',     'All Organizations'),
    ('specific_org', 'Specific Organization'),
]


class AutomationRule(models.Model):
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant          = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='automation_rules')
    name            = models.CharField(max_length=200)
    description     = models.TextField(blank=True)
    is_active       = models.BooleanField(default=True)
    priority_order  = models.PositiveIntegerField(default=10)
    trigger         = models.CharField(max_length=30, choices=TRIGGER_CHOICES)
    scope_type      = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='all_orgs')
    scope_org       = models.ForeignKey(
        'tenants.ClientOrganization', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='automation_rules',
    )
    condition_match = models.CharField(max_length=10, choices=CONDITION_MATCH_CHOICES, default='all')
    conditions      = models.JSONField(default=list)
    actions         = models.JSONField(default=list)
    stop_processing = models.BooleanField(default=False)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'automation_rules'
        ordering = ['priority_order', 'name']

    def __str__(self):
        return f'{self.name} [{self.trigger}]'


class AutomationLog(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant        = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='automation_logs')
    rule          = models.ForeignKey(AutomationRule, on_delete=models.SET_NULL, null=True, related_name='logs')
    rule_name     = models.CharField(max_length=200)
    ticket_ref    = models.CharField(max_length=50)
    trigger       = models.CharField(max_length=30)
    actions_taken = models.JSONField(default=list)
    fired_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'automation_logs'
        ordering = ['-fired_at']

    def __str__(self):
        return f'{self.rule_name} on {self.ticket_ref}'
