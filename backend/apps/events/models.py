import uuid
from django.db import models

EVENT_STATUS_CHOICES = [
    ('pending',   'Pending'),
    ('completed', 'Completed'),
]


class Event(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='events')
    title       = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    event_dt    = models.DateTimeField()
    creator     = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_events'
    )
    assigned_agents = models.ManyToManyField(
        'users.User', blank=True, related_name='assigned_events'
    )
    status = models.CharField(max_length=20, choices=EVENT_STATUS_CHOICES, default='pending')
    linked_ticket = models.ForeignKey(
        'tickets.Ticket', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='linked_events'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'events'
        ordering = ['event_dt']

    def __str__(self):
        return self.title
